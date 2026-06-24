"""Template-based field extraction for known document layouts."""

from __future__ import annotations

import base64
import io
import re
import unicodedata
from collections import defaultdict

from PIL import Image, ImageEnhance
import pytesseract

from templates.id_templates import ID_TEMPLATES


_NOISE_WORDS = {
    "surname", "given", "name", "nationality", "sex", "date", "birth", "expiry",
    "document", "number", "card", "mbiemri", "emri", "shtetesia", "gjinia",
    "sukunimi", "etunimet", "kansalaisuus", "sukupuoli", "priezvisko", "meno",
    "pohlavie", "citizenship", "documentnumber", "holder", "signature",
    "primer", "apellido", "segundo", "nombre", "nacionalidad", "perenimi",
    "eesnimi", "kodakondsus", "sunni", "aeg", "dokumendi", "kehtiv", "kuni",
    "sukunimi", "etunimet", "sukupuoli", "korttinumero", "kansalaisuus",
    "priezvisko", "datum", "narodenia", "platnosti", "cislo", "obcanstvo",
    "perekonnanimi", "letternjoftim", "leternjoftim",
}


_TEMPLATE_NATIONALITY = {
    "ALB": "Shqiptare/Albanian",
    "ESP": "ESP",
    "EST": "EST",
    "FIN": "FIN",
    "SVK": "SVK",
}


def _is_zero_coords(coords: tuple[float, float, float, float]) -> bool:
    return coords == (0.0, 0.0, 0.0, 0.0)


def _crop_by_percent(
    img: Image.Image, coords: tuple[float, float, float, float]
) -> Image.Image:
    width, height = img.size
    x1, y1, x2, y2 = coords
    left = int(x1 * width)
    upper = int(y1 * height)
    right = int(x2 * width)
    lower = int(y2 * height)
    return img.crop((left, upper, right, lower))


def _field_crop_variants(crop: Image.Image, field_key: str) -> list[Image.Image]:
    variants = []
    w, h = crop.size
    if w < 10 or h < 10:
        return [crop]

    right_focus = crop.crop((int(w * 0.28), 0, w, h))
    center_focus = crop.crop((int(w * 0.12), int(h * 0.05), int(w * 0.98), int(h * 0.95)))
    lower_focus = crop.crop((0, int(h * 0.35), w, h))
    lower_right_focus = crop.crop((int(w * 0.25), int(h * 0.30), w, h))
    upper_focus = crop.crop((0, 0, w, int(h * 0.78)))
    upper_right_focus = crop.crop((int(w * 0.25), 0, w, int(h * 0.80)))

    if field_key in {"surname", "names"}:
        variants.extend([upper_focus, upper_right_focus, lower_focus, lower_right_focus, crop])
    elif field_key == "nationality":
        variants.extend([center_focus, right_focus, crop])
    else:
        variants.extend([crop, right_focus, center_focus])
    return variants


def _preprocess_for_ocr(crop: Image.Image) -> Image.Image:
    gray = crop.convert("L")
    resized = gray.resize((max(1, gray.width * 3), max(1, gray.height * 3)), Image.LANCZOS)
    enhanced = ImageEnhance.Contrast(resized).enhance(2.5)
    return enhanced


def _normalize_text(text: str) -> str:
    txt = unicodedata.normalize("NFKD", text or "")
    txt = "".join(ch for ch in txt if not unicodedata.combining(ch))
    return txt


