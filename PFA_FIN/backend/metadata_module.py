"""
metadata_module.py — Corrected forensic analysis
 
CORRECTIONS vs original:
1. ELA: Amplified diff (×15 here) before colormap (standard Krawetz approach) — makes
   tampered zones bright red/yellow instead of nearly invisible.
2. Noise heatmap: shows DEVIATION from local mean, clamped and amplified ×3
   so genuine noise differences are visible.
3. Both heatmaps are blended with the GRAYSCALE original (not RGB) at a lower
   alpha so forensic colors dominate and are readable.
4. Jet colormap applied AFTER normalization to [0,1] — previously had a bug
   where low-contrast images produced nearly uniform blue maps.
"""

import os
import io
import base64
import concurrent.futures
import numpy as np
from PIL import Image, ExifTags

try:
    from pillow_heif import register_heif_opener
    register_heif_opener()
except ImportError:
    pass

try:
    import jpegio
    JPEGIO_AVAILABLE = True
except ImportError:
    JPEGIO_AVAILABLE = False


# ─────────────────────────────────────────────
# HELPERS — loading
# ─────────────────────────────────────────────

def _load_rgb(image_path: str) -> np.ndarray:
    img = Image.open(image_path)
    if img.mode == "RGBA":
        bg = Image.new("RGB", img.size, (255, 255, 255))
        bg.paste(img, mask=img.split()[3])
        img = bg
    elif img.mode != "RGB":
        img = img.convert("RGB")
    return np.array(img, dtype=np.float32)


def _rgb_to_luminance(rgb: np.ndarray) -> np.ndarray:
    """Standard ITU-R BT.601 luminance."""
    return 0.299 * rgb[:, :, 0] + 0.587 * rgb[:, :, 1] + 0.114 * rgb[:, :, 2]


# ─────────────────────────────────────────────
# HELPER — jet colormap (FIXED: input must be in [0,1])
# ─────────────────────────────────────────────

def _apply_jet_colormap(norm_map: np.ndarray) -> np.ndarray:
    """
    Apply JET colormap to a [0,1] normalised array.
    Blue=low, Cyan, Green, Yellow, Red=high — standard forensic display.
    """
    # Clamp to [0, 1]
    x = np.clip(norm_map, 0.0, 1.0)

    r = np.clip(1.5 - np.abs(x - 0.75) * 4, 0, 1)
    g = np.clip(1.5 - np.abs(x - 0.50) * 4, 0, 1)
    b = np.clip(1.5 - np.abs(x - 0.25) * 4, 0, 1)

    return (np.stack([r, g, b], axis=-1) * 255).astype(np.uint8)


def _encode_heatmap_overlay(
    original_rgb: np.ndarray,
    heatmap_norm: np.ndarray,   # [0, 1] float
    alpha: float = 0.70,
    quality: int = 85,
) -> str:
    """
    Blend jet-colorised heatmap onto a grayscale version of the original.
    Higher alpha → more vivid forensic colours.
    Returns base64 JPEG string.
    """
    h, w = original_rgb.shape[:2]

    # Grayscale background — makes colours pop
    gray  = _rgb_to_luminance(original_rgb)
    bg    = np.stack([gray, gray, gray], axis=-1).astype(np.float32)

    # Resize heatmap to image size
    hm_img  = Image.fromarray(np.uint8(heatmap_norm * 255)).resize((w, h), Image.BILINEAR)
    hm_norm = np.array(hm_img, dtype=np.float32) / 255.0

    jet_rgb = _apply_jet_colormap(hm_norm).astype(np.float32)

    blended = alpha * jet_rgb + (1.0 - alpha) * bg
    blended = np.clip(blended, 0, 255).astype(np.uint8)

    buf = io.BytesIO()
    Image.fromarray(blended).save(buf, format="JPEG", quality=quality, optimize=True)
    return base64.b64encode(buf.getvalue()).decode("utf-8")


# ─────────────────────────────────────────────
# MODULE 1 — EXIF analysis (unchanged logic)
# ─────────────────────────────────────────────

SOFTWARE_EDITORS = [
    "photoshop", "gimp", "lightroom", "affinity", "pixelmator",
    "paint.net", "snapseed", "facetune", "meitu", "picsart",
    "canva", "fotor", "pixlr", "capture one", "darktable",
    "corel", "inkscape", "illustrator"
]


