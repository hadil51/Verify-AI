import { useState } from "react";
import { AnalysisResult } from "../api";

// ─── Types ────────────────────────────────────────────────────────────────────
type TabId = "apercu" | "structurel" | "visuel" | "metadata";

interface Props {
  result: AnalysisResult;
  documentImageSrc?: string | null;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
function scoreColor(s: number) {
  if (s >= 0.75)
    return { text: "#16a34a", bg: "#f0fdf4", border: "#bbf7d0", label: "Bon" };
  if (s >= 0.5)
    return {
      text: "#d97706",
      bg: "#fffbeb",
      border: "#fde68a",
      label: "Moyen",
    };
  return { text: "#dc2626", bg: "#fef2f2", border: "#fecaca", label: "Faible" };
}
function pct(s: number) {
  return Math.round(Math.min(Math.max(s, 0), 1) * 100);
}

// Decode MRZ date e.g. "950312" → "12 Mar 1995"
function decodeMrzDate(raw: string, isBirth = false) {
  if (!raw || raw.length < 6) return raw;
  const yy = parseInt(raw.slice(0, 2), 10);
  const mm = parseInt(raw.slice(2, 4), 10);
  const dd = parseInt(raw.slice(4, 6), 10);
  if (isNaN(yy) || isNaN(mm) || isNaN(dd) || mm < 1 || mm > 12) return raw;
  const now = new Date().getFullYear() % 100;
  const fullYear = isBirth
    ? yy > now
      ? 1900 + yy
      : 2000 + yy
    : yy < 50
      ? 2000 + yy
      : 1900 + yy;
  const months = [
    "Jan",
    "Fév",
    "Mar",
    "Avr",
    "Mai",
    "Jun",
    "Jul",
    "Aoû",
    "Sep",
    "Oct",
    "Nov",
    "Déc",
  ];
  return `${dd} ${months[mm - 1]} ${fullYear}`;
}

// Auto-detect and decode date (MRZ format YYMMDD or visual DD/MM/YYYY etc.)
function decodeDate(raw: string, isBirth = false) {
  if (!raw) return "";
  const trimmed = raw.trim();
  // MRZ format: 6 digits
  if (/^\d{6}$/.test(trimmed)) return decodeMrzDate(trimmed, isBirth);
  // Already visual date (DD/MM/YYYY etc.)
  return trimmed;
}

function fieldQualityScore(fields: Record<string, string>) {
  const safe = (k: string) => (fields?.[k] || "").trim();
  const isName = (v: string) =>
    v.length >= 2 && /[A-Za-zÀ-ÖØ-öø-ÿ]/.test(v) && !/^[A-Z]{1,2}$/.test(v);
  const isDate = (v: string) =>
    /^\d{2}[\/\.\-]\d{2}[\/\.\-]\d{4}$/.test(v) || /^\d{6}$/.test(v);
  const isDocNum = (v: string) =>
    /[0-9]/.test(v) && v.replace(/\s+/g, "").length >= 6;
  const isSex = (v: string) => ["M", "F"].includes(v.toUpperCase());

  let score = 0;
  if (isName(safe("surname"))) score += 3;
  if (isName(safe("names"))) score += 3;
  if (isDate(safe("date_of_birth"))) score += 2;
  if (isDate(safe("expiration_date"))) score += 2;
  if (isDocNum(safe("number"))) score += 2;
  if (isSex(safe("sex"))) score += 1;
  if (safe("nationality").length >= 3) score += 1;
  return score;
}

// ─── Tab Button ───────────────────────────────────────────────────────────────
function TabBtn({
  active,
  label,
  icon,
  onClick,
}: {
  active: boolean;
  label: string;
  icon: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 7,
        padding: "10px 20px",
        borderRadius: 10,
        border: active ? "1.5px solid #2563eb" : "1.5px solid transparent",
        background: active ? "rgba(37,99,235,0.08)" : "transparent",
        color: active ? "#1d4ed8" : "#6b7280",
        cursor: "pointer",
        fontSize: 13.5,
        fontWeight: active ? 700 : 500,
        fontFamily: "inherit",
        transition: "all 0.18s ease",
        position: "relative",
        whiteSpace: "nowrap",
      }}
      onMouseEnter={(e) => {
        if (!active)
          (e.currentTarget as HTMLElement).style.background =
            "rgba(0,0,0,0.04)";
      }}
      onMouseLeave={(e) => {
        if (!active)
          (e.currentTarget as HTMLElement).style.background = "transparent";
      }}
    >
      <span style={{ display: "flex", opacity: active ? 1 : 0.7 }}>{icon}</span>
      {label}
      {active && (
        <span
          style={{
            position: "absolute",
            bottom: -2,
            left: "50%",
            transform: "translateX(-50%)",
            width: 28,
            height: 3,
            borderRadius: 2,
            background: "#2563eb",
          }}
        />
      )}
    </button>
  );
}

// ─── Progress Bar ─────────────────────────────────────────────────────────────
function ProgressBar({
  value,
  color,
  animated = true,
}: {
  value: number;
  color: string;
  animated?: boolean;
}) {
  return (
    <div
      style={{
        height: 8,
        borderRadius: 99,
        background: "#f0f0f5",
        overflow: "hidden",
        position: "relative",
      }}
    >
      <div
        style={{
          height: "100%",
          borderRadius: 99,
          background: color,
          width: `${Math.round(Math.min(Math.max(value, 0), 100))}%`,
          transition: animated
            ? "width 0.8s cubic-bezier(0.22,1,0.36,1)"
            : undefined,
          position: "relative",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            position: "absolute",
            inset: 0,
            background:
              "linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.35) 50%, transparent 100%)",
            animation: "shimmerBar 2s ease-in-out infinite",
          }}
        />
      </div>
    </div>
  );
}

// ─── Check Row (checklist) ────────────────────────────────────────────────────
function CheckRow({
  label,
  ok,
  detail,
}: {
  label: string;
  ok: boolean;
  detail?: string;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "flex-start",
        gap: 10,
        padding: "9px 0",
        borderBottom: "1px solid #f3f4f6",
      }}
    >
      <span
        style={{
          flexShrink: 0,
          marginTop: 1,
          width: 20,
          height: 20,
          borderRadius: "50%",
          background: ok ? "#16a34a" : "#ef4444",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {ok ? (
          <svg
            width="10"
            height="10"
            viewBox="0 0 24 24"
            fill="none"
            stroke="white"
            strokeWidth="3.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <polyline points="20 6 9 17 4 12" />
          </svg>
        ) : (
          <svg
            width="10"
            height="10"
            viewBox="0 0 24 24"
            fill="none"
            stroke="white"
            strokeWidth="3.5"
            strokeLinecap="round"
          >
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        )}
      </span>
      <div>
        <p
          style={{
            margin: 0,
            fontSize: 13,
            fontWeight: 500,
            color: ok ? "#111827" : "#b91c1c",
          }}
        >
          {label}
        </p>
        {detail && (
          <p
            style={{
              margin: "2px 0 0",
              fontSize: 11,
              color: "#9ca3af",
              fontFamily: "monospace",
            }}
          >
            {detail}
          </p>
        )}
      </div>
    </div>
  );
}

