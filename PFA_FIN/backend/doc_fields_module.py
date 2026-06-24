

import io
import os
import re
import base64
import unicodedata
from typing import Optional
from datetime import datetime

import numpy as np
from PIL import Image


# ─────────────────────────────────────────────
# HELPERS
# ─────────────────────────────────────────────

def _to_base64(img: Image.Image) -> str:
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return base64.b64encode(buf.getvalue()).decode("utf-8")


def _load_pil(image_path: str) -> Image.Image:
    img = Image.open(image_path)
    if img.mode == "RGBA":
        bg = Image.new("RGB", img.size, (255, 255, 255))
        bg.paste(img, mask=img.split()[3])
        return bg
    return img.convert("RGB")


# ─────────────────────────────────────────────
# PREPROCESSING
# ─────────────────────────────────────────────

def _preprocess_for_ocr(image_path: str) -> Image.Image:
    """
    4-step preprocessing: grayscale → upscale → denoise → adaptive threshold.
    Falls back to raw PIL upscale if OpenCV unavailable.
    """
    try:
        import cv2

        img = cv2.imread(image_path, cv2.IMREAD_GRAYSCALE)
        if img is None:
            raise ValueError("cv2 imread returned None")

        h, w = img.shape
        if w < 1200:
            img = cv2.resize(
                img,
                (1200, int(h * 1200 / w)),
                interpolation=cv2.INTER_CUBIC,
            )

        img = cv2.fastNlMeansDenoising(img, h=10)

        img = cv2.adaptiveThreshold(
            img, 255,
            cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
            cv2.THRESH_BINARY,
            blockSize=31,
            C=11,
        )

        return Image.fromarray(img)

    except Exception as e:
        print(f"Preprocessing failed ({e}), using raw image")
        img = Image.open(image_path).convert("L")
        w, h = img.size
        if w < 1200:
            img = img.resize((1200, int(h * 1200 / w)), Image.LANCZOS)
        return img


# ─────────────────────────────────────────────
# TSV BOUNDING BOX EXTRACTION
# ─────────────────────────────────────────────

LABEL_KEYWORDS: dict[str, str] = {
    "nom":          "surname",
    "name":         "surname",
    "surname":      "surname",
    "last":         "surname",
    "prenom":       "names",
    "prénom":       "names",
    "prénoms":      "names",
    "given":        "names",
    "first":        "names",
    "firstname":    "names",
    "naissance":    "date_of_birth",
    "birth":        "date_of_birth",
    "né":           "date_of_birth",
    "née":          "date_of_birth",
    "dob":          "date_of_birth",
    "expiration":   "expiration_date",
    "expiry":       "expiration_date",
    "validité":     "expiration_date",
    "validity":     "expiration_date",
    "expires":      "expiration_date",
    "numéro":       "number",
    "numero":       "number",
    "number":       "number",
    "n°":           "number",
    "sexe":         "sex",
    "sex":          "sex",
    "genre":        "sex",
    "gender":       "sex",
    "nationalité":  "nationality",
    "nationality":  "nationality",
    "nat":          "nationality",
    "pays":         "nationality",
    # Albanian labels often seen on IDs (including bilingual forms)
    "mbiemri":      "surname",
    "emri":         "names",
    "datelindja":   "date_of_birth",
    "lindja":       "date_of_birth",
    "skadimit":     "expiration_date",
    "gjinia":       "sex",
    "shtetesia":    "nationality",
    "letërnjoftim": "number",
    "leternjoftim": "number",
    "personal":     "number",
}

# Multi-word label phrases checked as consecutive words on the same line
LABEL_PHRASES: dict[tuple, str] = {
    ("date", "de", "naissance"):  "date_of_birth",
    ("date", "naissance"):        "date_of_birth",
    ("date", "of", "birth"):      "date_of_birth",
    ("date", "d", "expiration"):  "expiration_date",
    ("date", "expiration"):       "expiration_date",
    ("date", "of", "expiry"):     "expiration_date",
    ("last", "name"):             "surname",
    ("first", "name"):            "names",
    ("given", "name"):            "names",
    ("document", "number"):       "number",
    ("document", "no"):           "number",
    ("doc", "number"):            "number",
    ("nr", "leternjoftim"):       "number",
    ("nr", "letternjoftim"):      "number",
    ("nr", "personal"):           "number",
    ("personal", "no"):           "number",
}