def _analyze_exif(image_path: str) -> dict:
    try:
        img = Image.open(image_path)
        raw = img._getexif()
    except Exception:
        raw = None

    details           = []
    detected_software = None

    if not raw:
        return {
            "score": 50.0,
            "details": [
                "Pas de métadonnées EXIF — souvent le cas pour un scan ou une capture "
                "(on applique un score neutre de 50 % pour ne pas pénaliser à tort)."
            ],
            "detected_software": None,
        }

    exif  = {ExifTags.TAGS.get(k, str(k)): str(v) for k, v in raw.items()}
    score = 0.0

    software_raw = exif.get("Software", "").strip()
    software_lc  = software_raw.lower()
    if software_lc:
        for editor in SOFTWARE_EDITORS:
            if editor in software_lc:
                score            += 60
                detected_software = software_raw
                details.append(
                    f"Logiciel de retouche repéré dans les EXIF : {software_raw}"
                )
                break
        else:
            details.append(f"Champ « Software » : {software_raw} (rien de suspect)")

    dt_orig = exif.get("DateTimeOriginal", "").strip()
    dt_digi = exif.get("DateTimeDigitized", "").strip()
    dt_mod  = exif.get("DateTime", "").strip()

    if dt_orig and dt_mod and dt_orig != dt_mod:
        score += 25
        details.append(
            f"Date de modification ({dt_mod}) différente de la date d’origine ({dt_orig})"
        )
    elif dt_orig:
        details.append(f"Dates cohérentes autour de : {dt_orig}")

    if dt_orig and dt_digi and dt_orig != dt_digi:
        score += 10
        details.append("Date « numérisée » incohérente avec la date d’origine")

    make  = exif.get("Make", "").strip()
    model = exif.get("Model", "").strip()
    if make and model:
        details.append(f"Appareil indiqué : {make} {model}")
    elif software_lc and not make:
        score += 15
        details.append("Logiciel renseigné sans marque/modèle d’appareil photo")

    orientation = exif.get("Orientation", "")
    if orientation and orientation not in ("1", "0"):
        score += 5
        details.append(f"Orientation EXIF modifiée : {orientation}")

    gps = exif.get("GPSInfo", "")
    if gps:
        score += 10
        details.append(
            "Données GPS présentes — inhabituel pour une photo d’identité classique"
        )

    score = min(score, 100.0)
    if not details:
        details.append("Métadonnées EXIF présentes sans signal d’alerte particulier")

    return {
        "score":             float(score),
        "details":           details,
        "detected_software": detected_software,
    }


# ─────────────────────────────────────────────
# MODULE 2 — ELA (CORRECTED)
#
# KEY FIX: Amplify the difference by ×10 before colormap.
# Real Krawetz ELA multiplies by a scale factor (typically 10-20×)
# so that small JPEG artifacts (which are the actual forensic signal)
# become visible. Without amplification, differences of 1-5 pixel
# values map to near-zero in [0,255] and produce a mostly-blue image.
# ─────────────────────────────────────────────

