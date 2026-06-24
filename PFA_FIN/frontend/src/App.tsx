import { useState, useEffect, useRef, useCallback } from "react";
import { analyzeDocument, AnalysisResult } from "./api";
import TopBar from "./components/TopBar";
import UploadSection from "./components/UploadSection";
import GlobalScore, { ScanRecord } from "./components/GlobalScore";
import AnalysisTabs from "./components/AnalysisTabs";
import CameraCapture from "./components/CameraCapture";

interface UploadedImage {
  name: string;
  src: string;
  time: string;
}

// ── Step icons ────────────────────────────────────────────────────────────────
const StepIcons = {
  image: (
    <svg
      width="28"
      height="28"
      viewBox="0 0 24 24"
      fill="none"
      stroke="#2563eb"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <circle cx="8.5" cy="8.5" r="1.5" />
      <polyline points="21 15 16 10 5 21" />
    </svg>
  ),
  scan: (
    <svg
      width="28"
      height="28"
      viewBox="0 0 24 24"
      fill="none"
      stroke="#2563eb"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M3 7V5a2 2 0 012-2h2M17 3h2a2 2 0 012 2v2M21 17v2a2 2 0 01-2 2h-2M7 21H5a2 2 0 01-2-2v-2" />
      <line x1="3" y1="12" x2="21" y2="12" />
    </svg>
  ),
  database: (
    <svg
      width="28"
      height="28"
      viewBox="0 0 24 24"
      fill="none"
      stroke="#2563eb"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <ellipse cx="12" cy="5" rx="9" ry="3" />
      <path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3" />
      <path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5" />
    </svg>
  ),
  cpu: (
    <svg
      width="28"
      height="28"
      viewBox="0 0 24 24"
      fill="none"
      stroke="#2563eb"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="4" y="4" width="16" height="16" rx="2" />
      <rect x="9" y="9" width="6" height="6" />
      <line x1="9" y1="1" x2="9" y2="4" />
      <line x1="15" y1="1" x2="15" y2="4" />
      <line x1="9" y1="20" x2="9" y2="23" />
      <line x1="15" y1="20" x2="15" y2="23" />
      <line x1="20" y1="9" x2="23" y2="9" />
      <line x1="20" y1="14" x2="23" y2="14" />
      <line x1="1" y1="9" x2="4" y2="9" />
      <line x1="1" y1="14" x2="4" y2="14" />
    </svg>
  ),
  type: (
    <svg
      width="28"
      height="28"
      viewBox="0 0 24 24"
      fill="none"
      stroke="#2563eb"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <polyline points="4 7 4 4 20 4 20 7" />
      <line x1="9" y1="20" x2="15" y2="20" />
      <line x1="12" y1="4" x2="12" y2="20" />
    </svg>
  ),
  barChart: (
    <svg
      width="28"
      height="28"
      viewBox="0 0 24 24"
      fill="none"
      stroke="#2563eb"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <line x1="18" y1="20" x2="18" y2="10" />
      <line x1="12" y1="20" x2="12" y2="4" />
      <line x1="6" y1="20" x2="6" y2="14" />
      <line x1="2" y1="20" x2="22" y2="20" />
    </svg>
  ),
};

const ANALYSIS_STEPS = [
  {
    label: "Lecture de l'image du document…",
    icon: StepIcons.image,
    duration: 1000,
  },
  { label: "Détection OCR & MRZ…", icon: StepIcons.scan, duration: 3000 },
  {
    label: "Analyse des métadonnées & EXIF…",
    icon: StepIcons.database,
    duration: 2500,
  },
  {
    label: "Inférence CNN (deep learning)…",
    icon: StepIcons.cpu,
    duration: 3500,
  },
  {
    label: "Vérification police & alignement…",
    icon: StepIcons.type,
    duration: 2000,
  },
  { label: "Calcul du score global…", icon: StepIcons.barChart, duration: 800 },
];
const TOTAL_DURATION = ANALYSIS_STEPS.reduce((s, x) => s + x.duration, 0);

