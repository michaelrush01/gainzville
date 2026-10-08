"use client";

import Link from "next/link";
import { useState } from "react";

/** Transparent chat bar with the scan button built in. Chat answers arrive in step 2. */
export function ChatBar() {
  const [text, setText] = useState("");
  const [note, setNote] = useState<string | null>(null);

  return (
    <div className="space-y-2">
      {note && <p className="px-2 font-body text-sm text-muted">{note}</p>}
      <form
        className="glass flex items-center gap-2 rounded-full p-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (!text.trim()) return;
          setNote("The coach is coming in the next update. For now, try the scanner.");
          setText("");
        }}
      >
        <Link
          href="/scan"
          aria-label="Scan food"
          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-accent text-on-accent"
        >
          <CameraIcon />
        </Link>
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Ask anything…"
          className="min-w-0 flex-1 bg-transparent font-mono text-text placeholder:text-muted focus:outline-none"
        />
        <button
          type="submit"
          aria-label="Send"
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-track text-text"
        >
          ↑
        </button>
      </form>
    </div>
  );
}

export function CameraIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
      <path d="M3 8h3l2-3h8l2 3h3v11H3z" strokeLinejoin="round" />
      <circle cx="12" cy="13" r="3.5" />
    </svg>
  );
}