# FIX 4: no \\b around separators
DATE_RE   = re.compile(
    r"(?<!\d)(\d{2}[\/\.\-]\d{2}[\/\.\-]\d{4}|\d{4}[\/\.\-]\d{2}[\/\.\-]\d{2})(?!\d)"
)
# FIX 5: must contain at least one digit, min 6 chars
DOCNUM_RE = re.compile(r"(?<![A-Z0-9])([A-Z]{0,2}[0-9][A-Z0-9]{5,11})(?![A-Z0-9])")
SEX_RE    = re.compile(r"\b(Masculin|Féminin|Male|Female)\b", re.IGNORECASE)

NAME_SKIP = {
    "REPUBLIQUE", "REPUBLIC", "NATIONALE", "NATIONAL", "IDENTITE", "IDENTITY",
    "CARD", "CARTE", "PERMIS", "PASSEPORT", "PASSPORT", "NOM", "NAME", "PRENOM",
    "SURNAME", "FIRSTNAME", "DATE", "NAISSANCE", "BIRTH", "EXPIRATION", "VALIDITE",
    "VALIDITY", "SEXE", "SEX", "TUNISIE", "TUNISIA", "MAROC", "MOROCCO",
    "ALGERIE", "ALGERIA", "FRANCE", "BELGIQUE", "BELGIUM", "DOCUMENT",
    "NATIONALITY", "NATIONALITE", "GENRE", "GENDER",
}


def _safe_conf(val) -> int:
    """FIX 2: conf can be '-1' string or NaN."""
    try:
        return int(float(val))
    except (ValueError, TypeError):
        return -1


def _normalize_text(text: str) -> str:
    text = unicodedata.normalize("NFKD", text or "")
    text = "".join(ch for ch in text if not unicodedata.combining(ch))
    return text.lower().strip()


def _word_variants(text: str) -> set[str]:
    norm = _normalize_text(text)
    parts = [p for p in re.split(r"[^a-z0-9]+", norm) if p]
    out = set(parts)
    if norm:
        out.add(norm)
    return out


def _clean_word(text: str) -> str:
    """Normalized lowercase token for phrase matching."""
    norm = _normalize_text(text)
    return re.sub(r"[^a-z0-9]", "", norm)


def _label_matches(word_text: str, keyword: str) -> bool:
    key = _clean_word(keyword)
    if not key:
        return False
    return key in {_clean_word(v) for v in _word_variants(word_text)}


def _sanitize_field_value(field_name: str, value: str) -> str:
    val = re.sub(r"\s+", " ", (value or "").strip())
    if not val:
        return ""

    # Remove duplicated label artifacts commonly returned by OCR.
    noisy_leads = {
        "name", "given", "surname", "first", "last", "prenom",
        "nom", "mbiemri", "emri", "nationality", "nationalite",
        "shtetesia", "sex", "sexe", "gjinia",
    }
    tokens = val.replace("/", " ").split()
    while tokens and _clean_word(tokens[0]) in noisy_leads:
        tokens.pop(0)
    val = " ".join(tokens).strip()

    if field_name in ("date_of_birth", "expiration_date"):
        m = DATE_RE.search(val)
        return m.group(1) if m else val

    if field_name == "sex":
        u = _normalize_text(val).upper()
        if u in ("M", "MALE", "MASCULIN"):
            return "M"
        if u in ("F", "FEMALE", "FEMININ"):
            return "F"
        # fallback: first standalone M/F token
        for t in tokens:
            tu = t.upper()
            if tu in ("M", "F"):
                return tu
        return val

    if field_name == "number":
        compact = re.sub(r"\s+", "", val.upper())
        m = DOCNUM_RE.search(compact)
        return m.group(1) if m else compact

    return val


