"use client";

import { useState, useRef, useEffect } from "react";

interface MessageInputProps {
  onSend: (content: string, type?: string, mediaUrl?: string, fileName?: string) => void;
  onTyping: (isTyping: boolean) => void;
  onUpload?: (file: File) => Promise<{ url: string; fileName: string } | null>;
  disabled?: boolean;
}

export default function MessageInput({
  onSend,
  onTyping,
  onUpload,
  disabled,
}: MessageInputProps) {
  const [text, setText] = useState("");
  const [uploading, setUploading] = useState(false);
  const typingTimeout = useRef<NodeJS.Timeout | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setText(e.target.value);
    onTyping(true);

    if (typingTimeout.current) {
      clearTimeout(typingTimeout.current);
    }

    typingTimeout.current = setTimeout(() => {
      onTyping(false);
    }, 1500);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!text.trim() || disabled) return;

    onSend(text.trim());
    setText("");
    onTyping(false);

    if (typingTimeout.current) {
      clearTimeout(typingTimeout.current);
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !onUpload) return;
    setUploading(true);
    try {
      const res = await onUpload(file);
      if (res?.url) {
        const isImage = file.type.startsWith("image/");
        onSend("", isImage ? "image" : "file", res.url, file.name);
      }
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  return (
    <div className="bg-tg-header px-3 py-2.5 shrink-0">
      <form onSubmit={handleSubmit} className="flex items-center gap-2">
        {onUpload && (
          <>
            <input
              ref={fileInputRef}
              type="file"
              className="hidden"
              onChange={handleFileChange}
              disabled={disabled || uploading}
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={disabled || uploading}
              className="w-10 h-10 rounded-full flex items-center justify-center text-tg-text-secondary hover:text-tg-blue hover:bg-tg-hover transition-colors shrink-0 disabled:opacity-40"
              title="Attach file"
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
                <path fillRule="evenodd" d="M18.97 3.659a2.25 2.25 0 00-3.182 0l-10.94 10.94a3.75 3.75 0 105.304 5.303l7.693-7.693a.75.75 0 011.06 1.06l-7.693 7.693a5.25 5.25 0 11-7.424-7.424l10.939-10.94a3.75 3.75 0 115.303 5.304L9.097 18.75a2.25 2.25 0 01-3.182-3.182l7.693-7.693a.75.75 0 011.06 1.06l-7.693 7.693a.75.75 0 001.06 1.06l10.94-10.94a2.25 2.25 0 000-3.182z" clipRule="evenodd" />
              </svg>
            </button>
          </>
        )}
        <input
          ref={inputRef}
          type="text"
          value={text}
          onChange={handleChange}
          placeholder={uploading ? "Uploading..." : "Message"}
          disabled={disabled || uploading}
          className="flex-1 bg-tg-input text-tg-text placeholder-tg-text-secondary rounded-full px-4 py-2.5 text-[15px] outline-none focus:ring-1 focus:ring-tg-blue"
        />
        <button
          type="submit"
          disabled={!text.trim() || disabled || uploading}
          className="w-10 h-10 rounded-full bg-tg-blue flex items-center justify-center text-white disabled:opacity-40 disabled:cursor-not-allowed hover:bg-tg-blue-dark transition-colors shrink-0"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="currentColor"
            className="w-5 h-5"
          >
            <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
          </svg>
        </button>
      </form>
    </div>
  );
}
