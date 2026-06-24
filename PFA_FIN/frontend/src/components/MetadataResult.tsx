import { useState } from "react";

interface Props {
  metadata: {
    score: number;
    composite_risk_percent?: number;
    risk_level: string;
    summary: string;
    diagnostic: string[];
    ela_score: number;
    exif_score: number;
    double_compression_score: number;
    noise_score?: number;
    detected_software?: string | null;
    ela_base64?: string | null;
    noise_base64?: string | null;
    forensic_params?: {
      ela_recompress_quality: number;
      ela_diff_multiplier: number;
      ela_block_size: number;
      noise_block_size: number;
      noise_deviation_multiplier: number;
    };
  };
}

function riskStyle(risk: string) {
  if (risk === "Low")
    return {
      color: "#16a34a",
      bg: "#f0fdf4",
      border: "#bbf7d0",
      dot: "#16a34a",
    };
  if (risk === "Moderate")
    return {
      color: "#d97706",
      bg: "#fffbeb",
      border: "#fde68a",
      dot: "#d97706",
    };
  if (risk === "High")
    return {
      color: "#dc2626",
      bg: "#fef2f2",
      border: "#fecaca",
      dot: "#dc2626",
    };
  return { color: "#9b1c1c", bg: "#fef2f2", border: "#f87171", dot: "#ef4444" }; // Critical
}

function barColor(pct: number) {
  if (pct >= 60) return "#ef4444";
  if (pct >= 35) return "#f59e0b";
  return "#16a34a";
}

function ScoreBar({
  label,
  value,
  icon,
}: {
  label: string;
  value: number;
  icon: React.ReactNode;
}) {
  const pct = Math.min(Math.round(value), 100);
  const color = barColor(pct);
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
      <span style={{ color: "#6b7280", display: "flex", flexShrink: 0 }}>
        {icon}
      </span>
      <span
        style={{
          fontSize: 12,
          color: "#374151",
          fontWeight: 500,
          minWidth: 148,
          flexShrink: 0,
        }}
      >
        {label}
      </span>
      <div
        style={{ flex: 1, height: 5, borderRadius: 99, background: "#f3f4f6" }}
      >
        <div
          style={{
            height: 5,
            borderRadius: 99,
            width: `${pct}%`,
            background: color,
            transition: "width 0.7s ease",
          }}
        />
      </div>
      <span
        style={{
          fontSize: 11.5,
          fontWeight: 700,
          color,
          minWidth: 36,
          textAlign: "right",
          fontFamily: "monospace",
        }}
      >
        {pct}
      </span>
    </div>
  );
}