def _parse_visual_date(value: str) -> datetime | None:
    if not value:
        return None
    txt = value.strip()
    for fmt in ("%d/%m/%Y", "%d-%m-%Y", "%d.%m.%Y", "%Y/%m/%d", "%Y-%m-%d"):
        try:
            return datetime.strptime(txt, fmt)
        except ValueError:
            pass
    return None


def _is_plausible_field_value(field_name: str, value: str) -> bool:
    v = (value or "").strip()
    if not v:
        return False
    if field_name in ("surname", "names"):
        letters = re.sub(r"[^A-Za-zÀ-ÖØ-öø-ÿ]", "", v)
        return len(letters) >= 2
    if field_name in ("date_of_birth", "expiration_date"):
        return _parse_visual_date(v) is not None
    if field_name == "sex":
        return v.upper() in ("M", "F")
    if field_name == "number":
        compact = re.sub(r"\s+", "", v.upper())
        return bool(re.search(r"\d", compact)) and len(compact) >= 6
    if field_name == "nationality":
        letters = re.sub(r"[^A-Za-zÀ-ÖØ-öø-ÿ]", "", v)
        return len(letters) >= 3
    return True


def _build_rows(tsv_df) -> dict[int, list[dict]]:
    """
    Groups TSV words into lines by top-y coordinate.
    FIX 2: safe conf cast.
    FIX 6: ±15px grouping tolerance (was ±10px, too tight at 1200px).
    """
    rows: dict[int, list[dict]] = {}
    for _, row in tsv_df.iterrows():
        if _safe_conf(row["conf"]) < 20:
            continue
        text = str(row["text"]).strip()
        if not text:
            continue
        top = int(row["top"])
        key = next((k for k in rows if abs(k - top) <= 15), top)  # FIX 6
        rows.setdefault(key, []).append({
            "text":  text,
            "left":  int(row["left"]),
            "top":   top,
            "width": int(row["width"]),
        })
    for key in rows:
        rows[key].sort(key=lambda w: w["left"])
    return rows


def _value_after_label(rows: dict, keyword: str) -> Optional[str]:
    """
    Single-word label lookup.
    FIX 1: next-line condition now uses concrete 60px threshold.
    FIX 3: uses _clean_word() before comparing.
    """
    sorted_rows = sorted(rows.items())
    for row_idx, (y, words) in enumerate(sorted_rows):
        for w_idx, word in enumerate(words):
            if _label_matches(word["text"], keyword):
                label_x = word["left"] + word["width"]

                # Same line — words to the right
                right = [w["text"] for w in words[w_idx + 1:]
                         if w["left"] >= label_x - 5]
                if right:
                    return " ".join(right)

                # FIX 1: next line within 60px
                if row_idx + 1 < len(sorted_rows):
                    next_y, next_words = sorted_rows[row_idx + 1]
                    if next_y - y <= 60:
                        below = [w["text"] for w in next_words
                                 if w["left"] >= word["left"] - 20]
                        if below:
                            return " ".join(below)
    return None


def _value_after_phrase(rows: dict, phrase: tuple) -> Optional[str]:
    """
    FIX 7: multi-word label lookup (e.g. "date de naissance").
    Scans each line for consecutive words matching the phrase,
    returns words to the right or on the next line.
    """
    sorted_rows = sorted(rows.items())
    phrase_len  = len(phrase)

    for row_idx, (y, words) in enumerate(sorted_rows):
        cleaned = [_clean_word(w["text"]) for w in words]
        for i in range(len(cleaned) - phrase_len + 1):
            if tuple(cleaned[i:i + phrase_len]) == phrase:
                last_word = words[i + phrase_len - 1]
                label_x   = last_word["left"] + last_word["width"]

                right = [w["text"] for w in words[i + phrase_len:]
                         if w["left"] >= label_x - 5]
                if right:
                    return " ".join(right)

                if row_idx + 1 < len(sorted_rows):
                    next_y, next_words = sorted_rows[row_idx + 1]
                    if next_y - y <= 60:
                        below = [w["text"] for w in next_words
                                 if w["left"] >= words[i]["left"] - 20]
                        if below:
                            return " ".join(below)
    return None


