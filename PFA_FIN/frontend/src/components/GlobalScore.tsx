import type { AnalysisResult } from "../api";

export interface ScanRecord {
  id: string;
  filename: string;
  verdict: string;
  score: number;
  mrz_type: string;
  time: string;
  metadata_score: number | null;
  result?: AnalysisResult;
}

interface Props {
  global_score: number;
  global_score_display: number;
  verdict: string;
  cnn: { confidence: number; label: string };
  structural_score: number;
  metadata_score: number | null;
  history: ScanRecord[];
  onRowClick?: (record: ScanRecord) => void;
  activeResultId?: string | null;
}

export default function GlobalScore({
  global_score,
  global_score_display,
  verdict,
  cnn,
  structural_score,
  metadata_score,
  history,
  onRowClick,
  activeResultId,
}: Props) {
  const verdictColor =
    verdict === "Authentic"
      ? "#16a34a"
      : verdict === "Suspicious"
        ? "#d97706"
        : "#ff0000";
  const barColor =
    verdict === "Authentic"
      ? "#16a34a"
      : verdict === "Suspicious"
        ? "#f59e0b"
        : "#ff0000";
  const verdictBadgeBg =
    verdict === "Authentic"
      ? "#f0fdf4"
      : verdict === "Suspicious"
        ? "#fffbeb"
        : "#fef2f2";
  const verdictBadgeBorder =
    verdict === "Authentic"
      ? "#bbf7d0"
      : verdict === "Suspicious"
        ? "#fde68a"
        : "#fecaca";

  // CNN : la confidence est la certitude du label (ex: 85% sûr que c'est Falsified)
  // → score d'authenticité = 1 - confidence si Falsified, confidence si Real
  const cnnPct = Math.round(
    (cnn.label === "Falsified" ? 1 - cnn.confidence : cnn.confidence) * 100
  );
  const strPct = Math.round(structural_score * 100);
  // Métadonnées : metadata_score est un score de risque (haut = suspect)
  // → score d'authenticité = 1 - metadata_score
  const metaRaw =
    metadata_score !== null ? Math.round((1 - metadata_score) * 100) : 0;

  const cnnDeg = (50 / 100) * 360;
  const strDeg = (30 / 100) * 360;
  const donut = `conic-gradient(#2563eb 0deg ${cnnDeg}deg, #16a34a ${cnnDeg}deg ${cnnDeg + strDeg}deg, #ff0000 ${cnnDeg + strDeg}deg 360deg)`;

  const rowColor = (v: string) =>
    v === "Authentic" ? "#16a34a" : v === "Suspicious" ? "#d97706" : "#ff0000";
  const dotBg = (v: string) =>
    v === "Authentic" ? "#22C55E" : v === "Suspicious" ? "#3B82F6" : "#ff0000";
  const dotRippleColor = (v: string) =>
    v === "Authentic"
      ? "rgba(34,197,94,0.5)"
      : v === "Suspicious"
        ? "rgba(59,130,246,0.5)"
        : "rgba(255,0,0,0.5)";

  return (
    <>
      <style>{`
        @keyframes ripplePulse {
          0%   { transform: scale(1); opacity: 0.8; }
          70%  { transform: scale(2.6); opacity: 0; }
          100% { transform: scale(1); opacity: 0; }
        }
        @keyframes ripplePulse2 {
          0%   { transform: scale(1); opacity: 0.5; }
          70%  { transform: scale(2.0); opacity: 0; }
          100% { transform: scale(1); opacity: 0; }
        }
        @keyframes shimmerFast {
          0%   { left: -60%; opacity: 0; }
          4%   { opacity: 1; }
          32%  { left: 115%; opacity: 1; }
          33%  { opacity: 0; left: 115%; }
          100% { opacity: 0; left: 115%; }
        }
        .shimmer-bar-wrap {
          position: relative;
          overflow: hidden;
          border-radius: 4px;
        }
        .shimmer-bar-wrap::after {
          content: '';
          position: absolute;
          top: 0;
          left: -60%;
          width: 40%;
          height: 100%;
          background: linear-gradient(
            90deg,
            transparent 0%,
            rgba(255,255,255,0.65) 50%,
            transparent 100%
          );
          animation: shimmerFast 2.8s ease-in-out infinite;
          pointer-events: none;
          border-radius: inherit;
        }
      `}</style>

      <div
        style={{
          background: "#ffffff",
          borderRadius: 16,
          padding: "28px 32px",
          boxShadow: "0 2px 12px rgba(0,0,0,0.07)",
          display: "flex",
          gap: 32,
        }}
      >
        {/* ── Score Breakdown ── */}
        <div
          style={{
            flexShrink: 0,
            minWidth: 240,
            display: "flex",
            flexDirection: "column",
            gap: 20,
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <p
              style={{
                fontSize: 17,
                fontWeight: 700,
                color: "#1a1a2e",
                margin: 0,
              }}
            >
              <strong>Score d’authenticité</strong>
            </p>
            <span style={{ fontSize: 11, color: "#9ca3af" }}>Session</span>
          </div>

          {/* Big donut */}
          <div
            style={{
              position: "relative",
              width: 148,
              height: 148,
              margin: "0 auto",
            }}
          >
            <div
              style={{
                width: 148,
                height: 148,
                borderRadius: "50%",
                background: donut,
                boxShadow: "0 4px 20px rgba(0,0,0,0.10)",
              }}
            />
            <div
              style={{
                position: "absolute",
                inset: 0,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <div
                style={{
                  width: 96,
                  height: 96,
                  borderRadius: "50%",
                  background: "#fff",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  boxShadow: "0 0 0 2px rgba(0,0,0,0.04) inset",
                }}
              >
                <span
                  key={global_score_display}
                  style={{
                    fontSize: 26,
                    fontWeight: 800,
                    color: verdictColor,
                    display: "inline-block",
                    animation:
                      "scorePop 0.45s cubic-bezier(0.22,1,0.36,1) both",
                    lineHeight: 1,
                  }}
                >
                  {global_score_display}
                </span>
                <span
                  style={{
                    fontSize: 10,
                    color: "#9ca3af",
                    fontWeight: 500,
                    marginTop: 2,
                  }}
                >
                  / 100
                </span>
              </div>
            </div>
          </div>

          {/* Legend with ripple dots */}
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {[
              {
                color: "#2563eb",
                ripple: "rgba(37,99,235,0.5)",
                label: "Inspection visuelle par IA",
                pct: `${cnnPct}%`,
              },
              {
                color: "#16a34a",
                ripple: "rgba(22,163,74,0.5)",
                label: "Analyse structurelle",
                pct: `${strPct}%`,
              },
              {
                color: "#ff0000",
                ripple: "rgba(255,0,0,0.5)",
                label: "Métadonnées & Forensique",
                pct: `${metaRaw}%`,
              },
            ].map(({ color, ripple, label, pct }) => (
              <div
                key={label}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  fontSize: 13.5,
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span
                    style={{
                      position: "relative",
                      width: 10,
                      height: 10,
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      flexShrink: 0,
                    }}
                  >
                    <span
                      style={{
                        position: "absolute",
                        borderRadius: "50%",
                        width: "100%",
                        height: "100%",
                        background: ripple,
                        animation: "ripplePulse 2s ease-out infinite",
                        pointerEvents: "none",
                      }}
                    />
                    <span
                      style={{
                        position: "absolute",
                        borderRadius: "50%",
                        width: "100%",
                        height: "100%",
                        background: ripple,
                        animation: "ripplePulse2 2s ease-out infinite",
                        animationDelay: "0.5s",
                        pointerEvents: "none",
                      }}
                    />
                    <span
                      style={{
                        width: 10,
                        height: 10,
                        borderRadius: "50%",
                        background: color,
                        display: "block",
                        position: "relative",
                        zIndex: 1,
                      }}
                    />
                  </span>
                  <span style={{ color: "#6b7280" }}>{label}</span>
                </div>
                <span
                  style={{ fontWeight: 700, color, fontFamily: "monospace" }}
                >
                  {pct}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Divider */}
        <div style={{ width: 1, background: "#f0f0f0", flexShrink: 0 }} />

        {/* ── Live table ── */}
        <div
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            gap: 12,
            minWidth: 0,
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <p
              style={{
                fontSize: 14,
                fontWeight: 700,
                color: "#1a1a2e",
                margin: 0,
                display: "flex",
                alignItems: "center",
                gap: 10,
              }}
            >
              <span
                style={{
                  position: "relative",
                  width: 10,
                  height: 10,
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                }}
              >
                <span
                  style={{
                    position: "absolute",
                    borderRadius: "50%",
                    width: "100%",
                    height: "100%",
                    background: "rgba(37,99,235,0.5)",
                    animation: "ripplePulse 2s ease-out infinite",
                    pointerEvents: "none",
                  }}
                />
                <span
                  style={{
                    position: "absolute",
                    borderRadius: "50%",
                    width: "100%",
                    height: "100%",
                    background: "rgba(37,99,235,0.4)",
                    animation: "ripplePulse2 2s ease-out infinite",
                    animationDelay: "0.5s",
                    pointerEvents: "none",
                  }}
                />
                <span
                  style={{
                    width: 10,
                    height: 10,
                    borderRadius: "50%",
                    background: "#2563eb",
                    display: "block",
                    position: "relative",
                    zIndex: 1,
                  }}
                />
              </span>
              Statut d'analyse en direct
            </p>
            <span
              style={{
                fontSize: 12,
                fontWeight: 600,
                padding: "4px 14px",
                borderRadius: 20,
                background: "#2563eb",
                color: "#fff",
              }}
            >
              {history.length} scan{history.length !== 1 ? "s" : ""}
            </span>
          </div>

          {/* Table header */}
          <div
            style={
              {
                display: "grid",
                gridTemplateColumns: "36px 1fr 110px 120px 60px",
                fontSize: 11.5,
                fontWeight: 600,
                color: "#9ca3af",
                paddingBottom: 8,
                borderBottom: "1px solid #f3f4f6",
                textTransform: "uppercase",
                letterSpacing: "0.04em",
              } as React.CSSProperties
            }
          >
            <span>N°</span>
            <span>Fichier</span>
            <span>Type</span>
            <span>Statut</span>
            <span style={{ textAlign: "right" }}>Score</span>
          </div>

          <div style={{ overflowY: "auto", maxHeight: 150 }}>
            {history.length === 0 ? (
              <p
                style={{
                  fontSize: 12,
                  color: "#9ca3af",
                  textAlign: "center",
                  padding: "20px 0",
                }}
              >
                Aucun scan pour l'instant
              </p>
            ) : (
              history.map((row, i) => (
                <div
                  key={row.id}
                  onClick={() => onRowClick && onRowClick(row)}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "36px 1fr 110px 120px 60px",
                    alignItems: "center",
                    fontSize: 12.5,
                    padding: "9px 6px",
                    borderBottom: "1px solid #f9fafb",
                    cursor: onRowClick ? "pointer" : "default",
                    borderRadius: 6,
                    transition: "background 0.15s",
                    animation:
                      row.id === activeResultId
                        ? "rowFlash 0.9s ease-out both"
                        : undefined,
                  }}
                  onMouseEnter={(e) => {
                    if (onRowClick)
                      (e.currentTarget as HTMLElement).style.background =
                        "#f5f6fa";
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLElement).style.background =
                      "transparent";
                  }}
                >
                  <span style={{ color: "#9ca3af", fontFamily: "monospace" }}>
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <span
                    style={{
                      fontFamily: "monospace",
                      color: "#1a1a2e",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                      paddingRight: 8,
                    }}
                    title={row.filename}
                  >
                    {row.filename}
                  </span>
                  <span style={{ color: "#6b7280" }}>
                    {row.mrz_type &&
                    row.mrz_type !== "—" &&
                    row.mrz_type !== "None"
                      ? `MRZ ${row.mrz_type}`
                      : "OCR Visuel"}
                  </span>

                  <div
                    style={{ display: "flex", alignItems: "center", gap: 8 }}
                  >
                    <span
                      style={{
                        position: "relative",
                        width: 9,
                        height: 9,
                        display: "inline-flex",
                        alignItems: "center",
                        justifyContent: "center",
                        flexShrink: 0,
                      }}
                    >
                      <span
                        style={{
                          position: "absolute",
                          borderRadius: "50%",
                          width: "100%",
                          height: "100%",
                          background: dotRippleColor(row.verdict),
                          animation: "ripplePulse 2.2s ease-out infinite",
                          animationDelay: `${i * 0.3}s`,
                          pointerEvents: "none",
                        }}
                      />
                      <span
                        style={{
                          position: "absolute",
                          borderRadius: "50%",
                          width: "100%",
                          height: "100%",
                          background: dotRippleColor(row.verdict),
                          animation: "ripplePulse2 2.2s ease-out infinite",
                          animationDelay: `${i * 0.3 + 0.5}s`,
                          pointerEvents: "none",
                        }}
                      />
                      <span
                        style={{
                          width: 9,
                          height: 9,
                          borderRadius: "50%",
                          background: dotBg(row.verdict),
                          display: "block",
                          position: "relative",
                          zIndex: 1,
                        }}
                      />
                    </span>
                    <span
                      style={{ fontWeight: 600, color: rowColor(row.verdict) }}
                    >
                      {row.verdict === "Authentic"
                        ? "Authentique"
                        : row.verdict === "Suspicious"
                          ? "Suspect"
                          : "Falsifié"}
                    </span>
                  </div>

                  <span
                    style={{
                      textAlign: "right",
                      fontWeight: 700,
                      color: rowColor(row.verdict),
                      fontFamily: "monospace",
                    }}
                  >
                    {row.score}
                  </span>
                </div>
              ))
            )}
          </div>

          {/* Verdict + shimmer bar */}
          <div style={{ marginTop: "auto", paddingTop: 10 }}>
            <div
              key={verdict}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                padding: "5px 14px",
                borderRadius: 20,
                fontSize: 13,
                fontWeight: 600,
                marginBottom: 10,
                background: verdictBadgeBg,
                border: `1px solid ${verdictBadgeBorder}`,
                color: verdictColor,
                animation: "scorePop 0.45s cubic-bezier(0.22,1,0.36,1) both",
              }}
            >
              {verdict === "Authentic"
                ? "✓"
                : verdict === "Suspicious"
                  ? "⚠"
                  : "✕"}{" "}
              {verdict === "Authentic"
                ? "Authentique"
                : verdict === "Suspicious"
                  ? "Suspect"
                  : "Falsifié"}
            </div>

            <div
              style={{
                width: "100%",
                height: 7,
                borderRadius: 4,
                background: "#f3f4f6",
              }}
            >
              <div
                className="shimmer-bar-wrap"
                style={{
                  height: 7,
                  borderRadius: 4,
                  width: `${global_score * 100}%`,
                  background: barColor,
                  transition: "width 0.8s cubic-bezier(0.22,1,0.36,1)",
                }}
              />
            </div>
          </div>
        </div>
      </div>
    </>
  );
}