"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { getSocket, disconnectSocket } from "@/lib/socket";
import { useWebRTC } from "@/lib/useWebRTC";
import Sidebar from "./components/Sidebar";
import ChatWindow from "./components/ChatWindow";
import MessageInput from "./components/MessageInput";
import Settings from "./components/Settings";
import CallOverlay from "./components/CallOverlay";

interface Message {
  _id: string;
  from: string;
  to: string;
  room: string;
  content: string;
  type?: string;
  mediaUrl?: string;
  fileName?: string;
  status?: string;
  createdAt: string;
  deletedForEveryone?: boolean;
}

interface User {
  id: string;
  email: string;
  username: string;
  bio?: string;
  avatar?: string;
}

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

export default function Home() {
  const router = useRouter();
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [authMode, setAuthMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [successMsg, setSuccessMsg] = useState("");
  const [unverifiedEmail, setUnverifiedEmail] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const [onlineUsers, setOnlineUsers] = useState<string[]>([]);
  const [currentChat, setCurrentChat] = useState<string | null>(null);
  const [recentChats, setRecentChats] = useState<string[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [typingUser, setTypingUser] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState(false);

  // WebRTC calls (must stay above any early return)
  const callSocket = token ? getSocket(token) : null;
  const call = useWebRTC(callSocket, user?.username, user?.username);

  useEffect(() => {
    const saved = localStorage.getItem("chat_token");
    const savedUser = localStorage.getItem("chat_user");
    if (saved && savedUser) {
      try {
        setToken(saved);
        setUser(JSON.parse(savedUser));
      } catch {
        localStorage.removeItem("chat_token");
        localStorage.removeItem("chat_user");
      }
    }

    const prefillEmail = localStorage.getItem("prefill_login_email");
    if (prefillEmail) {
      setEmail(prefillEmail);
      setAuthMode("login");
      localStorage.removeItem("prefill_login_email");
    }

    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      if (params.get("verified") === "true") {
        setSuccessMsg("Email verified successfully! You can now log in.");
      }
    }
  }, []);

  useEffect(() => {
    if (!token || !user) return;

    const socket = getSocket(token);
    socket.auth = { token };
    socket.connect();

    socket.on("online-users", (users: string[]) => setOnlineUsers(users));

    socket.on("history", ({ withUser, messages: history }: any) => {
      if (withUser === currentChat) {
        setMessages(history);
        socket.emit("mark-seen", { withUser });
      }
    });

    socket.on("receive-message", (msg: Message) => {
      const other = msg.from === user.username ? msg.to : msg.from;
      setRecentChats((prev) => [other, ...prev.filter((u) => u !== other)]);

      if (currentChat === other) {
        setMessages((prev) => {
          if (prev.some((m) => m._id === msg._id)) return prev;
          return [...prev, msg];
        });
        socket.emit("mark-seen", { withUser: other });
      }
    });

    socket.on("messages-delivered", ({ withUser }: any) => {
      if (withUser === currentChat) {
        setMessages((prev) =>
          prev.map((m) =>
            m.from === user.username && m.status === "sent"
              ? { ...m, status: "delivered" }
              : m
          )
        );
      }
    });

    socket.on("messages-seen", ({ withUser }: any) => {
      if (withUser === currentChat) {
        setMessages((prev) =>
          prev.map((m) =>
            m.from === user.username ? { ...m, status: "seen" } : m
          )
        );
      }
    });

    socket.on("message-deleted", ({ messageId, forEveryone }: any) => {
      if (forEveryone) {
        setMessages((prev) =>
          prev.map((m) =>
            m._id === messageId
              ? { ...m, deletedForEveryone: true, content: "", mediaUrl: "" }
              : m
          )
        );
      } else {
        setMessages((prev) => prev.filter((m) => m._id !== messageId));
      }
    });

    socket.on("user-typing", ({ username: typingName, isTyping, withUser }: any) => {
      if (withUser === currentChat || typingName === currentChat) {
        setTypingUser(isTyping ? typingName : null);
      }
    });

    socket.on("connect_error", (err) => {
      if (err.message.includes("Authentication") || err.message.includes("token")) {
        handleLogout();
      }
    });

    return () => {
      socket.off("online-users");
      socket.off("history");
      socket.off("receive-message");
      socket.off("messages-delivered");
      socket.off("messages-seen");
      socket.off("message-deleted");
      socket.off("user-typing");
      socket.off("connect_error");
    };
  }, [token, user, currentChat]);

  useEffect(() => {
    if (!token || !user || !currentChat) return;
    const socket = getSocket(token);
    setMessages([]);
    setTypingUser(null);
    socket.emit("join-private", currentChat);
    socket.emit("get-history", { withUser: currentChat });
    setRecentChats((prev) =>
      prev.includes(currentChat) ? prev : [currentChat, ...prev]
    );
  }, [currentChat, token, user]);

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccessMsg("");
    setUnverifiedEmail(null);
    setLoading(true);
    try {
      const endpoint = authMode === "login" ? "/api/auth/login" : "/api/auth/register";
      const body = authMode === "login" ? { email, password } : { email, username, password };
      const res = await fetch(`${API_URL}${endpoint}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        if (res.status === 403 || data.isVerified === false) {
          const targetEmail = (data.email || email).toLowerCase().trim();
          setUnverifiedEmail(targetEmail);
          setError(data.error || "Please verify your email before logging in.");
        } else {
          setError(data.error || "Something went wrong");
        }
        setLoading(false);
        return;
      }

      // If registering, redirect to email verification page with the email
      if (authMode === "register") {
        const targetEmail = (data.email || email).toLowerCase().trim();
        localStorage.setItem("pending_verify_email", targetEmail);
        router.push(`/verify?email=${encodeURIComponent(targetEmail)}`);
        return;
      }

      // Login success
      localStorage.setItem("chat_token", data.token);
      localStorage.setItem("chat_user", JSON.stringify(data.user));
      setToken(data.token);
      setUser(data.user);
    } catch {
      setError("Network error. Is the backend running?");
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    disconnectSocket();
    localStorage.removeItem("chat_token");
    localStorage.removeItem("chat_user");
    setToken(null);
    setUser(null);
    setCurrentChat(null);
    setMessages([]);
    setOnlineUsers([]);
    setRecentChats([]);
  };

  const handleSearch = async (query: string) => {
    if (!token) return [];
    const res = await fetch(`${API_URL}/api/search?q=${encodeURIComponent(query)}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return [];
    return res.json();
  };

  const handleSend = useCallback(
    (content: string, type = "text", mediaUrl = "", fileName = "") => {
      if (!token || !currentChat) return;
      getSocket(token).emit("send-message", {
        to: currentChat,
        content,
        type,
        mediaUrl,
        fileName,
      });
    },
    [token, currentChat]
  );

  const handleUpload = useCallback(
    async (file: File) => {
      if (!token) return null;
      const form = new FormData();
      form.append("file", file);
      const res = await fetch(`${API_URL}/api/upload`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: form,
      });
      if (!res.ok) return null;
      return res.json();
    },
    [token]
  );

  const handleDelete = useCallback(
    (messageId: string, forEveryone: boolean) => {
      if (!token) return;
      getSocket(token).emit("delete-message", { messageId, forEveryone });
    },
    [token]
  );

  // Real WebRTC call (replaces the old alert placeholder)
  const handleCall = useCallback(
    (isVideo: boolean) => {
      if (!currentChat) return;
      if (!onlineUsers.includes(currentChat)) {
        alert(`${currentChat} is offline right now.`);
        return;
      }
      call.startCall({ id: currentChat, name: currentChat }, isVideo);
    },
    [currentChat, onlineUsers, call.startCall]
  );

  const handleBlock = async (usernameToBlock: string) => {
    if (!token || !currentChat) return;
    if (!confirm(`Block ${usernameToBlock}?`)) return;
    await fetch(`${API_URL}/api/block`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ username: usernameToBlock, block: true }),
    });
    setCurrentChat(null);
    setRecentChats((prev) => prev.filter((u) => u !== usernameToBlock));
    alert(`${usernameToBlock} blocked`);
  };

  if (!token || !user) {
    return (
      <div className="h-screen flex items-center justify-center bg-tg-bg">
        <div className="bg-tg-sidebar p-8 rounded-2xl shadow-2xl w-full max-w-md mx-4">
          <div className="text-center mb-8">
            <div className="w-20 h-20 bg-tg-blue rounded-full flex items-center justify-center mx-auto mb-4">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="white" className="w-10 h-10">
                <path d="M12 2C6.48 2 2 6.48 2 12c0 1.54.36 3 .97 4.29L2 22l5.71-.97C9 21.64 10.46 22 12 22c5.52 0 10-4.48 10-10S17.52 2 12 2zm0 18c-1.38 0-2.67-.36-3.79-.98l-.27-.16-2.85.48.48-2.85-.16-.27C5.36 14.67 5 13.38 5 12c0-3.87 3.13-7 7-7s7 3.13 7 7-3.13 7-7 7z" />
              </svg>
            </div>
            <h1 className="text-2xl font-semibold text-tg-text">Chat App</h1>
            <p className="text-tg-text-secondary mt-1">
              {authMode === "login" ? "Login to continue" : "Create your account"}
            </p>
          </div>

          <form onSubmit={handleAuth} className="space-y-4">
            {successMsg && (
              <div className="p-3 rounded-xl bg-green-500/10 border border-green-500/30 text-green-400 text-sm text-center">
                {successMsg}
              </div>
            )}
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" required className="w-full bg-tg-input text-tg-text placeholder-tg-text-secondary rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-tg-blue" />
            {authMode === "register" && (
              <input type="text" value={username} onChange={(e) => setUsername(e.target.value)} placeholder="Username (unique)" required minLength={3} className="w-full bg-tg-input text-tg-text placeholder-tg-text-secondary rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-tg-blue" />
            )}
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Password" required minLength={6} className="w-full bg-tg-input text-tg-text placeholder-tg-text-secondary rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-tg-blue" />
            {error && (
              <div className="space-y-2">
                <p className="text-red-400 text-sm text-center">{error}</p>
                {unverifiedEmail && (
                  <button
                    type="button"
                    onClick={() => router.push(`/verify?email=${encodeURIComponent(unverifiedEmail)}`)}
                    className="w-full text-center text-xs text-tg-blue hover:underline font-semibold block bg-tg-blue/10 py-2 rounded-lg transition-colors"
                  >
                    Click here to verify your email →
                  </button>
                )}
              </div>
            )}
            <button type="submit" disabled={loading} className="w-full bg-tg-blue hover:bg-tg-blue-dark text-white font-medium py-3 rounded-xl transition-colors disabled:opacity-50">
              {loading ? "Please wait..." : authMode === "login" ? "Login" : "Create Account"}
            </button>
          </form>

          <p className="text-center text-tg-text-secondary text-sm mt-6">
            {authMode === "login" ? (
              <>No account? <button onClick={() => { setAuthMode("register"); setError(""); setSuccessMsg(""); setUnverifiedEmail(null); }} className="text-tg-blue hover:underline">Create one</button></>
            ) : (
              <>Already have account? <button onClick={() => { setAuthMode("login"); setError(""); setSuccessMsg(""); setUnverifiedEmail(null); }} className="text-tg-blue hover:underline">Login</button></>
            )}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen flex bg-tg-bg">
      {/* Incoming / outgoing call screen */}
      <CallOverlay call={call} />

      {showSettings && (
        <Settings
          user={user}
          token={token}
          onClose={() => setShowSettings(false)}
          onUpdate={(data) => {
            const updated = { ...user, ...data };
            setUser(updated);
            localStorage.setItem("chat_user", JSON.stringify(updated));
          }}
        />
      )}

      <Sidebar
        username={user.username}
        onlineUsers={onlineUsers}
        currentChat={currentChat}
        recentChats={recentChats}
        onSelectChat={setCurrentChat}
        onLogout={handleLogout}
        onSearch={handleSearch}
        onOpenSettings={() => setShowSettings(true)}
      />

      <div className="flex-1 flex flex-col">
        {currentChat ? (
          <>
            <ChatWindow
              messages={messages}
              currentUser={user.username}
              chatName={currentChat}
              typingUser={typingUser}
              isOnline={onlineUsers.includes(currentChat)}
              onDelete={handleDelete}
              onCall={handleCall}
              onBlock={() => handleBlock(currentChat)}
            />
            <MessageInput
              onSend={handleSend}
              onTyping={(isTyping) => {
                if (!token || !currentChat) return;
                getSocket(token).emit("typing", { to: currentChat, isTyping });
              }}
              onUpload={handleUpload}
            />
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-tg-text-secondary bg-tg-bg">
            <div className="text-center">
              <div className="w-16 h-16 bg-tg-sidebar rounded-full flex items-center justify-center mx-auto mb-4">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-8 h-8 text-tg-text-secondary">
                  <path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H6l-2 2V4h16v12z" />
                </svg>
              </div>
              <p className="text-lg mb-1 text-tg-text">Select a chat</p>
              <p className="text-sm">Search a username to start messaging</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}