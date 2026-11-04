"use client";

import { useState, useRef } from "react";

interface SettingsProps {
  user: {
    username: string;
    email: string;
    bio?: string;
    avatar?: string;
  };
  token: string;
  onClose: () => void;
  onUpdate: (data: { bio: string; avatar: string }) => void;
}

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

export default function Settings({ user, token, onClose, onUpdate }: SettingsProps) {
  const [bio, setBio] = useState(user.bio || "");
  const [avatar, setAvatar] = useState(user.avatar || "");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const handleAvatar = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const form = new FormData();
    form.append("file", file);

    try {
      const res = await fetch(`${API_URL}/api/upload`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: form,
      });
      const data = await res.json();
      if (data.url) {
        setAvatar(data.url);
      }
    } catch {
      setMessage("Upload failed");
    }
  };

  const handleSave = async () => {
    setSaving(true);
    setMessage("");
    try {
      const res = await fetch(`${API_URL}/api/profile`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ bio, avatar }),
      });
      const data = await res.json();
      if (res.ok) {
        onUpdate({ bio: data.bio, avatar: data.avatar });
        setMessage("Saved!");
        setTimeout(onClose, 800);
      } else {
        setMessage(data.error || "Failed");
      }
    } catch {
      setMessage("Network error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
      <div className="bg-tg-sidebar rounded-2xl w-full max-w-md p-6 shadow-2xl">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-semibold text-tg-text">Settings</h2>
          <button onClick={onClose} className="text-tg-text-secondary hover:text-tg-text text-xl">
            ×
          </button>
        </div>

        {/* Avatar */}
        <div className="flex flex-col items-center mb-6">
          <div
            onClick={() => fileRef.current?.click()}
            className="w-24 h-24 rounded-full bg-[#5288c1] flex items-center justify-center text-white text-3xl font-medium cursor-pointer overflow-hidden relative group"
          >
            {avatar ? (
              <img src={avatar} alt="avatar" className="w-full h-full object-cover" />
            ) : (
              user.username.charAt(0).toUpperCase()
            )}
            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center text-sm">
              Change
            </div>
          </div>
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleAvatar} />
          <p className="text-tg-text mt-2 font-medium">{user.username}</p>
          <p className="text-tg-text-secondary text-sm">{user.email}</p>
        </div>

        {/* Bio */}
        <div className="mb-6">
          <label className="text-sm text-tg-text-secondary mb-1 block">Bio</label>
          <textarea
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            maxLength={150}
            rows={3}
            placeholder="Write something about yourself..."
            className="w-full bg-tg-input text-tg-text placeholder-tg-text-secondary rounded-xl px-4 py-3 outline-none focus:ring-1 focus:ring-tg-blue resize-none"
          />
          <p className="text-xs text-tg-text-secondary text-right mt-1">{bio.length}/150</p>
        </div>

        {message && (
          <p className={`text-sm text-center mb-3 ${message === "Saved!" ? "text-green-400" : "text-red-400"}`}>
            {message}
          </p>
        )}

        <button
          onClick={handleSave}
          disabled={saving}
          className="w-full bg-tg-blue hover:bg-tg-blue-dark text-white font-medium py-3 rounded-xl transition disabled:opacity-50"
        >
          {saving ? "Saving..." : "Save"}
        </button>
      </div>
    </div>
  );
}
