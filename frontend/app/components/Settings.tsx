"use client";

import { useState, useRef } from "react";
import { profileApi, mediaApi, extractErrorMessage } from "@/lib/api";
import { getMediaUrl } from "@/lib/config";

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

export default function Settings({ user, onClose, onUpdate }: SettingsProps) {
  const [bio, setBio] = useState(user.bio || "");
  const [avatar, setAvatar] = useState(user.avatar || "");
  const [saving, setSaving] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [message, setMessage] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const handleAvatar = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadingAvatar(true);
    setMessage("");

    try {
      const data = await mediaApi.uploadFile(file);
      if (data.url) {
        setAvatar(data.url);
      }
    } catch (err) {
      setMessage(extractErrorMessage(err, "Avatar upload failed"));
    } finally {
      setUploadingAvatar(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    setMessage("");

    try {
      const data = await profileApi.updateProfile({
        bio: bio.trim(),
        avatar,
      });

      onUpdate({ bio: data.bio || bio, avatar: data.avatar || avatar });
      setMessage("Saved!");
      setTimeout(onClose, 800);
    } catch (err) {
      setMessage(extractErrorMessage(err, "Failed to update profile"));
    } finally {
      setSaving(false);
    }
  };

  const displayAvatarUrl = getMediaUrl(avatar);

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
            onClick={() => !uploadingAvatar && fileRef.current?.click()}
            className="w-24 h-24 rounded-full bg-[#5288c1] flex items-center justify-center text-white text-3xl font-medium cursor-pointer overflow-hidden relative group"
          >
            {displayAvatarUrl ? (
              <img src={displayAvatarUrl} alt="avatar" className="w-full h-full object-cover" />
            ) : (
              user.username.charAt(0).toUpperCase()
            )}
            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center text-sm">
              {uploadingAvatar ? "Uploading..." : "Change"}
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
          disabled={saving || uploadingAvatar}
          className="w-full bg-tg-blue hover:bg-tg-blue-dark text-white font-medium py-3 rounded-xl transition disabled:opacity-50"
        >
          {saving ? "Saving..." : "Save"}
        </button>
      </div>
    </div>
  );
}