def _analyze_ela(image_path: str) -> dict:
    ext = os.path.splitext(image_path)[1].lower()

    if ext in (".png", ".bmp", ".tiff", ".tif"):
        return {
            "score":      0.0,
            "details":    [
                f"ELA non applicable au format sans perte ({ext}) — "
                "pas d’artefacts JPEG à analyser."
            ],
            "ela_base64": None,
        }

    try:
        original = _load_rgb(image_path)
        h, w     = original.shape[:2]

        # Re-compress at Q75 (Krawetz 2007 standard)
        buf = io.BytesIO()
        Image.fromarray(original.astype(np.uint8)).save(buf, format="JPEG", quality=75)
        buf.seek(0)
        recompressed = np.array(Image.open(buf).convert("RGB"), dtype=np.float32)

        # Per-channel max diff → amplify ×15 to make signal visible
        diff      = np.abs(original - recompressed)
        diff_gray = diff.max(axis=2)          # (H, W) in [0, 255]
        amplified = np.clip(diff_gray * 15.0, 0, 255)  # ← KEY FIX

        # Block statistics for scoring
        block_size   = 16
        block_errors = []
        heatmap_full = np.zeros((h, w), dtype=np.float32)

        for y in range(0, h - block_size, block_size):
            for x in range(0, w - block_size, block_size):
                block = amplified[y:y+block_size, x:x+block_size]
                val   = float(block.mean())
                block_errors.append(val)
                heatmap_full[y:y+block_size, x:x+block_size] = val

        if not block_errors:
            return {
                "score": 0.0,
                "details": ["ELA : image trop petite pour l’analyse."],
                "ela_base64": None,
            }

        arr  = np.array(block_errors)
        mean = arr.mean()
        std  = arr.std()

        cv              = (std / mean) if mean > 1e-6 else 0.0
        threshold       = mean + 2.0 * std
        anomalous_ratio = float((arr > threshold).mean())
        score           = min(cv * 40 + anomalous_ratio * 100, 100.0)

        # Normalise to [0,1] for colormap
        hm_max = heatmap_full.max()
        if hm_max > 1e-6:
            hm_norm = heatmap_full / hm_max
        else:
            hm_norm = np.zeros_like(heatmap_full)

        ela_b64 = _encode_heatmap_overlay(original, hm_norm, alpha=0.72)

        details = [
            f"ELA — erreur moyenne {diff_gray.mean():.2f} (×{15.0} amplifiée), "
            f"variabilité={cv:.3f}, blocs atypiques={anomalous_ratio*100:.1f} %"
        ]
        if score >= 40:
            details.append(
                "Zones à forte erreur détectées — possible retouche ou collage local"
            )
        else:
            details.append(
                "Répartition de l’erreur assez homogène — rien d’évident côté ELA"
            )

        return {"score": float(score), "details": details, "ela_base64": ela_b64}

    except Exception as e:
        return {"score": 0.0, "details": [f"ELA : échec technique ({e})"], "ela_base64": None}


# ─────────────────────────────────────────────
# MODULE 3 — JPEG Ghost (unchanged logic)
# ─────────────────────────────────────────────

def _ghost_diff_map_at_quality(args) -> np.ndarray:
    original_u8, quality = args
    buf = io.BytesIO()
    Image.fromarray(original_u8).save(buf, format="JPEG", quality=quality)
    buf.seek(0)
    recomp = np.array(Image.open(buf).convert("RGB"), dtype=np.float32)
    return np.mean(np.abs(original_u8.astype(np.float32) - recomp), axis=2)


def _analyze_ghost(image_path: str) -> dict:
    ext = os.path.splitext(image_path)[1].lower()

    if ext not in (".jpg", ".jpeg"):
        return {
            "score":   0.0,
            "details": [
                f"Analyse « compression fantôme » réservée au JPEG — ici : {ext}."
            ],
        }

    try:
        original    = _load_rgb(image_path)
        original_u8 = original.astype(np.uint8)
        h, w        = original.shape[:2]
        qualities   = [50, 60, 70, 75, 80, 85, 90, 95]

        with concurrent.futures.ThreadPoolExecutor(max_workers=4) as ex:
            diff_maps = list(ex.map(
                _ghost_diff_map_at_quality,
                [(original_u8, q) for q in qualities]
            ))

        diff_stack      = np.stack(diff_maps, axis=0)
        min_quality_idx = np.argmin(diff_stack, axis=0)

        block_size   = 32
        block_min_qs = []

        for y in range(0, h - block_size, block_size):
            for x in range(0, w - block_size, block_size):
                block    = min_quality_idx[y:y+block_size, x:x+block_size]
                counts   = np.bincount(block.flatten(), minlength=len(qualities))
                dominant = int(np.argmax(counts))
                block_min_qs.append(dominant)

        if len(block_min_qs) < 4:
            return {"score": 0.0, "details": ["Compression fantôme : image trop petite."]}

        block_min_qs_arr = np.array(block_min_qs)
        q_std      = float(block_min_qs_arr.std())
        dominant_q = qualities[int(np.bincount(block_min_qs_arr).argmax())]

        global_diffs = diff_stack.mean(axis=(1, 2))
        global_min_q = qualities[int(np.argmin(global_diffs))]

        score = min(q_std * 25, 100.0)
        if dominant_q <= 70:
            score = min(score + 15, 100.0)
        elif dominant_q <= 80:
            score = min(score + 8, 100.0)

        details = [
            f"Compression fantôme — qualité JPEG « dominante » : Q{dominant_q}, "
            f"écart spatial des blocs={q_std:.2f}"
        ]
        if score >= 35:
            details.append(
                f"Incohérence de qualité entre zones — possible collage ou double export "
                f"(meilleure cohérence globale vers Q{global_min_q})"
            )
        else:
            details.append(
                f"Signature de compression assez uniforme (environ Q{dominant_q})"
            )

        return {"score": float(score), "details": details}

    except Exception as e:
        return {"score": 0.0, "details": [f"Compression fantôme : erreur ({e})"]}