def _bbox_for_value_on_rows(rows: dict, value: str) -> Optional[dict]:
    """Bounding box of the line that contains the field value (preprocessed image px)."""
    if not value or len(value.strip()) < 2:
        return None
    vnorm = re.sub(r"[^A-Z0-9À-ÖØ-öø-ÿ]", "", value.upper())
    if len(vnorm) < 2:
        return None
    vshort = vnorm[: min(12, len(vnorm))]
    for _y, words in sorted(rows.items()):
        line_compact = re.sub(
            r"[^A-Z0-9À-ÖØ-öø-ÿ]",
            "",
            "".join(w["text"] for w in words).upper(),
        )
        if not line_compact:
            continue
        if vnorm in line_compact or (len(vshort) >= 6 and vshort in line_compact):
            xs = [w["left"] for w in words]
            ys = [w["top"] for w in words]
            rs = [w["left"] + w["width"] for w in words]
            return {
                "x": int(min(xs)),
                "y": int(min(ys)),
                "w": max(1, int(max(rs) - min(xs))),
                "h": 36,
            }
    return None


def _extract_fields_tsv(preprocessed_img: Image.Image) -> dict:
    """
    4-pass field extraction:
    Pass 1a — multi-word phrase spatial lookup  (most reliable)
    Pass 1b — single-word label spatial lookup
    Pass 2  — regex fallback for dates / doc number / sex
    Pass 3  — uppercase line heuristic for names only
    """
    try:
        import pytesseract
        tsv = pytesseract.image_to_data(
            preprocessed_img,
            config="--oem 1 --psm 6 -l eng+fra",
            output_type=pytesseract.Output.DATAFRAME,
        )
    except Exception as e:
        return {
            "error": f"TSV OCR failed: {e}",
            "fields": {},
            "field_boxes_preprocessed": {},
        }

    rows   = _build_rows(tsv)
    fields: dict = {}
    found:  set  = set()

    # ── Pass 1a: multi-word phrase lookup ──
    for phrase, field_name in LABEL_PHRASES.items():
        if field_name in found:
            continue
        value = _value_after_phrase(rows, phrase)
        if value:
            cleaned = _sanitize_field_value(field_name, value)
            if cleaned:
                fields[field_name] = cleaned
                found.add(field_name)

    # ── Pass 1b: single-word label lookup ──
    for keyword, field_name in LABEL_KEYWORDS.items():
        if field_name in found:
            continue
        value = _value_after_label(rows, keyword)
        if value:
            cleaned = _sanitize_field_value(field_name, value)
            if cleaned:
                fields[field_name] = cleaned
                found.add(field_name)

    # ── Pass 2: regex fallback ──
    flat = " ".join(w["text"] for words in rows.values() for w in words)
    flat_norm = re.sub(r"\s+", " ", flat).strip()

    if "date_of_birth" not in found or "expiration_date" not in found:
        dates = DATE_RE.findall(flat)
        parsed = [(d, _parse_visual_date(d)) for d in dates]
        parsed = [(raw, dt) for raw, dt in parsed if dt is not None]
        if parsed:
            # Oldest plausible date is usually DOB, latest plausible date is expiry.
            parsed_sorted = sorted(parsed, key=lambda x: x[1])
            if "date_of_birth" not in found:
                for raw, dt in parsed_sorted:
                    age = (datetime.now() - dt).days / 365.25
                    if 10 <= age <= 120:
                        fields["date_of_birth"] = _sanitize_field_value("date_of_birth", raw)
                        break
            if "expiration_date" not in found:
                for raw, dt in reversed(parsed_sorted):
                    if dt.year >= datetime.now().year - 5:
                        fields["expiration_date"] = _sanitize_field_value("expiration_date", raw)
                        break

    if "number" not in found:
        m = DOCNUM_RE.search(flat)
        if m:
            fields["number"] = _sanitize_field_value("number", m.group())

    if "sex" not in found:
        m = SEX_RE.search(flat)
        if m:
            s = m.group().upper()
            if s in ("MASCULIN", "MALE"):
                fields["sex"] = _sanitize_field_value("sex", "M")
            elif s in ("FÉMININ", "FEMININ", "FEMALE"):
                fields["sex"] = _sanitize_field_value("sex", "F")
        else:
            # Standalone M/F only when it appears right after a sex label
            sorted_rows = sorted(rows.items())
            for row_idx, (y, words) in enumerate(sorted_rows):
                for w_idx, word in enumerate(words):
                    if _clean_word(word["text"]) in ("sexe", "sex", "genre", "gender"):
                        candidates = words[w_idx + 1:]
                        if not candidates and row_idx + 1 < len(sorted_rows):
                            _, candidates = sorted_rows[row_idx + 1]
                        for c in candidates:
                            if c["text"].upper() in ("M", "F"):
                                fields["sex"] = _sanitize_field_value("sex", c["text"].upper())
                                found.add("sex")
                                break
                        break

    # Extra context-aware regex pass for bilingual IDs (e.g., Albanian labels)
    if "surname" not in fields:
        m = re.search(r"(?:mbiemri|surname)\s*[\/:\-]?\s*([A-Za-zÀ-ÖØ-öø-ÿ' -]{2,40})", flat_norm, re.IGNORECASE)
        if m:
            fields["surname"] = _sanitize_field_value("surname", m.group(1))
    if "names" not in fields:
        m = re.search(r"(?:emri|given\s*name|first\s*name)\s*[\/:\-]?\s*([A-Za-zÀ-ÖØ-öø-ÿ' -]{2,40})", flat_norm, re.IGNORECASE)
        if m:
            fields["names"] = _sanitize_field_value("names", m.group(1))
    if "nationality" not in fields:
        m = re.search(r"(?:shtetesia|nationality)\s*[\/:\-]?\s*([A-Za-zÀ-ÖØ-öø-ÿ' -]{3,40})", flat_norm, re.IGNORECASE)
        if m:
            fields["nationality"] = _sanitize_field_value("nationality", m.group(1))

    # ── Pass 3: uppercase line fallback for names ──
    if "surname" not in found or "names" not in found:
        name_candidates = []
        for y, words in sorted(rows.items()):
            line  = " ".join(w["text"] for w in words)
            clean = line.replace(".", "").replace(",", "").replace("-", " ").split()
            if (
                all(w.upper() == w and w.isalpha() for w in clean)
                and 1 <= len(clean) <= 4
                and 2 <= len(line) <= 40
                and not any(kw in clean for kw in NAME_SKIP)
            ):
                name_candidates.append(line.strip())
        if "surname" not in found and name_candidates:
            fields["surname"] = name_candidates[0]
        if "names" not in found and len(name_candidates) >= 2:
            fields["names"] = name_candidates[1]

    fbpp: dict[str, dict] = {}
    for fk, fv in fields.items():
        bb = _bbox_for_value_on_rows(rows, fv)
        if bb:
            fbpp[fk] = bb

    return {
        "fields": fields,
        "field_boxes_preprocessed": fbpp,
        "error": None,
    }


