import { AnalysisResult } from "../api";

interface Props {
  result: AnalysisResult;
}

interface CardProps {
  label: string;
  badge: string;
  value: string;
  valueColor: string;
  arrow: "up" | "down";
  arrowColor: string;
  arrowText: string;
  lines: string[];
  badgeBg: string;
  badgeColor: string;
  wide?: boolean;
}

function ArrowUp({ color }: { color: string }) {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none">
      <polyline
        points="18,15 12,9 6,15"
        stroke={color}
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
function ArrowDown({ color }: { color: string }) {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none">
      <polyline
        points="6,9 12,15 18,9"
        stroke={color}
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function Card({
  label,
  badge,
  value,
  valueColor,
  arrow,
  arrowColor,
  arrowText,
  lines,
  badgeBg,
  badgeColor,
  wide,
}: CardProps) {
  const isUp = arrow === "up";
  const pillBg = isUp ? "rgba(34,197,94,0.10)" : "rgba(239,68,68,0.10)";

  return (
    <div
      style={{
        background: "#ffffff",
        borderRadius: 14,
        padding: wide ? "22px 26px" : "20px 22px",
        boxShadow: "0 1px 4px rgba(0,0,0,0.06)",
        display: "flex",
        flexDirection: "column",
        gap: 4,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 4,
        }}
      >
        <p
          style={{ fontSize: 13, color: "#9ca3af", fontWeight: 500, margin: 0 }}
        >
          {label}
        </p>
        <span
          style={{
            fontSize: 11,
            fontWeight: 600,
            borderRadius: 20,
            padding: "2px 10px",
            background: badgeBg,
            color: badgeColor,
          }}
        >
          {badge}
        </span>
      </div>
      <p
        key={value}
        style={{
          fontSize: wide ? 38 : 30,
          fontWeight: 700,
          color: valueColor,
          margin: 0,
          lineHeight: 1.1,
          display: "inline-block",
          animation: "scorePop 0.45s cubic-bezier(0.22,1,0.36,1) both",
        }}
      >
        {value}
      </p>
      <div
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 4,
          marginTop: 4,
          padding: "2px 8px",
          borderRadius: 20,
          background: pillBg,
          alignSelf: "flex-start",
        }}
      >
        {isUp ? <ArrowUp color={arrowColor} /> : <ArrowDown color={arrowColor} />}
        <span style={{ fontSize: 12, fontWeight: 600, color: arrowColor }}>
          {arrowText}
        </span>
      </div>
      {lines.map((l, i) => (
        <p key={i} style={{ fontSize: 12, color: "#9ca3af", margin: 0 }}>
          {l}
        </p>
      ))}
    </div>
  );
}

export default function StatCards({ result }: Props) {
  const {
    global_score_display,
    verdict,
    cnn,
    structural_score,
    metadata,
    ocr,
    font,
    ocr_fields,
  } = result;

  const verdictColor =
    verdict === "Authentic"
      ? "#16a34a"
      : verdict === "Suspicious"
        ? "#d97706"
        : "#dc2626";
  const cnnIsReal = cnn.label === "Real";
  const metaScore = metadata?.score ?? 0;
  const metaRisk = metadata?.risk_level ?? "—";
  const metaColor =
    metaRisk === "Low"
      ? "#16a34a"
      : metaRisk === "Moderate"
        ? "#d97706"
        : metaRisk === "High"
          ? "#dc2626"
          : "#9b1c1c";

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "1.4fr 1fr 1fr 1fr",
        gap: 16,
      }}
    >
      {/* Global Score card — wider than the others */}
      <Card
        label="Global Score"
        badge="Last scan"
        badgeBg="#f3f4f6"
        badgeColor="#6b7280"
        value={String(global_score_display)}
        valueColor={verdictColor}
        arrow={verdict === "Authentic" ? "up" : "down"}
        arrowColor={verdictColor}
        arrowText={verdict}
        wide={true}
        lines={[
          `CNN: ${Math.round(cnn.confidence * 100)}%`,
          `Structural: ${Math.round(structural_score * 100)}%`,
          `Metadata: ${Math.round(metaScore * 100)}%`,
        ]}
      />

      <Card
        label="CNN Confidence"
        badge="ResNet50"
        badgeBg="#eff6ff"
        badgeColor="#2563eb"
        value={`${Math.round(cnn.confidence * 100)}%`}
        valueColor={cnnIsReal ? "#2563eb" : "#dc2626"}
        arrow={cnnIsReal ? "up" : "down"}
        arrowColor={cnnIsReal ? "#16a34a" : "#dc2626"}
        arrowText={`${cnn.label} · ${cnn.risk_level} risk`}
        lines={["Grad-CAM ready"]}
      />

      <Card
        label="Structural Score"
        badge="MRZ+Font"
        badgeBg="#f5f3ff"
        badgeColor="#7c3aed"
        value={`${Math.round(structural_score * 100)}%`}
        valueColor={
          structural_score >= 0.75
            ? "#7c3aed"
            : structural_score >= 0.5
              ? "#d97706"
              : "#dc2626"
        }
        arrow={structural_score >= 0.5 ? "up" : "down"}
        arrowColor={structural_score >= 0.5 ? "#16a34a" : "#dc2626"}
        arrowText={`MRZ: ${Math.round(ocr.score * 100)}%`}
        lines={[
          `Font: ${Math.round(font.score * 100)}%`,
          `Fields: ${Math.round(ocr_fields.score * 100)}%`,
        ]}
      />

      <Card
        label="Metadata Risk"
        badge="EXIF/ELA"
        badgeBg="#fef2f2"
        badgeColor="#dc2626"
        value={`${Math.round(metaScore * 100)}%`}
        valueColor={metaColor}
        arrow={metaRisk === "Low" ? "up" : "down"}
        arrowColor={metaRisk === "Low" ? "#16a34a" : "#dc2626"}
        arrowText={`${metaRisk} risk`}
        lines={[
          metadata?.detected_software
            ? `⚠ ${metadata.detected_software}`
            : "No editor detected",
        ]}
      />
    </div>
  );
}