def _clean_text(text: str, field_key: str) -> str:
    cleaned = (text or "").strip()
    cleaned = re.sub(r"\s+", " ", cleaned)
    cleaned = cleaned.strip(".,:;|_-/\\~`'\"()[]{}")

    label_noise = {
        "surname",
        "name",
        "given",
        "nationality",
        "sex",
        "date",
        "birth",
        "expiry",
        "card",
        "document",
        "mbiemri",
        "emri",
        "shtetesia",
        "gjinia",
        "meno",
        "priezvisko",
        "pohlavie",
        "sukunimi",
        "etunimet",
        "kansalaisuus",
        "sukupuoli",
        "eesnimi",
        "perenimi",
    }

    tokens = cleaned.split()
    while tokens:
        check = re.sub(r"[^A-Za-zÀ-ÖØ-öø-ÿ]", "", _normalize_text(tokens[0]).lower())
        if check and check in label_noise:
            tokens.pop(0)
        else:
            break
    cleaned = " ".join(tokens).strip()

    if not cleaned:
        return ""

    if field_key == "sex":
        up = cleaned.upper()
        if "F" in up and "M" not in up:
            return "F"
        if "M" in up:
            return "M"
        return ""

    if field_key in {"date_of_birth", "expiration_date"}:
        m = re.search(r"(\d{2}[\.\-/ ]\d{2}[\.\-/ ]\d{2,4})", cleaned)
        return m.group(1).replace("  ", " ").strip() if m else ""

    if field_key == "number":
        compact = re.sub(r"[^A-Za-z0-9]", "", cleaned).upper()
        if len(compact) >= 6 and any(ch.isdigit() for ch in compact):
            return compact
        m = re.search(r"([A-Z0-9]{6,})", cleaned.upper())
        return m.group(1) if m else ""

    if field_key in {"surname", "names"}:
        cleaned = re.sub(r"[^A-Za-zÀ-ÖØ-öø-ÿ' -]", " ", cleaned)
        cleaned = re.sub(r"\s+", " ", cleaned).strip()
        words = [w for w in cleaned.split() if len(w) >= 2]
        if not words:
            return ""
        if field_key == "surname":
            return words[0]
        return " ".join(words[:2])

    if field_key == "nationality":
        cleaned = re.sub(r"[^A-Za-zÀ-ÖØ-öø-ÿ/ -]", " ", cleaned)
        cleaned = re.sub(r"\s+", " ", cleaned).strip()
        words = [w for w in cleaned.split() if len(w) >= 3]
        if not words:
            return ""
        # Prefer explicit code or bilingual value with slash.
        for w in words:
            if "/" in w or len(w) == 3:
                return w
        return words[0]

    return cleaned


def _score_field_value(field_key: str, value: str) -> int:
    if not value:
        return -1
    if field_key in {"surname", "names"}:
        letters = re.sub(r"[^A-Za-zÀ-ÖØ-öø-ÿ]", "", value)
        digits = re.sub(r"[^0-9]", "", value)
        words = value.split()
        penalty = 0
        up = value.upper()
        noisy_terms = ("NATIONALITY", "BIRTH", "SURNAME", "GIVEN", "NAME", "DATE", "SEX")
        if any(term in up for term in noisy_terms):
            penalty += 10
        if len(words) > 2:
            penalty += 8
        if len(letters) > 24:
            penalty += 6
        return len(letters) - (len(digits) * 4) - penalty
    if field_key == "nationality":
        letters = re.sub(r"[^A-Za-zÀ-ÖØ-öø-ÿ]", "", value)
        up = value.upper()
        if "/" in value:
            return len(letters) + 5
        if len(value) == 3:
            return 8
        if up in {"ALBANIAN", "ESP", "EST", "FIN", "SVK"}:
            return 9
        return len(letters) - 3 if "BIRTH" in up else len(letters)
    if field_key == "sex":
        return 10 if value in {"M", "F"} else -1
    if field_key in {"date_of_birth", "expiration_date"}:
        return 10 if re.search(r"\d{2}[\.\-/ ]\d{2}[\.\-/ ]\d{2,4}", value) else -1
    if field_key == "number":
        if len(value) >= 6 and any(ch.isdigit() for ch in value):
            letters = sum(1 for ch in value if ch.isalpha())
            return 10 - max(0, letters - 3)
        return -1
    return len(value)


