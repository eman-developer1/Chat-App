"use client";

import { useState } from "react";
import { getMediaUrl } from "@/lib/config";

interface SearchUser {
  username: string;
  email: string;
  bio?: string;
  avatar?: string;
}

interface SidebarProps {
  username: string;
  onlineUsers: string[];
  currentChat: string | null;
  recentChats: string[];
  onSelectChat: (chat: string) => void;
  onLogout: () => void;
  onSearch: (query: string) => Promise<SearchUser[]>;
  onOpenSettings: () => void;
}

export default function Sidebar({
  username,
  onlineUsers,
  currentChat,
  recentChats,
  onSelectChat,
  onLogout,
  onSearch,
  onOpenSettings,
}: SidebarProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchUser[]>([]);
  const [searching, setSearching] = useState(false);

  const handleSearch = async (q: string) => {
    setSearchQuery(q);
    if (q.trim().length < 1) {
      setSearchResults([]);
      return;
    }
    setSearching(true);
    try {
      const results = await onSearch(q.trim());
      setSearchResults(results.filter((u) => u.username !== username));
    } catch {
      setSearchResults([]);
    } finally {
      setSearching(false);
    }
  };

  const startChat = (user: string) => {
    onSelectChat(user);
    setSearchQuery("");
    setSearchResults([]);
  };

  const displayList = searchQuery.trim()
    ? searchResults.map((u) => u.username)
    : recentChats.length > 0
    ? recentChats
    : onlineUsers.filter((u) => u !== username);

  return (
    <div className="w-full md:w-[340px] h-full bg-tg-sidebar border-r border-[#0e1621] flex flex-col">
      {/* Header */}
      <div className="h-[56px] px-3 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3 cursor-pointer" onClick={onOpenSettings}>
          <div className="w-10 h-10 rounded-full bg-tg-blue flex items-center justify-center text-white font-medium text-lg">
            {username.charAt(0).toUpperCase()}
          </div>
          <div>
            <p className="font-medium text-tg-text text-[15px]">{username}</p>
            <p className="text-xs text-tg-text-secondary">Settings</p>
          </div>
        </div>
        <button
          onClick={onLogout}
          className="text-tg-text-secondary hover:text-tg-text text-sm px-2 py-1 rounded-md hover:bg-tg-hover transition"
        >
          Logout
        </button>
      </div>

      {/* Search */}
      <div className="px-3 pb-2">
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => handleSearch(e.target.value)}
          placeholder="Search"
          className="w-full bg-tg-input text-tg-text placeholder-tg-text-secondary rounded-full px-4 py-2 text-sm outline-none focus:ring-1 focus:ring-tg-blue"
        />
      </div>

      {/* Chat list */}
      <div className="flex-1 overflow-y-auto">
        {searching && (
          <div className="px-4 py-6 text-center text-tg-text-secondary text-sm">Searching...</div>
        )}

        {!searching && displayList.length === 0 && (
          <div className="px-4 py-10 text-center text-tg-text-secondary text-sm">
            {searchQuery ? "No users found" : "Search a username to start chatting"}
          </div>
        )}

        {displayList.map((user) => {
          const isOnline = onlineUsers.includes(user);
          const isActive = currentChat === user;
          const searchMatch = searchResults.find((s) => s.username === user);
          const avatarUrl = searchMatch?.avatar ? getMediaUrl(searchMatch.avatar) : "";

          return (
            <button
              key={user}
              onClick={() => startChat(user)}
              className={`w-full flex items-center gap-3 px-3 py-2.5 transition-colors ${
                isActive ? "bg-tg-active" : "hover:bg-tg-hover"
              }`}
            >
              <div className="relative shrink-0">
                <div className="w-[48px] h-[48px] rounded-full bg-[#5288c1] flex items-center justify-center text-white font-medium text-lg overflow-hidden">
                  {avatarUrl ? (
                    <img src={avatarUrl} alt={user} className="w-full h-full object-cover" />
                  ) : (
                    user.charAt(0).toUpperCase()
                  )}
                </div>
                {isOnline && (
                  <span className="absolute bottom-0.5 right-0.5 w-3 h-3 bg-[#4dcd5e] rounded-full border-2 border-tg-sidebar"></span>
                )}
              </div>
              <div className="flex-1 text-left min-w-0 border-b border-[#0e1621] pb-2.5">
                <p className="font-medium text-tg-text text-[15px] truncate">{user}</p>
                <p className="text-[13px] text-tg-text-secondary truncate mt-0.5">
                  {isOnline ? "online" : "last seen recently"}
                </p>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
