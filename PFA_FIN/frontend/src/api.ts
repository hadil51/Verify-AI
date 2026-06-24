const API_URL = "http://localhost:8000";
const MAX_ANALYSIS_CACHE_ITEMS = 20;
const analysisCache = new Map<string, AnalysisResult>();

export interface OcrResult {
  score: number;
  valid: boolean;
  mrz_found: boolean;
  mrz_type: string;
  valid_score: number;
  fields: Record<string, string>;
  checks: Record<string, boolean>;
  error: string | null;
  note?: string;
}

export interface OcrFieldsResult {
  score: number;
  checks: Record<string, boolean>;
  details: Record<string, string>;
  error: string | null;
  mode?: "mrz" | "visual";
  note?: string;
}

export interface FontResult {
  score: number;
  checks: Record<string, boolean>;
  details: Record<string, string>;
  error: string | null;
}

export interface ForgeryZone {
  index: number;
  number: string; // ① ② …
  zone: string; // "Signature / seal area"
  severity: number; // 0–1
  bbox: { x: number; y: number; w: number; h: number };
}

export interface CnnLocalizationThresholds {
  gradcam_threshold: number | null;
  lime_threshold: number | null;
  skipped?: string | null;
}

export interface CnnResult {
  score: number;
  label: string;
  confidence: number;
  risk_level: string;
  explanation: string;
  gradcam_base64: string;
  original_base64: string;
  lime_base64: string;
  localization_base64: string; // annotated original with bounding boxes
  forgery_zones: ForgeryZone[]; // structured zone list for the UI table
  /** Raw P(fake) before optional temperature calibration. */
  prob_fake_raw?: number;
  /** Set when calibration.json applies temperature scaling. */
  calibration_temperature?: number | null;
  integrated_gradients_base64?: string;
  localization_thresholds?: CnnLocalizationThresholds | null;
  /** "forgery_focus" | "authenticity_focus" — Grad-CAM target class for UX. */
  attribution_mode?: string;
  /** "fast" (default) or "full" when CNN_FULL_EXPLAIN=1 on server. */
  cnn_explain_tier?: string;
  cnn_lime_segments?: number;
  cnn_lime_samples?: number;
  cnn_ig_steps?: number;
}

export interface MetadataResult {
  /** Composite forensic risk, 0–1 (higher = more suspicious). */
  score: number;
  /** Same composite as `score`, expressed as 0–100 (from backend). */
  composite_risk_percent?: number;
  risk_level: string;
  summary: string;
  diagnostic: string[];
  /** Component scores 0–100 from backend (not 0–1). */
  ela_score: number;
  exif_score: number;
  double_compression_score: number;
  noise_score: number;
  detected_software: string | null;
  ela_base64: string | null;
  noise_base64: string | null;
  /** ELA/noise algorithm constants used server-side (for UI labels). */
  forensic_params?: {
    ela_recompress_quality: number;
    ela_diff_multiplier: number;
    ela_block_size: number;
    noise_block_size: number;
    noise_deviation_multiplier: number;
  };
  /** Aligns with server risk_level bands (informational). */
  risk_thresholds_percent?: {
    low_max: number;
    moderate_max: number;
    high_max: number;
  };
  /** French UX copy describing each forensic signal (from backend). */
  forensic_help_fr?: {
    exif: string;
    ela: string;
    ghost: string;
    noise: string;
    risk_rules: string;
    heatmap_ela: string;
    heatmap_noise: string;
  };
}

/** Visual TSV extraction + photo crop (backend doc_fields_module) */
export interface DocFieldsLayoutHints {
  original_width: number;
  original_height: number;
  photo_bbox: { x: number; y: number; w: number; h: number };
  field_boxes: Record<string, { x: number; y: number; w: number; h: number }>;
}

export interface DocFieldsResult {
  photo_base64: string | null;
  fields: Record<string, string>;
  field_labels?: Record<string, string>;
  layout_hints?: DocFieldsLayoutHints;
  error: string | null;
}

export interface AnalysisResult {
  global_score: number;
  global_score_display: number;
  verdict: string;
  structural_score: number;
  mrz_found: boolean;
  ocr: OcrResult;
  ocr_fields: OcrFieldsResult;
  doc_fields?: DocFieldsResult;
  font: FontResult;
  cnn: CnnResult;
  metadata: MetadataResult;
}

function buildFileCacheKey(file: File): string {
  return `${file.name}:${file.size}:${file.lastModified}`;
}

function getCachedAnalysis(key: string): AnalysisResult | null {
  const cached = analysisCache.get(key);
  if (!cached) return null;
  analysisCache.delete(key);
  analysisCache.set(key, cached);
  return cached;
}

function setCachedAnalysis(key: string, data: AnalysisResult) {
  analysisCache.set(key, data);
  if (analysisCache.size > MAX_ANALYSIS_CACHE_ITEMS) {
    const oldestKey = analysisCache.keys().next().value;
    if (oldestKey) analysisCache.delete(oldestKey);
  }
}

export async function analyzeDocument(file: File): Promise<AnalysisResult> {
  const cacheKey = buildFileCacheKey(file);
  const cached = getCachedAnalysis(cacheKey);
  if (cached) {
    return cached;
  }

  const formData = new FormData();
  formData.append("file", file);

  const response = await fetch(`${API_URL}/analyze`, {
    method: "POST",
    body: formData,
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Server error ${response.status}: ${text}`);
  }

  const data: AnalysisResult = await response.json();
  setCachedAnalysis(cacheKey, data);
  return data;
}