def _tokens_from_data(image: Image.Image, lang: str) -> list[str]:
    try:
        data = pytesseract.image_to_data(
            image,
            lang=lang,
            config="--psm 6",
            output_type=pytesseract.Output.DICT,
        )
    except Exception:
        return []
    tokens = []
    n = len(data.get("text", []))
    for i in range(n):
        txt = (data["text"][i] or "").strip()
        if not txt:
            continue
        try:
            conf = int(float(data["conf"][i]))
        except Exception:
            conf = -1
        if conf >= 25:
            tokens.append(txt)
    return tokens


def _pick_from_tokens(field_key: str, tokens: list[str]) -> str:
    if not tokens:
        return ""

    if field_key == "sex":
        for t in tokens:
            up = t.upper()
            if up in {"M", "F", "M/M"}:
                return "M" if "M" in up else "F"
        return ""

    if field_key in {"date_of_birth", "expiration_date"}:
        joined = " ".join(tokens)
        m = re.search(r"(\d{2}[\.\-/ ]\d{2}[\.\-/ ]\d{2,4})", joined)
        return m.group(1) if m else ""

    if field_key == "number":
        candidates = []
        for t in tokens:
            c = re.sub(r"[^A-Za-z0-9]", "", t).upper()
            if len(c) >= 6 and any(ch.isdigit() for ch in c):
                candidates.append(c)
        return max(candidates, key=len) if candidates else ""

    if field_key in {"surname", "names"}:
        keep = []
        for t in tokens:
            c = re.sub(r"[^A-Za-zÀ-ÖØ-öø-ÿ'-]", "", t)
            if len(c) >= 2 and not any(ch.isdigit() for ch in c):
                keep.append(c)
        if not keep:
            return ""
        if field_key == "surname":
            return min(keep, key=lambda x: abs(len(x) - 7))
        # names can be two tokens max
        keep_sorted = sorted(keep, key=lambda x: abs(len(x) - 6))[:2]
        return " ".join(keep_sorted).strip()

    if field_key == "nationality":
        for t in tokens:
            c = re.sub(r"[^A-Za-zÀ-ÖØ-öø-ÿ/]", "", t)
            if len(c) == 3:
                return c
            if len(c) >= 3 and "/" in c:
                return c
            if len(c) >= 3:
                return c
        return ""

    return ""


def _normalize_name_like(value: str) -> str:
    tokens = []
    for raw in value.split():
        t = re.sub(r"[^A-Za-zÀ-ÖØ-öø-ÿ'-]", "", raw)
        if len(t) < 2:
            continue
        if any(ch.isdigit() for ch in t):
            continue
        if t.lower() in _NOISE_WORDS:
            continue
        # Remove common OCR leading artifact (e.g. eAhmetaj -> Ahmetaj).
        if len(t) >= 2 and t[0].islower() and t[1].isupper():
            t = t[1:]
        tokens.append(t)
    # Drop very short leading artifacts (e.g. "fr JARI", "UZ Bftim").
    while tokens and len(tokens[0]) <= 2:
        tokens.pop(0)
    cleaned_tokens = []
    for t in tokens:
        # Fix frequent OCR artifact: extra leading O before uppercase word.
        if len(t) >= 4 and t[0] == "O" and t[1:].isupper():
            t = t[1:]
        cleaned_tokens.append(t)
    return " ".join(cleaned_tokens[:2]).strip()


def _preprocess_full_for_tsv(img: Image.Image) -> Image.Image:
    gray = img.convert("L")
    up = gray.resize((max(1, gray.width * 2), max(1, gray.height * 2)), Image.LANCZOS)
    return ImageEnhance.Contrast(up).enhance(2.0)