function ForensicImage({
  base64,
  title,
  subtitle,
  legend,
  emptyLabel,
}: {
  base64?: string | null;
  title: string;
  subtitle: string;
  legend: string;
  emptyLabel: string;
}) {
  const [zoomed, setZoomed] = useState(false);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
      {/* Header */}
      <div
        style={{
          padding: "10px 16px 8px",
          borderBottom: "1px solid #f3f4f6",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          background: "#fafafa",
        }}
      >
        <div>
          <p
            style={{
              margin: 0,
              fontSize: 12.5,
              fontWeight: 700,
              color: "#111827",
            }}
          >
            {title}
          </p>
          <p style={{ margin: 0, fontSize: 10.5, color: "#6b7280" }}>
            {subtitle}
          </p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {/* Color legend */}
          <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <div style={{ display: "flex", gap: 2 }}>
              {["#00008b", "#0080ff", "#00ff80", "#ffff00", "#ff4500"].map(
                (c, i) => (
                  <div
                    key={i}
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: 2,
                      background: c,
                    }}
                  />
                ),
              )}
            </div>
            <span style={{ fontSize: 10, color: "#9ca3af" }}>{legend}</span>
          </div>
          {base64 && (
            <button
              onClick={() => setZoomed(true)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 4,
                padding: "3px 8px",
                borderRadius: 5,
                border: "1px solid #e5e7eb",
                background: "#fff",
                cursor: "pointer",
                fontSize: 10.5,
                color: "#374151",
              }}
            >
              <svg
                width="11"
                height="11"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              >
                <path d="M8 3H5a2 2 0 00-2 2v3M16 3h3a2 2 0 012 2v3M8 21H5a2 2 0 01-2-2v-3M16 21h3a2 2 0 002-2v-3" />
              </svg>
              Expand
            </button>
          )}
        </div>
      </div>

      {/* Image */}
      {base64 ? (
        <div
          style={{
            position: "relative",
            cursor: "zoom-in",
            overflow: "hidden",
          }}
          onClick={() => setZoomed(true)}
        >
          <img
            src={`data:image/jpeg;base64,${base64}`}
            alt={title}
            style={{
              width: "100%",
              display: "block",
              minHeight: 220,
              maxHeight: 320,
              objectFit: "contain",
              background: "#111",
            }}
          />
          <div
            style={{
              position: "absolute",
              bottom: 8,
              right: 8,
              background: "rgba(0,0,0,0.6)",
              borderRadius: 5,
              padding: "2px 8px",
            }}
          >
            <span style={{ fontSize: 10, color: "#fff" }}>
              Click to enlarge
            </span>
          </div>
        </div>
      ) : (
        <div
          style={{
            height: 220,
            background: "#f9fafb",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
            borderTop: "1px solid #f3f4f6",
          }}
        >
          <svg
            width="28"
            height="28"
            viewBox="0 0 24 24"
            fill="none"
            stroke="#d1d5db"
            strokeWidth="1.5"
            strokeLinecap="round"
          >
            <rect x="3" y="3" width="18" height="18" rx="2" />
            <circle cx="8.5" cy="8.5" r="1.5" />
            <polyline points="21 15 16 10 5 21" />
          </svg>
          <p style={{ fontSize: 12, color: "#9ca3af", margin: 0 }}>
            {emptyLabel}
          </p>
        </div>
      )}

      {/* Fullscreen lightbox */}
      {zoomed && base64 && (
        <div
          onClick={() => setZoomed(false)}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 9999,
            background: "rgba(0,0,0,0.92)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexDirection: "column",
            gap: 16,
          }}
        >
          <img
            src={`data:image/jpeg;base64,${base64}`}
            alt={title}
            onClick={(e) => e.stopPropagation()}
            style={{
              maxWidth: "85vw",
              maxHeight: "80vh",
              objectFit: "contain",
              borderRadius: 8,
              boxShadow: "0 8px 60px rgba(0,0,0,0.6)",
            }}
          />
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <p
              style={{
                color: "#e5e7eb",
                fontSize: 13,
                margin: 0,
                fontWeight: 600,
              }}
            >
              {title}
            </p>
            <p style={{ color: "#6b7280", fontSize: 12, margin: 0 }}>
              {subtitle}
            </p>
            <button
              onClick={() => setZoomed(false)}
              style={{
                background: "rgba(255,255,255,0.1)",
                border: "1px solid rgba(255,255,255,0.2)",
                borderRadius: 6,
                padding: "6px 14px",
                color: "#e5e7eb",
                cursor: "pointer",
                fontSize: 12,
              }}
            >
              ✕ Close
            </button>
          </div>
          <p style={{ color: "#4b5563", fontSize: 11, margin: 0 }}>
            Blue=Low · Cyan · Green · Yellow · Red=High anomaly
          </p>
        </div>
      )}
    </div>
  );
}

const IC = {
  exif: (
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
    >
      <rect x="2" y="2" width="20" height="20" rx="2" />
      <path d="M7 2v20M17 2v20M2 12h20M2 7h5M2 17h5M17 7h5M17 17h5" />
    </svg>
  ),
  ela: (
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
    >
      <path d="M3 3l7.07 16.97 2.51-7.39 7.39-2.51L3 3z" />
      <path d="M13 13l6 6" />
    </svg>
  ),
  compress: (
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
    >
      <polyline points="4 14 10 14 10 20" />
      <polyline points="20 10 14 10 14 4" />
      <line x1="10" y1="14" x2="21" y2="3" />
      <line x1="3" y1="21" x2="14" y2="10" />
    </svg>
  ),
  noise: (
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
    >
      <path d="M3 3h4v4H3zM10 3h4v4h-4zM17 3h4v4h-4zM3 10h4v4H3zM10 10h4v4h-4zM17 10h4v4h-4zM3 17h4v4H3zM10 17h4v4h-4zM17 17h4v4h-4z" />
    </svg>
  ),
  global: (
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
    >
      <circle cx="12" cy="12" r="10" />
      <line x1="2" y1="12" x2="22" y2="12" />
      <path d="M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z" />
    </svg>
  ),
  warning: (
    <svg
      width="13"
      height="13"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
    >
      <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
      <line x1="12" y1="9" x2="12" y2="13" />
      <line x1="12" y1="17" x2="12.01" y2="17" />
    </svg>
  ),
  info: (
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
    >
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="8" x2="12" y2="12" />
      <line x1="12" y1="16" x2="12.01" y2="16" />
    </svg>
  ),
};

