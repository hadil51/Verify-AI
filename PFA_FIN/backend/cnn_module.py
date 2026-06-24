"""
cnn_module.py  —  CNN-based document authenticity analysis
  - LIME: superpixel mean masking (closer to standard LIME), full IMG_SIZE inference,
          batched predictions, adaptive segmentation count / sample count.
  - Grad-CAM: class-specific (faux vs réel) for coherent UX.
  - Integrated Gradients: saliency map at full resolution (complement to Grad-CAM).
  - Seuils Grad-CAM / LIME adaptatifs (percentiles image) bornés par des plafonds.
  - Calibration optionnelle (temperature) via ID_Project/results/calibration.json.
"""

import os
import io
import json
from typing import Optional
import time
import base64
import traceback

import numpy as np

try:
    import logging as _tf_log

    import tensorflow as tf

    os.environ.setdefault("TF_CPP_MIN_LOG_LEVEL", "2")
    _tf_log.getLogger("absl").setLevel(_tf_log.ERROR)
    _tf_log.getLogger("tensorflow").setLevel(_tf_log.ERROR)
    TF_AVAILABLE = True
    _TF_ERROR = ""
except ImportError as _e:
    TF_AVAILABLE = False
    _TF_ERROR = str(_e)

try:
    import cv2
    CV2_AVAILABLE = True
except ImportError:
    CV2_AVAILABLE = False

from PIL import Image, ImageDraw, ImageFont

_MPL_IMPORTED = False
_plt = None


def _get_mpl():
    global _MPL_IMPORTED, _plt
    if not _MPL_IMPORTED:
        import matplotlib
        matplotlib.use("Agg")
        import matplotlib.pyplot as plt
        _plt = plt
        _MPL_IMPORTED = True
    return _plt


_HERE            = os.path.dirname(os.path.abspath(__file__))
ID_PROJECT_ROOT  = os.path.join(_HERE, "ID_Project")
BEST_MODEL_PATH  = os.path.join(ID_PROJECT_ROOT, "models", "best_resnet50_id.h5")
THRESHOLD_PATH      = os.path.join(ID_PROJECT_ROOT, "results", "threshold.json")
CALIBRATION_PATH    = os.path.join(ID_PROJECT_ROOT, "results", "calibration.json")

IMG_SIZE          = 384   # LIME uses same resolution as the classifier (no train/serve skew)
DEFAULT_THRESHOLD = 0.54

_MODEL_CACHE: dict = {"model": None, "last_conv": None, "threshold": None}


def _cnn_runtime_params() -> tuple[int, int, int, str]:
    """
    Returns (lime_segments, lime_samples, ig_steps, tier_label).
    Default profile is fast on CPU. Set env CNN_FULL_EXPLAIN=1 for heavier LIME + IG.
    Optional overrides: CNN_LIME_SEGMENTS, CNN_LIME_SAMPLES, CNN_IG_STEPS.
    """
    full = os.environ.get("CNN_FULL_EXPLAIN", "").strip().lower() in ("1", "true", "yes")
    if full:
        segs = int(os.environ.get("CNN_LIME_SEGMENTS", "48"))
        smps = int(os.environ.get("CNN_LIME_SAMPLES", "64"))
        igs = int(os.environ.get("CNN_IG_STEPS", "14"))
        tier = "full"
    else:
        segs = int(os.environ.get("CNN_LIME_SEGMENTS", "32"))
        smps = int(os.environ.get("CNN_LIME_SAMPLES", "28"))
        igs = int(os.environ.get("CNN_IG_STEPS", "5"))
        tier = "fast"
    return max(8, segs), max(12, smps), max(0, igs), tier


# ── Helpers ───────────────────────────────────────────────────────────────────

def _load_threshold() -> float:
    try:
        with open(THRESHOLD_PATH, "r", encoding="utf-8") as f:
            data = json.load(f)
        return float(data.get("threshold_used", DEFAULT_THRESHOLD))
    except Exception:
        return DEFAULT_THRESHOLD