def _extract_global_tokens(img: Image.Image, lang: str) -> list[dict]:
    """
    OCR once on the full document and map tokens back to original coordinates.
    This is far more stable than many tiny isolated OCR calls.
    """
    prep = _preprocess_full_for_tsv(img)
    data = pytesseract.image_to_data(
        prep,
        lang=lang,
        config="--psm 6",
        output_type=pytesseract.Output.DICT,
    )
    sx = img.width / max(prep.width, 1)
    sy = img.height / max(prep.height, 1)
    out = []
    n = len(data.get("text", []))
    for i in range(n):
        txt = (data["text"][i] or "").strip()
        if not txt:
            continue
        try:
            conf = int(float(data["conf"][i]))
        except Exception:
            conf = -1
        if conf < 5:
            continue
        left = int(float(data["left"][i]) * sx)
        top = int(float(data["top"][i]) * sy)
        width = int(float(data["width"][i]) * sx)
        height = int(float(data["height"][i]) * sy)
        out.append(
            {
                "text": txt,
                "conf": conf,
                "left": left,
                "top": top,
                "width": max(1, width),
                "height": max(1, height),
                "cx": left + max(1, width) / 2,
                "cy": top + max(1, height) / 2,
            }
        )
    return out


def _tokens_in_region(
    tokens: list[dict], coords: tuple[float, float, float, float], w: int, h: int
) -> list[dict]:
    x1, y1, x2, y2 = coords
    l, u, r, b = x1 * w, y1 * h, x2 * w, y2 * h
    return [t for t in tokens if l <= t["cx"] <= r and u <= t["cy"] <= b]