// ─── Sub-card ─────────────────────────────────────────────────────────────────
function SubCard({
  title,
  icon,
  score,
  children,
  accent = "#2563eb",
  badge,
}: {
  title: string;
  icon: React.ReactNode;
  score: number;
  children: React.ReactNode;
  accent?: string;
  badge?: string;
}) {
  const c = scoreColor(score);
  const p = pct(score);
  return (
    <div
      style={{
        background: "#fff",
        borderRadius: 14,
        border: "1px solid #e8eaed",
        boxShadow: "0 2px 8px rgba(0,0,0,0.05)",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          padding: "14px 18px 12px",
          background: "linear-gradient(135deg, #fafbff 0%, #ffffff 100%)",
          borderBottom: "1px solid #f0f2f5",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span
            style={{
              width: 32,
              height: 32,
              borderRadius: 8,
              background: `${accent}15`,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: accent,
            }}
          >
            {icon}
          </span>
          <div>
            <p
              style={{
                margin: 0,
                fontSize: 13,
                fontWeight: 700,
                color: "#111827",
              }}
            >
              {title}
            </p>
            {badge && (
              <p style={{ margin: "1px 0 0", fontSize: 10, color: "#9ca3af" }}>
                {badge}
              </p>
            )}
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span
            style={{
              fontSize: 18,
              fontWeight: 800,
              color: c.text,
              fontFamily: "monospace",
            }}
          >
            {p}%
          </span>
          <span
            style={{
              fontSize: 11,
              fontWeight: 600,
              padding: "3px 10px",
              borderRadius: 999,
              background: c.bg,
              color: c.text,
              border: `1px solid ${c.border}`,
            }}
          >
            {c.label}
          </span>
        </div>
      </div>
      <div style={{ padding: "6px 18px 0" }}>
        <ProgressBar value={p} color={c.text} />
      </div>
      <div style={{ padding: "8px 18px 14px" }}>{children}</div>
    </div>
  );
}

// ─── Identity field row ───────────────────────────────────────────────────────
function IdRow({
  label,
  value,
  highlight = false,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  if (!value || value.trim() === "" || value === "—") return null;
  return (
    <tr>
      <td
        style={{
          padding: "9px 12px 9px 0",
          fontSize: 12,
          color: "#9ca3af",
          fontWeight: 500,
          verticalAlign: "top",
          whiteSpace: "nowrap",
          width: 150,
        }}
      >
        {label}
      </td>
      <td
        style={{
          padding: "9px 0",
          fontSize: 13,
          fontWeight: 600,
          color: highlight ? "#1d4ed8" : "#111827",
          fontFamily: "monospace",
          wordBreak: "break-all",
        }}
      >
        {value}
      </td>
    </tr>
  );
}

// ─── Zoomable image ───────────────────────────────────────────────────────────
function ZoomableImage({
  src,
  alt,
  label,
}: {
  src: string;
  alt: string;
  label?: string;
}) {
  const [zoomed, setZoomed] = useState(false);
  return (
    <>
      <div
        onClick={() => setZoomed(true)}
        style={{
          borderRadius: 12,
          overflow: "hidden",
          border: "1px solid #e5e7eb",
          cursor: "zoom-in",
          position: "relative",
          background: "#0f0f0f",
          boxShadow: "0 4px 20px rgba(0,0,0,0.10)",
        }}
      >
        <img
          src={src}
          alt={alt}
          style={{
            width: "100%",
            display: "block",
            maxHeight: 380,
            objectFit: "contain",
          }}
        />
        <div
          style={{
            position: "absolute",
            bottom: 10,
            right: 10,
            background: "rgba(0,0,0,0.6)",
            color: "#fff",
            fontSize: 11,
            padding: "3px 9px",
            borderRadius: 6,
            display: "flex",
            alignItems: "center",
            gap: 4,
            pointerEvents: "none",
          }}
        >
          <svg
            width="10"
            height="10"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          >
            <path d="M8 3H5a2 2 0 00-2 2v3M16 3h3a2 2 0 012 2v3M8 21H5a2 2 0 01-2-2v-3M16 21h3a2 2 0 002-2v-3" />
          </svg>
          Agrandir
        </div>
      </div>
      {label && (
        <p
          style={{
            margin: "6px 0 0",
            fontSize: 11,
            color: "#9ca3af",
            textAlign: "center",
          }}
        >
          {label}
        </p>
      )}
      {zoomed && (
        <div
          onClick={() => setZoomed(false)}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 10000,
            background: "rgba(0,0,0,0.92)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexDirection: "column",
            gap: 14,
          }}
        >
          <img
            src={src}
            alt={alt}
            onClick={(e) => e.stopPropagation()}
            style={{
              maxWidth: "88vw",
              maxHeight: "82vh",
              objectFit: "contain",
              borderRadius: 10,
              boxShadow: "0 12px 60px rgba(0,0,0,0.7)",
            }}
          />
          <button
            onClick={() => setZoomed(false)}
            style={{
              padding: "8px 20px",
              borderRadius: 8,
              background: "rgba(255,255,255,0.1)",
              border: "1px solid rgba(255,255,255,0.2)",
              color: "#e5e7eb",
              cursor: "pointer",
              fontSize: 13,
              fontFamily: "inherit",
            }}
          >
            ✕ Fermer
          </button>
        </div>
      )}
    </>
  );
}

// ─── Label maps ──────────────────────────────────────────────────────────────
const mrzCheckLabels: Record<string, string> = {
  valid_number: "Somme de contrôle — numéro document",
  valid_date_of_birth: "Somme de contrôle — date de naissance",
  valid_expiration_date: "Somme de contrôle — date d'expiration",
  valid_composite: "Somme de contrôle composite",
  valid_personal_number: "Somme de contrôle — numéro personnel",
};
const fieldCheckLabels: Record<string, string> = {
  mrz_detected: "Code MRZ détecté",
  valid_country: "Code pays valide (selon liste ISO 3166-1 alpha-3)",
  valid_nationality: "Code nationalité valide",
  valid_dob: "Date de naissance cohérente",
  valid_expiry: "Date d'expiration cohérente",
  valid_sex: "Champ sexe valide",
  valid_doc_number: "Numéro document valide",
  valid_surname: "Nom valide",
  valid_names: "Prénom valide",

  // Cohérence avec la MRZ
  surname_match: "Nom cohérent avec la MRZ",
  names_match: "Prénom cohérent avec la MRZ",
  nationality_match: "Nationalité cohérente avec la MRZ",
  country_match: "Pays d'émission cohérent avec la MRZ",
  dob_match: "Date de naissance cohérente avec la MRZ",
  expiry_match: "Date d'expiration cohérente avec la MRZ",
  sex_match: "Sexe cohérent avec la MRZ",

  // Vérifications logiques
  realistic_age: "Âge réaliste",
  dob_before_expiry: "Naissance antérieure à l'expiration",
  country_nationality_coherent: "Cohérence entre pays et nationalité",
  name_and_prenom_present: "Nom et prénom présents",
  name_different_from_prenom: "Nom différent du prénom",
  sex_name_coherent: "Sexe cohérent avec le prénom",

  // Mode visuel uniquement
  name_found: "Nom extrait",
  prenom_found: "Prénom extrait",
  doc_number_found: "Numéro document extrait",
};
const fontCheckLabels: Record<string, string> = {
  enough_components: "Nombre de régions de texte suffisant",
  uniform_height: "Hauteur des caractères uniforme",
  uniform_width: "Largeur des caractères uniforme",
  horizontal_alignment: "Alignement horizontal des lignes",
  regular_spacing: "Espacement inter-caractères régulier",
  uniform_density: "Densité d'encre uniforme",
};
const metaRiskFr: Record<string, string> = {
  Low: "Faible",
  Moderate: "Modéré",
  High: "Élevé",
  Critical: "Critique",
};

// ─────────────────────────────────────────────────────────────────────────────
// TAB 1 — Aperçu
// Problem 4 fixed: scores now come directly from backend fields (no inversion tricks)
// Problem 5 fixed: "Points clés" removed
// Problem 3 fixed: smart field display using doc_fields if available, then ocr fields
// ─────────────────────────────────────────────────────────────────────────────
function TabApercu({
  result,
  documentImageSrc,
}: {
  result: AnalysisResult;
  documentImageSrc?: string | null;
}) {
  const verdict = result.verdict;
  const verdictColor =
    verdict === "Authentic"
      ? "#16a34a"
      : verdict === "Suspicious"
        ? "#d97706"
        : "#dc2626";
  const verdictFr =
    verdict === "Authentic"
      ? "Authentique"
      : verdict === "Suspicious"
        ? "Suspect"
        : "Faux";

  // Problem 3 fix: Smart field source selection
  // If doc_fields from module is available, use it (visual extraction)
  // If MRZ present, use OCR MRZ fields (more reliable)
  // Otherwise, fall back to whatever is available
  const hasMrz = result.mrz_found ?? result.ocr?.mrz_found ?? false;
  const docFields = result.doc_fields; // from doc_fields_module if backend sends it

  // Determine display fields
  let displayFields: Record<string, string> = {};
  let photoBase64: string | null = null;
  let fieldSource = "";

  if (
    hasMrz &&
    result.ocr?.fields &&
    Object.keys(result.ocr.fields).length > 0
  ) {
    // MRZ present → use MRZ fields (most reliable)
    displayFields = result.ocr.fields;
    fieldSource = "MRZ";
    // Photo from doc_fields if available
    if (docFields?.photo_base64) photoBase64 = docFields.photo_base64;
  } else {
    // No MRZ → choose the best source between doc_fields and ocr.fields.
    const docCandidate = (docFields?.fields ?? {}) as Record<string, string>;
    const ocrCandidate = (result.ocr?.fields ?? {}) as Record<string, string>;
    const docScore = fieldQualityScore(docCandidate);
    const ocrScore = fieldQualityScore(ocrCandidate);

    if (docScore >= ocrScore && Object.keys(docCandidate).length > 0) {
      displayFields = docCandidate;
      fieldSource = "OCR Visuel";
      photoBase64 = docFields?.photo_base64 ?? null;
    } else if (Object.keys(ocrCandidate).length > 0) {
      displayFields = ocrCandidate;
      fieldSource = "OCR";
      photoBase64 = docFields?.photo_base64 ?? null;
    } else if (Object.keys(docCandidate).length > 0) {
      displayFields = docCandidate;
      fieldSource = "OCR Visuel";
      photoBase64 = docFields?.photo_base64 ?? null;
    }
  }

  const f = displayFields;

  // Scores d'authenticité — cohérents avec GlobalScore.tsx
  const cnnIsReal = result.cnn?.label === "Real";
  // CNN : confidence = certitude du label (ex: 85% sûr que Falsified)
  // → score d'authenticité = 1 - confidence si Falsified, confidence si Real
  const cnnAuthScore = cnnIsReal
    ? (result.cnn?.confidence ?? 0)
    : 1 - (result.cnn?.confidence ?? 0);

  // Structure : directement depuis le backend (déjà un score d'authenticité)
  const structureScore = result.structural_score ?? 0;

  // Métadonnées : metadata.score est un score de RISQUE (haut = suspect)
  // → score d'authenticité = 1 - metadata.score
  const metadataAuthScore = 1 - (result.metadata?.score ?? 0);

  return (
    <div
      style={{
        display: "flex",
        gap: 24,
        animation: "tabFadeIn 0.28s ease both",
      }}
    >
      {/* LEFT: Identity table */}
      <div
        style={{
          flex: 1,
          minWidth: 0,
          display: "flex",
          flexDirection: "column",
          gap: 18,
        }}
      >
        {/* Verdict badge */}
        <div
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 10,
            padding: "10px 18px",
            borderRadius: 12,
            background:
              verdict === "Authentic"
                ? "#f0fdf4"
                : verdict === "Suspicious"
                  ? "#fffbeb"
                  : "#fef2f2",
            border: `1.5px solid ${verdictColor}30`,
            alignSelf: "flex-start",
          }}
        >
          <span
            style={{
              width: 10,
              height: 10,
              borderRadius: "50%",
              background: verdictColor,
              boxShadow: `0 0 0 4px ${verdictColor}20`,
            }}
          />
          <span style={{ fontSize: 14, fontWeight: 700, color: verdictColor }}>
            Verdict : {verdictFr}
          </span>
          <span style={{ fontSize: 13, color: "#9ca3af" }}>
            Score global :{" "}
            <strong style={{ color: verdictColor }}>
              {result.global_score_display}
            </strong>
            /100
          </span>
        </div>

        {/* Identity table */}
        <div
          style={{
            background: "#fff",
            borderRadius: 14,
            border: "1px solid #e8eaed",
            boxShadow: "0 2px 8px rgba(0,0,0,0.05)",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              padding: "12px 18px",
              borderBottom: "1px solid #f0f2f5",
              background: "linear-gradient(135deg, #fafbff 0%, #fff 100%)",
              display: "flex",
              alignItems: "center",
              gap: 8,
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
              <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" />
              <circle cx="12" cy="7" r="4" />
            </svg>
            <p
              style={{
                margin: 0,
                fontSize: 13,
                fontWeight: 700,
                color: "#111827",
              }}
            >
              Identité extraite
            </p>
            <span
              style={{
                marginLeft: "auto",
                fontSize: 10.5,
                fontWeight: 600,
                padding: "2px 8px",
                borderRadius: 999,
                background: hasMrz ? "#eff6ff" : "#f5f3ff",
                color: hasMrz ? "#1d4ed8" : "#7c3aed",
                border: hasMrz ? "1px solid #bfdbfe" : "1px solid #ddd6fe",
              }}
            >
              {hasMrz
                ? `MRZ · ${result.ocr?.mrz_type || "TD3"}`
                : fieldSource || "Extraction visuelle"}
            </span>
          </div>

          <div style={{ display: "flex", gap: 0 }}>
            {/* Photo column */}
            <div
              style={{
                padding: "14px 16px",
                borderRight: "1px solid #f0f2f5",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 8,
                minWidth: 120,
              }}
            >
              {photoBase64 ? (
                <>
                  <img
                    src={`data:image/png;base64,${photoBase64}`}
                    alt="Photo extraite"
                    style={{
                      width: 90,
                      height: 115,
                      objectFit: "cover",
                      borderRadius: 8,
                      border: "1px solid #e5e7eb",
                      boxShadow: "0 2px 8px rgba(0,0,0,0.08)",
                    }}
                  />
                  <p style={{ fontSize: 10, color: "#9ca3af", margin: 0 }}>
                    Photo extraite
                  </p>
                </>
              ) : (
                <div
                  style={{
                    width: 90,
                    height: 115,
                    borderRadius: 8,
                    background: "#f5f6fa",
                    border: "2px dashed #d1d5db",
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 6,
                  }}
                >
                  <svg
                    width="24"
                    height="24"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="#d1d5db"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                  >
                    <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" />
                    <circle cx="12" cy="7" r="4" />
                  </svg>
                  <p
                    style={{
                      fontSize: 9,
                      color: "#9ca3af",
                      margin: 0,
                      textAlign: "center",
                    }}
                  >
                    Aucune photo
                  </p>
                </div>
              )}
            </div>

            {/* Fields */}
            <div style={{ flex: 1, padding: "4px 18px 14px" }}>
              {Object.keys(f).length === 0 ? (
                <div
                  style={{
                    padding: "20px 0",
                    display: "flex",
                    flexDirection: "column",
                    gap: 8,
                    alignItems: "flex-start",
                  }}
                >
                  <p style={{ color: "#9ca3af", fontSize: 13, margin: 0 }}>
                    {hasMrz
                      ? "Aucun champ MRZ extrait."
                      : "Aucun champ visuel extrait du document."}
                  </p>
                  {!hasMrz && (
                    <div
                      style={{
                        padding: "8px 12px",
                        borderRadius: 8,
                        background: "#fffbeb",
                        border: "1px solid #fde68a",
                      }}
                    >
                      <p
                        style={{ margin: 0, fontSize: 11.5, color: "#92400e" }}
                      >
                        ℹ️ Document sans MRZ — l'extraction visuelle peut être
                        limitée selon la qualité et l'orientation du document.
                      </p>
                    </div>
                  )}
                </div>
              ) : (
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <tbody>
                    <IdRow label="Nom" value={f.surname} highlight />
                    <IdRow label="Prénom" value={f.names} highlight />
                    <IdRow label="Nationalité" value={f.nationality} />
                    <IdRow
                      label="Sexe"
                      value={
                        f.sex === "M"
                          ? "Masculin (M)"
                          : f.sex === "F"
                            ? "Féminin (F)"
                            : f.sex
                      }
                    />
                    <IdRow
                      label="Date de naissance"
                      value={
                        f.date_of_birth ? decodeDate(f.date_of_birth, true) : ""
                      }
                    />
                    <IdRow
                      label="Date d'expiration"
                      value={
                        f.expiration_date ? decodeDate(f.expiration_date) : ""
                      }
                    />
                    <IdRow label="Numéro du document" value={f.number} />
                    {hasMrz && (
                      <IdRow label="Type de document" value={f.type} />
                    )}
                    {hasMrz && <IdRow label="Pays" value={f.country} />}
                    {hasMrz && (
                      <IdRow label="N° personnel" value={f.personal_number} />
                    )}
                  </tbody>
                </table>
              )}
              {!hasMrz && result.ocr?.note && (
                <div
                  style={{
                    marginTop: 8,
                    padding: "8px 12px",
                    borderRadius: 8,
                    background: "#fffbeb",
                    border: "1px solid #fde68a",
                  }}
                >
                  <p style={{ margin: 0, fontSize: 11.5, color: "#92400e" }}>
                    ℹ️ {result.ocr.note}
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* RIGHT: Document image + correct scores from backend */}
      <div
        style={{
          width: 300,
          flexShrink: 0,
          display: "flex",
          flexDirection: "column",
          gap: 14,
        }}
      >
        <div
          style={{
            background: "#fff",
            borderRadius: 14,
            border: "1px solid #e8eaed",
            boxShadow: "0 2px 8px rgba(0,0,0,0.05)",
            padding: 14,
          }}
        >
          <p
            style={{
              margin: "0 0 10px",
              fontSize: 12,
              fontWeight: 700,
              color: "#9ca3af",
              textTransform: "uppercase",
              letterSpacing: "0.07em",
            }}
          >
            Document analysé
          </p>
          {documentImageSrc ? (
            <ZoomableImage
              src={documentImageSrc}
              alt="Document uploadé"
              label="Cliquez pour agrandir"
            />
          ) : result.cnn?.original_base64 ? (
            <ZoomableImage
              src={`data:image/jpeg;base64,${result.cnn.original_base64}`}
              alt="Document"
              label="Cliquez pour agrandir"
            />
          ) : (
            <div
              style={{
                height: 200,
                borderRadius: 12,
                background: "#f5f6fa",
                border: "2px dashed #d1d5db",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                gap: 8,
              }}
            >
              <svg
                width="36"
                height="36"
                viewBox="0 0 24 24"
                fill="none"
                stroke="#d1d5db"
                strokeWidth="1.5"
                strokeLinecap="round"
              >
                <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
                <polyline points="14 2 14 8 20 8" />
              </svg>
              <p style={{ margin: 0, fontSize: 12, color: "#9ca3af" }}>
                Image du document
              </p>
            </div>
          )}
        </div>

        {/* Problem 4 fix: correct scores directly from backend */}
        <div
          style={{
            background: "#fff",
            borderRadius: 14,
            border: "1px solid #e8eaed",
            boxShadow: "0 2px 8px rgba(0,0,0,0.05)",
            padding: "14px 16px",
            display: "flex",
            flexDirection: "column",
            gap: 10,
          }}
        >
          <p
            style={{
              margin: "0 0 4px",
              fontSize: 11,
              fontWeight: 700,
              color: "#9ca3af",
              textTransform: "uppercase",
              letterSpacing: "0.07em",
            }}
          >
            Scores d'authenticité
          </p>
          {[
            {
              label: "Inspection visuelle (IA)",
              value: cnnAuthScore,
              detail: `${cnnIsReal ? "Réel" : "Falsifié"} · ${Math.round((result.cnn?.confidence ?? 0) * 100)}% confiance`,
            },
            {
              label: "Analyse structurelle",
              value: structureScore,
              detail: `MRZ: ${Math.round((result.ocr?.score ?? 0) * 100)}% · Police: ${Math.round((result.font?.score ?? 0) * 100)}%`,
            },
            {
              label: "Métadonnées & Forensics",
              value: metadataAuthScore,
              detail: `Risque ${metaRiskFr[result.metadata?.risk_level ?? ""] ?? result.metadata?.risk_level ?? "—"}`,
            },
          ].map(({ label, value, detail }) => {
            const c = scoreColor(value);
            return (
              <div key={label}>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    fontSize: 12,
                    marginBottom: 3,
                  }}
                >
                  <span style={{ color: "#6b7280", fontWeight: 500 }}>
                    {label}
                  </span>
                  <span
                    style={{
                      fontWeight: 700,
                      color: c.text,
                      fontFamily: "monospace",
                    }}
                  >
                    {pct(value)}%
                  </span>
                </div>
                <ProgressBar value={pct(value)} color={c.text} />
                <p
                  style={{
                    margin: "2px 0 0",
                    fontSize: 10.5,
                    color: "#9ca3af",
                  }}
                >
                  {detail}
                </p>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// TAB 2 — Analyse Structurelle
// Problem 1 fix: Champs = validité logique + cohérence MRZ (si présent)
// Problem 2 fix: Police = zone champs + zone MRZ (si présent)
// ─────────────────────────────────────────────────────────────────────────────
function TabStructurel({ result }: { result: AnalysisResult }) {
  const { ocr, ocr_fields, font, structural_score } = result;
  const hasMrz = result.mrz_found ?? ocr?.mrz_found ?? false;
  const mrzEntries = Object.entries(ocr?.checks ?? {});
  const fieldEntries = Object.entries(ocr_fields?.checks ?? {});
  const fontEntries = Object.entries(font?.checks ?? {});
  const isVisualMode = ocr_fields?.mode === "visual";

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 16,
        animation: "tabFadeIn 0.28s ease both",
      }}
    >
      {/* Overall badge */}
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <div style={{ flex: 1 }}>
          <ProgressBar
            value={pct(structural_score)}
            color={scoreColor(structural_score).text}
          />
        </div>
        <span
          style={{
            fontSize: 14,
            fontWeight: 800,
            color: scoreColor(structural_score).text,
            minWidth: 52,
            textAlign: "right",
            fontFamily: "monospace",
          }}
        >
          {pct(structural_score)}%
        </span>
        <span
          style={{
            fontSize: 12,
            fontWeight: 600,
            padding: "4px 12px",
            borderRadius: 999,
            background: scoreColor(structural_score).bg,
            color: scoreColor(structural_score).text,
            border: `1px solid ${scoreColor(structural_score).border}`,
          }}
        >
          Score structurel global
        </span>
      </div>

      {/* ── 1. Vérification MRZ ── */}
      <SubCard
        title={
          hasMrz
            ? `Vérification MRZ · ${ocr?.mrz_type || "TD3"}`
            : "OCR Visuel (sans MRZ)"
        }
        icon={
          <svg
            width="15"
            height="15"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          >
            <path d="M3 7V5a2 2 0 012-2h2M17 3h2a2 2 0 012 2v2M21 17v2a2 2 0 01-2 2h-2M7 21H5a2 2 0 01-2-2v-2" />
            <line x1="3" y1="12" x2="21" y2="12" />
          </svg>
        }
        score={ocr?.score ?? 0}
        accent="#2563eb"
        badge={
          hasMrz
            ? "Sommes de contrôle ISO 7501"
            : "Extraction par OCR Tesseract"
        }
      >
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 0,
            marginTop: 4,
          }}
        >
          {mrzEntries.length > 0 ? (
            mrzEntries.map(([k, ok]) => (
              <CheckRow
                key={k}
                label={mrzCheckLabels[k] ?? k.replace(/_/g, " ")}
                ok={ok as boolean}
              />
            ))
          ) : (
            <p style={{ fontSize: 12, color: "#9ca3af", margin: "8px 0" }}>
              Aucune vérification MRZ disponible.
            </p>
          )}
          {ocr?.note && (
            <div
              style={{
                marginTop: 8,
                padding: "8px 12px",
                borderRadius: 8,
                background: "#fffbeb",
                border: "1px solid #fde68a",
              }}
            >
              <p style={{ margin: 0, fontSize: 11.5, color: "#92400e" }}>
                ℹ️ {ocr.note}
              </p>
            </div>
          )}
        </div>
      </SubCard>

      {/* ── 2. Vérification des Champs ──
          Problem 1 fix:
          - If MRZ present: score = logical validity + MRZ coherence (both shown)
          - If no MRZ: score = logical validity only ── */}
      <SubCard
        title="Vérification des Champs"
        icon={
          <svg
            width="15"
            height="15"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          >
            <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
            <polyline points="14 2 14 8 20 8" />
            <line x1="9" y1="13" x2="15" y2="13" />
            <line x1="9" y1="17" x2="15" y2="17" />
          </svg>
        }
        score={ocr_fields?.score ?? 0}
        accent="#7c3aed"
        badge={
          isVisualMode
            ? "Vérification logique uniquement (pas de MRZ)"
            : "Validité logique + Cohérence MRZ"
        }
      >
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 0,
            marginTop: 4,
          }}
        >
          {hasMrz && !isVisualMode && (
            <div
              style={{
                marginBottom: 8,
                padding: "6px 10px",
                borderRadius: 7,
                background: "#eff6ff",
                border: "1px solid #bfdbfe",
              }}
            >
              <p
                style={{
                  margin: 0,
                  fontSize: 11,
                  color: "#1d4ed8",
                  fontWeight: 600,
                }}
              >
                📋 Score = Validité logique des champs + Cohérence avec la MRZ
              </p>
            </div>
          )}
          {isVisualMode && (
            <div
              style={{
                marginBottom: 8,
                padding: "6px 10px",
                borderRadius: 7,
                background: "#fffbeb",
                border: "1px solid #fde68a",
              }}
            >
              <p
                style={{
                  margin: 0,
                  fontSize: 11,
                  color: "#92400e",
                  fontWeight: 600,
                }}
              >
                ℹ️ Pas de MRZ — score basé sur la validité logique des champs
                visuels uniquement
              </p>
            </div>
          )}
          {fieldEntries.length > 0 ? (
            fieldEntries.map(([k, ok]) => (
              <CheckRow
                key={k}
                label={fieldCheckLabels[k] ?? k.replace(/_/g, " ")}
                ok={ok as boolean}
                detail={ocr_fields?.details?.[k]}
              />
            ))
          ) : (
            <p style={{ fontSize: 12, color: "#9ca3af", margin: "8px 0" }}>
              Aucune vérification de champs disponible.
            </p>
          )}
          {ocr_fields?.note && (
            <div
              style={{
                marginTop: 8,
                padding: "8px 12px",
                borderRadius: 8,
                background: "#fffbeb",
                border: "1px solid #fde68a",
              }}
            >
              <p style={{ margin: 0, fontSize: 11.5, color: "#92400e" }}>
                ℹ️ {ocr_fields.note}
              </p>
            </div>
          )}
        </div>
      </SubCard>

      {/* ── 3. Police & Alignement ──
          Problem 2 fix: show MRZ zone analysis + field zone analysis separately ── */}
      <SubCard
        title="Police & Alignement"
        icon={
          <svg
            width="15"
            height="15"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          >
            <polyline points="4 7 4 4 20 4 20 7" />
            <line x1="9" y1="20" x2="15" y2="20" />
            <line x1="12" y1="4" x2="12" y2="20" />
          </svg>
        }
        score={font?.score ?? 0}
        accent="#059669"
        badge={
          hasMrz
            ? "Zone MRZ + Zone champs du document"
            : "Analyse des champs visuels"
        }
      >
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 0,
            marginTop: 4,
          }}
        >
          {hasMrz && (
            <div
              style={{
                marginBottom: 8,
                padding: "6px 10px",
                borderRadius: 7,
                background: "#f0fdf4",
                border: "1px solid #bbf7d0",
              }}
            >
              <p
                style={{
                  margin: 0,
                  fontSize: 11,
                  color: "#15803d",
                  fontWeight: 600,
                }}
              >
                🔤 Analyse : alignement & police dans la zone MRZ et dans la
                zone des champs textuels
              </p>
            </div>
          )}
          {font?.error ? (
            <p style={{ fontSize: 12, color: "#d97706", margin: "8px 0" }}>
              {font.error}
            </p>
          ) : fontEntries.length > 0 ? (
            fontEntries.map(([k, ok]) => (
              <CheckRow
                key={k}
                label={fontCheckLabels[k] ?? k.replace(/_/g, " ")}
                ok={ok as boolean}
                detail={font?.details?.[k]}
              />
            ))
          ) : (
            <p style={{ fontSize: 12, color: "#9ca3af", margin: "8px 0" }}>
              Aucune donnée de police disponible.
            </p>
          )}
        </div>
      </SubCard>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// TAB 3 — Inspection Visuelle (IA)
