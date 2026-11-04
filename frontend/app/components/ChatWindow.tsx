"use client";

import { useEffect, useRef } from "react";
import { format } from "date-fns";
import { getMediaUrl } from "@/lib/config";

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

interface ChatWindowProps {
  messages: Message[];
  currentUser: string;
  chatName: string;
  typingUser: string | null;
  isOnline?: boolean;
  onDelete: (messageId: string, forEveryone: boolean) => void;
  onCall: (isVideo: boolean) => void;
  onBlock: () => void;
}

export default function ChatWindow({
  messages,
  currentUser,
  chatName,
  typingUser,
  isOnline = false,
  onDelete,
  onCall,
  onBlock,
}: ChatWindowProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, typingUser]);

  const getTicks = (msg: Message) => {
    if (msg.from !== currentUser) return null;
    if (msg.status === "seen") {
      return <span className="text-[#53bdeb] ml-1 text-[13px]">✓✓</span>;
    }
    if (msg.status === "delivered") {
      return <span className="text-tg-text-secondary ml-1 text-[13px]">✓✓</span>;
    }
    return <span className="text-tg-text-secondary ml-1 text-[13px]">✓</span>;
  };

  return (
    <div className="flex-1 flex flex-col bg-tg-bg relative">
      {/* Header */}
      <div className="h-[56px] bg-tg-header px-4 flex items-center gap-3 shrink-0 border-b border-[#0e1621]">
        <div className="w-10 h-10 rounded-full bg-[#5288c1] flex items-center justify-center text-white font-medium">
          {chatName.charAt(0).toUpperCase()}
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-medium text-tg-text text-[15px] truncate">{chatName}</p>
          {typingUser ? (
            <p className="text-xs text-tg-blue">typing...</p>
          ) : (
            <p className="text-xs text-tg-text-secondary">
              {isOnline ? "online" : "last seen recently"}
            </p>
          )}
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => onCall(false)}
            className="w-9 h-9 rounded-full flex items-center justify-center text-tg-text-secondary hover:bg-tg-hover"
            title="Voice Call"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
              <path d="M6.62 10.79c1.44 2.83 3.76 5.14 6.59 6.59l2.2-2.2c.27-.27.67-.36 1.02-.24 1.12.37 2.33.57 3.57.57.55 0 1 .45 1 1V20c0 .55-.45 1-1 1-9.39 0-17-7.61-17-17 0-.55.45-1 1-1h3.5c.55 0 1 .45 1 1 0 1.25.2 2.45.57 3.57.11.35.03.74-.25 1.02l-2.2 2.2z" />
            </svg>
          </button>
          <button
            onClick={() => onCall(true)}
            className="w-9 h-9 rounded-full flex items-center justify-center text-tg-text-secondary hover:bg-tg-hover"
            title="Video Call"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
              <path d="M17 10.5V7c0-.55-.45-1-1-1H4c-.55 0-1 .45-1 1v10c0 .55.45 1 1 1h12c.55 0 1-.45 1-1v-3.5l4 4v-11l-4 4z" />
            </svg>
          </button>
          <button
            onClick={onBlock}
            className="w-9 h-9 rounded-full flex items-center justify-center text-red-400 hover:bg-tg-hover text-xs"
            title="Block"
          >
            Block
          </button>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-1.5">
        {messages.length === 0 && (
          <div className="flex items-center justify-center h-full text-tg-text-secondary text-sm">
            No messages yet. Say hi!
          </div>
        )}

        {messages.map((msg) => {
          if (msg.deletedForEveryone) {
            return (
              <div key={msg._id} className="flex justify-center">
                <span className="text-xs text-tg-text-secondary italic bg-tg-sidebar px-3 py-1 rounded-full">
                  This message was deleted
                </span>
              </div>
            );
          }

          const isOwn = msg.from === currentUser;
          const mediaFullUrl = msg.mediaUrl ? getMediaUrl(msg.mediaUrl) : "";

          return (
            <div
              key={msg._id}
              className={`flex ${isOwn ? "justify-end" : "justify-start"} group`}
            >
              <div
                className={`relative max-w-[75%] md:max-w-[65%] px-3 py-1.5 shadow-sm ${
                  isOwn
                    ? "bg-tg-message-out rounded-2xl rounded-br-md"
                    : "bg-tg-message-in rounded-2xl rounded-bl-md"
                }`}
              >
                {msg.type === "image" && mediaFullUrl && (
                  <img
                    src={mediaFullUrl}
                    alt="attachment"
                    className="max-w-full rounded-lg mb-1 max-h-60 object-cover"
                  />
                )}
                {msg.type === "file" && mediaFullUrl && (
                  <a
                    href={mediaFullUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-2 text-tg-blue underline mb-1"
                  >
                    📎 {msg.fileName || "File"}
                  </a>
                )}
                {msg.content && (
                  <p className="text-[15px] text-tg-text break-words whitespace-pre-wrap leading-snug">
                    {msg.content}
                  </p>
                )}
                <div className="flex items-center justify-end gap-1 mt-0.5">
                  <p className="text-[11px] text-tg-text-secondary opacity-80">
                    {format(new Date(msg.createdAt), "HH:mm")}
                  </p>
                  {getTicks(msg)}
                </div>

                <div className="absolute top-0 right-0 opacity-0 group-hover:opacity-100 transition">
                  <button
                    onClick={() => {
                      if (isOwn) {
                        const everyone = window.confirm("Delete for everyone?");
                        onDelete(msg._id, everyone);
                      } else {
                        onDelete(msg._id, false);
                      }
                    }}
                    className="text-xs bg-black/60 text-white px-1.5 py-0.5 rounded"
                  >
                    Delete
                  </button>
                </div>
              </div>
            </div>
          );
        })}

        {typingUser && (
          <div className="flex justify-start">
            <div className="bg-tg-message-in rounded-2xl rounded-bl-md px-3 py-2 text-sm text-tg-text-secondary italic">
              {typingUser} is typing...
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>
    </div>
  );
}
