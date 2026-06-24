import sys, os
sys.path.insert(0, os.path.dirname(__file__))

import concurrent.futures
import re
import time
import os

import cnn_module
import ocr_module
import ocr_fields_module
import font_module
import metadata_module
import doc_fields_module

CNN_TIMEOUT_S = float(os.getenv("CNN_TIMEOUT_S", "18"))
OCR_TIMEOUT_S = float(os.getenv("OCR_TIMEOUT_S", "20"))
DOC_FIELDS_TIMEOUT_S = float(os.getenv("DOC_FIELDS_TIMEOUT_S", "8"))


def _safe_doc_fields(image_path: str) -> dict:
    try:
        return doc_fields_module.analyze(image_path)
    except Exception as e:
        return {
            "photo_base64": None,
            "fields": {},
            "field_labels": {},
            "error": str(e),
        }


def _timed_call(fn, *args, **kwargs):
    t0 = time.perf_counter()
    result = fn(*args, **kwargs)
    return result, (time.perf_counter() - t0)


def _resolve_with_timeout(future, timeout_s: float, fallback_result: dict):
    try:
        return future.result(timeout=timeout_s)
    except concurrent.futures.TimeoutError:
        return fallback_result, timeout_s


def _is_visual_date(value: str) -> bool:
    if not value:
        return False
    return bool(
        re.fullmatch(r"\d{2}[\/\.\-]\d{2}[\/\.\-]\d{4}", value.strip()) or
        re.fullmatch(r"\d{4}[\/\.\-]\d{2}[\/\.\-]\d{2}", value.strip())
    )


def _looks_valid_name(value: str) -> bool:
    if not value:
        return False
    cleaned = re.sub(r"[^A-Za-zÀ-ÖØ-öø-ÿ\s'-]", "", value).strip()
    return len(cleaned) >= 2 and any(ch.isalpha() for ch in cleaned)


def _enrich_visual_ocr_fields(ocr_result: dict, doc_fields_result: dict) -> dict:
    """
    When MRZ is absent, merge robust TSV-extracted fields into OCR fallback fields.
    This keeps MRZ path untouched and improves no-MRZ extraction consistency.
    """
    if not isinstance(ocr_result, dict):
        return ocr_result
    if ocr_result.get("mrz_found", True):
        return ocr_result

    ocr_fields = dict(ocr_result.get("fields", {}) or {})
    doc_fields = dict(doc_fields_result.get("fields", {}) or {})
    if not doc_fields:
        return ocr_result

    merged = dict(ocr_fields)

    for key in ("surname", "names", "nationality", "sex", "date_of_birth", "expiration_date", "number"):
        incoming = (doc_fields.get(key) or "").strip()
        current = (merged.get(key) or "").strip()
        if not incoming:
            continue
        if not current:
            merged[key] = incoming
            continue

        if key in ("surname", "names"):
            if (not _looks_valid_name(current)) and _looks_valid_name(incoming):
                merged[key] = incoming
        elif key in ("date_of_birth", "expiration_date"):
            if (not _is_visual_date(current)) and _is_visual_date(incoming):
                merged[key] = incoming
        elif key == "sex":
            if current.upper() not in ("M", "F") and incoming.upper() in ("M", "F"):
                merged[key] = incoming.upper()
        elif key == "number":
            cur_compact = re.sub(r"\s+", "", current)
            in_compact = re.sub(r"\s+", "", incoming)
            if len(cur_compact) < 6 <= len(in_compact):
                merged[key] = incoming
        elif key == "nationality":
            if len(current) <= 2 and len(incoming) > len(current):
                merged[key] = incoming

    checks = dict(ocr_result.get("checks", {}) or {})
    for key in ("surname", "date_of_birth", "number", "expiration_date", "sex", "nationality"):
        checks[f"field_{key}_found"] = bool((merged.get(key) or "").strip())

    merged_result = dict(ocr_result)
    merged_result["fields"] = merged
    merged_result["checks"] = checks
    return merged_result


