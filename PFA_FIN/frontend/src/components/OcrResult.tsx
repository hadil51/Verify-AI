/* eslint-disable react-refresh/only-export-components -- legacy named exports (stubs, fontLabels) consumed outside this module */
import { useState } from "react";

interface MrzOcr {
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
interface OcrFields {
  score: number;
  checks: Record<string, boolean>;
  details: Record<string, string>;
  error: string | null;
  mode?: "mrz" | "visual";
  note?: string;
}
interface FontResult {
  score: number;
  checks: Record<string, boolean>;
  details: Record<string, string>;
  error: string | null;
}
interface Props {
  ocr: MrzOcr;
  ocr_fields: OcrFields;
  font: FontResult;
  structural_score: number;
  mrz_found?: boolean;
}

function decodeDate(raw: string, isBirth = false): string | null {
  if (!raw || raw.length < 6) return null;
  const yy = parseInt(raw.slice(0, 2), 10);
  const mm = parseInt(raw.slice(2, 4), 10);
  const dd = parseInt(raw.slice(4, 6), 10);
  if (isNaN(yy) || isNaN(mm) || isNaN(dd) || mm < 1 || mm > 12) return null;
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
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ];
  return `${dd} ${months[mm - 1]} ${fullYear}`;
}

function sc(s: number) {
  if (s >= 0.75) return { text: "#15803d", bg: "#f0fdf4", border: "#bbf7d0" };
  if (s >= 0.5) return { text: "#b45309", bg: "#fffbeb", border: "#fde68a" };
  return { text: "#b91c1c", bg: "#fef2f2", border: "#fecaca" };
}

function MiniCard({
  label,
  score,
  icon,
}: {
  label: string;
  score: number;
  icon: React.ReactNode;
}) {
  const c = sc(score);
  const pct = Math.round(score * 100);
  return (
    <div
      style={{
        background: "#f9fafb",
        border: "1px solid #e5e7eb",
        borderRadius: 10,
        padding: "12px 14px",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 8,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ color: "#6b7280", display: "flex" }}>{icon}</span>
          <span style={{ fontSize: 11.5, fontWeight: 600, color: "#6b7280" }}>
            {label}
          </span>
        </div>
        <span style={{ fontSize: 13, fontWeight: 700, color: c.text }}>
          {pct}%
        </span>
      </div>
      <div style={{ height: 4, background: "#e5e7eb", borderRadius: 99 }}>
        <div
          style={{
            height: 4,
            borderRadius: 99,
            width: `${pct}%`,
            background: c.text,
            transition: "width 0.6s ease",
          }}
        />
      </div>
    </div>
  );
}

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
        padding: "8px 0",
        borderBottom: "1px solid #f9fafb",
      }}
    >
      <span
        style={{
          flexShrink: 0,
          marginTop: 1,
          width: 18,
          height: 18,
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
            fontSize: 12.5,
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

function FieldRow({
  label,
  value,
  blue = false,
}: {
  label: string;
  value: string;
  blue?: boolean;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "baseline",
        justifyContent: "space-between",
        padding: "7px 0",
        borderBottom: "1px solid #f9fafb",
      }}
    >
      <span
        style={{
          fontSize: 11.5,
          color: "#9ca3af",
          fontWeight: 500,
          flexShrink: 0,
          marginRight: 12,
        }}
      >
        {label}
      </span>
      <span
        style={{
          fontSize: 13,
          fontWeight: 600,
          color: blue ? "#1d4ed8" : "#111827",
          fontFamily: "monospace",
          textAlign: "right",
          wordBreak: "break-all",
        }}
      >
        {value}
      </span>
    </div>
  );
}

function ColHeader({ title, icon }: { title: string; icon: React.ReactNode }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 6,
        marginBottom: 10,
      }}
    >
      <span style={{ color: "#9ca3af", display: "flex" }}>{icon}</span>
      <p
        style={{
          margin: 0,
          fontSize: 10.5,
          fontWeight: 700,
          color: "#9ca3af",
          textTransform: "uppercase",
          letterSpacing: "0.08em",
        }}
      >
        {title}
      </p>
    </div>
  );
}