// Problem 7 fix: removed "Document original", kept 3 items with better icons
// ─────────────────────────────────────────────────────────────────────────────
function VisualSlide({
  label,
  b64,
  note,
  accent,
  icon,
}: {
  label: string;
  b64: string;
  note: string;
  accent: string;
  icon: React.ReactNode;
}) {
  return (
    <div
      style={{
        background: "#fff",
        borderRadius: 14,
        border: "1px solid #e8eaed",
        boxShadow: "0 2px 8px rgba(0,0,0,0.05)",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          padding: "10px 14px",
          borderBottom: "1px solid #f0f2f5",
          display: "flex",
          alignItems: "center",
          gap: 8,
        }}
      >
        <span
          style={{
            width: 28,
            height: 28,
            borderRadius: 7,
            background: `${accent}15`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: accent,
            flexShrink: 0,
          }}
        >
          {icon}
        </span>
        <p
          style={{
            margin: 0,
            fontSize: 12.5,
            fontWeight: 700,
            color: "#111827",
          }}
        >
          {label}
        </p>
      </div>
      <div style={{ background: "#0a0a0a" }}>
        <ZoomableImage src={`data:image/jpeg;base64,${b64}`} alt={label} />
      </div>
      <div style={{ padding: "8px 14px 10px" }}>
        <p
          style={{
            margin: 0,
            fontSize: 11.5,
            color: "#6b7280",
            lineHeight: 1.6,
          }}
        >
          {note}
        </p>
      </div>
    </div>
  );
}