def _best_from_region(
    doc_type: str,
    field_key: str,
    region_tokens: list[dict],
    region_bounds: tuple[float, float, float, float],
) -> str:
    if not region_tokens:
        return ""

    # Group by line proximity.
    lines = defaultdict(list)
    for t in region_tokens:
        line_key = int(t["cy"] // 12)
        lines[line_key].append(t)
    for k in lines:
        lines[k].sort(key=lambda x: x["left"])

    # Flatten normalized texts.
    texts = [" ".join(t["text"] for t in lines[k]) for k in sorted(lines)]
    joined = " ".join(texts)

    if field_key == "sex":
        if re.search(r"\bM\b|M/M", joined.upper()):
            return "M"
        if re.search(r"\bF\b", joined.upper()):
            return "F"
        return ""

    if field_key in {"date_of_birth", "expiration_date"}:
        m = re.search(r"(\d{2}[\.\-/ ]\d{2}[\.\-/ ]\d{2,4})", joined)
        return m.group(1).strip() if m else ""

    if field_key == "number":
        up = re.sub(r"[^A-Z0-9 ]", " ", joined.upper())
        if doc_type == "ALB":
            m = re.search(r"\b\d{8,10}\b", up)
            return m.group(0) if m else ""
        if doc_type == "ESP":
            m = re.search(r"\b[A-Z]{3}\d{6}\b", up)
            return m.group(0) if m else ""
        if doc_type == "EST":
            m = re.search(r"\b[A-Z]{2}\d{7}\b", up)
            return m.group(0) if m else ""
        if doc_type == "FIN":
            m = re.search(r"\b\d{9}\b", up)
            return m.group(0) if m else ""
        if doc_type == "SVK":
            m = re.search(r"\b[A-Z]{2}\d{6}\b", up)
            return m.group(0) if m else ""
        return ""

    if field_key == "nationality":
        # For fixed templates, nationality is deterministic and stable.
        if doc_type in _TEMPLATE_NATIONALITY:
            if doc_type == "ALB":
                return "Shqiptare/Albanian"
            return _TEMPLATE_NATIONALITY[doc_type]
        return ""

    if field_key in {"surname", "names"}:
        x1, y1, x2, y2 = region_bounds
        target_y = y1 + (y2 - y1) * 0.62
        candidates = []
        for t in region_tokens:
            val = re.sub(r"[^A-Za-zÀ-ÖØ-öø-ÿ'-]", "", t["text"])
            if len(val) < 2 or any(ch.isdigit() for ch in val):
                continue
            low = val.lower()
            if low in _NOISE_WORDS:
                continue
            if any(noise in low for noise in _NOISE_WORDS):
                continue
            if val.upper() in {"ESP", "EST", "FIN", "SVK", "ALB"}:
                continue
            if len(val) > 16:
                continue

            # Most value tokens are away from the far-right side of these fields.
            if doc_type in {"ALB", "ESP", "EST", "FIN", "SVK"} and t["cx"] > (x1 + (x2 - x1) * 0.78):
                continue

            pos_score = max(0, 20 - abs(t["cy"] - target_y) / 2)
            len_score = min(8.0, float(len(val)))
            short_penalty = -8.0 if len(val) <= 2 else 0.0
            score = float(t["conf"]) + pos_score + len_score + short_penalty
            candidates.append((val, score))
        if not candidates:
            return ""
        # Prefer high-confidence name-like token around expected baseline.
        candidates.sort(key=lambda x: (-x[1], len(x[0])))
        if field_key == "surname":
            return candidates[0][0]
        top_two = [c[0] for c in candidates[:2]]
        return " ".join(top_two).strip()

    return ""


def _normalize_by_template(doc_type: str, field_key: str, value: str) -> str:
    v = (value or "").strip()
    if not v:
        return ""

    if field_key in {"surname", "names"}:
        nv = _normalize_name_like(v)
        if not nv:
            return ""
        if nv.upper() in {"ESP", "EST", "FIN", "SVK", "ALB"}:
            return ""
        if doc_type in {"ALB", "ESP", "EST", "FIN", "SVK"}:
            # Latin-script templates: keep concise 1-2 word person names only.
            words = nv.split()
            if len(words) > 2:
                words = words[:2]
            if any(len(w) > 20 for w in words):
                return ""
            return " ".join(words)
        return nv

    if field_key == "nationality":
        up = re.sub(r"[^A-Z/]", "", v.upper())
        if doc_type == "ALB":
            if "ALBANIAN" in up or "SHQIPTARE" in up or "ALB" in up:
                return "Shqiptare/Albanian"
            return ""
        if doc_type in {"ESP", "EST", "FIN", "SVK"}:
            for code in ("ESP", "EST", "FIN", "SVK"):
                if code in up:
                    return code
        return _clean_text(v, field_key)

    if field_key in {"date_of_birth", "expiration_date"}:
        m = re.search(r"(\d{2}[\.\-/ ]\d{2}[\.\-/ ]\d{2,4})", v)
        return m.group(1).strip() if m else ""

    if field_key == "sex":
        uv = v.upper()
        if "M" in uv:
            return "M"
        if "F" in uv:
            return "F"
        return ""

    if field_key == "number":
        up = re.sub(r"[^A-Z0-9]", "", v.upper())
        if doc_type == "ALB":
            m = re.search(r"\d{8,10}", up)
            return m.group(0) if m else ""
        if doc_type == "ESP":
            m = re.search(r"[A-Z]{3}\d{6}", up)
            return m.group(0) if m else ""
        if doc_type == "EST":
            m = re.search(r"[A-Z]{2}\d{7}", up)
            return m.group(0) if m else ""
        if doc_type == "FIN":
            m = re.search(r"\d{9}", up)
            return m.group(0) if m else ""
        if doc_type == "SVK":
            m = re.search(r"[A-Z]{2}\d{6}", up)
            return m.group(0) if m else ""
        if doc_type == "RUS":
            return ""
        return up if len(up) >= 6 else ""

    return v


def _ocr_best_value(preprocessed: Image.Image, field_key: str, doc_type: str) -> str:
    variants = [preprocessed]
    # Binary variant often helps on textured backgrounds.
    binary = preprocessed.point(lambda x: 255 if x > 150 else 0)
    variants.append(binary)

    if doc_type == "RUS":
        attempts = [("--psm 6", "rus"), ("--psm 7", "rus")]
    else:
        attempts = [("--psm 7", "eng"), ("--psm 6", "eng")]

    best_value = ""
    best_score = -1
    token_boost_value = _pick_from_tokens(field_key, _tokens_from_data(preprocessed, attempts[0][1]))
    token_boost_score = _score_field_value(field_key, token_boost_value)
    if token_boost_score > best_score:
        best_score = token_boost_score
        best_value = token_boost_value

    for img in variants:
        for cfg, lang in attempts:
            raw = pytesseract.image_to_string(img, config=cfg, lang=lang)
            if doc_type == "RUS" and field_key == "names":
                raw = " ".join(line.strip() for line in raw.splitlines() if line.strip())
            cleaned = _clean_text(raw, field_key)
            score = _score_field_value(field_key, cleaned)
            if score > best_score:
                best_score = score
                best_value = cleaned
    return best_value


def _quick_local_fallback(crop: Image.Image, field_key: str, doc_type: str) -> str:
    """
    Fast single-pass fallback to avoid expensive multi-variant OCR loops.
    Used only when global token path fails.
    """
    preprocessed = _preprocess_for_ocr(crop)
    if doc_type == "RUS":
        raw = pytesseract.image_to_string(preprocessed, config="--psm 6", lang="rus")
    else:
        raw = pytesseract.image_to_string(preprocessed, config="--psm 7", lang="eng")
    cleaned = _clean_text(raw, field_key)
    return _normalize_by_template(doc_type, field_key, cleaned)


def _to_base64_png(img: Image.Image) -> str:
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return base64.b64encode(buf.getvalue()).decode("utf-8")


def extract_fields_by_template(image_path: str, doc_type: str) -> dict:
    template = ID_TEMPLATES[doc_type]
    img = Image.open(image_path).convert("RGB")
    ocr_lang = template.get("ocr_lang", "eng")
    global_tokens = _extract_global_tokens(img, ocr_lang)

    fields: dict[str, str] = {}

    for field_key, coords in template.get("fields", {}).items():
        if _is_zero_coords(coords):
            continue

        # Primary path: global OCR + spatial token selection.
        region_tokens = _tokens_in_region(global_tokens, coords, img.width, img.height)
        x1, y1, x2, y2 = coords
        bounds = (x1 * img.width, y1 * img.height, x2 * img.width, y2 * img.height)
        cleaned = _best_from_region(doc_type, field_key, region_tokens, bounds)
        cleaned = _normalize_by_template(doc_type, field_key, cleaned)

        # Fallback: local crop OCR when global path returns empty.
        if not cleaned:
            crop = _crop_by_percent(img, coords)
            cleaned = _quick_local_fallback(crop, field_key, doc_type)

            # Apply heavier fallback only for key identity fields.
            if not cleaned and field_key in {"surname", "names", "number"}:
                best = ""
                best_score = -1
                for variant_crop in _field_crop_variants(crop, field_key):
                    preprocessed = _preprocess_for_ocr(variant_crop)
                    local_val = _ocr_best_value(preprocessed, field_key, doc_type)
                    local_val = _normalize_by_template(doc_type, field_key, local_val)
                    score = _score_field_value(field_key, local_val)
                    if score > best_score:
                        best_score = score
                        best = local_val
                cleaned = best

        if cleaned:
            fields[field_key] = cleaned

    photo_base64 = None
    photo_info = template.get("photo", {})
    photo_coords = photo_info.get("coords")
    if photo_coords:
        photo_crop = _crop_by_percent(img, photo_coords)
        photo_base64 = _to_base64_png(photo_crop)

    return {
        "photo_base64": photo_base64,
        "fields": fields,
        "field_labels": dict(template.get("field_labels", {})),
        "extraction_method": "template",
        "doc_type_detected": doc_type,
        "error": None,
    }

