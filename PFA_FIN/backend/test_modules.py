import sys
import os
from pathlib import Path

sys.path.insert(0, os.path.dirname(__file__))

_BACKEND = Path(__file__).resolve().parent
_REPO_ROOT = _BACKEND.parent
# Sample images: repo root (parent of PFA_FIN) or PFA_FIN/backend
_CANDIDATES = [
    _REPO_ROOT.parent / "TN_pass.PNG",
    _REPO_ROOT.parent / "test5.jpeg",
    _BACKEND / "ID_Project" / "results" / "gradcam_result_1.png",
]


def _pick_test_image() -> Path | None:
    for p in _CANDIDATES:
        if p.is_file():
            return p
    return None


TEST_IMAGE = _pick_test_image()

# -- Test metadata --
print("=" * 40)
print("Testing metadata_module...")
try:
    import metadata_module

    if not TEST_IMAGE:
        print("[SKIP] metadata: no sample image found")
    else:
        result = metadata_module.analyze(str(TEST_IMAGE))
        print("[OK] metadata")
        print(f"   score                    : {result['score']}")
        print(f"   risk_level               : {result['risk_level']}")
        print(f"   summary                  : {result['summary']}")
        print(f"   ela_score                : {result['ela_score']}")
        print(f"   exif_score               : {result['exif_score']}")
        print(f"   double_compression_score : {result['double_compression_score']}")
        print("   diagnostic               :")
        for d in result["diagnostic"]:
            print(f"      - {d}")
except Exception as e:
    print(f"[FAIL] metadata: {e}")

# -- Test OCR --
print("=" * 40)
print("Testing ocr_module...")
try:
    import ocr_module

    if not TEST_IMAGE:
        print("[SKIP] ocr: no sample image found")
    else:
        result = ocr_module.analyze(str(TEST_IMAGE))
        print("[OK] ocr")
        print(f"   score       : {result['score']}")
        print(f"   valid       : {result['valid']}")
        print(f"   mrz_type    : {result['mrz_type']}")
        print(f"   valid_score : {result['valid_score']}")
        print(f"   error       : {result['error']}")
        print()
        print("   -- CHECKS --")
        for k, v in result["checks"].items():
            status = "Y" if v else "N"
            print(f"   [{status}] {k}: {v}")
        print()
        print("   -- FIELDS --")
        for k, v in result["fields"].items():
            if v:
                print(f"   {k:20s}: {v}")
except Exception as e:
    print(f"[FAIL] ocr: {e}")

print("=" * 40)

# -- Test CNN --
print("=" * 40)
print("Testing cnn_module...")
try:
    import cnn_module

    if not TEST_IMAGE:
        print("[SKIP] cnn: no sample image found")
    else:
        result = cnn_module.analyze(str(TEST_IMAGE))
        print("[OK] cnn")
        print(f"   score       : {result['score']}")
        print(f"   label       : {result['label']}")
        print(f"   confidence  : {result['confidence']}")
        print(f"   risk_level  : {result['risk_level']}")
        print(f"   explanation : {result['explanation']}")
        gc = "present" if result["gradcam_base64"] else "missing"
        ob = "present" if result["original_base64"] else "missing"
        print(f"   gradcam     : {gc}")
        print(f"   original    : {ob}")
except Exception as e:
    print(f"[FAIL] cnn: {e}")

# -- Test Pipeline --
print("=" * 40)
print("Testing pipeline...")
try:
    import pipeline

    if not TEST_IMAGE:
        print("[SKIP] pipeline: no sample image found")
    else:
        result = pipeline.run_pipeline(str(TEST_IMAGE))
        print("[OK] pipeline")
        print(f"   global_score         : {result['global_score']}")
        print(f"   global_score_display : {result['global_score_display']}")
        print(f"   verdict              : {result['verdict']}")
        print(f"   doc_fields keys      : {list(result.get('doc_fields', {}).keys())}")
except Exception as e:
    print(f"[FAIL] pipeline: {e}")

print("Done.")
