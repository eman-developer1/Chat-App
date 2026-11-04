"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Socket } from "socket.io-client";

export type CallStatus = "idle" | "calling" | "ringing" | "connected";

export interface CallPeer {
  id: string; // the other user's username
  name: string;
}

// STUN works for most local/same-network calls.
// For users on different networks (deployed site) add a TURN server via env vars.
const ICE_SERVERS: RTCIceServer[] = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
];

if (process.env.NEXT_PUBLIC_TURN_URL) {
  ICE_SERVERS.push({
    urls: process.env.NEXT_PUBLIC_TURN_URL,
    username: process.env.NEXT_PUBLIC_TURN_USERNAME,
    credential: process.env.NEXT_PUBLIC_TURN_CREDENTIAL,
  });
}

const RING_TIMEOUT_MS = 30000;

// The 2nd and 3rd arguments are kept so page.tsx does not need changes.
// The backend already knows who is calling (socket.user.username).
export function useWebRTC(
  socket: Socket | null,
  _myUserId?: string,
  _myName?: string
) {
  const [status, setStatus] = useState<CallStatus>("idle");
  const [peer, setPeer] = useState<CallPeer | null>(null);
  const [isVideo, setIsVideo] = useState(false);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [muted, setMuted] = useState(false);
  const [cameraOff, setCameraOff] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Refs so socket handlers never read stale state
  const statusRef = useRef<CallStatus>("idle");
  const peerRef = useRef<CallPeer | null>(null);
  const isVideoRef = useRef(false);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const pendingOfferRef = useRef<RTCSessionDescriptionInit | null>(null);
  const pendingIceRef = useRef<RTCIceCandidateInit[]>([]);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const updateStatus = (s: CallStatus) => {
    statusRef.current = s;
    setStatus(s);
  };

  const clearRingTimeout = () => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  };

  // Close everything and go back to idle. If notify=true, tell the other user.
  const finish = useCallback(
    (notify: boolean) => {
      clearRingTimeout();

      if (notify && socket && peerRef.current) {
        socket.emit("end-call", { to: peerRef.current.id });
      }

      if (pcRef.current) {
        pcRef.current.onicecandidate = null;
        pcRef.current.ontrack = null;
        pcRef.current.onconnectionstatechange = null;
        pcRef.current.close();
        pcRef.current = null;
      }

      localStreamRef.current?.getTracks().forEach((t) => t.stop());
      localStreamRef.current = null;

      pendingOfferRef.current = null;
      pendingIceRef.current = [];
      peerRef.current = null;
      isVideoRef.current = false;

      setLocalStream(null);
      setRemoteStream(null);
      setPeer(null);
      setIsVideo(false);
      setMuted(false);
      setCameraOff(false);
      updateStatus("idle");
    },
    [socket]
  );

  const getMedia = async (video: boolean): Promise<MediaStream | null> => {
    if (!navigator.mediaDevices?.getUserMedia) {
      setError("Calls need HTTPS (or localhost) and a supported browser.");
      return null;
    }
    try {
      return await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true },
        video: video ? { facingMode: "user" } : false,
      });
    } catch (err: any) {
      if (err?.name === "NotAllowedError") {
        setError("Microphone/camera permission denied. Please allow access.");
      } else if (err?.name === "NotFoundError") {
        setError("No microphone or camera found on this device.");
      } else {
        setError("Could not access microphone/camera.");
      }
      return null;
    }
  };

  const createPeerConnection = useCallback(
    (peerId: string) => {
      const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });

      pc.onicecandidate = (e) => {
        if (e.candidate && socket) {
          socket.emit("ice-candidate", { to: peerId, candidate: e.candidate });
        }
      };

      pc.ontrack = (e) => {
        setRemoteStream(e.streams[0]);
      };

      pc.onconnectionstatechange = () => {
        if (pc.connectionState === "connected") {
          clearRingTimeout();
          updateStatus("connected");
        } else if (pc.connectionState === "failed") {
          setError("Call connection failed. Check your network.");
          finish(true);
        }
      };

      pcRef.current = pc;
      return pc;
    },
    [socket, finish]
  );

  const flushPendingIce = async () => {
    const pc = pcRef.current;
    if (!pc) return;
    for (const c of pendingIceRef.current) {
      try {
        await pc.addIceCandidate(c);
      } catch (e) {
        console.warn("[WebRTC] addIceCandidate failed", e);
      }
    }
    pendingIceRef.current = [];
  };

  // ---------- Caller ----------
  const startCall = useCallback(
    async (target: CallPeer, video = false) => {
      if (!socket || statusRef.current !== "idle") return;
      setError(null);

      const stream = await getMedia(video);
      if (!stream) return;

      localStreamRef.current = stream;
      setLocalStream(stream);
      peerRef.current = target;
      setPeer(target);
      isVideoRef.current = video;
      setIsVideo(video);
      updateStatus("calling");

      try {
        const pc = createPeerConnection(target.id);
        stream.getTracks().forEach((t) => pc.addTrack(t, stream));

        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);

        socket.emit("call-user", { to: target.id, offer, isVideo: video });

        timeoutRef.current = setTimeout(() => {
          if (statusRef.current === "calling") {
            setError("No answer.");
            finish(true);
          }
        }, RING_TIMEOUT_MS);
      } catch (err) {
        console.error("[WebRTC] startCall error", err);
        setError("Could not start the call.");
        finish(false);
      }
    },
    [socket, createPeerConnection, finish]
  );

  // ---------- Receiver ----------
  const acceptCall = useCallback(async () => {
    if (!socket || statusRef.current !== "ringing") return;
    const target = peerRef.current;
    const offer = pendingOfferRef.current;
    if (!target || !offer) return;

    const stream = await getMedia(isVideoRef.current);
    if (!stream) {
      socket.emit("reject-call", { to: target.id });
      finish(false);
      return;
    }

    localStreamRef.current = stream;
    setLocalStream(stream);

    try {
      const pc = createPeerConnection(target.id);
      stream.getTracks().forEach((t) => pc.addTrack(t, stream));

      await pc.setRemoteDescription(new RTCSessionDescription(offer));
      await flushPendingIce();

      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);

      socket.emit("answer-call", { to: target.id, answer });
    } catch (err) {
      console.error("[WebRTC] acceptCall error", err);
      setError("Could not connect the call.");
      finish(true);
    }
  }, [socket, createPeerConnection, finish]);

  const rejectCall = useCallback(() => {
    if (socket && peerRef.current) {
      socket.emit("reject-call", { to: peerRef.current.id });
    }
    finish(false);
  }, [socket, finish]);

  const endCall = useCallback(() => finish(true), [finish]);

  // ---------- Controls ----------
  const toggleMute = useCallback(() => {
    const tracks = localStreamRef.current?.getAudioTracks() ?? [];
    if (tracks.length === 0) return;
    const next = !tracks[0].enabled;
    tracks.forEach((t) => (t.enabled = next));
    setMuted(!next);
  }, []);

  const toggleCamera = useCallback(() => {
    const tracks = localStreamRef.current?.getVideoTracks() ?? [];
    if (tracks.length === 0) return;
    const next = !tracks[0].enabled;
    tracks.forEach((t) => (t.enabled = next));
    setCameraOff(!next);
  }, []);

  const clearError = useCallback(() => setError(null), []);

  // ---------- Socket listeners (match the events in server.js) ----------
  useEffect(() => {
    if (!socket) return;

    const onIncomingCall = (data: {
      from: string;
      offer: RTCSessionDescriptionInit;
      isVideo?: boolean;
    }) => {
      // Already in a call -> auto-reject so the caller is not left hanging
      if (statusRef.current !== "idle") {
        socket.emit("reject-call", { to: data.from });
        return;
      }
      setError(null);
      pendingOfferRef.current = data.offer;
      pendingIceRef.current = [];
      const incoming = { id: data.from, name: data.from };
      peerRef.current = incoming;
      setPeer(incoming);
      isVideoRef.current = !!data.isVideo;
      setIsVideo(!!data.isVideo);
      updateStatus("ringing");
    };

    const onCallAnswered = async (data: {
      from: string;
      answer: RTCSessionDescriptionInit;
    }) => {
      const pc = pcRef.current;
      if (!pc || statusRef.current !== "calling") return;
      if (peerRef.current && data.from !== peerRef.current.id) return;
      try {
        await pc.setRemoteDescription(new RTCSessionDescription(data.answer));
        await flushPendingIce();
      } catch (err) {
        console.error("[WebRTC] onCallAnswered error", err);
      }
    };

    const onIceCandidate = async (data: {
      from: string;
      candidate: RTCIceCandidateInit;
    }) => {
      if (peerRef.current && data.from !== peerRef.current.id) return;
      const pc = pcRef.current;
      if (pc && pc.remoteDescription) {
        try {
          await pc.addIceCandidate(data.candidate);
        } catch (e) {
          console.warn("[WebRTC] addIceCandidate failed", e);
        }
      } else {
        // Candidate arrived before the call was accepted/answered: keep it
        pendingIceRef.current.push(data.candidate);
      }
    };

    const onCallEnded = (data: { from: string }) => {
      if (statusRef.current === "idle") return;
      if (peerRef.current && data.from !== peerRef.current.id) return;
      finish(false);
    };

    const onCallRejected = (data: { from: string }) => {
      if (statusRef.current === "idle") return;
      if (peerRef.current && data.from !== peerRef.current.id) return;
      setError("Call declined or user is busy.");
      finish(false);
    };

    socket.on("incoming-call", onIncomingCall);
    socket.on("call-answered", onCallAnswered);
    socket.on("ice-candidate", onIceCandidate);
    socket.on("call-ended", onCallEnded);
    socket.on("call-rejected", onCallRejected);

    return () => {
      socket.off("incoming-call", onIncomingCall);
      socket.off("call-answered", onCallAnswered);
      socket.off("ice-candidate", onIceCandidate);
      socket.off("call-ended", onCallEnded);
      socket.off("call-rejected", onCallRejected);
    };
  }, [socket, finish]);

  // Cleanup when the component unmounts
  useEffect(() => {
    return () => {
      if (statusRef.current !== "idle") finish(true);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return {
    status,
    peer,
    isVideo,
    localStream,
    remoteStream,
    muted,
    cameraOff,
    error,
    startCall,
    acceptCall,
    rejectCall,
    endCall,
    toggleMute,
    toggleCamera,
    clearError,
  };
}

export type CallApi = ReturnType<typeof useWebRTC>;