function LoadingOverlay({ elapsedMs }: { elapsedMs: number }) {
  const elapsed = elapsedMs;
  let stepIdx = ANALYSIS_STEPS.length - 1;
  let cumulative = 0;
  for (let i = 0; i < ANALYSIS_STEPS.length; i++) {
    cumulative += ANALYSIS_STEPS[i].duration;
    if (elapsed < cumulative) {
      stepIdx = i;
      break;
    }
  }
  let stepStart = 0;
  for (let i = 0; i < stepIdx; i++) stepStart += ANALYSIS_STEPS[i].duration;
  const stepPct = Math.min(
    (elapsed - stepStart) / ANALYSIS_STEPS[stepIdx].duration,
    1,
  );
  const overallPct = Math.min((elapsed / TOTAL_DURATION) * 0.95, 0.95);
  const circumference = 2 * Math.PI * 34;
  const step = ANALYSIS_STEPS[stepIdx];

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "80px 24px",
        gap: 28,
        animation: "fadeIn 0.3s ease both",
      }}
    >
      <div style={{ position: "relative", width: 84, height: 84 }}>
        <svg
          width="84"
          height="84"
          viewBox="0 0 84 84"
          style={{ position: "absolute", inset: 0 }}
        >
          <circle
            cx="42"
            cy="42"
            r="34"
            fill="none"
            stroke="#e5e7eb"
            strokeWidth="5"
          />
          <circle
            cx="42"
            cy="42"
            r="34"
            fill="none"
            stroke="#2563eb"
            strokeWidth="5"
            strokeLinecap="round"
            strokeDasharray={`${circumference * stepPct} ${circumference * (1 - stepPct)}`}
            strokeDashoffset={circumference * 0.25}
            style={{ transition: "stroke-dasharray 0.15s linear" }}
          />
        </svg>
        <div
          style={{
            position: "absolute",
            inset: 10,
            borderRadius: "50%",
            background: "#ffffff",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            boxShadow: "0 2px 12px rgba(37,99,235,0.12)",
          }}
        >
          {step.icon}
        </div>
      </div>
      <div style={{ textAlign: "center" }}>
        <p
          style={{
            color: "#1a1a2e",
            fontWeight: 700,
            fontSize: 15,
            margin: "0 0 5px",
          }}
        >
          {step.label}
        </p>
        <p style={{ color: "#9ca3af", fontSize: 12, margin: 0 }}>
          Étape {stepIdx + 1} / {ANALYSIS_STEPS.length}
        </p>
      </div>
      <div style={{ width: 340 }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            fontSize: 11,
            color: "#9ca3af",
            marginBottom: 6,
          }}
        >
          <span>Progression globale</span>
          <span>{Math.round(overallPct * 100)}%</span>
        </div>
        <div
          style={{
            height: 6,
            borderRadius: 3,
            background: "#f3f4f6",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              height: "100%",
              borderRadius: 3,
              background: "linear-gradient(90deg, #2563eb 0%, #60a5fa 100%)",
              width: `${overallPct * 100}%`,
              transition: "width 0.2s ease",
            }}
          />
        </div>
      </div>
      <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
        {ANALYSIS_STEPS.map((_, i) => (
          <div
            key={i}
            style={{
              height: 6,
              borderRadius: 3,
              width: i === stepIdx ? 22 : 6,
              background:
                i < stepIdx ? "#bfdbfe" : i === stepIdx ? "#2563eb" : "#e5e7eb",
              transition: "all 0.3s ease",
            }}
          />
        ))}
      </div>
      <p style={{ color: "#9ca3af", fontSize: 12, margin: 0 }}>
        L'analyse prend généralement 30-32 secondes
      </p>
      <p style={{ color: "#6b7280", fontSize: 11, margin: 0 }}>
        Temps écoulé: {(elapsed / 1000).toFixed(1)}s
      </p>
    </div>
  );
}