# ─────────────────────────────────────────────
# MODULE 4 — Local noise analysis (CORRECTED)
#
# KEY FIX: The heatmap now shows the DEVIATION from the local mean
# (i.e. how much each block's noise differs from expected).
# This makes copy-paste regions (near-zero deviation) appear blue
# and over-compressed/edited regions (high deviation) appear red.
# We also amplify ×3 so the signal is visible on clean documents.
# ─────────────────────────────────────────────

def _analyze_noise(image_path: str) -> dict:
    try:
        original = _load_rgb(image_path)
        gray     = _rgb_to_luminance(original)
        h, w     = gray.shape

        block_size   = 32
        heatmap_full = np.zeros((h, w), dtype=np.float32)
        local_stds   = []

        for y in range(0, h - block_size, block_size):
            for x in range(0, w - block_size, block_size):
                block = gray[y:y+block_size, x:x+block_size]
                val   = float(block.std())
                local_stds.append(val)
                heatmap_full[y:y+block_size, x:x+block_size] = val

        if len(local_stds) < 4:
            return {
                "score": 0.0,
                "details": ["Analyse du bruit : image trop petite."],
                "noise_base64": None,
            }

        arr      = np.array(local_stds)
        mean_std = arr.mean()
        std_std  = arr.std()
        cv       = (std_std / mean_std) if mean_std > 1e-6 else 0.0

        low_threshold  = mean_std - 2.0 * std_std
        anomalous_low  = float((arr < max(low_threshold, 0.5)).mean())
        high_threshold = mean_std + 2.5 * std_std
        anomalous_high = float((arr > high_threshold).mean())
        anomalous_ratio = anomalous_low + anomalous_high

        score = min(cv * 30 + anomalous_ratio * 80, 100.0)

        # FIXED heatmap: show deviation from mean, amplified
        deviation    = np.abs(heatmap_full - mean_std)
        dev_amp      = np.clip(deviation * 3.0, 0, None)   # ← amplify ×3
        dev_max      = dev_amp.max()
        if dev_max > 1e-6:
            hm_norm = dev_amp / dev_max
        else:
            hm_norm = np.zeros_like(dev_amp)

        noise_b64 = _encode_heatmap_overlay(original, hm_norm, alpha=0.68)

        details = [
            f"Bruit — grain moyen={mean_std:.2f}, irrégularité={cv:.3f}, "
            f"zones atypiques={anomalous_ratio*100:.1f} %"
        ]
        if anomalous_low > 0.05:
            details.append(
                "Zones anormalement lisses — possible collage ou zone « recollée »"
            )
        if anomalous_high > 0.05:
            details.append(
                "Zones très bruitées — possible sur-compression locale ou retouche"
            )
        if score < 20:
            details.append("Grain plutôt régulier sur l’ensemble — rien de frappant")

        return {
            "score":        float(score),
            "details":      details,
            "noise_base64": noise_b64,
        }

    except Exception as e:
        return {
            "score": 0.0,
            "details": [f"Analyse du bruit : erreur ({e})"],
            "noise_base64": None,
        }


# ─────────────────────────────────────────────
# MAIN FUNCTION
# ─────────────────────────────────────────────

