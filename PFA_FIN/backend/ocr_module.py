import sys
import os
import re
import unicodedata
import threading

sys.path.insert(0, os.path.dirname(__file__))

try:
    from ocr_engine.mrz_legacy import read_mrz_legacy
    OCR_AVAILABLE = True
except ImportError as e:
    OCR_AVAILABLE = False
    OCR_IMPORT_ERROR = str(e)

_EASYOCR_READER = None
_EASYOCR_LOCK = threading.Lock()


def warmup_easyocr():
    """
    Preload EasyOCR reader once to remove heavy first-request latency.
    """
    try:
        import easyocr
    except Exception:
        return False
    global _EASYOCR_READER
    if _EASYOCR_READER is None:
        with _EASYOCR_LOCK:
            if _EASYOCR_READER is None:
                _EASYOCR_READER = easyocr.Reader(["en", "fr"], gpu=False, verbose=False)
    return True


# ─────────────────────────────────────────────
# VISUAL FIELD EXTRACTOR (fallback — no MRZ)
# ─────────────────────────────────────────────

def _normalize_text(text: str) -> str:
    text = unicodedata.normalize("NFKD", text or "")
    text = "".join(ch for ch in text if not unicodedata.combining(ch))
    return text.lower().strip()


def _clean_token(text: str) -> str:
    return re.sub(r"[^a-z0-9]", "", _normalize_text(text))


def _parse_visual_date(value: str):
    from datetime import datetime
    if not value:
        return None
    txt = value.strip()
    for fmt in ("%d/%m/%Y", "%d-%m-%Y", "%d.%m.%Y", "%Y/%m/%d", "%Y-%m-%d"):
        try:
            return datetime.strptime(txt, fmt)
        except ValueError:
            pass
    return None


def _sanitize_candidate(field_name: str, value: str) -> str:
    value = re.sub(r"\s+", " ", (value or "").strip())
    if not value:
        return ""
    # Remove OCR leftovers that are actually labels instead of values.
    drop_prefixes = (
        "surname", "name", "given", "first", "last", "nom", "prenom", "prenom",
        "mbiemri", "emri", "nationality", "nationalite", "shtetesia", "sex", "sexe",
    )
    tokens = value.replace("/", " ").replace("|", " ").split()
    while tokens and _clean_token(tokens[0]) in { _clean_token(x) for x in drop_prefixes }:
        tokens.pop(0)
    value = " ".join(tokens).strip()
    if not value:
        return ""
    if field_name in ("date_of_birth", "expiration_date"):
        m = re.search(r"(\d{2}[\/\.\-]\d{2}[\/\.\-]\d{4}|\d{4}[\/\.\-]\d{2}[\/\.\-]\d{2})", value)
        return m.group(1) if m else value
    if field_name == "sex":
        u = _normalize_text(value).upper()
        if u in ("M", "MALE", "MASCULIN"):
            return "M"
        if u in ("F", "FEMALE", "FEMININ"):
            return "F"
    if field_name == "number":
        compact = re.sub(r"\s+", "", value).upper()
        m = re.search(r"([A-Z]{0,2}[0-9][A-Z0-9\-]{5,12})", compact)
        return m.group(1) if m else compact
    if field_name in ("surname", "names", "nationality"):
        # Reject obvious "label echo" artifacts such as lsurname, lnationality.
        bad = {"surname", "name", "given", "nationality", "nationalite"}
        ct = _clean_token(value)
        if ct in bad or ct.endswith("surname") or ct.endswith("nationality"):
            return ""
    return value


def _is_plausible(field_name: str, value: str) -> bool:
    v = (value or "").strip()
    if not v:
        return False
    if field_name in ("surname", "names"):
        compact = _clean_token(v)
        if any(tag in compact for tag in ("surname", "givenname", "firstname", "lastname", "mbiemri", "emri")):
            return False
        letters = re.sub(r"[^A-Za-zÀ-ÖØ-öø-ÿ]", "", v)
        if len(letters) < 2:
            return False
        # Avoid short garbage like "HE"/"YY" when better candidates exist.
        return len(letters) >= 3
    if field_name in ("date_of_birth", "expiration_date"):
        return _parse_visual_date(v) is not None
    if field_name == "sex":
        return v.upper() in ("M", "F")
    if field_name == "number":
        compact = re.sub(r"\s+", "", v.upper())
        return bool(re.search(r"\d", compact)) and len(compact) >= 6
    if field_name == "nationality":
        return len(re.sub(r"[^A-Za-zÀ-ÖØ-öø-ÿ]", "", v)) >= 3
    return True