def run_pipeline(image_path: str) -> dict:
    """
    Run all independent analysis modules concurrently.

    NOTE: We use ThreadPoolExecutor (not ProcessPoolExecutor) because:
    - TensorFlow/Keras models cannot be pickled across processes on Windows
    - The GIL is released during I/O-heavy operations (image reading, disk access)
    - CNN inference releases the GIL during native C ops in most TF builds
    """
    t0 = time.perf_counter()
    executor = concurrent.futures.ThreadPoolExecutor(max_workers=5)
    try:
        future_cnn        = executor.submit(_timed_call, cnn_module.analyze, image_path)
        future_ocr        = executor.submit(_timed_call, ocr_module.analyze, image_path)
        future_font       = executor.submit(_timed_call, font_module.analyze, image_path)
        future_metadata   = executor.submit(_timed_call, metadata_module.analyze, image_path)
        future_doc_fields = executor.submit(_timed_call, _safe_doc_fields, image_path)

        ocr_result, t_ocr = _resolve_with_timeout(
            future_ocr,
            OCR_TIMEOUT_S,
            {
                "score": 0.4,
                "valid": False,
                "mrz_found": False,
                "mrz_type": "None",
                "valid_score": 40,
                "fields": {},
                "checks": {},
                "error": "ocr_timeout",
                "note": "OCR timeout — fallback mode used",
            },
        )
        font_result, t_font = future_font.result()
        metadata_result, t_meta = future_metadata.result()

        # Enforce timeout on heavy optional branches.
        cnn_result, t_cnn = _resolve_with_timeout(
            future_cnn,
            CNN_TIMEOUT_S,
            {"label": "Unknown", "confidence": 0.0, "score": 0.5, "error": "cnn_timeout"},
        )
        doc_fields_result, t_doc = _resolve_with_timeout(
            future_doc_fields,
            DOC_FIELDS_TIMEOUT_S,
            {"photo_base64": None, "fields": {}, "field_labels": {}, "error": "doc_fields_timeout"},
        )
    finally:
        # Don't block response on timed-out tasks.
        executor.shutdown(wait=False, cancel_futures=True)

    try:
        cnn_module.apply_layout_hints(cnn_result, doc_fields_result)
    except Exception:
        pass

    ocr_result = _enrich_visual_ocr_fields(ocr_result, doc_fields_result)

    # OCR fields depends on ocr_result — must run after
    fields_t0 = time.perf_counter()
    fields_result = ocr_fields_module.analyze(ocr_result)
    t_fields = time.perf_counter() - fields_t0
    total_elapsed = time.perf_counter() - t0

    # ── MRZ flag ──
    mrz_found = ocr_result.get("mrz_found", True)

    # ── Structural score ──
    mrz_score    = ocr_result["score"]
    fields_score = fields_result["score"]
    font_score   = font_result["score"]

    if mrz_found:
        structural_score = (
            mrz_score    * 0.40 +
            fields_score * 0.40 +
            font_score   * 0.20
        )
    else:
        structural_score = (
            fields_score * 0.55 +
            font_score   * 0.30 +
            mrz_score    * 0.15
        )
        print("No MRZ detected - using visual field weights")

    structural_score = round(max(0.0, min(1.0, structural_score)), 4)

    # ── CNN score (robust fallback when module returns error/unknown) ──
    cnn_label = str(cnn_result.get("label", "Unknown"))
    cnn_conf = float(cnn_result.get("confidence", 0.0))
    if cnn_label == "Real":
        cnn_score = cnn_conf
    elif cnn_label == "Falsified":
        cnn_score = 1.0 - cnn_conf
    else:
        # Neutral contribution on failure/unknown to avoid false positives.
        cnn_score = 0.5
    cnn_score = round(max(0.0, min(1.0, cnn_score)), 4)

    # ── Metadata score (inverted — lower forensic risk = higher authenticity) ──
    metadata_score = 1.0 - metadata_result["score"]

    # ── Global score ──
    if mrz_found:
        global_score = (
            cnn_score        * 0.50 +
            structural_score * 0.30 +
            metadata_score   * 0.20
        )
    else:
        global_score = (
            cnn_score        * 0.55 +
            structural_score * 0.25 +
            metadata_score   * 0.20
        )

    global_score = round(max(0.0, min(1.0, global_score)), 4)

    # ── Verdict ──
    if global_score >= 0.75:
        verdict = "Authentic"
    elif global_score >= 0.50:
        verdict = "Suspicious"
    else:
        verdict = "Fake"

    print(
        f"Pipeline done: mrz_found={mrz_found}, global_score={global_score} -> {verdict}"
    )

    return {
        "global_score":         global_score,
        "global_score_display": round(global_score * 100, 2),
        "verdict":              verdict,
        "structural_score":     structural_score,
        "mrz_found":            mrz_found,
        "cnn":                  cnn_result,
        "ocr":                  ocr_result,
        "ocr_fields":           fields_result,
        "doc_fields":           doc_fields_result,
        "font":                 font_result,
        "metadata":             metadata_result,
        "performance": {
            "cnn_s": round(t_cnn, 3),
            "ocr_s": round(t_ocr, 3),
            "font_s": round(t_font, 3),
            "metadata_s": round(t_meta, 3),
            "doc_fields_s": round(t_doc, 3),
            "ocr_fields_s": round(t_fields, 3),
            "total_s": round(total_elapsed, 3),
        },
    }