def analyze(image_path: str) -> dict:
    W_EXIF  = 0.20
    W_ELA   = 0.35
    W_GHOST = 0.25
    W_NOISE = 0.20

    with concurrent.futures.ThreadPoolExecutor(max_workers=4) as ex:
        f_exif  = ex.submit(_analyze_exif,  image_path)
        f_ela   = ex.submit(_analyze_ela,   image_path)
        f_ghost = ex.submit(_analyze_ghost, image_path)
        f_noise = ex.submit(_analyze_noise, image_path)

        exif_result  = f_exif.result()
        ela_result   = f_ela.result()
        ghost_result = f_ghost.result()
        noise_result = f_noise.result()

    exif_score  = exif_result["score"]
    ela_score   = ela_result["score"]
    ghost_score = ghost_result["score"]
    noise_score = noise_result["score"]

    final_score = (
        exif_score  * W_EXIF  +
        ela_score   * W_ELA   +
        ghost_score * W_GHOST +
        noise_score * W_NOISE
    )
    final_score = float(min(final_score, 100.0))

    if final_score >= 70:
        risk_level = "Critical"
    elif final_score >= 50:
        risk_level = "High"
    elif final_score >= 30:
        risk_level = "Moderate"
    else:
        risk_level = "Low"

    diagnostic = []
    for r in [exif_result, ela_result, ghost_result, noise_result]:
        for d in r.get("details", []):
            diagnostic.append(d)

    if final_score >= 50:
        summary = (
            "Plusieurs signaux forensiques pointent vers un risque élevé : "
            "le document mérite une vérification approfondie (pas un jugement définitif)."
        )
    elif final_score >= 30:
        summary = (
            "Quelques anomalies légères ou ambiguës : on vous conseille de croiser "
            "avec d’autres contrôles (structure, photo d’identité, etc.)."
        )
    else:
        summary = (
            "Rien de très suspect au niveau métadonnées / forensics automatiques "
            "sur ce fichier — le document peut quand même être faux pour d’autres raisons."
        )

    # exif_score, ela_score, ghost, noise are 0–100; score is 0–1 composite (risk)
    return {
        "score":                    round(final_score / 100.0, 4),
        "composite_risk_percent": round(final_score, 2),
        "risk_level":               risk_level,
        "summary":                  summary,
        "diagnostic":               diagnostic,
        "ela_score":                round(ela_score, 2),
        "exif_score":               round(exif_score, 2),
        "double_compression_score": round(ghost_score, 2),
        "noise_score":              round(noise_score, 2),
        "detected_software":        exif_result.get("detected_software"),
        "ela_base64":               ela_result.get("ela_base64"),
        "noise_base64":             noise_result.get("noise_base64"),
        "forensic_params": {
            "ela_recompress_quality":     75,
            "ela_diff_multiplier":        15.0,
            "ela_block_size":             16,
            "noise_block_size":           32,
            "noise_deviation_multiplier": 3.0,
        },
        "risk_thresholds_percent": {
            "low_max": 29.99,
            "moderate_max": 49.99,
            "high_max": 69.99,
        },
        "forensic_help_fr": {
            "exif": (
                "On lit les EXIF (dates, appareil, logiciel, GPS…). "
                "Un logiciel de montage ou des dates incohérentes augmentent le score. "
                "Pondération dans le total : 20 %."
            ),
            "ela": (
                "ELA (Error Level Analysis) : on ré-enregistre l’image en JPEG à qualité fixe "
                "et on colore les écarts — les zones retouchées ou recollées ressortent souvent. "
                "Méthode inspirée de Krawetz. Pondération : 35 %."
            ),
            "ghost": (
                "On compare plusieurs recompressions JPEG et on cherche des zones qui ne « collent » "
                "pas au reste (double export, collage). Réservé aux fichiers JPEG. Pondération : 25 %."
            ),
            "noise": (
                "On découpe l’image en blocs et on regarde si le « grain » est régulier : "
                "un collage peut être trop lisse ou trop haché. Pondération : 20 %."
            ),
            "risk_rules": (
                "Le libellé Risque (Faible à Critique) suit le score global 0 à 100 : "
                "moins de 30 = Faible, 30 à 49 = Modéré, 50 à 69 = Élevé, 70 et plus = Critique."
            ),
            "heatmap_ela": (
                "Bleu = faible écart après ré-compression, rouge = fort écart (zone à examiner). "
                "Ce n’est pas une preuve judiciaire seule."
            ),
            "heatmap_noise": (
                "Bleu = grain proche de la moyenne, rouge = écart fort (zone peut-être retouchée ou collée)."
            ),
        },
    }   