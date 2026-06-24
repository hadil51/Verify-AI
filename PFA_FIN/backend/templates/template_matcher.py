"""Template detection for supported identity document types."""

from __future__ import annotations

import re
import unicodedata
import difflib

from PIL import Image
from PIL import ImageEnhance
import pytesseract

from templates.id_templates import ID_TEMPLATES


_PRIORITY_ORDER = ["RUS", "ALB", "ESP", "EST", "FIN", "SVK"]


def _normalize_text(text: str) -> str:
    txt = (text or "").strip().upper()
    txt = unicodedata.normalize("NFKD", txt)
    txt = "".join(ch for ch in txt if not unicodedata.combining(ch))
    txt = re.sub(r"\s+", " ", txt)
    return txt


def _keyword_variants(keyword: str) -> set[str]:
    base = _normalize_text(keyword)
    ascii_only = re.sub(r"[^A-Z0-9 ]", "", base)
    return {base, ascii_only}


def _ocr_crop(img: Image.Image, lang: str = "eng+rus") -> str:
    gray = img.convert("L")
    upscaled = gray.resize((max(1, gray.width * 2), max(1, gray.height * 2)), Image.LANCZOS)
    enhanced = ImageEnhance.Contrast(upscaled).enhance(2.0)
    text = pytesseract.image_to_string(enhanced, lang=lang)
    return _normalize_text(text)


def _fuzzy_contains(keyword: str, text_tokens: list[str], ratio: float = 0.78) -> bool:
    k = re.sub(r"[^A-Z0-9]", "", _normalize_text(keyword))
    if not k:
        return False
    for tok in text_tokens:
        if not tok:
            continue
        if k in tok or tok in k:
            return True
        if len(k) >= 5 and difflib.SequenceMatcher(a=k, b=tok).ratio() >= ratio:
            return True
    return False


def detect_doc_type(image_path: str) -> str | None:
    """
    Detect document template from OCR keywords in stable regions.

    Strategy:
    1. OCR top 15% strip (full width) with eng+rus
    2. OCR right 10% strip (full height) with eng+rus
    3. Match any template keyword
    4. Resolve ambiguity via fixed priority order
    """
    img = Image.open(image_path).convert("RGB")
    width, height = img.size

    top_crop = img.crop((0, 0, width, int(height * 0.20)))
    right_crop = img.crop((int(width * 0.90), 0, width, height))
    left_top_crop = img.crop((0, 0, int(width * 0.40), int(height * 0.35)))

    # Fast pass (eng only) first; most templates are latin-script.
    top_text = _ocr_crop(top_crop, lang="eng")
    right_text = _ocr_crop(right_crop, lang="eng")
    left_top_text = _ocr_crop(left_top_crop, lang="eng")
    combined_text = f"{top_text}\n{right_text}\n{left_top_text}"
    text_tokens = re.findall(r"[A-Z0-9]{3,}", combined_text)

    scores = {}
    for doc_type, template in ID_TEMPLATES.items():
        hits = 0
        for keyword in template.get("detect_keywords", []):
            if _fuzzy_contains(keyword, text_tokens):
                hits += 1
        if hits > 0:
            scores[doc_type] = hits

    # Fast additional hints for difficult OCR headers.
    if re.search(r"\d{2}\s*\d{2}\s*\d{5,7}", right_text):
        scores["RUS"] = scores.get("RUS", 0) + 2
    if "DOCUMENTO" in combined_text or "IDENTIDAD" in combined_text or "ESPANA" in combined_text:
        scores["ESP"] = scores.get("ESP", 0) + 2
    if "REPUBLIKA" in combined_text and ("ALBANIA" in combined_text or "SHQIP" in combined_text):
        scores["ALB"] = scores.get("ALB", 0) + 2

    # If nothing matched, run a second pass with rus included (costly, but rare).
    if not scores:
        top_text_rus = _ocr_crop(top_crop, lang="eng+rus")
        right_text_rus = _ocr_crop(right_crop, lang="eng+rus")
        left_top_text_rus = _ocr_crop(left_top_crop, lang="eng+rus")
        combined_rus = f"{top_text_rus}\n{right_text_rus}\n{left_top_text_rus}"
        tokens_rus = re.findall(r"[A-Z0-9]{3,}", combined_rus)
        for doc_type, template in ID_TEMPLATES.items():
            hits = 0
            for keyword in template.get("detect_keywords", []):
                if _fuzzy_contains(keyword, tokens_rus):
                    hits += 1
            if hits > 0:
                scores[doc_type] = hits
        if re.search(r"\d{2}\s*\d{2}\s*\d{5,7}", right_text_rus):
            scores["RUS"] = scores.get("RUS", 0) + 2

    if not scores:
        return None
    max_hits = max(scores.values())
    if max_hits <= 0:
        return None
    candidates = {k for k, v in scores.items() if v == max_hits}

    for doc_type in _PRIORITY_ORDER:
        if doc_type in candidates:
            return doc_type

    return None