def _load_calibration() -> dict:
    """Optional temperature scaling on prob_fake for display / risk (label still uses raw prob)."""
    try:
        with open(CALIBRATION_PATH, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return {}


def _temperature_scale_prob(p: float, temperature: float) -> float:
    p = float(max(1e-6, min(1.0 - 1e-6, p)))
    T = max(1e-6, float(temperature))
    logit = np.log(p / (1.0 - p))
    z = logit / T
    return float(1.0 / (1.0 + np.exp(-z)))


def _find_last_conv_layer(model) -> str:
    for name in ["conv5_block3_out", "conv5_block3_3_conv"]:
        try:
            model.get_layer(name)
            return name
        except Exception:
            pass
    for layer in reversed(model.layers):
        try:
            shape = layer.output_shape
        except Exception:
            continue
        if isinstance(shape, tuple) and len(shape) == 4:
            return layer.name
    raise ValueError("Could not find a suitable conv layer for Grad-CAM.")


def _get_model():
    if not TF_AVAILABLE:
        raise RuntimeError(f"TensorFlow not installed: {_TF_ERROR}")
    if _MODEL_CACHE["model"] is None:
        if not os.path.exists(BEST_MODEL_PATH):
            raise FileNotFoundError(
                f"Trained model not found at:\n  {BEST_MODEL_PATH}\n"
                "Ensure ID_Project/models/best_resnet50_id.h5 exists."
            )
        try:
            from keras.src.layers.core.dense import Dense as _OrigDense
        except Exception:
            from keras.layers import Dense as _OrigDense

        class _PatchedDense(_OrigDense):
            def __init__(self, *args, quantization_config=None, **kwargs):
                super().__init__(*args, **kwargs)

        _MODEL_CACHE["model"] = tf.keras.models.load_model(
            BEST_MODEL_PATH,
            custom_objects={"Dense": _PatchedDense}
        )
        _MODEL_CACHE["last_conv"] = _find_last_conv_layer(_MODEL_CACHE["model"])
        _MODEL_CACHE["threshold"] = _load_threshold()
    return (
        _MODEL_CACHE["model"],
        _MODEL_CACHE["last_conv"],
        float(_MODEL_CACHE["threshold"]),
    )


def _load_image_for_model(img_path: str):
    data = tf.io.read_file(img_path)
    ext  = tf.strings.lower(
        tf.strings.regex_replace(img_path, r"^.*(\.[^\.]+)$", r"\1")
    )

    def _jpeg():  return tf.io.decode_jpeg(data, channels=3)
    def _png():   return tf.io.decode_png(data, channels=3)
    def _fallback():
        img0 = tf.image.decode_image(data, channels=3, expand_animations=False)
        img0.set_shape([None, None, 3])
        return img0

    img = tf.case(
        [(tf.equal(ext, ".jpg"),  _jpeg),
         (tf.equal(ext, ".jpeg"), _jpeg),
         (tf.equal(ext, ".png"),  _png)],
        default=_fallback, exclusive=True,
    )
    img = tf.image.resize(img, [IMG_SIZE, IMG_SIZE], method="bilinear")
    img = tf.cast(img, tf.float32)
    img = tf.clip_by_value(img, 0.0, 255.0)
    orig_rgb   = img.numpy().astype(np.uint8)
    img        = tf.keras.applications.resnet50.preprocess_input(img)
    img_tensor = tf.expand_dims(img, axis=0)
    return img_tensor, orig_rgb


# ── Grad-CAM ──────────────────────────────────────────────────────────────────

def _gradcam_heatmap(
    model, img_tensor, last_conv_layer_name: str, *, explain_fake: bool = True
) -> np.ndarray:
    conv_layer = model.get_layer(last_conv_layer_name)
    grad_model = tf.keras.Model(
        inputs  = model.inputs,
        outputs = [conv_layer.output, model.output],
    )
    with tf.GradientTape() as tape:
        conv_out, pred = grad_model(img_tensor)
        # explain_fake=True: salience for increasing P(fake). False: for increasing P(real)=1-P(fake).
        p = pred[:, 0]
        class_channel = p if explain_fake else (1.0 - p)
    grads        = tape.gradient(class_channel, conv_out)
    pooled_grads = tf.reduce_mean(grads, axis=(0, 1, 2))
    conv_out = conv_out[0]
    heatmap  = tf.reduce_sum(conv_out * pooled_grads, axis=-1)
    heatmap  = tf.nn.relu(heatmap)
    heatmap  = heatmap / (tf.reduce_max(heatmap) + 1e-8)
    return heatmap.numpy()


def _overlay_gradcam(orig_rgb: np.ndarray, heatmap: np.ndarray, alpha: float = 0.50) -> np.ndarray:
    h, w = orig_rgb.shape[:2]
    if CV2_AVAILABLE:
        heatmap_resized = cv2.resize(heatmap, (w, h))
        heatmap_uint8   = np.uint8(255 * heatmap_resized)
        heatmap_color   = cv2.applyColorMap(heatmap_uint8, cv2.COLORMAP_JET)
        heatmap_color   = cv2.cvtColor(heatmap_color, cv2.COLOR_BGR2RGB)
    else:
        plt = _get_mpl()
        heatmap_resized = np.array(
            Image.fromarray(np.uint8(255 * heatmap)).resize((w, h), Image.BILINEAR)
        ) / 255.0
        cmap          = plt.get_cmap("jet")
        heatmap_color = (cmap(heatmap_resized)[:, :, :3] * 255).astype(np.uint8)
    return np.clip(alpha * heatmap_color + (1 - alpha) * orig_rgb, 0, 255).astype(np.uint8)


def _baseline_preprocessed_tensor() -> tf.Tensor:
    gray = np.full((1, IMG_SIZE, IMG_SIZE, 3), 127.0, dtype=np.float32)
    return tf.keras.applications.resnet50.preprocess_input(gray)


def _integrated_gradients_attribution(
    model, img_tensor: tf.Tensor, m_steps: int
) -> np.ndarray:
    """
    Integrated Gradients w.r.t. P(fake). Returns a single-channel map (H,W), max-normalized.
    Pass m_steps=0 to skip work (returns zeros).
    """
    if m_steps <= 0:
        return np.zeros((IMG_SIZE, IMG_SIZE), dtype=np.float32)
    baseline = _baseline_preprocessed_tensor()
    delta    = img_tensor - baseline
    acc      = np.zeros((IMG_SIZE, IMG_SIZE, 3), dtype=np.float32)
    for k in range(m_steps):
        t = (k + 0.5) / float(m_steps)
        inter = baseline + t * delta
        with tf.GradientTape() as tape:
            tape.watch(inter)
            pred = model(inter)
            y = pred[:, 0]
        g = tape.gradient(y, inter)
        if g is None:
            continue
        acc += g.numpy()[0]
    avg_grad = acc / float(max(1, m_steps))
    delta_np = np.asarray(delta[0], dtype=np.float32)
    ig       = delta_np * avg_grad
    attr     = np.sum(np.abs(ig), axis=-1)
    mx       = float(np.max(attr)) + 1e-8
    return (attr / mx).astype(np.float32)


def _gradcam_explanation(heatmap: np.ndarray) -> str:
    h, w   = heatmap.shape
    border = max(1, int(round(min(h, w) * 0.15)))
    edge_mask              = np.zeros_like(heatmap, dtype=bool)
    edge_mask[:border,  :] = True
    edge_mask[-border:, :] = True
    edge_mask[:,  :border] = True
    edge_mask[:, -border:] = True
    center_mask = ~edge_mask
    edge_mean   = float(np.mean(heatmap[edge_mask]))   if np.any(edge_mask)   else 0.0
    center_mean = float(np.mean(heatmap[center_mask])) if np.any(center_mask) else 0.0
    peak        = float(np.max(heatmap))               if heatmap.size        else 0.0
    if edge_mean > center_mean * 1.15:
        return ("Focus is stronger near edges/borders, consistent with seams, "
                "splicing boundaries, or cut-and-paste artifacts.")
    if center_mean > edge_mean * 1.15:
        return ("Focus is stronger in central text/photo regions, consistent with "
                "suspicious local edits or abnormal texture.")
    if peak > 0.85:
        return ("A concentrated hot-spot suggests attention to a small localized "
                "anomaly (texture/seal inconsistency).")
    return ("Attention is diffuse, suggesting reliance on overall print/texture "
            "characteristics rather than a single hotspot.")


# ── LIME Superpixels ───────────────────────────────────────────────────────────
# Same resolution as training/inference; superpixels masked with their mean colour.

def _lime_superpixels(
    model,
    orig_rgb: np.ndarray,
    threshold: float,
    n_segments: int = 32,
    n_samples: int = 28,
):
    h, w = orig_rgb.shape[:2]

    try:
        from skimage.segmentation import slic
        segments = slic(
            orig_rgb,
            n_segments=n_segments,
            compactness=10,
            sigma=1,
            start_label=0,
        )
    except ImportError:
        rows = cols = int(np.ceil(np.sqrt(n_segments)))
        segments = np.zeros((h, w), dtype=np.int32)
        for r in range(rows):
            for c in range(cols):
                r0, r1 = r * h // rows, (r + 1) * h // rows
                c0, c1 = c * w // cols, (c + 1) * w // cols
                segments[r0:r1, c0:c1] = r * cols + c

    n_sp = int(segments.max()) + 1
    sp_mean = np.zeros((n_sp, 3), dtype=np.float32)
    for sp_idx in range(n_sp):
        mask_px = segments == sp_idx
        if not np.any(mask_px):
            continue
        sp_mean[sp_idx] = orig_rgb[mask_px].mean(axis=0)

    rng     = np.random.default_rng(42)
    masks   = rng.integers(0, 2, size=(n_samples, n_sp), dtype=np.uint8)
    batch_inputs = np.zeros((n_samples, h, w, 3), dtype=np.float32)

    for i, mask_row in enumerate(masks):
        perturbed = orig_rgb.astype(np.float32).copy()
        for sp_idx in range(n_sp):
            if mask_row[sp_idx] == 0:
                mask_px = segments == sp_idx
                perturbed[mask_px] = sp_mean[sp_idx]
        proc = tf.keras.applications.resnet50.preprocess_input(
            np.expand_dims(np.asarray(perturbed, dtype=np.float32), axis=0)
        )
        batch_inputs[i] = np.asarray(proc[0], dtype=np.float32)

    raw_batch = model.predict(batch_inputs, verbose=0, batch_size=min(32, n_samples))
    probs = np.asarray(raw_batch).reshape(-1).astype(np.float32)

    # ── Weighted linear regression (LIME approximation) ──────────────────────
    all_on    = np.ones(n_sp, dtype=np.float32)
    distances = np.array([
        np.dot(masks[i].astype(np.float32), all_on) /
        (np.linalg.norm(masks[i].astype(np.float32)) * np.linalg.norm(all_on) + 1e-8)
        for i in range(n_samples)
    ], dtype=np.float32)
    kernel_width = 0.25
    weights = np.exp(-(1 - distances) ** 2 / kernel_width ** 2)
    W   = np.diag(weights)
    X   = masks.astype(np.float32)
    y   = probs
    XtW = X.T @ W
    try:
        coef = np.linalg.solve(XtW @ X + 1e-6 * np.eye(n_sp), XtW @ y)
    except np.linalg.LinAlgError:
        coef = np.zeros(n_sp, dtype=np.float32)

    max_abs = max(float(np.abs(coef).max()), 1e-8)
    coef_n  = coef / max_abs

    # ── Render LIME overlay ───────────────────────────────────────────────────
    canvas = (orig_rgb * 0.25).astype(np.float32)
    for sp_idx in range(n_sp):
        mask_px = segments == sp_idx
        v       = float(coef_n[sp_idx])
        if v > 0.10:
            intensity = min(v, 1.0)
            overlay   = np.array([220 * intensity, 30 * intensity, 30 * intensity], dtype=np.float32)
            canvas[mask_px] = (0.45 * canvas[mask_px] +
                               0.55 * (0.35 * orig_rgb[mask_px].astype(np.float32) + 0.65 * overlay))
        elif v < -0.10:
            intensity = min(-v, 1.0)
            overlay   = np.array([30 * intensity, 100 * intensity, 220 * intensity], dtype=np.float32)
            canvas[mask_px] = (0.45 * canvas[mask_px] +
                               0.55 * (0.35 * orig_rgb[mask_px].astype(np.float32) + 0.65 * overlay))

    lime_render = np.clip(canvas, 0, 255).astype(np.uint8)
    try:
        from skimage.segmentation import mark_boundaries
        lime_render = (mark_boundaries(
            lime_render.astype(np.float32) / 255.0,
            segments, color=(1, 1, 1), mode="thin"
        ) * 255).astype(np.uint8)
    except Exception:
        pass

    return lime_render, segments, coef_n


# ── Forgery Localization ──────────────────────────────────────────────────────

def _zone_name(cx: float, cy: float) -> str:
    if cy < 0.25:
        vert = "top"
    elif cy < 0.55:
        vert = "middle"
    else:
        vert = "bottom"
    if cx < 0.30:
        horiz = "left"
    elif cx < 0.65:
        horiz = "center"
    else:
        horiz = "right"
    return {
        ("top",    "left"):   "Header / logo area",
        ("top",    "center"): "Document title area",
        ("top",    "right"):  "Top-right corner",
        ("middle", "left"):   "Photo zone",
        ("middle", "center"): "Name / nationality fields",
        ("middle", "right"):  "ID number zone",
        ("bottom", "left"):   "Signature / seal area",
        ("bottom", "center"): "Date fields",
        ("bottom", "right"):  "MRZ / barcode zone",
    }.get((vert, horiz), f"{vert}-{horiz} area")


def _build_localization_image(
    orig_rgb: np.ndarray,
    heatmap_gradcam: np.ndarray,
    segments: np.ndarray,
    coef_n: np.ndarray,
    label: str,
    gradcam_threshold: float = 0.55,
    lime_threshold: float    = 0.30,
):
    h, w = orig_rgb.shape[:2]

    if label == "Real":
        return orig_rgb.copy(), [], {
            "gradcam_threshold": None,
            "lime_threshold":    None,
            "skipped":           "authentic_document",
        }

    if CV2_AVAILABLE:
        gcam_resized = cv2.resize(heatmap_gradcam, (w, h))
    else:
        gcam_resized = np.array(
            Image.fromarray((heatmap_gradcam * 255).astype(np.uint8)).resize((w, h), Image.BILINEAR)
        ) / 255.0

    p90 = float(np.percentile(gcam_resized, 90))
    gradcam_thr = float(
        np.clip(0.5 * gradcam_threshold + 0.5 * p90, 0.38, 0.78)
    )
    pos = coef_n[coef_n > 0.02]
    if pos.size:
        pl = float(np.percentile(pos, 72))
        lime_thr = float(np.clip(0.5 * lime_threshold + 0.5 * pl, 0.12, 0.50))
    else:
        lime_thr = float(lime_threshold)

    gcam_mask = gcam_resized >= gradcam_thr

    lime_mask = np.zeros((h, w), dtype=bool)
    for sp_idx, imp in enumerate(coef_n):
        if imp >= lime_thr:
            lime_mask[segments == sp_idx] = True

    combined = ((gcam_mask | lime_mask).astype(np.uint8) * 255)

    if CV2_AVAILABLE:
        kernel   = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (15, 15))
        combined = cv2.morphologyEx(combined, cv2.MORPH_CLOSE, kernel)
        combined = cv2.morphologyEx(combined, cv2.MORPH_OPEN,
                                    cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (7, 7)))
        n_comp, _, stats, _ = cv2.connectedComponentsWithStats(combined)
    else:
        n_comp = 1
        stats  = np.zeros((1, 5), dtype=int)

    min_area = (h * w) * 0.005
    max_area = (h * w) * 0.70
    boxes    = []

    if CV2_AVAILABLE:
        for i in range(1, n_comp):
            x   = int(stats[i, cv2.CC_STAT_LEFT])
            y   = int(stats[i, cv2.CC_STAT_TOP])
            bw  = int(stats[i, cv2.CC_STAT_WIDTH])
            bh  = int(stats[i, cv2.CC_STAT_HEIGHT])
            area = int(stats[i, cv2.CC_STAT_AREA])
            if area < min_area or area > max_area:
                continue
            cx_n = (x + bw / 2) / w
            cy_n = (y + bh / 2) / h
            gcam_patch = gcam_resized[y:y+bh, x:x+bw]
            gcam_max   = float(np.max(gcam_patch)) if gcam_patch.size else 0.0
            # LIME can flag regions with little Grad-CAM peak inside the same connected component.
            sub_seg = segments[y:y+bh, x:x+bw]
            lime_max = 0.0
            if sub_seg.size and len(coef_n):
                for sp_idx in np.unique(sub_seg.astype(np.int32)):
                    si = int(sp_idx)
                    if 0 <= si < len(coef_n):
                        v = float(coef_n[si])
                        if v > lime_max:
                            lime_max = v
            severity = max(gcam_max, lime_max, 1e-6)
            boxes.append({"x": x, "y": y, "w": bw, "h": bh,
                          "zone": _zone_name(cx_n, cy_n), "severity": round(severity, 3)})
    else:
        ys, xs = np.where(combined > 0)
        if len(ys):
            boxes.append({"x": int(xs.min()), "y": int(ys.min()),
                          "w": int(xs.max()-xs.min()), "h": int(ys.max()-ys.min()),
                          "zone": _zone_name(0.5, 0.5), "severity": 0.7})
        loc_meta = {
            "gradcam_threshold": round(gradcam_thr, 4),
            "lime_threshold":    round(lime_thr, 4),
            "skipped":           None,
        }
        canvas = orig_rgb.copy().astype(np.float32)
        red_overlay = np.zeros_like(canvas)
        red_overlay[:, :, 0] = 220
        suspicious_px = combined > 128
        canvas[suspicious_px] = 0.55 * canvas[suspicious_px] + 0.45 * red_overlay[suspicious_px]
        canvas = np.clip(canvas, 0, 255).astype(np.uint8)
        zones_out = []
        for idx, box in enumerate(boxes[:5]):
            zones_out.append({
                "index": idx + 1,
                "number": ["①", "②", "③", "④", "⑤"][idx],
                "zone": box["zone"],
                "severity": box["severity"],
                "bbox": {"x": box["x"], "y": box["y"], "w": box["w"], "h": box["h"]},
            })
        return canvas, zones_out, loc_meta

    boxes.sort(key=lambda b: b["severity"], reverse=True)
    # Drop components that are mostly noise vs. the strongest signal (avoids "0% suspect" rows).
    if boxes:
        mx = max(b["severity"] for b in boxes)
        floor = max(0.10, 0.28 * mx)
        kept = [b for b in boxes if b["severity"] >= floor]
        boxes = kept if kept else [boxes[0]]
    boxes = boxes[:5]

    canvas = orig_rgb.copy().astype(np.float32)
    red_overlay          = np.zeros_like(canvas)
    red_overlay[:, :, 0] = 220
    suspicious_px        = combined > 128
    canvas[suspicious_px] = (0.55 * canvas[suspicious_px] +
                              0.45 * red_overlay[suspicious_px])
    canvas = np.clip(canvas, 0, 255).astype(np.uint8)

    pil_img = Image.fromarray(canvas).convert("RGBA")
    draw    = ImageDraw.Draw(pil_img)

    COLORS = [(220,38,38), (234,88,12), (161,0,115), (5,150,105), (37,99,235)]
    NUMS   = ["①", "②", "③", "④", "⑤"]
    zones_out = []

    for idx, box in enumerate(boxes):
        x, y, bw, bh = box["x"], box["y"], box["w"], box["h"]
        color         = COLORS[idx % len(COLORS)]
        num           = NUMS[idx]
        border        = max(3, int(min(w, h) * 0.006))

        for t in range(border):
            draw.rectangle([x-t, y-t, x+bw+t, y+bh+t],
                           outline=color + (230,))

        label_text = f"{num} {box['zone']}"
        pill_x     = max(0, x)
        pill_y     = max(0, y - 26)
        pill_w     = len(label_text) * 7 + 14
        pill_h     = 22
        draw.rounded_rectangle([pill_x, pill_y, pill_x+pill_w, pill_y+pill_h],
                                radius=5, fill=color + (225,))
        draw.text((pill_x + 7, pill_y + 4), label_text, fill=(255,255,255))

        zones_out.append({
            "index":    idx + 1,
            "number":   num,
            "zone":     box["zone"],
            "severity": box["severity"],
            "bbox":     {"x": x, "y": y, "w": bw, "h": bh},
        })

    if zones_out and label == "Falsified":
        banner_h = 36
        banner_y = h - banner_h
        draw.rectangle([0, banner_y, w, h], fill=(15, 15, 15, 210))
        summary = "  ".join(f"{z['number']} {z['zone']}" for z in zones_out)
        draw.text((10, banner_y + 10), summary, fill=(255, 255, 255))

    loc_meta = {
        "gradcam_threshold": round(gradcam_thr, 4),
        "lime_threshold":    round(lime_thr, 4),
        "skipped":           None,
    }
    return np.array(pil_img.convert("RGB")), zones_out, loc_meta