def _extract_fields_from_lines(lines: list[dict]) -> dict:
    """
    Detection + recognition post-processing:
    - line-level extraction
    - candidate ranking
    - business-rule plausibility filtering
    """
    from datetime import datetime

    candidates: dict[str, list[tuple[float, str]]] = {
        "surname": [],
        "names": [],
        "date_of_birth": [],
        "expiration_date": [],
        "number": [],
        "sex": [],
        "nationality": [],
    }

    label_patterns = {
        "surname": r"(?:nom|surname|last\s*name|mbiemri)",
        "names": r"(?:prenom|pr[ée]nom|first\s*name|given\s*name|emri)",
        "date_of_birth": r"(?:date\s*de\s*naissance|date\s*of\s*birth|naissance|birth|datelindja)",
        "expiration_date": r"(?:date\s*d.?expiration|date\s*of\s*expiry|expiration|expiry|skadimit|validit[eé])",
        "number": r"(?:num[ée]ro|number|document\s*number|personal\s*no|nr\.?\s*personal|let[eë]rnjoftim)",
        "sex": r"(?:sexe|sex|gender|genre|gjinia)",
        "nationality": r"(?:nationalit[eé]|nationality|shtetesia|citizenship)",
    }

    def add_candidate(field: str, value: str, score: float):
        cleaned = _sanitize_candidate(field, value)
        if cleaned:
            candidates[field].append((score, cleaned))

    # 1) Label-based candidates (inline + nearby lines).
    for i, line in enumerate(lines):
        txt = line["text"]
        norm = _normalize_text(txt)
        conf = line.get("conf", 0.5)
        for field, pat in label_patterns.items():
            m = re.search(pat + r"\s*[:\/\-]?\s*(.+)$", norm, re.IGNORECASE)
            if m:
                add_candidate(field, m.group(1), 1.0 + conf)

                for j in (i + 1, i + 2):
                    if j >= len(lines):
                        continue
                    dy = lines[j]["y"] - line["y"]
                    if 0 <= dy <= 80:
                        add_candidate(field, lines[j]["text"], 0.75 + (lines[j].get("conf", 0.5) * 0.5))

    # 2) Regex/global candidates from full text.
    all_text = " ".join(l["text"] for l in lines)
    all_text_norm = _normalize_text(all_text)

    # Strong bilingual anchors (especially for Albanian IDs).
    for line in lines:
        txt = line["text"]
        conf_boost = 1.2 + (line.get("conf", 0.5) * 0.5)
        m = re.search(r"(?:mbiemri|surname)\s*[:\/\-]?\s*([A-Za-zÀ-ÖØ-öø-ÿ' -]{2,40})$", txt, re.IGNORECASE)
        if m:
            add_candidate("surname", m.group(1), conf_boost)
        m = re.search(r"(?:emri|given\s*name|first\s*name)\s*[:\/\-]?\s*([A-Za-zÀ-ÖØ-öø-ÿ' -]{2,40})$", txt, re.IGNORECASE)
        if m:
            add_candidate("names", m.group(1), conf_boost)
        m = re.search(r"(?:shtetesia|nationality)\s*[:\/\-]?\s*([A-Za-zÀ-ÖØ-öø-ÿ' -]{3,30})$", txt, re.IGNORECASE)
        if m:
            add_candidate("nationality", m.group(1), 1.0 + (line.get("conf", 0.5) * 0.4))
    if "shqiptare" in all_text_norm or "albanian" in all_text_norm:
        add_candidate("nationality", "Albanian", 1.25)
    date_hits = re.findall(r"(\d{2}[\/\.\-]\d{2}[\/\.\-]\d{4}|\d{4}[\/\.\-]\d{2}[\/\.\-]\d{2})", all_text)
    parsed_dates = [(d, _parse_visual_date(d)) for d in date_hits]
    parsed_dates = [(raw, dt) for raw, dt in parsed_dates if dt is not None]
    if parsed_dates:
        now = datetime.now()
        parsed_sorted = sorted(parsed_dates, key=lambda x: x[1])
        for raw, dt in parsed_sorted:
            age = (now - dt).days / 365.25
            if 10 <= age <= 120:
                add_candidate("date_of_birth", raw, 0.8)
                break
        for raw, dt in reversed(parsed_sorted):
            if dt.year >= now.year - 5:
                add_candidate("expiration_date", raw, 0.8)
                break

    for m in re.finditer(r"\b([A-Z]{0,2}[0-9][A-Z0-9\-]{5,12})\b", all_text.upper()):
        add_candidate("number", m.group(1), 0.7)

    for m in re.finditer(r"\b(M|F|MALE|FEMALE|MASCULIN|FEMININ)\b", all_text, re.IGNORECASE):
        add_candidate("sex", m.group(1), 0.65)

    nat = re.search(r"(?:nationality|nationalit[eé]|shtetesia)\s*[:\/\-]?\s*([A-Za-zÀ-ÖØ-öø-ÿ]{3,20})", all_text, re.IGNORECASE)
    if nat:
        add_candidate("nationality", nat.group(1), 0.7)

    # UPPERCASE name candidates
    for line in lines:
        raw = line["text"].strip()
        toks = raw.replace("-", " ").split()
        if 1 <= len(toks) <= 4 and all(t.isalpha() and t.upper() == t for t in toks):
            add_candidate("surname", raw, 0.55 + (line.get("conf", 0.5) * 0.2))
            add_candidate("names", raw, 0.5 + (line.get("conf", 0.5) * 0.2))

    # 3) Ranking
    fields = {}
    for field, vals in candidates.items():
        ranked = sorted(vals, key=lambda x: x[0], reverse=True)
        for _, candidate in ranked:
            if _is_plausible(field, candidate):
                fields[field] = candidate
                break

    # If first name is still missing, try nearby line after surname (common on IDs).
    if fields.get("surname") and not fields.get("names"):
        surname_idx = None
        for idx, line in enumerate(lines):
            if _clean_token(fields["surname"]) and _clean_token(fields["surname"]) in _clean_token(line["text"]):
                surname_idx = idx
                break
        if surname_idx is not None:
            for j in range(surname_idx + 1, min(surname_idx + 5, len(lines))):
                cand = re.sub(r"\s+", " ", lines[j]["text"]).strip()
                if not cand:
                    continue
                cclean = _clean_token(cand)
                if any(tag in cclean for tag in ("name", "given", "emri", "surname", "mbiemri", "nationality")):
                    continue
                if re.fullmatch(r"[A-ZÀ-ÖØ-Ý][a-zà-öø-ÿ]{2,}(?: [A-ZÀ-ÖØ-Ý][a-zà-öø-ÿ]{2,}){0,2}", cand):
                    fields["names"] = cand
                    break

    # Generic fallback for first name: best title-case token line.
    if fields.get("surname") and not fields.get("names"):
        best_name = None
        best_conf = -1.0
        for line in lines:
            cand = re.sub(r"\s+", " ", line["text"]).strip()
            if not re.fullmatch(r"[A-ZÀ-ÖØ-Ý][a-zà-öø-ÿ]{2,}(?: [A-ZÀ-ÖØ-Ý][a-zà-öø-ÿ]{2,}){0,2}", cand):
                continue
            if _clean_token(cand) == _clean_token(fields["surname"]):
                continue
            cclean = _clean_token(cand)
            if any(tag in cclean for tag in ("name", "given", "emri", "surname", "mbiemri", "nationality")):
                continue
            conf = float(line.get("conf", 0.0))
            if conf > best_conf:
                best_name = cand
                best_conf = conf
        if best_name:
            fields["names"] = best_name

    # Avoid same value for surname and names.
    if fields.get("surname") and fields.get("names"):
        if _clean_token(fields["surname"]) == _clean_token(fields["names"]):
            fields.pop("names", None)

    fields["raw_text"] = "\n".join(l["text"] for l in lines)
    return fields


