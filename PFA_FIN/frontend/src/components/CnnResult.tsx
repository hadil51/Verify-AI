import { useState } from "react";
import { ForgeryZone } from "../api";

interface Props {
  cnn: {
    score: number;
    label: string;
    confidence: number;
    risk_level: string;
    explanation: string;
    gradcam_base64: string;
    original_base64: string;
    lime_base64: string;
    localization_base64: string;
    forgery_zones: ForgeryZone[];
    prob_fake_raw?: number;
    calibration_temperature?: number | null;
    integrated_gradients_base64?: string;
    attribution_mode?: string;
  };
}

function severityColor(v: number) {
  return v >= 0.75 ? "#dc2626" : v >= 0.5 ? "#ea580c" : "#d97706";
}
function severityLabel(v: number) {
  return v >= 0.75 ? "ÉLEVÉ" : v >= 0.5 ? "MOY" : "FAIBLE";
}

interface SlideItem {
  base64: string;
  title: string;
  subtitle: string;
  note: string;
  accent: string;
  icon: string;
  description: string;
  legendEl?: React.ReactNode;
}

// ── FIXED Lightbox — position:fixed fills viewport, image never requires scroll ─
function Lightbox({
  slides,
  startIndex,
  onClose,
}: {
  slides: SlideItem[];
  startIndex: number;
  onClose: () => void;
}) {
  const [idx, setIdx] = useState(startIndex);
  const slide = slides[idx];
  const prev = () => setIdx((i) => (i - 1 + slides.length) % slides.length);
  const next = () => setIdx((i) => (i + 1) % slides.length);

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 10000,
        background: "rgba(0,0,0,0.96)",
        display: "flex",
        flexDirection: "column",
        /* Key: center everything inside */
        alignItems: "center",
        justifyContent: "center",
        gap: 0,
      }}
    >
      {/* Top bar */}
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "100%",
          padding: "12px 24px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          background: "rgba(255,255,255,0.03)",
          borderBottom: "1px solid rgba(255,255,255,0.07)",
          flexShrink: 0,
        }}
      >
        <div>
          <p
            style={{ margin: 0, fontSize: 14, fontWeight: 700, color: "#fff" }}
          >
            {slide.title}
          </p>
          <p style={{ margin: 0, fontSize: 11, color: "#9ca3af" }}>
            {slide.note}
          </p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ display: "flex", gap: 5 }}>
            {slides.map((_, i) => (
              <button
                key={i}
                onClick={() => setIdx(i)}
                style={{
                  width: i === idx ? 20 : 8,
                  height: 8,
                  borderRadius: 4,
                  border: "none",
                  background: i === idx ? "#2563eb" : "rgba(255,255,255,0.22)",
                  cursor: "pointer",
                  transition: "all 0.2s",
                  padding: 0,
                }}
              />
            ))}
          </div>
          <button
            onClick={onClose}
            style={{
              background: "rgba(255,255,255,0.08)",
              border: "1px solid rgba(255,255,255,0.14)",
              borderRadius: 7,
              padding: "6px 16px",
              color: "#e5e7eb",
              cursor: "pointer",
              fontSize: 12,
              fontWeight: 600,
              fontFamily: "inherit",
            }}
          >
            ✕ Fermer
          </button>
        </div>
      </div>

      {/* Image row — flex:1 but use flexbox centering, NOT overflow */}
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          flex: 1,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          position: "relative",
          width: "100%",
          padding: "20px 80px",
          minHeight: 0 /* crucial: prevents flex child from overflowing */,
        }}
      >
        {slides.length > 1 && (
          <button
            onClick={prev}
            style={{
              position: "absolute",
              left: 16,
              background: "rgba(255,255,255,0.08)",
              border: "1px solid rgba(255,255,255,0.14)",
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
        <img
          src={`data:image/jpeg;base64,${slide.base64}`}
          alt={slide.title}
          style={{
            /* Constrain to available space — never overflow */
            maxWidth: "100%",
            maxHeight: "100%",
            objectFit: "contain",
            borderRadius: 10,
            boxShadow: "0 12px 80px rgba(0,0,0,0.7)",
            display: "block",
          }}
        />
        {slides.length > 1 && (
          <button
            onClick={next}
            style={{
              position: "absolute",
              right: 16,
              background: "rgba(255,255,255,0.08)",
              border: "1px solid rgba(255,255,255,0.14)",
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
      </div>

      {/* Thumbnails */}
      {slides.length > 1 && (
        <div
          onClick={(e) => e.stopPropagation()}
          style={{
            display: "flex",
            gap: 8,
            padding: "10px 24px",
            background: "rgba(255,255,255,0.03)",
            borderTop: "1px solid rgba(255,255,255,0.07)",
            width: "100%",
            justifyContent: "center",
            overflowX: "auto",
            flexShrink: 0,
          }}
        >
          {slides.map((s, i) => (
            <button
              key={i}
              onClick={() => setIdx(i)}
              style={{
                border:
                  i === idx ? "2px solid #2563eb" : "2px solid transparent",
                borderRadius: 6,
                background: "none",
                cursor: "pointer",
                padding: 0,
                opacity: i === idx ? 1 : 0.45,
                transition: "all 0.2s",
                flexShrink: 0,
              }}
            >
              <img
                src={`data:image/jpeg;base64,${s.base64}`}
                alt={s.title}
                style={{
                  width: 70,
                  height: 44,
                  objectFit: "cover",
                  borderRadius: 4,
                  display: "block",
                }}
              />
              <p
                style={{
                  margin: "3px 0 0",
                  fontSize: 9,
                  color: i === idx ? "#93c5fd" : "#6b7280",
                  textAlign: "center",
                  maxWidth: 70,
                }}
              >
                {s.title}
              </p>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Legends ───────────────────────────────────────────────────────────────────
function GradCamLegend() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 3 }}>
        {["#00008b", "#0080ff", "#00ff80", "#ffff00", "#ff4500"].map((c, i) => (
          <div
            key={i}
            style={{ width: 18, height: 18, borderRadius: 4, background: c }}
          />
        ))}
      </div>
      <p style={{ margin: 0, fontSize: 10.5, color: "#6b7280" }}>
        <strong style={{ color: "#111" }}>Bleu → Vert → Jaune → Rouge</strong> =
        Faible → Forte attention
      </p>
    </div>
  );
}
function LimeLegend() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
      {[
        { c: "#dc2626", label: "Rouge", desc: "oriente l'IA vers Falsifié" },
        { c: "#2563eb", label: "Bleu", desc: "soutient l'authenticité" },
        { c: "#374151", label: "Foncé", desc: "neutre / ignoré" },
      ].map(({ c, label, desc }) => (
        <div
          key={label}
          style={{ display: "flex", alignItems: "center", gap: 8 }}
        >
          <div
            style={{
              width: 13,
              height: 13,
              borderRadius: 3,
              background: c,
              flexShrink: 0,
            }}
          />
          <span style={{ fontSize: 11.5, color: "#374151" }}>
            <strong>{label}</strong> = {desc}
          </span>
        </div>
      ))}
    </div>
  );
}

// ── Zone table ────────────────────────────────────────────────────────────────
function ForgeryZoneTable({ zones }: { zones: ForgeryZone[] }) {
  if (!zones.length) return null;
  const COLORS = ["#dc2626", "#ea580c", "#a10073", "#059669", "#2563eb"];
  const zoneExplain: Record<string, string> = {
    Name: "Le champ nom semble avoir été modifié numériquement — incohérences de caractères détectées.",
    nationality:
      "Le texte de nationalité montre des signes de modification incompatibles avec l'impression originale.",
    MRZ: "La zone de lecture automatique présente des anomalies de données.",
    barcode:
      "La zone du code-barres contient des motifs incompatibles avec des documents authentiques.",
    Photo:
      "La zone photo montre des signes de substitution ou de manipulation numérique.",
    Date: "Les champs de date contiennent des incohérences au niveau des pixels suggérant une altération.",
    "ID number":
      "Le numéro d'identité présente des anomalies statistiques par rapport aux échantillons authentiques.",
    Signature:
      "La zone signature/cachet montre des signes d'insertion numérique.",
    Address:
      "La zone adresse présente des artefacts de police incompatibles avec le reste.",
  };
  function getExplanation(zoneName: string) {
    for (const key of Object.keys(zoneExplain)) {
      if (zoneName.toLowerCase().includes(key.toLowerCase()))
        return zoneExplain[key];
    }
    return "Cette région a été signalée comme statistiquement incompatible avec des documents authentiques.";
  }

  return (
    <div style={{ borderTop: "1px solid #f3f4f6" }}>
      <div
        style={{
          padding: "10px 24px 8px",
          background: "#fef2f2",
          borderBottom: "1px solid #fecaca",
          display: "flex",
          alignItems: "center",
          gap: 8,
        }}
      >
        <span style={{ fontSize: 16 }}>📍</span>
        <div>
          <p
            style={{
              margin: 0,
              fontSize: 11,
              fontWeight: 700,
              color: "#dc2626",
              textTransform: "uppercase",
              letterSpacing: "0.07em",
            }}
          >
            {zones.length} Zone{zones.length > 1 ? "s" : ""} suspecte
            {zones.length > 1 ? "s" : ""} détectée{zones.length > 1 ? "s" : ""}
          </p>
          <p style={{ margin: 0, fontSize: 10, color: "#9ca3af" }}>
            Les numéros correspondent aux boîtes sur la carte de falsification
          </p>
        </div>
      </div>
      <div
        style={{
          padding: "14px 24px",
          display: "flex",
          flexDirection: "column",
          gap: 8,
        }}
      >
        {zones.map((zone, i) => {
          const color = COLORS[i % COLORS.length];
          const pct = Math.round(zone.severity * 100);
          return (
            <div
              key={i}
              style={{
                borderRadius: 10,
                padding: "12px 16px",
                border: `1px solid ${zone.severity >= 0.75 ? "#fecaca" : zone.severity >= 0.5 ? "#fed7aa" : "#fde68a"}`,
                background:
                  zone.severity >= 0.75
                    ? "#fff5f5"
                    : zone.severity >= 0.5
                      ? "#fff7ed"
                      : "#fffbeb",
                display: "grid",
                gridTemplateColumns: "36px 1fr auto",
                alignItems: "start",
                gap: 12,
              }}
            >
              <div
                style={{
                  width: 34,
                  height: 34,
                  borderRadius: "50%",
                  background: color,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 13,
                  color: "#fff",
                  fontWeight: 800,
                  flexShrink: 0,
                }}
              >
                {zone.index}
              </div>
              <div>
                <p
                  style={{
                    margin: 0,
                    fontSize: 13,
                    fontWeight: 700,
                    color: "#111827",
                  }}
                >
                  {zone.zone}
                </p>
                <p
                  style={{
                    margin: "2px 0 7px",
                    fontSize: 11,
                    color: "#6b7280",
                  }}
                >
                  {getExplanation(zone.zone)}
                </p>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <div
                    style={{
                      flex: 1,
                      height: 4,
                      borderRadius: 2,
                      background: "#e5e7eb",
                    }}
                  >
                    <div
                      style={{
                        height: 4,
                        borderRadius: 2,
                        width: `${pct}%`,
                        background: severityColor(zone.severity),
                        transition: "width 0.5s ease",
                      }}
                    />
                  </div>
                  <span
                    style={{
                      fontSize: 10,
                      color: "#9ca3af",
                      fontFamily: "monospace",
                      minWidth: 28,
                    }}
                  >
                    {pct}%
                  </span>
                </div>
                <p
                  style={{ margin: "3px 0 0", fontSize: 9.5, color: "#9ca3af" }}
                >
                  Position : ({zone.bbox.x}, {zone.bbox.y}) · {zone.bbox.w}×
                  {zone.bbox.h}px
                </p>
              </div>
              <span
                style={{
                  fontSize: 10.5,
                  fontWeight: 800,
                  color: severityColor(zone.severity),
                  background: "#fff",
                  border: `1.5px solid ${severityColor(zone.severity)}`,
                  borderRadius: 6,
                  padding: "3px 9px",
                  flexShrink: 0,
                  letterSpacing: "0.04em",
                }}
              >
                {severityLabel(zone.severity)}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Slide viewer — image LEFT, info RIGHT ─────────────────────────────────────
function SlideshowViewer({ slides }: { slides: SlideItem[] }) {
  const [active, setActive] = useState(0);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const slide = slides[active];

  return (
    <>
      {/* Tabs */}
      <div
        style={{
          display: "flex",
          gap: 6,
          padding: "14px 24px 0",
          flexWrap: "wrap",
          borderBottom: "1px solid #f3f4f6",
          paddingBottom: 14,
        }}
      >
        {slides.map((s, i) => (
          <button
            key={i}
            onClick={() => setActive(i)}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              padding: "7px 15px",
              borderRadius: 8,
              border:
                active === i
                  ? `1.5px solid ${s.accent}`
                  : "1.5px solid #e5e7eb",
              background: active === i ? `${s.accent}12` : "#fafafa",
              color: active === i ? s.accent : "#6b7280",
              cursor: "pointer",
              fontSize: 12,
              fontWeight: active === i ? 700 : 500,
              transition: "all 0.18s ease",
              fontFamily: "inherit",
            }}
          >
            <span style={{ fontSize: 14 }}>{s.icon}</span>
            {s.title}
          </button>
        ))}
      </div>

      {/* Image LEFT + Info RIGHT */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(200px, 400px) 1fr",
          gap: 24,
          padding: "20px 24px",
        }}
      >
        {/* LEFT */}
        <div>
          <div
            style={{
              borderRadius: 10,
              overflow: "hidden",
              border: `1.5px solid ${slide.accent}40`,
              background: "#0f0f0f",
              position: "relative",
            }}
          >
            <img
              src={`data:image/jpeg;base64,${slide.base64}`}
              alt={slide.title}
              onClick={() => setLightboxOpen(true)}
              style={{
                width: "100%",
                height: "auto",
                display: "block",
                objectFit: "contain",
                cursor: "zoom-in",
              }}
            />
            <button
              onClick={() => setLightboxOpen(true)}
              style={{
                position: "absolute",
                top: 8,
                right: 8,
                background: "rgba(0,0,0,0.58)",
                border: "1px solid rgba(255,255,255,0.18)",
                borderRadius: 6,
                padding: "4px 10px",
                color: "#fff",
                fontSize: 10.5,
                fontWeight: 600,
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: 4,
                fontFamily: "inherit",
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
              Plein écran
            </button>
          </div>

          {/* Thumbnails */}
          {slides.length > 1 && (
            <div
              style={{
                display: "flex",
                gap: 6,
                marginTop: 8,
                flexWrap: "wrap",
              }}
            >
              {slides.map((s, i) => (
                <button
                  key={i}
                  onClick={() => setActive(i)}
                  style={{
                    border:
                      active === i
                        ? `2px solid ${s.accent}`
                        : "2px solid #e5e7eb",
                    borderRadius: 6,
                    background: "none",
                    cursor: "pointer",
                    padding: 0,
                    opacity: active === i ? 1 : 0.5,
                    transition: "all 0.18s",
                  }}
                >
                  <img
                    src={`data:image/jpeg;base64,${s.base64}`}
                    alt={s.title}
                    style={{
                      width: 62,
                      height: 40,
                      objectFit: "cover",
                      borderRadius: 4,
                      display: "block",
                    }}
                  />
                </button>
              ))}
            </div>
          )}
          <p
            style={{
              margin: "6px 0 0",
              fontSize: 9.5,
              color: "#9ca3af",
              textAlign: "center",
            }}
          >
            Cliquez sur l'image ou ⛶ pour agrandir
          </p>
        </div>

        {/* RIGHT */}
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontSize: 24 }}>{slide.icon}</span>
            <div>
              <h3
                style={{
                  margin: 0,
                  fontSize: 15,
                  fontWeight: 700,
                  color: "#111827",
                }}
              >
                {slide.title}
              </h3>
              <p style={{ margin: 0, fontSize: 11.5, color: "#6b7280" }}>
                {slide.subtitle}
              </p>
            </div>
          </div>

          <div
            style={{
              padding: "13px 16px",
              borderRadius: 10,
              background: "#f8fafc",
              border: "1px solid #e5e7eb",
            }}
          >
            <p
              style={{
                margin: "0 0 3px",
                fontSize: 10,
                fontWeight: 700,
                textTransform: "uppercase",
                letterSpacing: "0.06em",
                color: "#9ca3af",
              }}
            >
              Ce que vous voyez
            </p>
            <p
              style={{
                margin: 0,
                fontSize: 12.5,
                color: "#374151",
                lineHeight: 1.7,
              }}
            >
              {slide.description}
            </p>
          </div>

          {slide.legendEl && (
            <div
              style={{
                padding: "12px 16px",
                borderRadius: 10,
                background: "#fff",
                border: "1px solid #e5e7eb",
              }}
            >
              <p
                style={{
                  margin: "0 0 8px",
                  fontSize: 10,
                  fontWeight: 700,
                  textTransform: "uppercase",
                  letterSpacing: "0.06em",
                  color: "#9ca3af",
                }}
              >
                Légende des couleurs
              </p>
              {slide.legendEl}
            </div>
          )}

          <div
            style={{
              padding: "11px 14px",
              borderRadius: 9,
              background: `${slide.accent}0d`,
              border: `1px solid ${slide.accent}28`,
              display: "flex",
              gap: 8,
              alignItems: "flex-start",
            }}
          >
            <span style={{ fontSize: 15, flexShrink: 0 }}>💡</span>
            <p
              style={{
                margin: 0,
                fontSize: 11.5,
                color: "#4b5563",
                lineHeight: 1.65,
              }}
            >
              {slide.note}
            </p>
          </div>
        </div>
      </div>

      {lightboxOpen && (
        <Lightbox
          slides={slides}
          startIndex={active}
          onClose={() => setLightboxOpen(false)}
        />
      )}
    </>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export default function CnnResult({ cnn }: Props) {
  const pct = Math.round(cnn.confidence * 100);
  const isReal = cnn.label === "Real";
  const isFalsified = cnn.label === "Falsified";

  const labelColor = isReal ? "#1d4ed8" : "#b91c1c";
  const labelBg = isReal ? "#eff6ff" : "#fef2f2";
  const labelBdr = isReal ? "#bfdbfe" : "#fecaca";
  const barColor = isReal ? "#2563eb" : "#ef4444";
  const riskColor =
    cnn.risk_level === "Low"
      ? "#16a34a"
      : cnn.risk_level === "Medium"
        ? "#d97706"
        : "#dc2626";
  const riskBg =
    cnn.risk_level === "Low"
      ? "#f0fdf4"
      : cnn.risk_level === "Medium"
        ? "#fffbeb"
        : "#fef2f2";
  const riskBdr =
    cnn.risk_level === "Low"
      ? "#bbf7d0"
      : cnn.risk_level === "Medium"
        ? "#fde68a"
        : "#fecaca";

  const hasLocalization = !!cnn.localization_base64 && isFalsified;
  const hasLime = !!cnn.lime_base64;
  const hasGradcam = !!cnn.gradcam_base64;
  const hasIG = !!cnn.integrated_gradients_base64;
  const hasOriginal = !!cnn.original_base64;
  const hasZones = cnn.forgery_zones?.length > 0;

  const slides: SlideItem[] = [];
  if (isFalsified && hasLocalization) {
    slides.push({
      base64: cnn.localization_base64,
      title: "Carte de falsification",
      subtitle: "Original annoté — boîtes numérotées = zones falsifiées",
      note: "Chaque boîte rouge numérotée identifie une zone précise signalée comme altérée par l'IA. Les numéros correspondent à la liste des zones ci-dessous.",
      accent: "#dc2626",
      icon: "🗺️",
      description:
        "Image la plus importante. Le document original est affiché avec des boîtes colorées sur les zones suspectes. Les zones rouges numérotées (① ②…) indiquent des régions où les statistiques de pixels, les polices ou les artefacts de compression sont incompatibles avec un document authentique.",
    });
  }
  if (hasOriginal) {
    slides.push({
      base64: cnn.original_base64,
      title: "Document original",
      subtitle: "Référence brute — sans superposition IA",
      note: "Utilisez cette image pour comparer avec la carte de falsification. Aucune superposition IA n'est appliquée.",
      accent: "#2563eb",
      icon: "🖼️",
      description:
        "Le document brut tel qu'importé, sans superposition IA. Utilisez-le comme référence pour comparer avec la carte de falsification ou les cartes thermiques.",
    });
  }
  if (hasLime) {
    slides.push({
      base64: cnn.lime_base64,
      title: "Analyse LIME",
      subtitle: "Quelles régions ont influencé la décision IA",
      note: "Même résolution que le classifieur (384 px). Rouge = oriente vers « falsifié ».",
      accent: "#7c3aed",
      icon: "🔬",
      description:
        "LIME masque des superpixels (couleur moyenne locale) et mesure l'impact sur P(faux). Les zones bleues soutiennent l'authenticité.",
      legendEl: <LimeLegend />,
    });
  }
  if (hasGradcam) {
    slides.push({
      base64: cnn.gradcam_base64,
      title: "Carte thermique Grad-CAM",
      subtitle: isReal
        ? "Attention liée au score « réel »"
        : "Là où le réseau de neurones portait son attention",
      note: isReal
        ? "Carte calculée pour augmenter P(réel) : met en avant ce que le modèle associe à l'authenticité."
        : "Les zones rouges/jaunes indiquent une forte influence sur le score « faux ».",
      accent: "#ea580c",
      icon: "🧠",
      description: isReal
        ? "Grad-CAM cible ici la classe « réel » pour éviter d'afficher une carte orientée falsification sur un document jugé authentique."
        : "Grad-CAM rétro-propage la décision dans ResNet-50 pour révéler les pixels les plus influents sur P(faux).",
      legendEl: <GradCamLegend />,
    });
  }
  if (hasIG) {
    slides.push({
      base64: cnn.integrated_gradients_base64!,
      title: "Integrated Gradients",
      subtitle: "Attribution par chemin d'intégration",
      note: "Complète Grad-CAM : sensibilité du score « faux » aux pixels (même résolution 384).",
      accent: "#0d9488",
      icon: "📐",
      description:
        "Integrated Gradients accumule les gradients le long d'un chemin depuis une image de référence jusqu'à l'entrée actuelle, ce qui réduit certains biais visuels par rapport à une seule rétropropagation.",
    });
  }

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
          padding: "16px 24px",
          borderBottom: "1px solid #f3f4f6",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: 10,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div
            style={{
              width: 36,
              height: 36,
              borderRadius: 9,
              background: "#eff6ff",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="#2563eb"
              strokeWidth="2"
              strokeLinecap="round"
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
          </div>
          <div>
            <h2
              style={{
                margin: 0,
                fontSize: 15,
                fontWeight: 700,
                color: "#111827",
              }}
            >
              Analyse CNN Deep Learning
            </h2>
            <p style={{ margin: 0, fontSize: 11, color: "#9ca3af" }}>
              ResNet-50 · Grad-CAM · Integrated Gradients · LIME
              {isReal ? " · pas de localisation falsification" : " · localisation"}
            </p>
          </div>
        </div>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            flexWrap: "wrap",
          }}
        >
          <span
            style={{
              fontSize: 12,
              fontWeight: 700,
              borderRadius: 20,
              padding: "4px 13px",
              border: `1px solid ${labelBdr}`,
              color: labelColor,
              background: labelBg,
            }}
          >
            {cnn.label === "Real" ? "Réel" : "Falsifié"}
          </span>
          <span
            style={{
              fontSize: 12,
              fontWeight: 700,
              borderRadius: 20,
              padding: "4px 13px",
              border: `1px solid ${riskBdr}`,
              color: riskColor,
              background: riskBg,
            }}
          >
            {cnn.risk_level === "Low"
              ? "Risque Faible"
              : cnn.risk_level === "Medium"
                ? "Risque Modéré"
                : "Risque Élevé"}
          </span>
          <span
            style={{
              fontSize: 12,
              fontFamily: "monospace",
              borderRadius: 20,
              padding: "4px 13px",
              color: "#6b7280",
              background: "#f5f6fa",
              border: "1px solid #ebebf0",
            }}
          >
            {pct}% conf.
            {cnn.calibration_temperature != null &&
            cnn.calibration_temperature > 0 &&
            cnn.prob_fake_raw != null ? (
              <span
                style={{
                  display: "block",
                  marginTop: 3,
                  fontSize: 9,
                  color: "#9ca3af",
                }}
              >
                brut P(faux) {Math.round(cnn.prob_fake_raw * 100)}% · T=
                {cnn.calibration_temperature}
              </span>
            ) : null}
          </span>
        </div>
      </div>

      {/* Confidence + explanation */}
      <div
        style={{
          padding: "16px 24px",
          borderBottom: "1px solid #f3f4f6",
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 20,
        }}
      >
        <div>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              fontSize: 12,
              color: "#6b7280",
              marginBottom: 7,
            }}
          >
            <span>Confiance du modèle</span>
            <span
              style={{
                fontFamily: "monospace",
                fontWeight: 700,
                color: barColor,
              }}
            >
              {pct}%
            </span>
          </div>
          <div style={{ height: 8, borderRadius: 4, background: "#f5f6fa" }}>
            <div
              style={{
                height: 8,
                borderRadius: 4,
                width: `${pct}%`,
                background: barColor,
                transition: "width 0.7s ease",
              }}
            />
          </div>
          <p style={{ fontSize: 11, color: "#9ca3af", margin: "5px 0 0" }}>
            Seuil : {isReal ? "< " : "≥ "}50% · Probabilité de falsification :{" "}
            {Math.round((isFalsified ? cnn.confidence : 1 - cnn.confidence) * 100)}%
          </p>
        </div>
        <div
          style={{
            padding: "11px 15px",
            borderRadius: 10,
            background: "#f8fafc",
            border: "1px solid #e5e7eb",
          }}
        >
          <p
            style={{
              fontSize: 10,
              fontWeight: 700,
              textTransform: "uppercase",
              letterSpacing: "0.05em",
              color: "#9ca3af",
              margin: "0 0 4px",
            }}
          >
            Interprétation IA
          </p>
          <p
            style={{
              fontSize: 12.5,
              color: "#4b5563",
              lineHeight: 1.65,
              margin: 0,
            }}
          >
            {cnn.explanation}
          </p>
        </div>
      </div>

      {/* Slideshow */}
      {slides.length > 0 && <SlideshowViewer slides={slides} />}

      {/* Zone table */}
      {isFalsified && hasZones && (
        <ForgeryZoneTable zones={cnn.forgery_zones} />
      )}
    </div>
  );
}