// ── Fullscreen lightbox ───────────────────────────────────────────────────────
function DocLightbox({
  images,
  idx,
  onClose,
  onNav,
  onDownload,
}: {
  images: UploadedImage[];
  idx: number;
  onClose: () => void;
  onNav: (i: number) => void;
  onDownload: (img: UploadedImage) => void;
}) {
  const img = images[idx];
  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 10000,
        background: "rgba(0,0,0,0.92)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {idx > 0 && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onNav(idx - 1);
          }}
          style={{
            position: "absolute",
            left: 20,
            top: "50%",
            transform: "translateY(-50%)",
            background: "rgba(255,255,255,0.1)",
            border: "1px solid rgba(255,255,255,0.15)",
            borderRadius: "50%",
            width: 44,
            height: 44,
            color: "#fff",
            fontSize: 22,
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          ‹
        </button>
      )}
      {idx < images.length - 1 && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onNav(idx + 1);
          }}
          style={{
            position: "absolute",
            right: 20,
            top: "50%",
            transform: "translateY(-50%)",
            background: "rgba(255,255,255,0.1)",
            border: "1px solid rgba(255,255,255,0.15)",
            borderRadius: "50%",
            width: 44,
            height: 44,
            color: "#fff",
            fontSize: 22,
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          ›
        </button>
      )}
      <img
        src={img.src}
        alt={img.name}
        onClick={(e) => e.stopPropagation()}
        style={{
          maxWidth: "min(88vw, 900px)",
          maxHeight: "calc(100vh - 140px)",
          objectFit: "contain",
          borderRadius: 10,
          boxShadow: "0 8px 60px rgba(0,0,0,0.6)",
        }}
      />
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 16,
          marginTop: 18,
          padding: "10px 20px",
          borderRadius: 10,
          background: "rgba(255,255,255,0.06)",
          border: "1px solid rgba(255,255,255,0.1)",
        }}
      >
        <span
          style={{ color: "#e5e7eb", fontSize: 12, fontFamily: "monospace" }}
        >
          {img.name}
        </span>
        <span style={{ color: "#6b7280", fontSize: 11 }}>{img.time}</span>
        <button
          onClick={() => onDownload(img)}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 5,
            padding: "6px 14px",
            borderRadius: 7,
            background: "#2563eb",
            color: "#fff",
            border: "none",
            cursor: "pointer",
            fontSize: 12,
            fontWeight: 600,
          }}
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
            <path
              d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1M12 4v12M8 12l4 4 4-4"
              stroke="white"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          Télécharger
        </button>
        <button
          onClick={onClose}
          style={{
            padding: "6px 12px",
            borderRadius: 7,
            background: "rgba(255,255,255,0.08)",
            border: "1px solid rgba(255,255,255,0.12)",
            color: "#e5e7eb",
            cursor: "pointer",
            fontSize: 12,
          }}
        >
          ✕ Fermer
        </button>
      </div>
    </div>
  );
}