export default function MetadataResult({ metadata }: Props) {
  const rs = riskStyle(metadata.risk_level);
  const diagnostics = metadata.diagnostic ?? [];
  const hasEla = !!metadata.ela_base64;
  const hasNoise = !!metadata.noise_base64;

  return (
    <div
      style={{
        background: "#fff",
        borderRadius: 14,
        border: "1px solid #e5e7eb",
        overflow: "hidden",
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: "16px 20px",
          borderBottom: "1px solid #f3f4f6",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div
            style={{
              width: 32,
              height: 32,
              borderRadius: 8,
              background: "#eff6ff",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="#2563eb"
              strokeWidth="2"
              strokeLinecap="round"
            >
              <ellipse cx="12" cy="5" rx="9" ry="3" />
              <path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3" />
              <path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5" />
            </svg>
          </div>
          <div>
            <h2
              style={{
                margin: 0,
                fontSize: 14,
                fontWeight: 700,
                color: "#111827",
              }}
            >
              Metadata Forensics
            </h2>
            <p style={{ margin: 0, fontSize: 11, color: "#9ca3af" }}>
              EXIF · ELA · Noise · Ghost Compression
            </p>
          </div>
        </div>
        <span
          style={{
            fontSize: 12.5,
            fontWeight: 700,
            padding: "5px 14px",
            borderRadius: 999,
            background: rs.bg,
            color: rs.color,
            border: `1px solid ${rs.border}`,
          }}
        >
          {metadata.risk_level} Risk
        </span>
      </div>

      {/* Scores + Summary row */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          borderBottom: "1px solid #f3f4f6",
        }}
      >
        {/* Left: Scores */}
        <div style={{ padding: "16px 20px", borderRight: "1px solid #f3f4f6" }}>
          <p
            style={{
              margin: "0 0 12px",
              fontSize: 10,
              fontWeight: 700,
              color: "#9ca3af",
              textTransform: "uppercase",
              letterSpacing: "0.08em",
            }}
          >
            Forensic Scores (higher = more suspicious)
          </p>

          {metadata.detected_software && (
            <div
              style={{
                display: "flex",
                alignItems: "flex-start",
                gap: 8,
                padding: "8px 10px",
                borderRadius: 8,
                background: "#fef2f2",
                border: "1px solid #fecaca",
                marginBottom: 12,
              }}
            >
              <span
                style={{
                  color: "#ef4444",
                  display: "flex",
                  flexShrink: 0,
                  marginTop: 1,
                }}
              >
                {IC.warning}
              </span>
              <div>
                <p
                  style={{
                    fontSize: 11,
                    fontWeight: 700,
                    color: "#b91c1c",
                    margin: "0 0 2px",
                  }}
                >
                  Editing software detected
                </p>
                <p
                  style={{
                    fontSize: 11,
                    fontFamily: "monospace",
                    color: "#ef4444",
                    margin: 0,
                  }}
                >
                  {metadata.detected_software}
                </p>
              </div>
            </div>
          )}

          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <ScoreBar
              label="EXIF Anomaly"
              value={metadata.exif_score}
              icon={IC.exif}
            />
            <ScoreBar
              label="ELA Error Level"
              value={metadata.ela_score}
              icon={IC.ela}
            />
            <ScoreBar
              label="Ghost Compression"
              value={metadata.double_compression_score}
              icon={IC.compress}
            />
            {metadata.noise_score !== undefined && (
              <ScoreBar
                label="Noise Abnormality"
                value={metadata.noise_score}
                icon={IC.noise}
              />
            )}
            <div
              style={{ height: 1, background: "#f3f4f6", margin: "2px 0" }}
            />
            <ScoreBar
              label="Overall Risk Score"
              value={
                metadata.composite_risk_percent ??
                Math.round(metadata.score * 10000) / 100
              }
              icon={IC.global}
            />
          </div>

          <p
            style={{
              margin: "10px 0 0",
              fontSize: 10.5,
              color: "#9ca3af",
              lineHeight: 1.6,
            }}
          >
            Green &lt;35 · Amber 35–60 · Red &gt;60
          </p>
        </div>

        {/* Right: Summary + Diagnostics */}
        <div
          style={{
            padding: "16px 20px",
            display: "flex",
            flexDirection: "column",
            gap: 12,
            overflowY: "auto",
            maxHeight: 340,
          }}
        >
          <p
            style={{
              margin: "0 0 4px",
              fontSize: 10,
              fontWeight: 700,
              color: "#9ca3af",
              textTransform: "uppercase",
              letterSpacing: "0.08em",
            }}
          >
            Summary & Diagnostics
          </p>

          {metadata.summary && (
            <div
              style={{
                padding: "10px 12px",
                borderRadius: 8,
                background: "#fffbeb",
                border: "1px solid #fde68a",
              }}
            >
              <p
                style={{
                  fontSize: 12.5,
                  color: "#374151",
                  margin: 0,
                  lineHeight: 1.6,
                }}
              >
                {metadata.summary}
              </p>
            </div>
          )}

          {diagnostics.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
              {diagnostics.map((d, i) => (
                <div
                  key={i}
                  style={{
                    display: "flex",
                    alignItems: "flex-start",
                    gap: 8,
                    padding: "7px 10px",
                    borderRadius: 7,
                    background: "#f9fafb",
                    border: "1px solid #f3f4f6",
                  }}
                >
                  <span
                    style={{
                      color: "#2563eb",
                      display: "flex",
                      flexShrink: 0,
                      marginTop: 2,
                    }}
                  >
                    {IC.info}
                  </span>
                  <p
                    style={{
                      fontSize: 11.5,
                      color: "#374151",
                      margin: 0,
                      lineHeight: 1.5,
                    }}
                  >
                    {d}
                  </p>
                </div>
              ))}
            </div>
          )}

          {!metadata.summary && diagnostics.length === 0 && (
            <p style={{ fontSize: 13, color: "#9ca3af", margin: 0 }}>
              No forensic anomalies to report.
            </p>
          )}
        </div>
      </div>

      {/* ── Forensic Heatmaps — LARGE & CLEAR ── */}
      {(hasEla || hasNoise) && (
        <>
          <div
            style={{
              padding: "12px 20px 8px",
              background: "#fafafa",
              borderBottom: "1px solid #f3f4f6",
            }}
          >
            <p
              style={{
                margin: 0,
                fontSize: 10,
                fontWeight: 700,
                color: "#9ca3af",
                textTransform: "uppercase",
                letterSpacing: "0.08em",
              }}
            >
              Forensic Heatmaps — Jet colormap: Blue=normal · Red=suspicious
            </p>
          </div>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: hasEla && hasNoise ? "1fr 1fr" : "1fr",
            }}
          >
            {/* ELA Heatmap */}
            {hasEla && (
              <div
                style={{ borderRight: hasNoise ? "1px solid #f3f4f6" : "none" }}
              >
                <ForensicImage
                  base64={metadata.ela_base64}
                  title="ELA — Error Level Analysis"
                  subtitle={`Re-compressed Q${
                    metadata.forensic_params?.ela_recompress_quality ?? 75
                  } · ×${
                    metadata.forensic_params?.ela_diff_multiplier ?? 15
                  } (backend)`}
                  legend="Low → High error"
                  emptyLabel="ELA not available for this format"
                />
              </div>
            )}

            {/* Noise Heatmap */}
            {hasNoise && (
              <div>
                <ForensicImage
                  base64={metadata.noise_base64}
                  title="Noise Map — Local Std Dev"
                  subtitle={`Local deviation · ×${
                    metadata.forensic_params?.noise_deviation_multiplier ?? 3
                  } (backend)`}
                  legend="Uniform → Abnormal"
                  emptyLabel="Noise analysis not available"
                />
              </div>
            )}
          </div>

          <div
            style={{
              padding: "10px 20px",
              background: "#f9fafb",
              borderTop: "1px solid #f3f4f6",
            }}
          >
            <p
              style={{
                margin: 0,
                fontSize: 10.5,
                color: "#6b7280",
                lineHeight: 1.6,
              }}
            >
              <strong>ELA</strong>: Bright red areas = high JPEG error
              difference after Q75 re-compression → possible tampered zones.
              &nbsp;|&nbsp;
              <strong>Noise</strong>: Red areas = noise significantly different
              from image average → copy-paste or local editing detected. Click
              any image to zoom.
            </p>
          </div>
        </>
      )}
    </div>
  );
}