# ─────────────────────────────────────────────
# PHOTO EXTRACTION
# ─────────────────────────────────────────────

def _photo_bbox_original(image_path: str, img_pil: Image.Image) -> dict:
    """Face-based or heuristic photo region in original image pixels."""
    try:
        import cv2

        img_cv = cv2.imread(image_path)
        if img_cv is None:
            raise ValueError("cv2 imread failed")

        gray = cv2.cvtColor(img_cv, cv2.COLOR_BGR2GRAY)
        for cp in [
            cv2.data.haarcascades + "haarcascade_frontalface_default.xml",
            cv2.data.haarcascades + "haarcascade_frontalface_alt.xml",
        ]:
            if not os.path.exists(cp):
                continue
            faces = cv2.CascadeClassifier(cp).detectMultiScale(
                gray, scaleFactor=1.05, minNeighbors=3, minSize=(30, 30)
            )
            if len(faces) > 0:
                h, w = img_cv.shape[:2]
                x, y, fw, fh = sorted(
                    faces, key=lambda f: f[2] * f[3], reverse=True
                )[0]
                x1 = max(0, x - int(fw * 0.4))
                y1 = max(0, y - int(fh * 0.5))
                x2 = min(w, x + fw + int(fw * 0.4))
                y2 = min(h, y + fh + int(fh * 0.5))
                return {"x": x1, "y": y1, "w": x2 - x1, "h": y2 - y1}
    except Exception:
        pass

    w, h = img_pil.size
    return {
        "x": int(w * 0.02),
        "y": int(h * 0.08),
        "w": int(w * 0.30),
        "h": int(h * 0.54),
    }