def _cnn_document_risk_level(label: str, confidence: float) -> str:
    """
    User-facing *document* risk (not model epistemic uncertainty).

    - Falsified: `confidence` is P(fake). Higher ⇒ stronger forgery signal ⇒ higher risk.
    - Real: `confidence` is P(real). Higher ⇒ document likely authentic ⇒ lower risk.
    """
    c = float(max(0.0, min(1.0, confidence)))
    if label == "Falsified":
        if c >= 0.8:
            return "High"
        if c >= 0.5:
            return "Medium"
        return "Low"
    if label == "Real":
        if c >= 0.8:
            return "Low"
        if c >= 0.5:
            return "Medium"
        return "High"
    return "High"


_FIELD_ZONE_FR = {
    "surname":         "Zone nom (OCR)",
    "names":           "Zone prénom (OCR)",
    "nationality":     "Zone nationalité (OCR)",
    "date_of_birth":   "Zone date de naissance (OCR)",
    "expiration_date": "Zone date d'expiration (OCR)",
    "number":          "Zone numéro de document (OCR)",
    "sex":             "Zone sexe (OCR)",
}


def _bbox_iou(a: dict, b: dict) -> float:
    ax, ay, aw, ah = a["x"], a["y"], a["w"], a["h"]
    bx, by, bw, bh = b["x"], b["y"], b["w"], b["h"]
    x0, y0 = max(ax, bx), max(ay, by)
    x1, y1 = min(ax + aw, bx + bw), min(ay + ah, by + bh)
    iw, ih = max(0, x1 - x0), max(0, y1 - y0)
    inter = iw * ih
    if inter <= 0:
        return 0.0
    ua = aw * ah + bw * bh - inter
    return float(inter / max(ua, 1e-6))