function TabVisuel({ result }: { result: AnalysisResult }) {
  const cnn = result.cnn;
  const isReal = cnn?.label === "Real";
  const pctConf = Math.round((cnn?.confidence ?? 0) * 100);
  const pctRaw =
    cnn?.prob_fake_raw != null
      ? Math.round(cnn.prob_fake_raw * 100)
      : null;
  const calibT = cnn?.calibration_temperature;
  const labelColor = isReal ? "#1d4ed8" : "#dc2626";
  const labelBg = isReal ? "#eff6ff" : "#fef2f2";
  const hasZones = (cnn?.forgery_zones?.length ?? 0) > 0;

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 18,
        animation: "tabFadeIn 0.28s ease both",
      }}
    >
      {/* Header */}
      <div
        style={{
          background: "#fff",
          borderRadius: 14,
          border: "1px solid #e8eaed",
          boxShadow: "0 2px 8px rgba(0,0,0,0.05)",
          padding: "16px 20px",
          display: "flex",
          alignItems: "center",
          gap: 20,
          flexWrap: "wrap",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <div
            style={{
              width: 52,
              height: 52,
              borderRadius: 14,
              background: labelBg,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            {/* Brain / neural network icon */}
            <svg
              width="26"
              height="26"
              viewBox="0 0 24 24"
              fill="none"
              stroke={labelColor}
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M9.5 2a2.5 2.5 0 110 5H9a7 7 0 000 14h.5a2.5 2.5 0 100-5H9" />
              <path d="M14.5 22a2.5 2.5 0 110-5H15a7 7 0 000-14h-.5a2.5 2.5 0 100 5H15" />
            </svg>
          </div>
          <div>
            <p
              style={{
                margin: 0,
                fontSize: 15,
                fontWeight: 700,
                color: "#111827",
              }}
            >
              Inspection IA — ResNet-50
            </p>
            <p style={{ margin: "2px 0 0", fontSize: 12, color: "#9ca3af" }}>
              Grad-CAM · Integrated Gradients · LIME
              {isReal ? " · pas de carte de falsification (document réel)" : " · localisation"}
              {cnn?.cnn_explain_tier === "fast" ? " · mode rapide (serveur)" : null}
              {cnn?.cnn_explain_tier === "full" ? " · mode qualité max (serveur)" : null}
            </p>
          </div>
        </div>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            marginLeft: "auto",
            flexWrap: "wrap",
          }}
        >
          <span
            style={{
              fontSize: 13,
              fontWeight: 700,
              padding: "6px 16px",
              borderRadius: 999,
              background: labelBg,
              color: labelColor,
              border: `1px solid ${isReal ? "#bfdbfe" : "#fecaca"}`,
            }}
          >
            {isReal ? "✓ Réel" : "✕ Falsifié"}
          </span>
          <span
            style={{
              fontSize: 13,
              fontWeight: 700,
              padding: "6px 16px",
              borderRadius: 999,
              background: "#f5f6fa",
              color: "#374151",
              border: "1px solid #e5e7eb",
              fontFamily: "monospace",
            }}
          >
            {pctConf}% confiance
            {calibT != null && calibT > 0 && pctRaw != null ? (
              <span
                style={{
                  display: "block",
                  marginTop: 4,
                  fontSize: 10,
                  color: "#9ca3af",
                  fontWeight: 500,
                }}
              >
                Score brut P(faux) : {pctRaw}% · calibration T={calibT}
              </span>
            ) : null}
          </span>
          <span
            style={{
              fontSize: 13,
              fontWeight: 600,
              padding: "6px 14px",
              borderRadius: 999,
              background:
                cnn?.risk_level === "Low"
                  ? "#f0fdf4"
                  : cnn?.risk_level === "Medium"
                    ? "#fffbeb"
                    : "#fef2f2",
              color:
                cnn?.risk_level === "Low"
                  ? "#16a34a"
                  : cnn?.risk_level === "Medium"
                    ? "#d97706"
                    : "#dc2626",
              border: `1px solid ${cnn?.risk_level === "Low" ? "#bbf7d0" : cnn?.risk_level === "Medium" ? "#fde68a" : "#fecaca"}`,
            }}
          >
            Risque{" "}
            {cnn?.risk_level === "Low"
              ? "faible"
              : cnn?.risk_level === "Medium"
                ? "moyen"
                : "élevé"}
          </span>
        </div>
      </div>

      {/* Explanation */}
      {cnn?.explanation && (
        <div
          style={{
            background: "#fff",
            borderRadius: 14,
            border: "1px solid #e8eaed",
            padding: "12px 18px",
            boxShadow: "0 2px 8px rgba(0,0,0,0.05)",
            display: "flex",
            gap: 10,
            alignItems: "flex-start",
          }}
        >
          <div
            style={{
              width: 32,
              height: 32,
              borderRadius: 8,
              background: "#eff6ff",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
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
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
          </div>
          <div>
            <p
              style={{
                margin: "0 0 4px",
                fontSize: 11.5,
                fontWeight: 700,
                color: "#9ca3af",
                textTransform: "uppercase",
                letterSpacing: "0.06em",
              }}
            >
              Interprétation de l'IA
            </p>
            <p
              style={{
                margin: 0,
                fontSize: 13,
                color: "#374151",
                lineHeight: 1.7,
              }}
            >
              {cnn.explanation}
            </p>
          </div>
        </div>
      )}

      {/* Problem 7 fix: Only 3 visuals, no "Document original" */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
          gap: 16,
        }}
      >
        {cnn?.localization_base64 && !isReal && (
          <VisualSlide
            label="Carte de falsification"
            b64={cnn.localization_base64}
            note="Les zones encadrées en rouge indiquent les régions suspectes détectées par le réseau de neurones."
            accent="#dc2626"
            icon={
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              >
                <polygon points="3 11 22 2 13 21 11 13 3 11" />
              </svg>
            }
          />
        )}
        {cnn?.gradcam_base64 && (
          <VisualSlide
            label="Carte Grad-CAM"
            b64={cnn.gradcam_base64}
            note={
              isReal
                ? "Attention pour augmenter P(réel) : zones soutenant l'authenticité selon le réseau."
                : "Bleu → Vert → Jaune → Rouge = faible → forte attention du réseau neuronal (score faux)."
            }
            accent="#ea580c"
            icon={
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              >
                <circle cx="12" cy="12" r="3" />
                <path d="M12 1v4M12 19v4M4.22 4.22l2.83 2.83M16.95 16.95l2.83 2.83M1 12h4M19 12h4M4.22 19.78l2.83-2.83M16.95 7.05l2.83-2.83" />
              </svg>
            }
          />
        )}
        {cnn?.lime_base64 && (
          <VisualSlide
            label="Analyse LIME"
            b64={cnn.lime_base64}
            note="Superpixels masqués (couleur moyenne), même résolution 384 que le modèle. Rouge = « faux » ; bleu = authenticité."
            accent="#7c3aed"
            icon={
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              >
                <path d="M9 3H5a2 2 0 00-2 2v4m6-6h10a2 2 0 012 2v4M9 3v18m0 0h10a2 2 0 002-2V9M9 21H5a2 2 0 01-2-2V9m0 0h18" />
              </svg>
            }
          />
        )}
      </div>

      {/* Forgery zones */}
      {hasZones && (
        <div
          style={{
            background: "#fff",
            borderRadius: 14,
            border: "1px solid #fecaca",
            boxShadow: "0 2px 8px rgba(0,0,0,0.05)",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              padding: "12px 18px",
              background: "#fef2f2",
              borderBottom: "1px solid #fecaca",
              display: "flex",
              alignItems: "center",
              gap: 8,
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
              <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
              <line x1="12" y1="9" x2="12" y2="13" />
              <line x1="12" y1="17" x2="12.01" y2="17" />
            </svg>
            <p
              style={{
                margin: 0,
                fontSize: 13,
                fontWeight: 700,
                color: "#dc2626",
              }}
            >
              {cnn.forgery_zones.length} zone
              {cnn.forgery_zones.length > 1 ? "s" : ""} suspecte
              {cnn.forgery_zones.length > 1 ? "s" : ""} détectée
              {cnn.forgery_zones.length > 1 ? "s" : ""}
            </p>
          </div>
          <div
            style={{
              padding: "14px 18px",
              display: "flex",
              flexDirection: "column",
              gap: 10,
            }}
          >
            {cnn.forgery_zones.map((zone, i) => {
              const sevPct = Math.round(zone.severity * 100);
              const sevColor =
                zone.severity >= 0.75
                  ? "#dc2626"
                  : zone.severity >= 0.5
                    ? "#ea580c"
                    : "#d97706";
              return (
                <div
                  key={i}
                  style={{
                    padding: "12px 16px",
                    borderRadius: 10,
                    border: `1px solid ${sevColor}30`,
                    background: `${sevColor}05`,
                    display: "grid",
                    gridTemplateColumns: "36px 1fr auto",
                    gap: 12,
                    alignItems: "center",
                  }}
                >
                  <div
                    style={{
                      width: 34,
                      height: 34,
                      borderRadius: "50%",
                      background: sevColor,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: 12,
                      color: "#fff",
                      fontWeight: 800,
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
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                        marginTop: 5,
                      }}
                    >
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
                            width: `${sevPct}%`,
                            background: sevColor,
                            transition: "width 0.5s ease",
                          }}
                        />
                      </div>
                      <span
                        style={{
                          fontSize: 11,
                          color: "#9ca3af",
                          fontFamily: "monospace",
                        }}
                      >
                        {sevPct}%
                      </span>
                    </div>
                  </div>
                  <span
                    style={{
                      fontSize: 10.5,
                      fontWeight: 800,
                      color: sevColor,
                      border: `1.5px solid ${sevColor}`,
                      borderRadius: 6,
                      padding: "3px 9px",
                    }}
                  >
                    {zone.severity >= 0.75
                      ? "ÉLEVÉ"
                      : zone.severity >= 0.5
                        ? "MOYEN"
                        : "FAIBLE"}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// TAB 4 — Métadonnées & Forensics
// ─────────────────────────────────────────────────────────────────────────────
function TabMetadata({ result }: { result: AnalysisResult }) {
  const meta = result.metadata;
  if (!meta)
    return (
      <p style={{ color: "#9ca3af" }}>
        Aucune donnée de métadonnées disponible.
      </p>
    );

  const compositePct =
    meta.composite_risk_percent ?? Math.round((meta.score ?? 0) * 10000) / 100;
  const compositeFmt = new Intl.NumberFormat("fr-FR", {
    maximumFractionDigits: 1,
    minimumFractionDigits: 0,
  }).format(compositePct);

  const rs =
    meta.risk_level === "Low"
      ? { color: "#16a34a", bg: "#f0fdf4", border: "#bbf7d0" }
      : meta.risk_level === "Moderate"
        ? { color: "#d97706", bg: "#fffbeb", border: "#fde68a" }
        : meta.risk_level === "High"
          ? { color: "#dc2626", bg: "#fef2f2", border: "#fecaca" }
          : { color: "#9b1c1c", bg: "#fef2f2", border: "#f87171" };

  const fp = meta.forensic_params;
  const elaQ = fp?.ela_recompress_quality ?? 75;
  const elaAmp = fp?.ela_diff_multiplier ?? 15;
  const noiseAmp = fp?.noise_deviation_multiplier ?? 3;
  const help = meta.forensic_help_fr;

  const bars: {
    key: string;
    label: string;
    value: number;
    hint: string;
  }[] = [
    {
      key: "exif",
      label: "Anomalie EXIF",
      value: meta.exif_score ?? 0,
      hint:
        help?.exif ??
        "Indicateur basé sur les métadonnées EXIF (dates, logiciel, appareil…). Échelle 0–100.",
    },
    {
      key: "ela",
      label: "Niveau d'erreur ELA",
      value: meta.ela_score ?? 0,
      hint:
        help?.ela ??
        "Analyse du niveau d’erreur après ré-compression JPEG (méthode type Krawetz). 0–100.",
    },
    {
      key: "ghost",
      label: "Double compression",
      value: meta.double_compression_score ?? 0,
      hint:
        help?.ghost ??
        "Recherche d’incohérences de compression (JPEG uniquement). 0–100.",
    },
    {
      key: "noise",
      label: "Bruit anormal",
      value: meta.noise_score ?? 0,
      hint:
        help?.noise ??
        "Régularité du grain par blocs (collage possible si trop lisse ou trop haché). 0–100.",
    },
  ];

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 20,
        animation: "tabFadeIn 0.28s ease both",
      }}
    >
      {/* En-tête : verdict + score global (même source que le backend) */}
      <div
        style={{
          background: "linear-gradient(180deg, #fafbff 0%, #ffffff 100%)",
          borderRadius: 16,
          border: "1px solid #e8eaed",
          boxShadow: "0 4px 24px rgba(15,23,42,0.06)",
          padding: "20px 22px",
          display: "flex",
          flexDirection: "column",
          gap: 14,
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "space-between",
            flexWrap: "wrap",
            gap: 14,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <div
              style={{
                width: 44,
                height: 44,
                borderRadius: 12,
                background: "linear-gradient(145deg, #eff6ff, #dbeafe)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
              }}
            >
              <svg
                width="22"
                height="22"
                viewBox="0 0 24 24"
                fill="none"
                stroke="#1d4ed8"
                strokeWidth="2"
                strokeLinecap="round"
              >
                <ellipse cx="12" cy="5" rx="9" ry="3" />
                <path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3" />
                <path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5" />
              </svg>
            </div>
            <div>
              <p
                style={{
                  margin: 0,
                  fontSize: 16,
                  fontWeight: 800,
                  color: "#0f172a",
                  letterSpacing: "-0.02em",
                }}
              >
                Métadonnées & Forensics
              </p>
              <p style={{ margin: "4px 0 0", fontSize: 13, color: "#64748b" }}>
                Résultats produits côté serveur (aucun recalcul dans le
                navigateur)
              </p>
            </div>
          </div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              flexWrap: "wrap",
              gap: 10,
            }}
          >
            <span
              style={{
                fontSize: 13,
                fontWeight: 700,
                padding: "8px 16px",
                borderRadius: 999,
                background: rs.bg,
                color: rs.color,
                border: `1px solid ${rs.border}`,
              }}
            >
              Risque {metaRiskFr[meta.risk_level] ?? meta.risk_level}
            </span>
            <span
              style={{
                fontSize: 13,
                fontWeight: 700,
                padding: "8px 16px",
                borderRadius: 999,
                background: "#f8fafc",
                color: "#0f172a",
                border: "1px solid #e2e8f0",
                fontVariantNumeric: "tabular-nums",
              }}
            >
              Score de risque global : {compositeFmt} %
            </span>
          </div>
        </div>
        {help?.risk_rules ? (
          <p
            style={{
              margin: 0,
              fontSize: 12.5,
              color: "#64748b",
              lineHeight: 1.65,
              padding: "12px 14px",
              background: "#f8fafc",
              borderRadius: 10,
              border: "1px solid #f1f5f9",
            }}
          >
            {help.risk_rules}
          </p>
        ) : null}
      </div>

      {/* Detected software */}
      {meta.detected_software && (
        <div
          style={{
            background: "#fef2f2",
            borderRadius: 12,
            border: "1.5px solid #fecaca",
            padding: "12px 18px",
            display: "flex",
            alignItems: "center",
            gap: 10,
          }}
        >
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="#dc2626"
            strokeWidth="2"
            strokeLinecap="round"
          >
            <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
            <line x1="12" y1="9" x2="12" y2="13" />
            <line x1="12" y1="17" x2="12.01" y2="17" />
          </svg>
          <div>
            <p
              style={{
                margin: 0,
                fontSize: 12.5,
                fontWeight: 700,
                color: "#b91c1c",
              }}
            >
              Logiciel de retouche détecté
            </p>
            <p
              style={{
                margin: "2px 0 0",
                fontSize: 12,
                color: "#ef4444",
                fontFamily: "monospace",
              }}
            >
              {meta.detected_software}
            </p>
          </div>
        </div>
      )}

      <div
        style={{
          display: "grid",
          gridTemplateColumns:
            "repeat(auto-fit, minmax(min(100%, 320px), 1fr))",
          gap: 18,
        }}
      >
        {/* Score bars */}
        <div
          style={{
            background: "#fff",
            borderRadius: 14,
            border: "1px solid #e8eaed",
            boxShadow: "0 2px 8px rgba(0,0,0,0.05)",
            padding: "16px 18px",
          }}
        >
          <p
            style={{
              margin: "0 0 6px",
              fontSize: 11,
              fontWeight: 700,
              color: "#64748b",
              textTransform: "uppercase",
              letterSpacing: "0.08em",
            }}
          >
            Scores forensiques (plus élevé = plus suspect)
          </p>
          <p
            style={{
              margin: "0 0 14px",
              fontSize: 12,
              color: "#94a3b8",
              lineHeight: 1.5,
            }}
          >
            Chaque barre affiche la valeur renvoyée par l’API (0 à 100). Le «
            Score de risque global » est affiché en haut à droite.
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {bars.map(({ key, label, value, hint }) => {
              const v = Math.min(Math.round(value), 100);
              const barCol =
                v >= 60 ? "#ef4444" : v >= 35 ? "#f59e0b" : "#16a34a";
              return (
                <div key={key}>
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      fontSize: 12.5,
                      marginBottom: 5,
                    }}
                  >
                    <span style={{ color: "#334155", fontWeight: 600 }}>
                      {label}
                    </span>
                    <span
                      style={{
                        fontWeight: 700,
                        color: barCol,
                        fontFamily: "monospace",
                      }}
                    >
                      {v}
                    </span>
                  </div>
                  <ProgressBar value={v} color={barCol} />
                  <p
                    style={{
                      margin: "6px 0 0",
                      fontSize: 11.5,
                      color: "#64748b",
                      lineHeight: 1.55,
                    }}
                  >
                    {hint}
                  </p>
                </div>
              );
            })}
          </div>
          <div
            style={{
              marginTop: 14,
              paddingTop: 12,
              borderTop: "1px solid #f1f5f9",
              fontSize: 11,
              color: "#94a3b8",
              lineHeight: 1.5,
            }}
          >
            Lecture des couleurs : vert &lt; 35, orange 35–59, rouge 60 et plus
            (repère visuel seulement).
          </div>
        </div>

        {/* Summary & diagnostics */}
        <div
          style={{
            background: "#fff",
            borderRadius: 14,
            border: "1px solid #e8eaed",
            boxShadow: "0 2px 8px rgba(0,0,0,0.05)",
            padding: "16px 18px",
            display: "flex",
            flexDirection: "column",
            gap: 12,
          }}
        >
          <p
            style={{
              margin: 0,
              fontSize: 11,
              fontWeight: 700,
              color: "#9ca3af",
              textTransform: "uppercase",
              letterSpacing: "0.08em",
            }}
          >
            Résumé & détails techniques
          </p>
          <p style={{ margin: "0 0 8px", fontSize: 12, color: "#94a3b8" }}>
            Textes générés côté serveur, rédigés pour être lisibles sans être
            experts.
          </p>
          {meta.summary && (
            <div
              style={{
                padding: "12px 16px",
                borderRadius: 12,
                background: "linear-gradient(135deg, #fffbeb 0%, #fef3c7 100%)",
                border: "1px solid #fde68a",
              }}
            >
              <p
                style={{
                  margin: 0,
                  fontSize: 13.5,
                  color: "#334155",
                  lineHeight: 1.75,
                  fontWeight: 500,
                }}
              >
                {meta.summary}
              </p>
            </div>
          )}
          {(meta.diagnostic ?? []).map((d, i) => (
            <div
              key={i}
              style={{
                display: "flex",
                gap: 10,
                alignItems: "flex-start",
                padding: "10px 14px",
                borderRadius: 10,
                background: "#f8fafc",
                border: "1px solid #e2e8f0",
              }}
            >
              <span
                style={{
                  flexShrink: 0,
                  width: 22,
                  height: 22,
                  borderRadius: 6,
                  background: "#e0f2fe",
                  color: "#0369a1",
                  fontSize: 11,
                  fontWeight: 800,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  marginTop: 1,
                }}
              >
                {i + 1}
              </span>
              <p
                style={{
                  margin: 0,
                  fontSize: 12.5,
                  color: "#475569",
                  lineHeight: 1.6,
                }}
              >
                {d}
              </p>
            </div>
          ))}
          {!meta.summary && (meta.diagnostic ?? []).length === 0 && (
            <p style={{ fontSize: 13, color: "#9ca3af", margin: 0 }}>
              Aucune anomalie forensique signalée.
            </p>
          )}
        </div>
      </div>

      {/* Cartes thermiques — algorithmes alignés sur metadata_module.py */}
      {(meta.ela_base64 || meta.noise_base64) && (
        <div
          style={{
            background: "#fff",
            borderRadius: 16,
            border: "1px solid #e8eaed",
            boxShadow: "0 4px 20px rgba(15,23,42,0.06)",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              padding: "14px 20px",
              borderBottom: "1px solid #f1f5f9",
              background: "linear-gradient(180deg, #f8fafc 0%, #fff 100%)",
            }}
          >
            <p
              style={{
                margin: 0,
                fontSize: 12,
                fontWeight: 800,
                color: "#0f172a",
                letterSpacing: "-0.02em",
              }}
            >
              Cartes colorées (ELA & bruit)
            </p>
            <p
              style={{
                margin: "6px 0 0",
                fontSize: 12.5,
                color: "#64748b",
                lineHeight: 1.55,
              }}
            >
              Bleu = plutôt « normal » pour cette analyse, rouge = fort signal.
              Ce sont des aides visuelles : elles complètent les scores
              ci-dessus, sans remplacer un examen humain.
            </p>
          </div>
          <div
            style={{
              display: "grid",
              gridTemplateColumns:
                meta.ela_base64 && meta.noise_base64
                  ? "repeat(auto-fit, minmax(min(100%, 280px), 1fr))"
                  : "1fr",
            }}
          >
            {meta.ela_base64 && (
              <div
                style={{
                  borderRight: meta.noise_base64 ? "1px solid #f1f5f9" : "none",
                  display: "flex",
                  flexDirection: "column",
                }}
              >
                <div style={{ padding: "12px 16px 10px" }}>
                  <p
                    style={{
                      margin: 0,
                      fontSize: 13,
                      fontWeight: 800,
                      color: "#0f172a",
                    }}
                  >
                    ELA — Analyse du niveau d&apos;erreur
                  </p>
                  <p
                    style={{
                      margin: "4px 0 0",
                      fontSize: 11.5,
                      color: "#64748b",
                      lineHeight: 1.5,
                    }}
                  >
                    Paramètres utilisés sur le serveur : ré-compression JPEG
                    qualité {elaQ}, amplification des différences ×{elaAmp}{" "}
                    (mise en évidence des zones modifiées).
                  </p>
                </div>
                <div style={{ background: "#0f172a", flex: 1 }}>
                  <ZoomableImage
                    src={`data:image/jpeg;base64,${meta.ela_base64}`}
                    alt="Carte ELA"
                  />
                </div>
                {help?.heatmap_ela ? (
                  <p
                    style={{
                      margin: 0,
                      padding: "10px 16px 14px",
                      fontSize: 11.5,
                      color: "#64748b",
                      lineHeight: 1.55,
                      background: "#fafafa",
                      borderTop: "1px solid #f1f5f9",
                    }}
                  >
                    {help.heatmap_ela}
                  </p>
                ) : null}
              </div>
            )}
            {meta.noise_base64 && (
              <div style={{ display: "flex", flexDirection: "column" }}>
                <div style={{ padding: "12px 16px 10px" }}>
                  <p
                    style={{
                      margin: 0,
                      fontSize: 13,
                      fontWeight: 800,
                      color: "#0f172a",
                    }}
                  >
                    Carte de bruit — Écart local
                  </p>
                  <p
                    style={{
                      margin: "4px 0 0",
                      fontSize: 11.5,
                      color: "#64748b",
                      lineHeight: 1.5,
                    }}
                  >
                    Chaque bloc mesure le grain ; on colore l&apos;écart par
                    rapport à la moyenne (×{noiseAmp} pour mieux voir les
                    différences).
                  </p>
                </div>
                <div style={{ background: "#0f172a", flex: 1 }}>
                  <ZoomableImage
                    src={`data:image/jpeg;base64,${meta.noise_base64}`}
                    alt="Carte de bruit"
                  />
                </div>
                {help?.heatmap_noise ? (
                  <p
                    style={{
                      margin: 0,
                      padding: "10px 16px 14px",
                      fontSize: 11.5,
                      color: "#64748b",
                      lineHeight: 1.55,
                      background: "#fafafa",
                      borderTop: "1px solid #f1f5f9",
                    }}
                  >
                    {help.heatmap_noise}
                  </p>
                ) : null}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN COMPONENT
// ─────────────────────────────────────────────────────────────────────────────
export default function AnalysisTabs({ result, documentImageSrc }: Props) {
  const [activeTab, setActiveTab] = useState<TabId>("apercu");

  const TABS: { id: TabId; label: string; icon: React.ReactNode }[] = [
    {
      id: "apercu",
      label: "Aperçu",
      icon: (
        <svg
          width="15"
          height="15"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
        >
          <rect x="3" y="3" width="7" height="7" rx="1" />
          <rect x="14" y="3" width="7" height="7" rx="1" />
          <rect x="3" y="14" width="7" height="7" rx="1" />
          <rect x="14" y="14" width="7" height="7" rx="1" />
        </svg>
      ),
    },
    {
      id: "structurel",
      label: "Analyse Structurelle",
      icon: (
        <svg
          width="15"
          height="15"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
        >
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
        </svg>
      ),
    },
    {
      id: "visuel",
      label: "Inspection Visuelle (IA)",
      icon: (
        <svg
          width="15"
          height="15"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
        >
          <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
          <circle cx="12" cy="12" r="3" />
        </svg>
      ),
    },
    {
      id: "metadata",
      label: "Métadonnées & Forensics",
      icon: (
        <svg
          width="15"
          height="15"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
        >
          <ellipse cx="12" cy="5" rx="9" ry="3" />
          <path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3" />
          <path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5" />
        </svg>
      ),
    },
  ];

  return (
    <>
      <style>{`
        @keyframes tabFadeIn {
          from { opacity: 0; transform: translateY(8px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes shimmerBar {
          0%   { transform: translateX(-100%); }
          100% { transform: translateX(200%); }
        }
      `}</style>

      <div
        style={{
          background: "#fff",
          borderRadius: 16,
          border: "1px solid #e8eaed",
          boxShadow: "0 2px 16px rgba(0,0,0,0.06)",
          overflow: "hidden",
          marginTop: 4,
        }}
      >
        {/* Tab bar */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 4,
            padding: "10px 16px 0",
            borderBottom: "1.5px solid #f0f2f5",
            background: "linear-gradient(180deg, #fafbff 0%, #ffffff 100%)",
            overflowX: "auto",
            scrollbarWidth: "none",
          }}
        >
          {TABS.map((tab) => (
            <TabBtn
              key={tab.id}
              active={activeTab === tab.id}
              label={tab.label}
              icon={tab.icon}
              onClick={() => setActiveTab(tab.id)}
            />
          ))}
        </div>

        {/* Tab content */}
        <div style={{ padding: "22px 20px 24px" }}>
          {activeTab === "apercu" && (
            <TabApercu result={result} documentImageSrc={documentImageSrc} />
          )}
          {activeTab === "structurel" && <TabStructurel result={result} />}
          {activeTab === "visuel" && <TabVisuel result={result} />}
          {activeTab === "metadata" && <TabMetadata result={result} />}
        </div>
      </div>
    </>
  );
}