def _extract_photo(image_path: str, img_pil: Image.Image) -> str:
    """OpenCV face detection with heuristic top-left fallback."""
    bb = _photo_bbox_original(image_path, img_pil)
    cropped = img_pil.crop((bb["x"], bb["y"], bb["x"] + bb["w"], bb["y"] + bb["h"]))
    return _to_base64(cropped.resize((160, 200), Image.LANCZOS))


# ─────────────────────────────────────────────
# MAIN
# ─────────────────────────────────────────────

FIELD_LABELS: dict[str, str] = {
    "surname":         "Last name",
    "names":           "First name(s)",
    "date_of_birth":   "Date of birth",
    "expiration_date": "Expiry date",
    "number":          "Document №",
    "sex":             "Sex",
    "nationality":     "Nationality",
}


def analyze(image_path: str) -> dict:
    # ── Template-based extraction (priority path) ──
    try:
        from templates.template_matcher import detect_doc_type
        from templates.field_extractor import extract_fields_by_template

        doc_type = detect_doc_type(image_path)
        if doc_type:
            result = extract_fields_by_template(image_path, doc_type)
            # Validate: at least surname or names must be non-empty
            fields = result.get("fields", {})
            if fields.get("surname") or fields.get("names"):
                return result
            # else fall through to generic extraction
    except Exception as _e:
        pass  # fall through silently

    img_pil      = _load_pil(image_path)
    photo_b64    = _extract_photo(image_path, img_pil)
    preprocessed = _preprocess_for_ocr(image_path)
    raw_pack     = _extract_fields_tsv(preprocessed)
    ocr_error    = raw_pack.get("error")

    if ocr_error:
        clean_fields = {}
        fbpp = {}
    else:
        clean_fields = dict(raw_pack.get("fields") or {})
        fbpp = dict(raw_pack.get("field_boxes_preprocessed") or {})

    clean_fields = {
        k: v
        for k, v in clean_fields.items()
        if v and k in FIELD_LABELS and _is_plausible_field_value(k, v)
    }

    ow, oh = img_pil.size
    pw, ph = preprocessed.size
    photo_bbox = _photo_bbox_original(image_path, img_pil)
    field_boxes_orig: dict[str, dict] = {}
    for fk, bb in fbpp.items():
        if fk not in clean_fields:
            continue
        field_boxes_orig[fk] = {
            "x": int(bb["x"] * ow / max(pw, 1)),
            "y": int(bb["y"] * oh / max(ph, 1)),
            "w": max(1, int(bb["w"] * ow / max(pw, 1))),
            "h": max(1, int(bb["h"] * oh / max(ph, 1))),
        }

    layout_hints = {
        "original_width":  ow,
        "original_height": oh,
        "photo_bbox":      photo_bbox,
        "field_boxes":     field_boxes_orig,
    }

    return {
        "photo_base64":   photo_b64,
        "fields":         clean_fields,
        "field_labels":   {k: FIELD_LABELS[k] for k in clean_fields},
        "layout_hints":   layout_hints,
        "error":          ocr_error,
    }
