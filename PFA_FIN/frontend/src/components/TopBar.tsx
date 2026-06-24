import { useRef, useState } from "react";
import type { AnalysisResult } from "../api";

interface ScanRecord {
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
  onFileSelect: (file: File) => void;
  loading: boolean;
  onCameraOpen: () => void;
  history?: ScanRecord[];
  onSearchSelect?: (record: ScanRecord) => void;
  activeTab: "dashboard" | "documents";
  onTabChange: (tab: "dashboard" | "documents") => void;
  onLogoClick?: () => void;
}

const verdictColor = (v: string) =>
  v === "Authentic" ? "#16a34a" : v === "Suspicious" ? "#d97706" : "#dc2626";
const dotBg = (v: string) =>
  v === "Authentic" ? "#22C55E" : v === "Suspicious" ? "#3B82F6" : "#EF4444";
const dotGlow = (v: string) =>
  v === "Authentic"
    ? "0 0 0 3px rgba(34,197,94,0.2)"
    : v === "Suspicious"
      ? "0 0 0 3px rgba(59,130,246,0.2)"
      : "0 0 0 3px rgba(239,68,68,0.2)";

export default function TopBar({
  onFileSelect,
  loading,
  onCameraOpen,
  history = [],
  onSearchSelect,
  activeTab,
  onTabChange,
  onLogoClick,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [focused, setFocused] = useState(false);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) onFileSelect(f);
    e.target.value = "";
  };

  const now = new Date();
  const dateStr = now.toLocaleDateString("fr-FR", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  });

  const filtered =
    query.trim().length > 0
      ? history.filter((r) =>
          r.filename.toLowerCase().includes(query.toLowerCase()),
        )
      : [];

  const NAV_TABS = [
    {
      id: "dashboard",
      label: "Tableau de bord",
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
          <rect x="3" y="3" width="7" height="7" rx="1.5" />
          <rect x="14" y="3" width="7" height="7" rx="1.5" />
          <rect x="3" y="14" width="7" height="7" rx="1.5" />
          <rect x="14" y="14" width="7" height="7" rx="1.5" />
        </svg>
      ),
    },
    {
      id: "documents",
      label: "Documents",
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
          <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
          <polyline points="14,2 14,8 20,8" strokeLinejoin="round" />
          <line x1="8" y1="13" x2="16" y2="13" />
          <line x1="8" y1="17" x2="16" y2="17" />
        </svg>
      ),
    },
  ];

  return (
    <>
      <link
        href="https://fonts.googleapis.com/css2?family=Rajdhani:wght@700&display=swap"
        rel="stylesheet"
      />
      <header
        style={{
          height: 60,
          flexShrink: 0,
          display: "flex",
          alignItems: "center",
          padding: "0 24px",
          gap: 0,
          background: "#0e0e0f",
          borderBottom: "1px solid rgba(255,255,255,0.06)",
          position: "sticky",
          top: 0,
          zIndex: 100,
        }}
      >
        {/* ── LEFT: Logo ── */}
        <div
          onClick={onLogoClick}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 9,
            cursor: onLogoClick ? "pointer" : "default",
            flexShrink: 0,
            minWidth: 160,
          }}
        >
          <div
            style={{
              width: 32,
              height: 32,
              borderRadius: 8,
              background: "rgba(59,130,246,0.15)",
              border: "1px solid rgba(59,130,246,0.3)",
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
              stroke="#3b82f6"
              strokeWidth="2"
              strokeLinecap="round"
            >
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
            </svg>
          </div>
          <div>
            <p
              style={{
                fontFamily: "'Rajdhani', sans-serif",
                fontWeight: 700,
                fontSize: 16,
                letterSpacing: "0.18em",
                textTransform: "uppercase",
                color: "#ffffff",
                margin: 0,
                lineHeight: 1.1,
              }}
            >
              Verify AI
            </p>
            <p
              style={{
                fontSize: 9,
                color: "#4b5563",
                margin: 0,
                letterSpacing: "0.04em",
              }}
            >
              Doc Forensics
            </p>
          </div>
        </div>

        {/* ── CENTER: Nav tabs ── */}
        <div
          style={{
            flex: 1,
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            gap: 4,
          }}
        >
          {NAV_TABS.map((tab) => {
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => onTabChange(tab.id as "dashboard" | "documents")}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 7,
                  padding: "7px 16px",
                  borderRadius: 8,
                  border: active
                    ? "1px solid rgba(59,130,246,0.4)"
                    : "1px solid transparent",
                  background: active ? "rgba(59,130,246,0.15)" : "transparent",
                  color: active ? "#60a5fa" : "#6b7280",
                  cursor: "pointer",
                  fontSize: 13,
                  fontWeight: active ? 600 : 400,
                  transition: "all 0.15s ease",
                  fontFamily: "inherit",
                }}
                onMouseEnter={(e) => {
                  if (!active)
                    (e.currentTarget as HTMLElement).style.background =
                      "rgba(255,255,255,0.05)";
                }}
                onMouseLeave={(e) => {
                  if (!active)
                    (e.currentTarget as HTMLElement).style.background =
                      "transparent";
                }}
              >
                <span style={{ display: "flex" }}>{tab.icon}</span>
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* ── RIGHT: search + actions ── */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            flexShrink: 0,
          }}
        >
          {/* Date */}
          <span
            style={{
              fontSize: 11.5,
              color: "#4b5563",
              letterSpacing: "0.02em",
              marginRight: 4,
            }}
          >
            {dateStr}
          </span>

          {/* Search */}
          <div style={{ position: "relative" }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                padding: "7px 13px",
                borderRadius: 8,
                background: "rgba(255,255,255,0.05)",
                border: `1px solid ${focused ? "rgba(59,130,246,0.5)" : "rgba(255,255,255,0.08)"}`,
                minWidth: 210,
                transition: "border-color 0.15s",
              }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                <circle
                  cx="11"
                  cy="11"
                  r="8"
                  stroke="#6b7280"
                  strokeWidth="2"
                />
                <path
                  d="M21 21l-4.35-4.35"
                  stroke="#6b7280"
                  strokeWidth="2"
                  strokeLinecap="round"
                />
              </svg>
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onFocus={() => setFocused(true)}
                onBlur={() => setTimeout(() => setFocused(false), 150)}
                placeholder="Rechercher un scan…"
                style={{
                  background: "transparent",
                  border: "none",
                  outline: "none",
                  fontSize: 12.5,
                  color: "#e5e7eb",
                  width: "100%",
                  fontFamily: "inherit",
                }}
              />
              {query && (
                <button
                  onClick={() => setQuery("")}
                  style={{
                    background: "none",
                    border: "none",
                    cursor: "pointer",
                    padding: 0,
                    color: "#6b7280",
                    lineHeight: 1,
                  }}
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
                    <path
                      d="M18 6L6 18M6 6l12 12"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                    />
                  </svg>
                </button>
              )}
            </div>

            {/* Search dropdown */}
            {focused && filtered.length > 0 && (
              <div
                style={{
                  position: "absolute",
                  top: "calc(100% + 6px)",
                  left: 0,
                  right: 0,
                  background: "#1a1a2e",
                  borderRadius: 10,
                  boxShadow: "0 8px 32px rgba(0,0,0,0.4)",
                  border: "1px solid rgba(255,255,255,0.08)",
                  zIndex: 999,
                  overflow: "hidden",
                }}
              >
                {filtered.map((record) => (
                  <div
                    key={record.id}
                    onMouseDown={() => {
                      if (onSearchSelect) onSearchSelect(record);
                      setQuery("");
                      setFocused(false);
                    }}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                      padding: "9px 14px",
                      cursor: "pointer",
                      borderBottom: "1px solid rgba(255,255,255,0.05)",
                      transition: "background 0.1s",
                    }}
                    onMouseEnter={(e) =>
                      ((e.currentTarget as HTMLElement).style.background =
                        "rgba(255,255,255,0.05)")
                    }
                    onMouseLeave={(e) =>
                      ((e.currentTarget as HTMLElement).style.background =
                        "transparent")
                    }
                  >
                    <span
                      style={{
                        width: 8,
                        height: 8,
                        borderRadius: "50%",
                        background: dotBg(record.verdict),
                        boxShadow: dotGlow(record.verdict),
                        flexShrink: 0,
                        display: "inline-block",
                      }}
                    />
                    <span
                      style={{
                        flex: 1,
                        fontSize: 12.5,
                        color: "#e5e7eb",
                        fontFamily: "monospace",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {record.filename}
                    </span>
                    <span
                      style={{
                        fontSize: 11,
                        fontWeight: 700,
                        color: verdictColor(record.verdict),
                      }}
                    >
                      {record.score}
                    </span>
                  </div>
                ))}
              </div>
            )}
            {focused && query.trim().length > 0 && filtered.length === 0 && (
              <div
                style={{
                  position: "absolute",
                  top: "calc(100% + 6px)",
                  left: 0,
                  right: 0,
                  background: "#1a1a2e",
                  borderRadius: 10,
                  border: "1px solid rgba(255,255,255,0.08)",
                  zIndex: 999,
                  padding: "12px 14px",
                }}
              >
                <p
                  style={{
                    fontSize: 12,
                    color: "#6b7280",
                    margin: 0,
                    textAlign: "center",
                  }}
                >
                  Aucun scan ne correspond à « {query} »
                </p>
              </div>
            )}
          </div>

          {/* Divider */}
          <div
            style={{
              width: 1,
              height: 28,
              background: "rgba(255,255,255,0.08)",
              flexShrink: 0,
            }}
          />

          {/* Bell */}
          <button
            style={{
              width: 36,
              height: 36,
              borderRadius: 8,
              border: "1px solid rgba(255,255,255,0.08)",
              background: "rgba(255,255,255,0.04)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: "pointer",
              position: "relative",
            }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
              <path
                d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 01-3.46 0"
                stroke="#6b7280"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            <span
              style={{
                position: "absolute",
                top: 7,
                right: 7,
                width: 7,
                height: 7,
                borderRadius: "50%",
                background: "#ef4444",
                border: "2px solid #0e0e0f",
              }}
            />
          </button>

          {/* Camera */}
          <button
            onClick={onCameraOpen}
            disabled={loading}
            style={{
              width: 36,
              height: 36,
              borderRadius: 8,
              border: "1px solid rgba(255,255,255,0.08)",
              background: "rgba(255,255,255,0.04)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: "pointer",
            }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
              <path
                d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z"
                stroke="#6b7280"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <circle cx="12" cy="13" r="4" stroke="#6b7280" strokeWidth="2" />
            </svg>
          </button>

          {/* Upload */}
          <button
            onClick={() => inputRef.current?.click()}
            disabled={loading}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 7,
              padding: "8px 18px",
              borderRadius: 8,
              background: "#2563eb",
              color: "#fff",
              fontSize: 13,
              fontWeight: 600,
              border: "none",
              cursor: "pointer",
              boxShadow: "0 2px 10px rgba(37,99,235,0.35)",
              fontFamily: "inherit",
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
              <path
                d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1M16 8l-4-4m0 0L8 8m4-4v12"
                stroke="white"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            Importer
          </button>

          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            style={{ display: "none" }}
            onChange={handleChange}
          />
        </div>
      </header>
    </>
  );
}