// ── Main App ──────────────────────────────────────────────────────────────────
export default function App() {
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<ScanRecord[]>([]);
  const [uploadedImages, setUploadedImages] = useState<UploadedImage[]>([]);
  const [hasStarted, setHasStarted] = useState(false);
  const [showCamera, setShowCamera] = useState(false);
  const [activeTab, setActiveTab] = useState<"dashboard" | "documents">(
    "dashboard",
  );
  const [lightboxIdx, setLightboxIdx] = useState<number | null>(null);
  const [resultKey, setResultKey] = useState(0);
  const [activeResultId, setActiveResultId] = useState<string | null>(null);
  const [analysisStartedAt, setAnalysisStartedAt] = useState<number | null>(null);
  const [analysisElapsedMs, setAnalysisElapsedMs] = useState(0);
  const [lastAnalysisDurationMs, setLastAnalysisDurationMs] = useState<number | null>(
    null,
  );
  // Store the current doc image src for Aperçu tab
  const [currentDocSrc, setCurrentDocSrc] = useState<string | null>(null);
  const previousObjectUrlsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!loading || analysisStartedAt === null) return;
    const intervalId = window.setInterval(() => {
      setAnalysisElapsedMs(Date.now() - analysisStartedAt);
    }, 100);
    return () => window.clearInterval(intervalId);
  }, [loading, analysisStartedAt]);

  useEffect(() => {
    const currentObjectUrls = new Set(
      uploadedImages
        .map((img) => img.src)
        .filter((src) => src.startsWith("blob:")),
    );

    for (const oldUrl of previousObjectUrlsRef.current) {
      if (!currentObjectUrls.has(oldUrl)) {
        URL.revokeObjectURL(oldUrl);
      }
    };

    previousObjectUrlsRef.current = currentObjectUrls;
  }, [uploadedImages]);

  useEffect(() => {
    return () => {
      for (const url of previousObjectUrlsRef.current) {
        URL.revokeObjectURL(url);
      }
    };
  }, []);

  const handleGoHome = useCallback(() => {
    setHasStarted(false);
    setResult(null);
    setError(null);
  }, []);

  const handleFileSelect = useCallback(async (f: File) => {
    const startedAt = Date.now();
    setShowCamera(false);
    setError(null);
    setLoading(true);
    setResult(null);
    setAnalysisStartedAt(startedAt);
    setAnalysisElapsedMs(0);
    setLastAnalysisDurationMs(null);
    setHasStarted(true);
    setActiveTab("dashboard");

    const src = URL.createObjectURL(f);
    setCurrentDocSrc(src);
    setUploadedImages((prev) => [
      {
        name: f.name,
        src,
        time: new Date().toLocaleTimeString("fr-FR", {
          hour: "2-digit",
          minute: "2-digit",
        }),
      },
      ...prev,
    ]);

    try {
      const data = await analyzeDocument(f);
      const newId = Date.now().toString();
      setResult(data);
      setResultKey((k) => k + 1);
      setHistory((prev) => [
        {
          id: newId,
          filename: f.name,
          verdict: data.verdict,
          score: data.global_score_display,
          mrz_type: data.ocr?.mrz_type || "—",
          time: new Date().toLocaleTimeString("fr-FR", {
            hour: "2-digit",
            minute: "2-digit",
          }),
          metadata_score: data.metadata?.score ?? null,
          result: data,
        },
        ...prev,
      ]);
      setActiveResultId(newId);
    } catch (err: unknown) {
      const msg =
        err instanceof Error
          ? err.message
          : "Analyse échouée. Vérifiez que le backend tourne sur le port 8000.";
      setError(msg);
    } finally {
      const duration = Date.now() - startedAt;
      setAnalysisElapsedMs(duration);
      setLastAnalysisDurationMs(duration);
      setAnalysisStartedAt(null);
      setTimeout(() => setLoading(false), 0);
    }
  }, []);

  const handleReplay = useCallback(
    (record: ScanRecord) => {
      if (record.result) {
        setResult(record.result);
        setResultKey((k) => k + 1);
        setActiveResultId(record.id);
        setError(null);
        setActiveTab("dashboard");
        // Try to find the matching uploaded image
        const matchingImg = uploadedImages.find(
          (img) => img.name === record.filename,
        );
        if (matchingImg) setCurrentDocSrc(matchingImg.src);
      }
    },
    [uploadedImages],
  );

  const handleDownload = useCallback((img: UploadedImage) => {
    const a = document.createElement("a");
    a.href = img.src;
    a.download = img.name;
    a.click();
  }, []);

  // ── Landing ──
  if (!hasStarted) {
    return (
      <>
        <div
          style={{
            minHeight: "100vh",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "#f5f6fa",
            animation: "fadeIn 0.45s ease both",
          }}
        >
          <UploadSection
            onFileSelect={handleFileSelect}
            loading={loading}
            onCameraOpen={() => setShowCamera(true)}
          />
        </div>
        {showCamera && (
          <CameraCapture
            onCapture={handleFileSelect}
            onClose={() => setShowCamera(false)}
          />
        )}
      </>
    );
  }

  return (
    <>
      {lightboxIdx !== null && uploadedImages[lightboxIdx] && (
        <DocLightbox
          images={uploadedImages}
          idx={lightboxIdx}
          onClose={() => setLightboxIdx(null)}
          onNav={setLightboxIdx}
          onDownload={handleDownload}
        />
      )}

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          height: "100vh",
          overflow: "hidden",
          background: "#f5f6fa",
        }}
      >
        <TopBar
          onFileSelect={handleFileSelect}
          loading={loading}
          onCameraOpen={() => setShowCamera(true)}
          history={history}
          onSearchSelect={handleReplay}
          activeTab={activeTab}
          onTabChange={setActiveTab}
          onLogoClick={handleGoHome}
        />

        <main style={{ flex: 1, overflowY: "auto", padding: "28px 32px" }}>
          {/* ── Documents tab ── */}
          {activeTab === "documents" && (
            <div
              key="documents-tab"
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 20,
                animation: "tabFadeIn 0.28s ease both",
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                }}
              >
                <div>
                  <h2
                    style={{
                      fontSize: 20,
                      fontWeight: 700,
                      color: "#1a1a2e",
                      margin: 0,
                    }}
                  >
                    Documents uploadés
                  </h2>
                  <p
                    style={{
                      fontSize: 12,
                      color: "#9ca3af",
                      margin: "3px 0 0",
                    }}
                  >
                    {uploadedImages.length} document
                    {uploadedImages.length !== 1 ? "s" : ""} analysé
                    {uploadedImages.length !== 1 ? "s" : ""} cette session
                  </p>
                </div>
              </div>
              {uploadedImages.length === 0 ? (
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "center",
                    padding: "80px 0",
                    gap: 12,
                  }}
                >
                  <svg
                    width="48"
                    height="48"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="#d1d5db"
                    strokeWidth="1.4"
                    strokeLinecap="round"
                  >
                    <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
                    <polyline points="14 2 14 8 20 8" />
                    <line x1="12" y1="18" x2="12" y2="12" />
                    <line x1="9" y1="15" x2="15" y2="15" />
                  </svg>
                  <p
                    style={{
                      color: "#9ca3af",
                      fontSize: 14,
                      margin: 0,
                      fontWeight: 500,
                    }}
                  >
                    Aucun document uploadé
                  </p>
                </div>
              ) : (
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns:
                      "repeat(auto-fill, minmax(200px, 1fr))",
                    gap: 16,
                  }}
                >
                  {uploadedImages.map((img, i) => (
                    <div
                      key={i}
                      onClick={() => setLightboxIdx(i)}
                      style={{
                        borderRadius: 12,
                        overflow: "hidden",
                        background: "#fff",
                        boxShadow: "0 1px 4px rgba(0,0,0,0.06)",
                        cursor: "pointer",
                        transition: "transform 0.15s, box-shadow 0.15s",
                      }}
                      onMouseEnter={(e) => {
                        (e.currentTarget as HTMLElement).style.transform =
                          "translateY(-3px)";
                        (e.currentTarget as HTMLElement).style.boxShadow =
                          "0 8px 24px rgba(0,0,0,0.12)";
                      }}
                      onMouseLeave={(e) => {
                        (e.currentTarget as HTMLElement).style.transform =
                          "none";
                        (e.currentTarget as HTMLElement).style.boxShadow =
                          "0 1px 4px rgba(0,0,0,0.06)";
                      }}
                    >
                      <img
                        src={img.src}
                        alt={img.name}
                        loading="lazy"
                        decoding="async"
                        style={{
                          width: "100%",
                          height: 140,
                          objectFit: "cover",
                        }}
                      />
                      <div style={{ padding: "10px 14px" }}>
                        <p
                          style={{
                            fontSize: 12,
                            fontWeight: 600,
                            color: "#1a1a2e",
                            margin: 0,
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {img.name}
                        </p>
                        <p
                          style={{
                            fontSize: 11,
                            color: "#9ca3af",
                            margin: "2px 0 0",
                          }}
                        >
                          {img.time}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ── Dashboard tab ── */}
          {activeTab === "dashboard" && (
            <div style={{ minHeight: "100%" }}>
              {error && !loading && (
                <div
                  style={{
                    background: "#fef2f2",
                    border: "1px solid #fecaca",
                    color: "#dc2626",
                    borderRadius: 12,
                    padding: "14px 18px",
                    marginBottom: 24,
                    fontSize: 13,
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    animation: "fadeIn 0.3s ease both",
                  }}
                >
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="#dc2626"
                    strokeWidth="2"
                    strokeLinecap="round"
                  >
                    <circle cx="12" cy="12" r="10" />
                    <line x1="12" y1="8" x2="12" y2="12" />
                    <line x1="12" y1="16" x2="12.01" y2="16" />
                  </svg>
                  {error}
                </div>
              )}

              {loading && <LoadingOverlay elapsedMs={analysisElapsedMs} />}

              {!loading && result && (
                <div
                  key={resultKey}
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: 20,
                    animation: "fadeIn 0.45s ease both",
                  }}
                >
                  {lastAnalysisDurationMs !== null && (
                    <p
                      style={{
                        margin: "0 0 2px",
                        color: "#9ca3af",
                        fontSize: 11,
                        fontWeight: 500,
                      }}
                    >
                      Analyse terminée en {(lastAnalysisDurationMs / 1000).toFixed(1)}s
                    </p>
                  )}
                  {/* ── TOP: GlobalScore (unchanged) ── */}
                  <GlobalScore
                    global_score={result.global_score}
                    global_score_display={result.global_score_display}
                    verdict={result.verdict}
                    cnn={result.cnn}
                    structural_score={result.structural_score}
                    metadata_score={result.metadata?.score ?? null}
                    history={history}
                    onRowClick={handleReplay}
                    activeResultId={activeResultId}
                  />

                  {/* ── BOTTOM: New tabbed analysis area ── */}
                  <AnalysisTabs
                    result={result}
                    documentImageSrc={currentDocSrc}
                  />
                </div>
              )}

              {!loading && !result && !error && (
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "center",
                    padding: "100px 0",
                    gap: 14,
                  }}
                >
                  <svg
                    width="52"
                    height="52"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="#d1d5db"
                    strokeWidth="1.4"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
                    <polyline points="14 2 14 8 20 8" />
                    <line x1="12" y1="18" x2="12" y2="12" />
                    <line x1="9" y1="15" x2="15" y2="15" />
                  </svg>
                  <p
                    style={{
                      color: "#9ca3af",
                      fontSize: 14,
                      margin: 0,
                      fontWeight: 500,
                    }}
                  >
                    Uploadez un document pour démarrer l'analyse
                  </p>
                </div>
              )}
            </div>
          )}
        </main>
      </div>

      {showCamera && (
        <CameraCapture
          onCapture={handleFileSelect}
          onClose={() => setShowCamera(false)}
        />
      )}
    </>
  );
}
