interface Props {
  activeTab: string;
  onTabChange: (tab: "dashboard" | "documents") => void;
  uploadedImages?: { name: string; src: string; time: string }[];
  onLogoClick?: () => void;
}

const NAV_MAIN = [
  {
    id: "dashboard",
    label: "Tableau de bord",
    icon: (
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
        <rect
          x="3"
          y="3"
          width="7"
          height="7"
          rx="1.5"
          stroke="currentColor"
          strokeWidth="2"
        />
        <rect
          x="14"
          y="3"
          width="7"
          height="7"
          rx="1.5"
          stroke="currentColor"
          strokeWidth="2"
        />
        <rect
          x="3"
          y="14"
          width="7"
          height="7"
          rx="1.5"
          stroke="currentColor"
          strokeWidth="2"
        />
        <rect
          x="14"
          y="14"
          width="7"
          height="7"
          rx="1.5"
          stroke="currentColor"
          strokeWidth="2"
        />
      </svg>
    ),
  },
  {
    id: "documents",
    label: "Documents",
    icon: (
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
        <path
          d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
        />
        <polyline
          points="14,2 14,8 20,8"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <line
          x1="8"
          y1="13"
          x2="16"
          y2="13"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
        />
        <line
          x1="8"
          y1="17"
          x2="16"
          y2="17"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
        />
      </svg>
    ),
  },
];

// Sidebar width reduced to 160px (was 200px) — gives 40px more content space
const SIDEBAR_WIDTH = 160;

export default function Sidebar({
  activeTab,
  onTabChange,
  uploadedImages = [],
  onLogoClick,
}: Props) {
  return (
    <>
      <link
        href="https://fonts.googleapis.com/css2?family=Rajdhani:wght@700&display=swap"
        rel="stylesheet"
      />
      <aside
        style={{
          width: SIDEBAR_WIDTH,
          flexShrink: 0,
          display: "flex",
          flexDirection: "column",
          background: "#0e0e0f",
          height: "100vh",
          borderRight: "1px solid rgba(255,255,255,0.05)",
        }}
      >
        {/* Logo */}
        <div
          onClick={onLogoClick}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: "16px 14px 14px",
            borderBottom: "1px solid rgba(255,255,255,0.06)",
            cursor: onLogoClick ? "pointer" : "default",
            transition: "opacity 0.15s",
          }}
          onMouseEnter={(e) => {
            if (onLogoClick)
              (e.currentTarget as HTMLElement).style.opacity = "0.7";
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLElement).style.opacity = "1";
          }}
        >
          <div
            style={{
              width: 30,
              height: 30,
              borderRadius: 7,
              overflow: "hidden",
              flexShrink: 0,
              background: "#1a1a1b",
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
                fontSize: 15,
                letterSpacing: "0.15em",
                textTransform: "uppercase",
                color: "#ffffff",
                margin: 0,
                lineHeight: 1.2,
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

        {/* Navigation */}
        <nav style={{ padding: "12px 8px 0" }}>
          <p
            style={{
              fontSize: 9,
              fontWeight: 700,
              color: "#374151",
              textTransform: "uppercase",
              letterSpacing: "0.1em",
              margin: "0 0 8px 6px",
            }}
          >
            Navigation
          </p>
          {NAV_MAIN.map((item) => {
            const active = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() =>
                  onTabChange(item.id as "dashboard" | "documents")
                }
                style={{
                  width: "100%",
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "9px 10px",
                  borderRadius: 7,
                  fontSize: 12.5,
                  fontWeight: active ? 600 : 400,
                  border: "none",
                  cursor: "pointer",
                  marginBottom: 2,
                  background: active ? "rgba(59,130,246,0.15)" : "transparent",
                  color: active ? "#60a5fa" : "#6b7280",
                  transition: "all 0.15s",
                  textAlign: "left",
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
                <span style={{ display: "flex", flexShrink: 0 }}>
                  {item.icon}
                </span>
                {item.label}
                {active && (
                  <div
                    style={{
                      marginLeft: "auto",
                      width: 4,
                      height: 4,
                      borderRadius: "50%",
                      background: "#3b82f6",
                    }}
                  />
                )}
              </button>
            );
          })}
        </nav>

        {/* Recent scans mini list */}
        {uploadedImages.length > 0 && (
          <div style={{ padding: "16px 8px 0", flex: 1, overflow: "hidden" }}>
            <p
              style={{
                fontSize: 9,
                fontWeight: 700,
                color: "#374151",
                textTransform: "uppercase",
                letterSpacing: "0.1em",
                margin: "0 0 8px 6px",
              }}
            >
              Recent
            </p>
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 4,
                overflowY: "auto",
                maxHeight: 180,
              }}
            >
              {uploadedImages.slice(0, 5).map((img, i) => (
                <div
                  key={i}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 7,
                    padding: "6px 8px",
                    borderRadius: 6,
                    background: "rgba(255,255,255,0.03)",
                    border: "1px solid rgba(255,255,255,0.05)",
                  }}
                >
                  <img
                    src={img.src}
                    alt={img.name}
                    style={{
                      width: 24,
                      height: 18,
                      objectFit: "cover",
                      borderRadius: 3,
                      flexShrink: 0,
                    }}
                  />
                  <div style={{ overflow: "hidden", flex: 1 }}>
                    <p
                      style={{
                        fontSize: 10,
                        color: "#9ca3af",
                        margin: 0,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {img.name}
                    </p>
                    <p style={{ fontSize: 9, color: "#4b5563", margin: 0 }}>
                      {img.time}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Footer */}
        <div
          style={{
            padding: "12px 10px",
            borderTop: "1px solid rgba(255,255,255,0.05)",
            marginTop: "auto",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <div
              style={{
                width: 6,
                height: 6,
                borderRadius: "50%",
                background: "#16a34a",
                animation: "pulseDot 1.6s ease-in-out infinite",
              }}
            />
            <span style={{ fontSize: 10, color: "#4b5563" }}>
              API Connectée
            </span>
          </div>
        </div>
      </aside>
    </>
  );
}