def apply_layout_hints(cnn_result: dict, doc_fields: Optional[dict]) -> None:
    """
    Renames forgery zone labels when a CNN box overlaps OCR / photo layout
    (original image coords scaled to CNN 384×384). Mutates cnn_result in place.
    """
    zones = cnn_result.get("forgery_zones") or []
    hints = ((doc_fields or {}).get("layout_hints") or {})
    ow    = int(hints.get("original_width") or 0)
    oh    = int(hints.get("original_height") or 0)
    if not zones or ow <= 0 or oh <= 0:
        return

    scale = float(IMG_SIZE)

    def to_cnn(bb: dict) -> dict:
        return {
            "x": int(bb["x"] * scale / ow),
            "y": int(bb["y"] * scale / oh),
            "w": max(1, int(bb["w"] * scale / ow)),
            "h": max(1, int(bb["h"] * scale / oh)),
        }

    for z in zones:
        bb = z.get("bbox") or {}
        zb = {
            "x": int(bb.get("x", 0)),
            "y": int(bb.get("y", 0)),
            "w": int(bb.get("w", 0)),
            "h": int(bb.get("h", 0)),
        }
        if zb["w"] <= 0 or zb["h"] <= 0:
            continue
        best_iou = 0.10
        best_lbl = None
        photo = hints.get("photo_bbox")
        if isinstance(photo, dict) and photo.get("w", 0) > 0:
            i = _bbox_iou(zb, to_cnn(photo))
            if i > best_iou:
                best_iou, best_lbl = i, "Photo (visage) — corrélation OCR"
        for fk, reg in (hints.get("field_boxes") or {}).items():
            if not isinstance(reg, dict) or reg.get("w", 0) <= 0:
                continue
            i = _bbox_iou(zb, to_cnn(reg))
            if i > best_iou:
                best_iou = i
                best_lbl = _FIELD_ZONE_FR.get(str(fk), str(fk))
        if best_lbl and best_iou >= 0.12:
            z["zone"] = best_lbl


