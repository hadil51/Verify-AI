import { useRef } from "react";

interface Props {
  onFileSelect: (file: File) => void;
  loading: boolean;
  onCameraOpen: () => void;
}

export default function UploadSection({
  onFileSelect,
  loading,
  onCameraOpen,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) onFileSelect(f);
    e.target.value = "";
  };

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 32,
        textAlign: "center",
        padding: "0 24px",
        minHeight: "80vh",
      }}
    >
      {/* Logo / Icône principale */}
      <div
        style={{
          width: 90,
          height: 90,
          borderRadius: 24,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#2563eb",
          boxShadow: "0 8px 24px rgba(37,99,235,0.3)",
          flexShrink: 0,
        }}
      >
        <svg width="44" height="44" viewBox="0 0 24 24" fill="none">
          <path
            d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z"
            stroke="white"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </div>

      {/* Titre + Description courte */}
      <div>
        <h1
          style={{
            fontSize: 32,
            fontWeight: 800,
            color: "#1a1a2e",
            marginBottom: 12,
          }}
        >
          Vérification d’authenticité du document
        </h1>
        <p
          style={{
            fontSize: 14,
            color: "#6b7280",
            maxWidth: 540,
            margin: "0 auto",
            lineHeight: 1.6,
          }}
        >
          Importez ou capturer votre document. <strong>VerifyAI</strong> analyse
          en temps réel
        </p>
      </div>

      {/* === 3 ANALYSES PRINCIPALES AVEC ICONS (style sites populaires) === */}
      <div
        style={{
          display: "flex",
          gap: 24,
          flexWrap: "wrap",
          justifyContent: "center",
          maxWidth: 620,
        }}
      >
        {/* 1. Inspection visuelle par IA */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 6,
            width: 160,
          }}
        >
          <svg
            width="28"
            height="28"
            viewBox="0 0 24 24"
            fill="none"
            stroke="#2563eb"
            strokeWidth="2"
          >
            <path d="M15 10l-4 4-2-2" />
            <circle cx="12" cy="12" r="10" />
            <path d="M2 12h2M20 12h2" />
          </svg>
          <p
            style={{
              fontSize: 13,
              fontWeight: 600,
              color: "#1a1a2e",
              margin: 0,
            }}
          >
            Inspection visuelle par IA
          </p>
        </div>

        {/* 2. Analyse structurelle */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 6,
            width: 160,
          }}
        >
          <svg
            width="28"
            height="28"
            viewBox="0 0 24 24"
            fill="none"
            stroke="#2563eb"
            strokeWidth="2"
          >
            <rect x="3" y="3" width="18" height="18" rx="2" />
            <path d="M9 9h6M9 15h6" />
          </svg>
          <p
            style={{
              fontSize: 13,
              fontWeight: 600,
              color: "#1a1a2e",
              margin: 0,
            }}
          >
            Analyse structurelle
          </p>
        </div>

        {/* 3. Métadonnées & Forensique */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 6,
            width: 160,
          }}
        >
          <svg
            width="28"
            height="28"
            viewBox="0 0 24 24"
            fill="none"
            stroke="#2563eb"
            strokeWidth="2"
          >
            <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
            <polyline points="14 2 14 8 20 8" />
            <path d="M16 13H8M16 17H8" />
          </svg>
          <p
            style={{
              fontSize: 13,
              fontWeight: 600,
              color: "#1a1a2e",
              margin: 0,
            }}
          >
            Métadonnées & Forensique
          </p>
        </div>
      </div>

      {/* Boutons d'action */}
      <div
        style={{
          display: "flex",
          gap: 16,
          flexWrap: "wrap",
          justifyContent: "center",
        }}
      >
        <button
          onClick={() => inputRef.current?.click()}
          disabled={loading}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: "14px 28px",
            borderRadius: 12,
            background: "#2563eb",
            color: "#fff",
            fontSize: 15,
            fontWeight: 600,
            border: "none",
            cursor: "pointer",
            boxShadow: "0 4px 14px rgba(37,99,235,0.3)",
          }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
            <path
              d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1M16 8l-4-4m0 0L8 8m4-4v12"
              stroke="white"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          Choisir un fichier
        </button>

        <button
          onClick={onCameraOpen}
          disabled={loading}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: "14px 28px",
            borderRadius: 12,
            background: "#fff",
            color: "#374151",
            fontSize: 15,
            fontWeight: 600,
            border: "1px solid #ebebf0",
            cursor: "pointer",
            boxShadow: "0 1px 4px rgba(0,0,0,0.06)",
          }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
            <path
              d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z"
              stroke="#374151"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <circle cx="12" cy="13" r="4" stroke="#374151" strokeWidth="2" />
          </svg>
          Prendre une photo
        </button>
      </div>

      {/* Footer */}
      <p style={{ fontSize: 13, color: "#9ca3af" }}>
        Compatible avec passeports • cartes d’identité • permis de conduire
      </p>

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        style={{ display: "none" }}
        onChange={handleChange}
      />
    </div>
  );
}