const IC = {
  mrz: (
    <svg
      width="13"
      height="13"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
    >
      <path d="M3 7V5a2 2 0 012-2h2M17 3h2a2 2 0 012 2v2M21 17v2a2 2 0 01-2 2h-2M7 21H5a2 2 0 01-2-2v-2" />
      <line x1="3" y1="12" x2="21" y2="12" />
    </svg>
  ),
  fields: (
    <svg
      width="13"
      height="13"
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
  ),
  font: (
    <svg
      width="13"
      height="13"
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
  ),
  user: (
    <svg
      width="13"
      height="13"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
    >
      <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  ),
  doc: (
    <svg
      width="13"
      height="13"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
    >
      <rect x="2" y="3" width="20" height="14" rx="2" />
      <line x1="8" y1="21" x2="16" y2="21" />
      <line x1="12" y1="17" x2="12" y2="21" />
    </svg>
  ),
  shield: (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="#2563eb"
      strokeWidth="2"
      strokeLinecap="round"
    >
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    </svg>
  ),
  chevron: (expanded: boolean) => (
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="#6b7280"
      strokeWidth="2.5"
      strokeLinecap="round"
      style={{
        transform: expanded ? "rotate(90deg)" : "none",
        transition: "transform 0.2s",
      }}
    >
      <polyline points="9 18 15 12 9 6" />
    </svg>
  ),
};

const mrzCheckLabels: Record<string, string> = {
  valid_number: "Document number checksum",
  valid_date_of_birth: "Date of birth checksum",
  valid_expiration_date: "Expiry date checksum",
  valid_composite: "Composite checksum",
  valid_personal_number: "Personal number checksum",
};
const fieldCheckLabels: Record<string, string> = {
  // Checks MRZ classiques
  mrz_detected: "Code MRZ détecté",
  valid_country: "Code pays valide (selon liste ISO 3166-1 alpha-3)",
  valid_nationality: "Code nationalité valide",
  valid_dob: "Date de naissance cohérente",
  valid_expiry: "Date d'expiration cohérente",
  valid_sex: "Champ sexe valide",
  valid_doc_number: "Numéro document valide",
  valid_surname: "Nom valide",
  valid_names: "Prénom valide",

  // Nouveaux checks de cohérence MRZ (les plus importants)
  surname_match: "Nom cohérent avec la MRZ",
  names_match: "Prénom cohérent avec la MRZ",
  nationality_match: "Nationalité cohérente avec la MRZ",
  country_match: "Pays cohérent avec la MRZ",
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

  // Mode visuel (sans MRZ)
  name_found: "Nom extrait",
  prenom_found: "Prénom extrait",
  doc_number_found: "Numéro document extrait",
};
const fontCheckLabels: Record<string, string> = {
  enough_components: "Sufficient text regions",
  uniform_height: "Uniform character height",
  uniform_width: "Uniform character width",
  horizontal_alignment: "Horizontal alignment",
  regular_spacing: "Regular spacing",
  uniform_density: "Uniform ink density",
};