# ── Encoding ──────────────────────────────────────────────────────────────────

def _to_base64_jpeg(arr: np.ndarray, quality: int = 88) -> str:
    buf = io.BytesIO()
    Image.fromarray(arr).save(buf, format="JPEG", quality=quality, optimize=True)
    buf.seek(0)
    return base64.b64encode(buf.read()).decode("utf-8")


# ── Main entry ────────────────────────────────────────────────────────────────


def warmup_model() -> None:
    """Load weights + one dry predict so first user request avoids cold TF start."""
    if not TF_AVAILABLE:
        return
    model, _, _ = _get_model()
    z = tf.zeros((1, IMG_SIZE, IMG_SIZE, 3))
    z = tf.keras.applications.resnet50.preprocess_input(z)
    model.predict(z, verbose=0)


def analyze(image_path: str) -> dict:
    if not TF_AVAILABLE:
        return _error_result(f"TensorFlow not available: {_TF_ERROR}")

    t0 = time.time()

    try:
        model, last_conv, threshold_used = _get_model()
    except Exception:
        return _error_result(f"Model load failed:\n{traceback.format_exc()}")

    try:
        lime_segs, lime_smps, ig_steps, explain_tier = _cnn_runtime_params()

        img_tensor, orig_rgb = _load_image_for_model(image_path)

        raw_prob     = model.predict(img_tensor, verbose=0)
        prob_fake    = float(np.asarray(raw_prob).reshape(-1)[0])
        prob_fake_raw = prob_fake

        calib = _load_calibration()
        T     = float(calib.get("temperature", 1.0))
        if T <= 0.0:
            T = 1.0
        prob_cal = (
            _temperature_scale_prob(prob_fake, T) if abs(T - 1.0) > 1e-9 else prob_fake
        )

        label = "Falsified" if prob_fake >= threshold_used else "Real"
        confidence = prob_cal if label == "Falsified" else (1.0 - prob_cal)
        risk_level = _cnn_document_risk_level(label, confidence)

        explain_fake = label == "Falsified"
        heatmap        = _gradcam_heatmap(
            model, img_tensor, last_conv, explain_fake=explain_fake
        )
        overlay        = _overlay_gradcam(orig_rgb, heatmap, alpha=0.50)
        explanation    = _gradcam_explanation(heatmap)
        gradcam_b64    = _to_base64_jpeg(overlay, quality=80)

        ig_b64 = ""
        if ig_steps > 0:
            try:
                ig_map = _integrated_gradients_attribution(
                    model, img_tensor, m_steps=ig_steps
                )
                ig_overlay = _overlay_gradcam(orig_rgb, ig_map, alpha=0.48)
                ig_b64 = _to_base64_jpeg(ig_overlay, quality=78)
            except Exception:
                pass

        lime_b64           = ""
        localization_b64   = ""
        zones_out          = []
        loc_threshold_meta = None
        segments           = np.zeros(orig_rgb.shape[:2], dtype=np.int32)
        coef_n             = np.array([0.0])

        try:
            lime_render, segments, coef_n = _lime_superpixels(
                model,
                orig_rgb,
                threshold_used,
                n_segments=lime_segs,
                n_samples=lime_smps,
            )
            lime_b64 = _to_base64_jpeg(lime_render, quality=78)
        except Exception:
            pass

        try:
            loc_img, zones_out, loc_threshold_meta = _build_localization_image(
                orig_rgb, heatmap, segments, coef_n, label
            )
            if label == "Falsified":
                localization_b64 = _to_base64_jpeg(loc_img, quality=82)
            else:
                localization_b64 = ""
        except Exception:
            localization_b64 = ""

        original_b64 = _to_base64_jpeg(orig_rgb, quality=80)
        t1 = time.time()

        return {
            "score"                    : round(float(1.0 - prob_fake), 4),
            "label"                    : label,
            "confidence"               : round(float(confidence), 4),
            "prob_fake_raw"            : round(float(prob_fake_raw), 4),
            "calibration_temperature"  : round(T, 4) if abs(T - 1.0) > 1e-9 else None,
            "risk_level"               : risk_level,
            "explanation"              : explanation,
            "threshold_used"           : round(float(threshold_used), 4),
            "gradcam_base64"           : gradcam_b64,
            "integrated_gradients_base64": ig_b64,
            "original_base64"          : original_b64,
            "lime_base64"              : lime_b64,
            "localization_base64"      : localization_b64,
            "forgery_zones"            : zones_out,
            "localization_thresholds"  : loc_threshold_meta,
            "attribution_mode"         : (
                "forgery_focus" if label == "Falsified" else "authenticity_focus"
            ),
            "cnn_explain_tier"         : explain_tier,
            "cnn_lime_segments"        : lime_segs,
            "cnn_lime_samples"         : lime_smps,
            "cnn_ig_steps"             : ig_steps,
            "processing_time_sec"      : round(t1 - t0, 3),
            "error"                    : None,
        }

    except Exception:
        return _error_result(traceback.format_exc())


def _error_result(msg: str) -> dict:
    return {
        "score"                      : 0.5,
        "label"                      : "Unknown",
        "confidence"                 : 0.0,
        "prob_fake_raw"              : 0.0,
        "calibration_temperature"    : None,
        "risk_level"                 : "High",
        "explanation"                : "Analysis failed — see error field.",
        "threshold_used"             : DEFAULT_THRESHOLD,
        "gradcam_base64"             : "",
        "integrated_gradients_base64": "",
        "original_base64"            : "",
        "lime_base64"                : "",
        "localization_base64"      : "",
        "forgery_zones"              : [],
        "localization_thresholds"    : None,
        "attribution_mode"           : "forgery_focus",
        "cnn_explain_tier"           : "error",
        "cnn_lime_segments"          : 0,
        "cnn_lime_samples"           : 0,
        "cnn_ig_steps"               : 0,
        "processing_time_sec"        : 0.0,
        "error"                      : msg,
    }