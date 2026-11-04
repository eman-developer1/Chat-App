"use client";

import { useEffect, useRef, useState } from "react";
import type { CallApi } from "@/lib/useWebRTC";

function useAttachStream(stream: MediaStream | null) {
  const ref = useRef<HTMLVideoElement | null>(null);
  useEffect(() => {
    if (ref.current) ref.current.srcObject = stream;
  }, [stream]);
  return ref;
}

function useTimer(running: boolean) {
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    if (!running) {
      setSeconds(0);
      return;
    }
    const id = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(id);
  }, [running]);
  const mm = String(Math.floor(seconds / 60)).padStart(2, "0");
  const ss = String(seconds % 60).padStart(2, "0");
  return `${mm}:${ss}`;
}

export default function CallOverlay({ call }: { call: CallApi }) {
  const {
    status,
    peer,
    isVideo,
    localStream,
    remoteStream,
    muted,
    cameraOff,
    error,
    acceptCall,
    rejectCall,
    endCall,
    toggleMute,
    toggleCamera,
    clearError,
  } = call;

  const remoteRef = useAttachStream(remoteStream);
  const localRef = useAttachStream(localStream);
  const timer = useTimer(status === "connected");

  // Auto-hide the error toast
  useEffect(() => {
    if (!error) return;
    const id = setTimeout(clearError, 4000);
    return () => clearTimeout(id);
  }, [error, clearError]);

  if (status === "idle") {
    if (!error) return null;
    return (
      <div className="fixed top-4 left-1/2 z-[100] -translate-x-1/2 rounded-lg bg-red-600 px-4 py-2 text-sm text-white shadow-lg">
        {error}
      </div>
    );
  }

  const peerName = peer?.name || "Unknown";
  const initial = peerName.charAt(0).toUpperCase();
  const showRemoteVideo = isVideo && status === "connected";

  const statusText =
    status === "calling"
      ? "Calling…"
      : status === "ringing"
      ? `Incoming ${isVideo ? "video" : "voice"} call`
      : timer;

  return (
    <div className="fixed inset-0 z-[100] flex flex-col items-center justify-between bg-[#0e1621] p-6 text-white">
      {/* Remote media: always rendered so audio plays even on voice calls */}
      <video
        ref={remoteRef}
        autoPlay
        playsInline
        className={
          showRemoteVideo
            ? "absolute inset-0 h-full w-full object-cover"
            : "pointer-events-none absolute h-px w-px opacity-0"
        }
      />

      {/* Local preview (video calls only) */}
      {isVideo && localStream && (
        <video
          ref={localRef}
          autoPlay
          playsInline
          muted
          className="absolute right-4 top-4 z-10 h-36 w-24 rounded-xl border border-white/20 bg-black object-cover sm:h-44 sm:w-32"
          style={{ transform: "scaleX(-1)" }}
        />
      )}

      {/* Header / avatar */}
      <div
        className={`relative z-10 mt-16 flex flex-col items-center gap-3 ${
          showRemoteVideo ? "rounded-xl bg-black/40 px-4 py-2" : ""
        }`}
      >
        {!showRemoteVideo && (
          <div className="flex h-28 w-28 items-center justify-center rounded-full bg-[#2AABEE] text-5xl font-semibold">
            {initial}
          </div>
        )}
        <h2 className="text-2xl font-semibold">{peerName}</h2>
        <p className="text-sm text-white/70">{statusText}</p>
        {error && <p className="text-sm text-red-400">{error}</p>}
      </div>

      {/* Controls */}
      <div className="relative z-10 mb-10 flex items-center gap-5">
        {status === "ringing" ? (
          <>
            <button
              onClick={rejectCall}
              aria-label="Decline call"
              className="flex h-16 w-16 items-center justify-center rounded-full bg-red-600 text-2xl shadow-lg transition hover:bg-red-700"
            >
              ✖
            </button>
            <button
              onClick={acceptCall}
              aria-label="Accept call"
              className="flex h-16 w-16 items-center justify-center rounded-full bg-green-500 text-2xl shadow-lg transition hover:bg-green-600"
            >
              📞
            </button>
          </>
        ) : (
          <>
            <button
              onClick={toggleMute}
              aria-label={muted ? "Unmute" : "Mute"}
              className={`flex h-14 w-14 items-center justify-center rounded-full text-xl transition ${
                muted ? "bg-white text-black" : "bg-white/15 hover:bg-white/25"
              }`}
            >
              {muted ? "🔇" : "🎤"}
            </button>

            {isVideo && (
              <button
                onClick={toggleCamera}
                aria-label={cameraOff ? "Turn camera on" : "Turn camera off"}
                className={`flex h-14 w-14 items-center justify-center rounded-full text-xl transition ${
                  cameraOff ? "bg-white text-black" : "bg-white/15 hover:bg-white/25"
                }`}
              >
                {cameraOff ? "🚫" : "📷"}
              </button>
            )}

            <button
              onClick={endCall}
              aria-label="End call"
              className="flex h-16 w-16 items-center justify-center rounded-full bg-red-600 text-2xl shadow-lg transition hover:bg-red-700"
            >
              📵
            </button>
          </>
        )}
      </div>
    </div>
  );
}