/* eslint-disable react-hooks/set-state-in-effect -- camera lifecycle and countdown reset run from effects by design */
import { useRef, useEffect, useState, useCallback } from "react";

interface Props {
  onCapture: (file: File) => void;
  onClose: () => void;
}
type DetectionState = "searching" | "detected" | "capturing" | "captured";

async function waitVideoMetadata(video: HTMLVideoElement, timeoutMs: number) {
  if (video.readyState >= HTMLMediaElement.HAVE_METADATA) return;
  await new Promise<void>((resolve, reject) => {
    let done = false;
    const finish = (fn: () => void) => {
      if (done) return;
      done = true;
      clearTimeout(tid);
      video.removeEventListener("loadedmetadata", onOk);
      video.removeEventListener("error", onErr);
      fn();
    };
    const onOk = () => finish(() => resolve());
    const onErr = () => finish(() => reject(new Error("video load error")));
    const tid = window.setTimeout(() => finish(() => resolve()), timeoutMs);
    video.addEventListener("loadedmetadata", onOk, { once: true });
    video.addEventListener("error", onErr, { once: true });
  });
}

async function acquireVideoStream(
  mode: "environment" | "user",
): Promise<MediaStream> {
  const attempts: MediaStreamConstraints[] = [
    {
      video: {
        facingMode: { ideal: mode },
        width: { ideal: 1280 },
        height: { ideal: 720 },
      },
      audio: false,
    },
    { video: { width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false },
    { video: true, audio: false },
  ];
  let last: unknown;
  for (const c of attempts) {
    try {
      return await navigator.mediaDevices.getUserMedia(c);
    } catch (e) {
      last = e;
    }
  }
  throw last;
}

export default function CameraCapture({ onCapture, onClose }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const overlayCanvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const animFrameRef = useRef<number>(0);
  const stableCountRef = useRef(0);
  const capturedRef = useRef(false); // prevent double-capture
  const mountedRef = useRef(true);

  const [state, setState] = useState<DetectionState>("searching");
  const [error, setError] = useState<string | null>(null);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [facingMode, setFacingMode] = useState<"environment" | "user">(
    "environment",
  );
  const [cameraReady, setCameraReady] = useState(false);

  // ── Stop all tracks helper ──
  const stopStream = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    cancelAnimationFrame(animFrameRef.current);
  }, []);

  // ── Start camera ──
  const startCamera = useCallback(
    async (mode: "environment" | "user") => {
      stopStream();
      setCameraReady(false);
      setError(null);
      capturedRef.current = false;
      setState("searching");
      stableCountRef.current = 0;

      if (!navigator.mediaDevices?.getUserMedia) {
        setError(
          "Caméra indisponible : utilisez HTTPS ou localhost, ou un navigateur récent.",
        );
        return;
      }

      try {
        const stream = await acquireVideoStream(mode);
        if (!mountedRef.current) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        const video = videoRef.current;
        if (!video) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        video.srcObject = stream;
        await waitVideoMetadata(video, 8000);
        if (!mountedRef.current) return;
        try {
          await video.play();
        } catch {
          /* autoplay may have already started */
        }
        if (!mountedRef.current) return;
        setCameraReady(true);
      } catch (err: unknown) {
        if (!mountedRef.current) return;
        const name = err instanceof DOMException ? err.name : "";
        const msg =
          name === "NotAllowedError"
            ? "Accès caméra refusé. Veuillez autoriser la caméra dans votre navigateur."
            : name === "NotFoundError"
              ? "Aucune caméra trouvée sur cet appareil."
              : name === "OverconstrainedError"
                ? "Cette caméra ne supporte pas le mode demandé. Essayez « Retourner » ou un autre navigateur."
                : "Impossible d'accéder à la caméra. Veuillez réessayer.";
        setError(msg);
      }
    },
    [stopStream],
  );

  useEffect(() => {
    startCamera(facingMode);
    return () => stopStream();
  }, [facingMode, startCamera, stopStream]);

  // ── Capture photo ──
  const capturePhoto = useCallback(() => {
    if (capturedRef.current) return;
    capturedRef.current = true;

    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;

    setState("capturing");
    cancelAnimationFrame(animFrameRef.current);

    setTimeout(() => {
      const vw = video.videoWidth || 640;
      const vh = video.videoHeight || 480;
      canvas.width = vw;
      canvas.height = vh;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.drawImage(video, 0, 0, vw, vh);

      canvas.toBlob(
        (blob) => {
          if (!blob) {
            capturedRef.current = false;
            setState("searching");
            return;
          }
          stopStream();
          setState("captured");
          const file = new File([blob], `capture_${Date.now()}.jpg`, {
            type: "image/jpeg",
          });
          // Give a brief visual flash, then pass the file up
          setTimeout(() => {
            onCapture(file);
          }, 300);
        },
        "image/jpeg",
        0.95,
      );
    }, 120);
  }, [onCapture, stopStream]);

  // ── Detect card in frame (RAF loop lives in effect — hoisted `loop` avoids TDZ) ──
  useEffect(() => {
    if (!cameraReady) return;

    function loop() {
      if (capturedRef.current) return;
      const video = videoRef.current;
      const canvas = canvasRef.current;
      const overlay = overlayCanvasRef.current;
      if (!video || !canvas || !overlay || video.readyState < 2) {
        animFrameRef.current = requestAnimationFrame(loop);
        return;
      }
      const vw = video.videoWidth || 640;
      const vh = video.videoHeight || 480;
      canvas.width = vw;
      canvas.height = vh;
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(video, 0, 0, vw, vh);

      const rectW = vw * 0.72;
      const rectH = rectW / 1.586;
      const rectX = (vw - rectW) / 2;
      const rectY = (vh - rectH) / 2;

      const sample = ctx.getImageData(rectX, rectY, rectW, rectH);
      const data = sample.data;
      let sum = 0,
        sumSq = 0,
        n = 0;
      for (let i = 0; i < data.length; i += 16) {
        const b = data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
        sum += b;
        sumSq += b * b;
        n++;
      }
      const mean = sum / n;
      const variance = sumSq / n - mean * mean;

      const cornersLit = [
        ctx.getImageData(rectX + 10, rectY + 10, 20, 20),
        ctx.getImageData(rectX + rectW - 30, rectY + 10, 20, 20),
        ctx.getImageData(rectX + 10, rectY + rectH - 30, 20, 20),
        ctx.getImageData(rectX + rectW - 30, rectY + rectH - 30, 20, 20),
      ]
        .map((s) => {
          let b = 0;
          for (let i = 0; i < s.data.length; i += 4)
            b +=
              s.data[i] * 0.299 + s.data[i + 1] * 0.587 + s.data[i + 2] * 0.114;
          return b / (s.data.length / 4);
        })
        .every((b) => b > 40);

      if (variance > 600 && cornersLit)
        stableCountRef.current = Math.min(stableCountRef.current + 1, 40);
      else stableCountRef.current = Math.max(stableCountRef.current - 2, 0);

      const stable = stableCountRef.current >= 30;

      overlay.width = vw;
      overlay.height = vh;
      const octx = overlay.getContext("2d")!;
      octx.clearRect(0, 0, vw, vh);
      octx.fillStyle = "rgba(0,0,0,0.45)";
      octx.fillRect(0, 0, vw, vh);
      octx.clearRect(rectX, rectY, rectW, rectH);

      const bc = stable ? "#22c55e" : "#2563eb";
      octx.strokeStyle = bc;
      octx.lineWidth = 2;
      octx.strokeRect(rectX, rectY, rectW, rectH);

      const cLen = 28;
      octx.lineWidth = 5;
      octx.strokeStyle = bc;
      (
        [
          [rectX, rectY, 1, 1],
          [rectX + rectW, rectY, -1, 1],
          [rectX, rectY + rectH, 1, -1],
          [rectX + rectW, rectY + rectH, -1, -1],
        ] as [number, number, number, number][]
      ).forEach(([cx, cy, dx, dy]) => {
        octx.beginPath();
        octx.moveTo(cx + dx * cLen, cy);
        octx.lineTo(cx, cy);
        octx.lineTo(cx, cy + dy * cLen);
        octx.stroke();
      });

      octx.font = "bold 14px Inter, sans-serif";
      octx.textAlign = "center";
      octx.fillStyle = bc;
      octx.fillText(
        stable
          ? "Document détecté — restez immobile"
          : "Placez votre document dans le cadre",
        vw / 2,
        rectY - 14,
      );

      if (stable) setState("detected");
      else setState("searching");

      animFrameRef.current = requestAnimationFrame(loop);
    }

    cancelAnimationFrame(animFrameRef.current);
    animFrameRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(animFrameRef.current);
  }, [cameraReady]);

  // Countdown auto-capture
  useEffect(() => {
    if (state !== "detected") {
      setCountdown(null);
      return;
    }
    setCountdown(3);
    const interval = setInterval(() => {
      setCountdown((prev) => {
        if (prev === null) return null;
        if (prev <= 1) {
          clearInterval(interval);
          capturePhoto();
          return null;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [state, capturePhoto]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const flipCamera = useCallback(() => {
    capturedRef.current = false;
    setCountdown(null);
    setFacingMode((m) => (m === "environment" ? "user" : "environment"));
  }, []);

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 50,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "rgba(10,12,20,0.96)",
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 640,
          margin: "0 16px",
          display: "flex",
          flexDirection: "column",
          gap: 16,
        }}
      >
        {/* Header */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="#60a5fa"
              strokeWidth="2"
              strokeLinecap="round"
            >
              <path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z" />
              <circle cx="12" cy="13" r="4" />
            </svg>
            <p
              style={{
                color: "#fff",
                fontWeight: 700,
                fontSize: 15,
                margin: 0,
              }}
            >
              Scanner un document
            </p>
          </div>
          <button
            onClick={onClose}
            style={{
              width: 36,
              height: 36,
              borderRadius: "50%",
              background: "rgba(255,255,255,0.1)",
              border: "none",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
              <path
                d="M18 6L6 18M6 6l12 12"
                stroke="white"
                strokeWidth="2"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </div>

        {/* Camera view */}
        <div
          style={{
            position: "relative",
            borderRadius: 16,
            overflow: "hidden",
            background: "#000",
            aspectRatio: "16/9",
            boxShadow: "0 0 0 1px rgba(255,255,255,0.08)",
          }}
        >
          {error ? (
            <div
              style={{
                position: "absolute",
                inset: 0,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                gap: 16,
                padding: 24,
              }}
            >
              <svg
                width="40"
                height="40"
                viewBox="0 0 24 24"
                fill="none"
                stroke="#ef4444"
                strokeWidth="1.5"
                strokeLinecap="round"
              >
                <path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z" />
                <line x1="12" y1="11" x2="12" y2="15" />
                <line x1="12" y1="18" x2="12.01" y2="18" />
              </svg>
              <p
                style={{
                  color: "#e5e7eb",
                  textAlign: "center",
                  fontSize: 14,
                  lineHeight: 1.6,
                  margin: 0,
                }}
              >
                {error}
              </p>
              <button
                onClick={() => startCamera(facingMode)}
                style={{
                  padding: "10px 24px",
                  borderRadius: 10,
                  background: "#2563eb",
                  color: "#fff",
                  border: "none",
                  cursor: "pointer",
                  fontWeight: 600,
                  fontSize: 14,
                }}
              >
                Réessayer
              </button>
            </div>
          ) : (
            <>
              <video
                ref={videoRef}
                style={{
                  width: "100%",
                  height: "100%",
                  objectFit: "cover",
                  display: "block",
                }}
                playsInline
                muted
                autoPlay
              />
              <canvas
                ref={overlayCanvasRef}
                style={{
                  position: "absolute",
                  inset: 0,
                  width: "100%",
                  height: "100%",
                  pointerEvents: "none",
                }}
              />
              <canvas ref={canvasRef} style={{ display: "none" }} />

              {/* Flash on capture */}
              {state === "capturing" && (
                <div
                  style={{
                    position: "absolute",
                    inset: 0,
                    background: "rgba(255,255,255,0.7)",
                    animation: "pulse 0.3s ease",
                  }}
                />
              )}

              {/* Countdown badge */}
              {countdown !== null && (
                <div
                  style={{
                    position: "absolute",
                    top: 16,
                    left: "50%",
                    transform: "translateX(-50%)",
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    padding: "6px 18px",
                    borderRadius: 20,
                    background: "rgba(37,99,235,0.92)",
                    backdropFilter: "blur(4px)",
                  }}
                >
                  <span
                    style={{ color: "#fff", fontSize: 13, fontWeight: 700 }}
                  >
                    Capture dans {countdown}…
                  </span>
                </div>
              )}

              {/* Status badge */}
              {!cameraReady ? (
                <div
                  style={{
                    position: "absolute",
                    bottom: 16,
                    left: "50%",
                    transform: "translateX(-50%)",
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    padding: "6px 16px",
                    borderRadius: 20,
                    background: "rgba(0,0,0,0.7)",
                  }}
                >
                  <span style={{ color: "#9ca3af", fontSize: 12 }}>
                    Initialisation de la caméra…
                  </span>
                </div>
              ) : (
                <div
                  style={{
                    position: "absolute",
                    bottom: 16,
                    left: "50%",
                    transform: "translateX(-50%)",
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    padding: "6px 16px",
                    borderRadius: 20,
                    background: "rgba(0,0,0,0.65)",
                  }}
                >
                  <span
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: "50%",
                      background: state === "detected" ? "#22c55e" : "#2563eb",
                      display: "inline-block",
                    }}
                  />
                  <span
                    style={{ color: "#fff", fontSize: 12, fontWeight: 500 }}
                  >
                    {state === "detected"
                      ? "Document détecté"
                      : state === "capturing"
                        ? "Capture en cours…"
                        : state === "captured"
                          ? "Capturé ✓"
                          : "Recherche de document…"}
                  </span>
                </div>
              )}
            </>
          )}
        </div>

        {/* Controls */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            padding: "0 8px",
          }}
        >
          {/* Flip button */}
          <button
            onClick={flipCamera}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "10px 18px",
              borderRadius: 10,
              background: "rgba(255,255,255,0.1)",
              color: "#d1d5db",
              border: "none",
              cursor: "pointer",
              fontSize: 13,
              fontWeight: 500,
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
              <path
                d="M1 4v6h6M23 20v-6h-6"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              />
              <path
                d="M20.49 9A9 9 0 005.64 5.64L1 10M23 14l-4.64 4.36A9 9 0 013.51 15"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              />
            </svg>
            Retourner
          </button>

          {/* Shutter button */}
          <button
            onClick={capturePhoto}
            disabled={
              state === "capturing" || state === "captured" || !cameraReady
            }
            style={{
              width: 64,
              height: 64,
              borderRadius: "50%",
              border: `4px solid ${state === "detected" ? "#16a34a" : "#e8eaed"}`,
              background: state === "detected" ? "#22c55e" : "#fff",
              cursor:
                state === "capturing" || state === "captured"
                  ? "not-allowed"
                  : "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              transition: "all 0.2s",
              opacity: !cameraReady ? 0.5 : 1,
            }}
          >
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none">
              <path
                d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z"
                stroke={state === "detected" ? "white" : "#374151"}
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <circle
                cx="12"
                cy="13"
                r="4"
                stroke={state === "detected" ? "white" : "#374151"}
                strokeWidth="2"
              />
            </svg>
          </button>

          {/* Hint */}
          <p
            style={{
              fontSize: 11,
              color: "#6b7280",
              textAlign: "right",
              maxWidth: 90,
              margin: 0,
              lineHeight: 1.4,
            }}
          >
            Capture automatique à la détection
          </p>
        </div>
      </div>
    </div>
  );
}