export function StructuralCheckPanel({
  ocr,
  ocr_fields,
  font,
  structural_score,
  mrz_found,
}: Props) {
  const [mrzExpanded, setMrzExpanded] = useState(false);
  const hasMrz = mrz_found ?? ocr.mrz_found ?? true;
  const f = ocr.fields ?? {};

  const mrzLines: string[] = [];
  Object.entries(f)
    .filter(([k, v]) => k.startsWith("line") && v)
    .forEach(([, v]) => mrzLines.push(v));
  if (!mrzLines.length)
    Object.values(f)
      .filter((v) => v && v.length > 20)
      .slice(0, 2)
      .forEach((v) => mrzLines.push(v));

  const overallC = sc(structural_score);
  const mrzEntries = Object.entries(ocr.checks);
  const fieldEntries = Object.entries(ocr_fields.checks);
  const fontEntries = Object.entries(font.checks);

  const hasIdentity = !!(
    f.surname ||
    f.names ||
    f.nationality ||
    f.sex ||
    f.personal_number ||
    f.check_number ||
    f.date_of_birth ||
    f.expiration_date
  );
  const hasDoc = !!(f.type || f.country || f.number);

  return (
    <div
      style={{
        background: "#fff",
        borderRadius: 16,
        border: "1px solid #e5e7eb",
        overflow: "hidden",
      }}
    >
      {/* ── Header ── */}
      <div
        style={{
          padding: "18px 22px",
          borderBottom: "1px solid #f3f4f6",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div
            style={{
              width: 36,
              height: 36,
              borderRadius: 10,
              background: "#eff6ff",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            {IC.shield}
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
              Structural Check
            </h2>
            <p style={{ margin: 0, fontSize: 11.5, color: "#9ca3af" }}>
              Document structure · Identity · Validation
            </p>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {hasMrz ? (
            <span
              style={{
                fontSize: 11.5,
                fontWeight: 600,
                padding: "4px 12px",
                borderRadius: 999,
                background: "#eff6ff",
                color: "#1d4ed8",
                border: "1px solid #bfdbfe",
                display: "flex",
                alignItems: "center",
                gap: 5,
              }}
            >
              <svg
                width="10"
                height="10"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="3"
                strokeLinecap="round"
              >
                <polyline points="20 6 9 17 4 12" />
              </svg>
              MRZ · {ocr.mrz_type || "TD3"}
            </span>
          ) : (
            <span
              style={{
                fontSize: 11.5,
                fontWeight: 600,
                padding: "4px 12px",
                borderRadius: 999,
                background: "#fffbeb",
                color: "#b45309",
                border: "1px solid #fde68a",
              }}
            >
              Visual OCR
            </span>
          )}
          <span
            style={{
              fontSize: 14,
              fontWeight: 700,
              padding: "5px 14px",
              borderRadius: 999,
              background: overallC.bg,
              color: overallC.text,
              border: `1px solid ${overallC.border}`,
            }}
          >
            Score: {Math.round(structural_score * 100)}%
          </span>
        </div>
      </div>

      {/* ── 3 score bars ── */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr 1fr",
          gap: 12,
          padding: "16px 22px",
          borderBottom: "1px solid #f3f4f6",
          background: "#fafafa",
        }}
      >
        <MiniCard
          label={hasMrz ? "MRZ Code" : "Visual OCR"}
          score={ocr.score}
          icon={IC.mrz}
        />
        <MiniCard
          label="Field Checks"
          score={ocr_fields.score}
          icon={IC.fields}
        />
        <MiniCard label="Font & Layout" score={font.score} icon={IC.font} />
      </div>

      {/* ── 2-column body ── */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr" }}>
        {/* LEFT: Extracted data */}
        <div style={{ padding: "18px 20px", borderRight: "1px solid #f3f4f6" }}>
          {hasIdentity && (
            <div style={{ marginBottom: 20 }}>
              <ColHeader title="Extracted Identity" icon={IC.user} />
              {f.surname && <FieldRow label="Surname" value={f.surname} blue />}
              {f.names && <FieldRow label="Given names" value={f.names} blue />}
              {f.nationality && (
                <FieldRow label="Nationality" value={f.nationality} />
              )}
              {f.sex && (
                <FieldRow
                  label="Sex"
                  value={
                    f.sex === "F"
                      ? "Female (F)"
                      : f.sex === "M"
                        ? "Male (M)"
                        : f.sex
                  }
                />
              )}
              {f.personal_number && (
                <FieldRow label="Personal No." value={f.personal_number} />
              )}
              {f.check_number && (
                <FieldRow label="Check No." value={f.check_number} />
              )}
              {f.date_of_birth && (
                <FieldRow
                  label="Date of birth"
                  value={(() => {
                    const h = decodeDate(f.date_of_birth, true);
                    return h ? `${f.date_of_birth} → ${h}` : f.date_of_birth;
                  })()}
                />
              )}
              {f.expiration_date && (
                <FieldRow
                  label="Expiry date"
                  value={(() => {
                    const h = decodeDate(f.expiration_date, false);
                    return h
                      ? `${f.expiration_date} → ${h}`
                      : f.expiration_date;
                  })()}
                />
              )}
            </div>
          )}

          {hasDoc && (
            <div style={{ marginBottom: 20 }}>
              <ColHeader title="Document Info" icon={IC.doc} />
              {f.type && <FieldRow label="Type" value={f.type} />}
              {f.country && <FieldRow label="Country" value={f.country} />}
              {f.number && <FieldRow label="Number" value={f.number} />}
            </div>
          )}

          {hasMrz && mrzLines.length > 0 && (
            <div>
              <button
                onClick={() => setMrzExpanded((p) => !p)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  padding: 0,
                  marginBottom: mrzExpanded ? 8 : 0,
                }}
              >
                {IC.chevron(mrzExpanded)}
                <span
                  style={{
                    fontSize: 10.5,
                    fontWeight: 700,
                    color: "#9ca3af",
                    textTransform: "uppercase",
                    letterSpacing: "0.08em",
                  }}
                >
                  Raw MRZ Code
                </span>
              </button>
              {mrzExpanded && (
                <div
                  style={{
                    borderRadius: 8,
                    padding: "10px 12px",
                    background: "#f9fafb",
                    border: "1px solid #e5e7eb",
                    fontFamily: "monospace",
                    fontSize: 10.5,
                    color: "#16a34a",
                    lineHeight: 2,
                    wordBreak: "break-all",
                  }}
                >
                  {mrzLines.map((l, i) => (
                    <div key={i}>{l}</div>
                  ))}
                </div>
              )}
            </div>
          )}

          {!hasIdentity && !hasDoc && (
            <p style={{ fontSize: 13, color: "#9ca3af", margin: 0 }}>
              No identity data extracted.
            </p>
          )}
        </div>

        {/* RIGHT: All checks */}
        <div
          style={{
            padding: "18px 20px",
            display: "flex",
            flexDirection: "column",
            gap: 20,
          }}
        >
          {hasMrz && mrzEntries.length > 0 && (
            <div>
              <ColHeader title="MRZ Checksums" icon={IC.mrz} />
              {mrzEntries.map(([k, ok]) => (
                <CheckRow
                  key={k}
                  label={mrzCheckLabels[k] ?? k.replace(/_/g, " ")}
                  ok={ok}
                />
              ))}
            </div>
          )}

          {fieldEntries.length > 0 && (
            <div>
              <ColHeader title="Vérification des champs" icon={IC.fields} />
              {fieldEntries.map(([k, ok]) => (
                <CheckRow
                  key={k}
                  label={fieldCheckLabels[k] ?? k.replace(/_/g, " ")}
                  ok={ok}
                  detail={ocr_fields.details?.[k]}
                />
              ))}
            </div>
          )}

          {fontEntries.length > 0 && (
            <div>
              <ColHeader title="Font & Alignment" icon={IC.font} />
              {font.error ? (
                <p style={{ fontSize: 12, color: "#d97706", margin: 0 }}>
                  {font.error}
                </p>
              ) : (
                fontEntries.map(([k, ok]) => (
                  <CheckRow
                    key={k}
                    label={fontCheckLabels[k] ?? k.replace(/_/g, " ")}
                    ok={ok}
                    detail={font.details?.[k]}
                  />
                ))
              )}
            </div>
          )}

          {ocr_fields.error && ocr_fields.score === 0 && (
            <p style={{ fontSize: 12, color: "#dc2626", margin: 0 }}>
              {ocr_fields.error}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

// Stub exports for backward compat (App.tsx imports these)
export function OcrFieldCoherencePanel(
  props: Pick<Props, "ocr" | "ocr_fields" | "mrz_found">,
) {
  void props;
  return null;
}
export function FontAlignmentPanel(props: Pick<Props, "font">) {
  void props;
  return null;
}
export function CheckCard({
  label,
  ok,
  detail,
}: {
  label: string;
  ok: boolean;
  detail?: string;
}) {
  return <CheckRow label={label} ok={ok} detail={detail} />;
}
export function SectionCard({
  icon,
  title,
  score,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  score?: number;
  children: React.ReactNode;
}) {
  const c = score !== undefined ? sc(score) : null;
  return (
    <div
      style={{
        background: "#fff",
        borderRadius: 14,
        padding: "18px 20px",
        border: "1px solid #e5e7eb",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 14,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ color: "#6b7280", display: "flex" }}>{icon}</span>
          <h3
            style={{
              margin: 0,
              fontSize: 13,
              fontWeight: 700,
              color: "#111827",
            }}
          >
            {title}
          </h3>
        </div>
        {c && (
          <span
            style={{
              fontSize: 12,
              fontWeight: 600,
              padding: "3px 10px",
              borderRadius: 999,
              background: c.bg,
              color: c.text,
              border: `1px solid ${c.border}`,
            }}
          >
            {Math.round((score ?? 0) * 100)}%
          </span>
        )}
      </div>
      {children}
    </div>
  );
}
export const fontLabels: Record<string, string> = {
  enough_components: "Sufficient text regions",
  uniform_height: "Uniform character height",
  uniform_width: "Uniform character width",
  horizontal_alignment: "Horizontal alignment",
  regular_spacing: "Regular spacing",
  uniform_density: "Uniform ink density",
};

export default function OcrResult({
  ocr,
  ocr_fields,
  font,
  structural_score,
  mrz_found,
}: Props) {
  return (
    <StructuralCheckPanel
      ocr={ocr}
      ocr_fields={ocr_fields}
      font={font}
      structural_score={structural_score}
      mrz_found={mrz_found}
    />
  );
}