def _extract_fields_visual_ai(image_path: str) -> dict:
    """
    AI approach for non-MRZ docs:
    detector + recognizer (EasyOCR) + candidate ranking.
    """
    try:
        import cv2
        import easyocr
        import numpy as np
    except Exception as e:
        return {"error": f"AI visual OCR unavailable: {e}"}

    try:
        # Lazy singleton: avoid reloading EasyOCR models at every request.
        global _EASYOCR_READER
        if _EASYOCR_READER is None:
            with _EASYOCR_LOCK:
                if _EASYOCR_READER is None:
                    _EASYOCR_READER = easyocr.Reader(["en", "fr"], gpu=False, verbose=False)

        img = cv2.imread(image_path)
        if img is None:
            return {"error": "AI visual OCR failed: cv2 image load error"}

        h, w = img.shape[:2]
        if w < 1100:
            scale = 1100.0 / w
            img = cv2.resize(img, (int(w * scale), int(h * scale)), interpolation=cv2.INTER_CUBIC)

        gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
        th = cv2.adaptiveThreshold(gray, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY, 31, 11)
        rgb = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)

        # Fast path: one OCR pass first. Use second pass only when needed.
        raw_results = _EASYOCR_READER.readtext(rgb, detail=1, paragraph=False)
        if len(raw_results) < 6:
            raw_results.extend(_EASYOCR_READER.readtext(th, detail=1, paragraph=False))

        lines = []
        for item in raw_results:
            if len(item) < 3:
                continue
            bbox, text, conf = item
            txt = str(text or "").strip()
            if not txt:
                continue
            xs = [float(p[0]) for p in bbox]
            ys = [float(p[1]) for p in bbox]
            lines.append({
                "text": txt,
                "x": min(xs),
                "y": min(ys),
                "conf": float(conf) if conf is not None else 0.5,
            })

        if not lines:
            return {"error": "AI visual OCR returned no text lines"}

        # Deduplicate near-identical lines from multi-variant recognition.
        seen = set()
        deduped = []
        for line in sorted(lines, key=lambda x: (x["y"], x["x"])):
            key = (_clean_token(line["text"]), int(line["x"] // 8), int(line["y"] // 8))
            if key in seen:
                continue
            seen.add(key)
            deduped.append(line)

        return _extract_fields_from_lines(deduped)

    except Exception as e:
        return {"error": f"AI visual OCR failed: {e}"}


def _extract_fields_visual_tesseract(image_path: str) -> dict:
    """
    Fallback when no MRZ is detected (e.g. CIN without MRZ).
    Extracts fields via visual OCR using Tesseract.
    """
    import re
    from datetime import datetime

    try:
        import pytesseract
        from PIL import Image
        import numpy as np
        import cv2

        img = Image.open(image_path).convert("RGB")

        h, w = np.array(img).shape[:2]
        if w < 800:
            scale = 800 / w
            img = img.resize((int(w * scale), int(h * scale)), Image.LANCZOS)

        # Multi-pass OCR for non-MRZ cards: different preprocessings + page segment modes.
        base_np = np.array(img)
        gray = cv2.cvtColor(base_np, cv2.COLOR_RGB2GRAY)
        blur = cv2.GaussianBlur(gray, (3, 3), 0)
        th = cv2.adaptiveThreshold(
            blur, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY, 31, 9
        )

        variants = [
            Image.fromarray(base_np),
            Image.fromarray(gray),
            Image.fromarray(th),
        ]
        configs = [
            "--oem 1 --psm 6 -l eng+fra",
            "--oem 1 --psm 11 -l eng+fra",
        ]

        best_text = ""
        best_score = -1
        for var_img in variants:
            for cfg in configs:
                txt = pytesseract.image_to_string(var_img, config=cfg) or ""
                alnum = len(re.findall(r"[A-Za-z0-9]", txt))
                date_hits = len(re.findall(r"\d{2}[\/\.\-]\d{2}[\/\.\-]\d{4}", txt))
                score = alnum + (date_hits * 25)
                if score > best_score:
                    best_score = score
                    best_text = txt

        raw_text = best_text

    except Exception as e:
        return {"error": f"Visual OCR failed: {e}", "raw_text": ""}

    fields = {"raw_text": raw_text}
    lines  = [ln.strip() for ln in raw_text.splitlines() if ln.strip()]
    flat_text = " ".join(lines)

    def parse_visual_date(value: str):
        if not value:
            return None
        txt = value.strip()
        for fmt in ("%d/%m/%Y", "%d-%m-%Y", "%d.%m.%Y", "%Y/%m/%d", "%Y-%m-%d"):
            try:
                return datetime.strptime(txt, fmt)
            except ValueError:
                pass
        return None

    # ── Dates ──
    date_pattern = re.compile(
        r"\b(\d{2}[\/\.\-]\d{2}[\/\.\-]\d{4}|\d{4}[\/\.\-]\d{2}[\/\.\-]\d{2}|\d{8})\b"
    )
    dates_found = []
    for ln in lines:
        for m in date_pattern.finditer(ln):
            dates_found.append(m.group())

    parsed_dates = [(d, parse_visual_date(d)) for d in dates_found]
    parsed_dates = [(raw, dt) for raw, dt in parsed_dates if dt is not None]
    if parsed_dates:
        parsed_sorted = sorted(parsed_dates, key=lambda x: x[1])
        for raw, dt in parsed_sorted:
            age = (datetime.now() - dt).days / 365.25
            if 10 <= age <= 120:
                fields["date_of_birth"] = raw
                break
        for raw, dt in reversed(parsed_sorted):
            if dt.year >= datetime.now().year - 5:
                fields["expiration_date"] = raw
                break

    # ── Document number ──
    doc_num_pattern = re.compile(r"\b([A-Z]{0,2}[0-9][A-Z0-9\-]{5,12})\b")
    for ln in lines:
        m = doc_num_pattern.search(ln)
        if m and not fields.get("number"):
            fields["number"] = m.group()

    # Context-aware document number extraction (e.g., nr/card no/personal no)
    if not fields.get("number"):
        m = re.search(
            r"(?:nr\.?\s*(?:personal|card|document)?|card\s*no|personal\s*no)\s*[:\-]?\s*([A-Z0-9]{6,16})",
            flat_text,
            re.IGNORECASE,
        )
        if m:
            fields["number"] = m.group(1).upper()

    # ── Sex ──
    # Prefer label-aware sex extraction to avoid random isolated letters.
    sex_from_label = re.search(
        r"(?:gjinia|sex|sexe)\s*[:\/\-]?\s*(M|F|Male|Female|Masculin|F[eé]minin)\b",
        flat_text,
        re.IGNORECASE,
    )
    if sex_from_label:
        raw_sex = sex_from_label.group(1).upper()
        if raw_sex in ("MASCULIN", "MALE", "M"):
            fields["sex"] = "M"
        elif raw_sex in ("FÉMININ", "FEMININ", "FEMALE", "F"):
            fields["sex"] = "F"
    else:
        sex_pattern = re.compile(r"\b(Masculin|Féminin|Female|Male)\b", re.IGNORECASE)
        for ln in lines:
            m = sex_pattern.search(ln)
            if m:
                raw_sex = m.group().upper()
                if raw_sex in ("MASCULIN", "MALE"):
                    fields["sex"] = "M"
                elif raw_sex in ("FÉMININ", "FEMININ", "FEMALE"):
                    fields["sex"] = "F"
                break

    # ── Nationality ──
    nationality_kw = re.compile(
        r"(Nationalit[eé]|Citizenship|Pays)[:\s]+([A-Z]{2,3})", re.IGNORECASE
    )
    for ln in lines:
        m = nationality_kw.search(ln)
        if m:
            fields["nationality"] = m.group(2).upper()
            break

    if not fields.get("nationality"):
        m = re.search(
            r"(?:shtetesia|nationality)\s*[:\/\-]?\s*([A-Za-zÀ-ÖØ-öø-ÿ]{3,20})",
            flat_text,
            re.IGNORECASE,
        )
        if m:
            fields["nationality"] = m.group(1).strip()
    if not fields.get("nationality"):
        if re.search(r"\bALBANIAN\b", flat_text, re.IGNORECASE):
            fields["nationality"] = "Albanian"

    # ── Latin name detection (uppercase lines) ──
    SKIP_KEYWORDS = {
        "REPUBLIQUE", "REPUBLIC", "NATIONALE", "NATIONAL", "IDENTITE",
        "IDENTITY", "CARD", "CARTE", "PERMIS", "PASSEPORT", "PASSPORT",
        "NOM", "NAME", "PRENOM", "SURNAME", "FIRSTNAME", "DATE",
        "NAISSANCE", "BIRTH", "EXPIRATION", "VALIDITE", "VALIDITY",
        "SEXE", "SEX", "TUNISIE", "TUNISIA", "MAROC", "MOROCCO",
        "ALGERIE", "ALGERIA", "FRANCE", "BELGIQUE", "BELGIUM",
    }
    name_candidates = []
    for ln in lines:
        clean = ln.replace(".", "").replace(",", "").replace("-", " ").strip()
        words = clean.split()
        if (
            all(w.upper() == w and w.isalpha() for w in words)
            and 1 <= len(words) <= 4
            and 2 <= len(clean) <= 40
            and not any(kw in words for kw in SKIP_KEYWORDS)
        ):
            name_candidates.append(clean)

    if len(name_candidates) >= 1:
        fields["surname"] = name_candidates[0]
    if len(name_candidates) >= 2:
        fields["names"] = name_candidates[1]

    # Context-aware fallback for bilingual labels
    if not fields.get("surname"):
        m = re.search(
            r"(?:mbiemri|surname)\s*[:\/\-]?\s*([A-Za-zÀ-ÖØ-öø-ÿ' -]{2,40})",
            flat_text,
            re.IGNORECASE,
        )
        if m:
            fields["surname"] = m.group(1).strip()
    if not fields.get("names"):
        m = re.search(
            r"(?:emri|given\s*name|first\s*name)\s*[:\/\-]?\s*([A-Za-zÀ-ÖØ-öø-ÿ' -]{2,40})",
            flat_text,
            re.IGNORECASE,
        )
        if m:
            fields["names"] = m.group(1).strip()
    if not fields.get("names") and fields.get("surname"):
        m = re.search(
            re.escape(fields["surname"]) + r"\s+([A-Z][a-zà-öø-ÿ]{2,30})",
            flat_text,
        )
        if m:
            fields["names"] = m.group(1).strip()

    # Final plausibility cleanup to remove OCR garbage values.
    def letters_len(v: str) -> int:
        return len(re.sub(r"[^A-Za-zÀ-ÖØ-öø-ÿ]", "", (v or "")))

    def clean_name(v: str) -> str:
        tokens = (v or "").replace("/", " ").split()
        drop = {"surname", "name", "given", "first", "last", "mbiemri", "emri"}
        while tokens and tokens[0].lower() in drop:
            tokens.pop(0)
        while len(tokens) >= 2 and (tokens[0].islower() or len(tokens[0]) <= 3):
            tokens.pop(0)
        return " ".join(tokens).strip()

    if fields.get("surname"):
        fields["surname"] = clean_name(fields["surname"])
    if fields.get("names"):
        fields["names"] = clean_name(fields["names"])
    if fields.get("names") and fields.get("surname"):
        if fields["names"].upper() == fields["surname"].upper():
            fields.pop("names", None)

    if fields.get("surname") and letters_len(fields["surname"]) < 2:
        fields.pop("surname", None)
    if fields.get("names") and letters_len(fields["names"]) < 2:
        fields.pop("names", None)
    if fields.get("number"):
        compact = re.sub(r"\s+", "", fields["number"].upper())
        if not re.search(r"\d", compact) or len(compact) < 6:
            fields.pop("number", None)
    if fields.get("sex") and fields["sex"].upper() not in ("M", "F"):
        fields.pop("sex", None)

    return fields


def _extract_fields_visual(image_path: str) -> dict:
    """
    Prefer AI detection+recognition pipeline for no-MRZ IDs.
    Fallback to legacy Tesseract path for compatibility.
    """
    ai = _extract_fields_visual_ai(image_path)
    ai_error = ai.pop("error", None)
    if ai and len([k for k in ai.keys() if k != "raw_text"]) >= 2:
        ai["extraction_engine"] = "easyocr_detection_recognition_ranking"
        return ai

    legacy = _extract_fields_visual_tesseract(image_path)
    legacy_error = legacy.pop("error", None)
    if ai_error:
        legacy["note"] = f"AI fallback used legacy pipeline ({ai_error})"
    if legacy_error:
        legacy["error"] = legacy_error
    legacy["extraction_engine"] = "tesseract_legacy_fallback"
    return legacy


# ─────────────────────────────────────────────
# MAIN FUNCTION
# ─────────────────────────────────────────────

def analyze(image_path: str) -> dict:
    """
    MRZ OCR analysis.
    If MRZ found  → full MRZ pipeline.
    If not found  → visual OCR fallback.
    """

    # ── Attempt MRZ ──
    if OCR_AVAILABLE:
        try:
            result = read_mrz_legacy(image_path, save_roi=False)
        except Exception:
            result = None
    else:
        result = None

    # ── MRZ found ──
    if result is not None:
        try:
            data = result.to_dict()
        except Exception:
            data = {}

        check_keys = [
            "valid_number",
            "valid_date_of_birth",
            "valid_expiration_date",
            "valid_composite",
            "valid_personal_number",
        ]
        checks = {key: bool(data.get(key, False)) for key in check_keys}
        passed = sum(1 for v in checks.values() if v)
        score  = passed / 5.0

        mrz_type = str(data.get("mrz_type", "")).strip() or "Unknown"

        def safe(key):
            val = data.get(key, "")
            return str(val).strip() if val is not None else ""

        fields = {
            "raw_text":        safe("raw_text"),
            "type":            safe("type"),
            "country":         safe("country"),
            "number":          safe("number"),
            "date_of_birth":   safe("date_of_birth"),
            "expiration_date": safe("expiration_date"),
            "nationality":     safe("nationality"),
            "sex":             safe("sex"),
            "names":           safe("names"),
            "surname":         safe("surname"),
            "personal_number": safe("personal_number"),
            "check_number":    safe("check_number"),
        }

        return {
            "score":       round(score, 4),
            "valid":       all(checks.values()),
            "mrz_found":   True,
            "mrz_type":    mrz_type,
            "valid_score": int(score * 100),
            "fields":      fields,
            "checks":      checks,
            "error":       None,
        }

    # ── No MRZ — visual OCR fallback ──
    visual_fields = _extract_fields_visual(image_path)
    ocr_error = visual_fields.pop("error", None)
    raw_text  = visual_fields.get("raw_text", "")

    FIELD_WEIGHTS = {
        "surname":         0.25,
        "date_of_birth":   0.25,
        "number":          0.20,
        "expiration_date": 0.15,
        "sex":             0.10,
        "nationality":     0.05,
    }
    confidence = sum(
        w for field, w in FIELD_WEIGHTS.items() if visual_fields.get(field)
    )
    score  = round(0.40 + confidence * 0.25, 4)
    checks = {f"field_{k}_found": bool(visual_fields.get(k))
              for k in FIELD_WEIGHTS}

    return {
        "score":       score,
        "valid":       False,
        "mrz_found":   False,
        "mrz_type":    "None",
        "valid_score": int(score * 100),
        "fields":      {**visual_fields, "raw_text": raw_text},
        "checks":      checks,
        "error":       ocr_error,
        "note":        "No MRZ detected — visual field extraction used",
    }