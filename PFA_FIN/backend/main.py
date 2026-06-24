import sys
import os
sys.path.insert(0, os.path.dirname(__file__))

import logging

# Before TensorFlow / Keras load (via pipeline → cnn_module): cut noisy absl / TF warnings.
for _lg in ("absl", "tensorflow"):
    logging.getLogger(_lg).setLevel(logging.ERROR)

import tempfile
import hashlib
import numpy as np
from collections import OrderedDict
from fastapi import FastAPI, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.responses import JSONResponse

import gdown
from contextlib import asynccontextmanager

import pipeline

# ─────────────────────────────────────────────
# AUTO-DOWNLOAD MODEL IF MISSING
# ─────────────────────────────────────────────

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
MODEL_PATH = os.path.join(BASE_DIR, "ID_Project", "models", "best_resnet50_id.h5")
AUTO_DOWNLOAD_MODEL = os.getenv("AUTO_DOWNLOAD_MODEL", "1") == "1"
MAX_UPLOAD_BYTES = 20 * 1024 * 1024
ALLOWED_EXTENSIONS = {".jpg", ".jpeg", ".png", ".bmp", ".tif", ".tiff", ".webp"}

logger = logging.getLogger("uvicorn.error")

if AUTO_DOWNLOAD_MODEL and not os.path.exists(MODEL_PATH):
    os.makedirs(os.path.dirname(MODEL_PATH), exist_ok=True)
    logger.info("Downloading model from Google Drive...")
    gdown.download(
       
        id="1Q2tlsv-EIt_RlunFcoHfh0jdYSqx8AIq",
        output=MODEL_PATH,
        quiet=False,
        fuzzy=True
    )
    logger.info("Model downloaded.")

# ─────────────────────────────────────────────
# JSON serializer qui gère numpy
# ─────────────────────────────────────────────

def numpy_safe(data):
    """Convertit récursivement les types numpy en types Python natifs."""
    if isinstance(data, dict):
        return {str(k): numpy_safe(v) for k, v in data.items()}
    if isinstance(data, list):
        return [numpy_safe(v) for v in data]
    if isinstance(data, tuple):
        return tuple(numpy_safe(v) for v in data)
    if isinstance(data, np.bool_):
        return bool(data)
    if isinstance(data, (np.integer,)):
        return int(data)
    if isinstance(data, (np.floating,)):
        return float(data)
    if isinstance(data, np.ndarray):
        return data.tolist()
    return data


MAX_CACHE_ITEMS = 32
_ANALYSIS_CACHE: "OrderedDict[str, dict]" = OrderedDict()


def _get_cached_result(cache_key: str):
    cached = _ANALYSIS_CACHE.get(cache_key)
    if cached is None:
        return None
    _ANALYSIS_CACHE.move_to_end(cache_key)
    return cached


def _set_cached_result(cache_key: str, result: dict):
    _ANALYSIS_CACHE[cache_key] = result
    _ANALYSIS_CACHE.move_to_end(cache_key)
    if len(_ANALYSIS_CACHE) > MAX_CACHE_ITEMS:
        _ANALYSIS_CACHE.popitem(last=False)

# ─────────────────────────────────────────────
# APP SETUP
# ─────────────────────────────────────────────


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Preload heavy models so first /analyze request is fast."""
    try:
        import cnn_module

        cnn_module.warmup_model()
        logger.info("CNN model ready (warmup done).")
    except Exception as exc:
        logger.warning("CNN warmup skipped: %s", exc)

    try:
        import ocr_module

        if ocr_module.warmup_easyocr():
            logger.info("EasyOCR reader ready (warmup done).")
    except Exception as exc:
        logger.warning("EasyOCR warmup skipped: %s", exc)
    yield


app = FastAPI(title="Document Authenticity API", lifespan=lifespan)
app.add_middleware(GZipMiddleware, minimum_size=1000)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://localhost:4173",
        "https://verify-ai-vers.vercel.app",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ─────────────────────────────────────────────
# ROUTES
# ─────────────────────────────────────────────

@app.get("/health")
def health():
    return {"status": "ok"}


@app.post("/analyze")
async def analyze(file: UploadFile = File(...)):
    original_name = file.filename or "upload.jpg"
    ext = os.path.splitext(original_name)[1].lower()
    if not ext:
        ext = ".jpg"
    if ext not in ALLOWED_EXTENSIONS:
        return JSONResponse(
            status_code=400,
            content={"error": f"Unsupported file type: {ext}"},
        )

    tmp = tempfile.NamedTemporaryFile(suffix=ext, delete=False)
    try:
        contents = await file.read()
        if len(contents) > MAX_UPLOAD_BYTES:
            return JSONResponse(
                status_code=413,
                content={"error": "File too large. Max size is 20MB."},
            )
        if not contents:
            return JSONResponse(
                status_code=400,
                content={"error": "Empty file upload."},
            )
        file_hash = hashlib.sha256(contents).hexdigest()

        cached = _get_cached_result(file_hash)
        if cached is not None:
            logger.info("Cache hit for: %s", original_name)
            return JSONResponse(content=cached)

        tmp.write(contents)
        tmp.close()

        logger.info("Analyzing: %s (%s bytes)", original_name, len(contents))

        result = pipeline.run_pipeline(tmp.name)
        result = numpy_safe(result)
        _set_cached_result(file_hash, result)

        return JSONResponse(content=result)

    except Exception as e:
        import traceback
        traceback.print_exc()
        return JSONResponse(
            status_code=500,
            content={"error": str(e)}
        )
    finally:
        try:
            os.remove(tmp.name)
        except OSError:
            pass