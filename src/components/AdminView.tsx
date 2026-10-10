"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { authHeaders } from "@/lib/supabase";

// Board moderation for the site owner. The server checks admin rights on every request.

type AdminPost = {
  id: number;
  area: string;
  body: string;
  place: string | null;
  score: number;
  reports: number;
  hidden: boolean;
  created_at: string;
  board_reports?: { reason: string | null }[];
};

export default function AdminView() {
  const [data, setData] = useState<{ flagged: AdminPost[]; recent: AdminPost[] } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/board/admin", { headers: await authHeaders() });
    const d = await res.json().catch(() => null);
    if (!res.ok) return setError(d?.error ?? "Not allowed.");
    setData(d);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const res = await fetch("/api/board/admin", { headers: await authHeaders() });
      const d = await res.json().catch(() => null);
      if (cancelled) return;
      if (!res.ok) setError(d?.error ?? "Not allowed.");
      else setData(d);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function act(id: number, action: "restore" | "remove" | "ban") {
    if (action === "ban" && !confirm("Ban this poster from the board and remove all their posts?")) return;
    await fetch("/api/board/admin", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(await authHeaders()) },
      body: JSON.stringify({ id, action }),
    });
    load();
  }

  const list = (title: string, posts: AdminPost[]) => (
    <section className="mt-8">
      <p className="font-mono text-sm tracking-[0.2em] text-accent">{title}</p>
      {posts.length === 0 && <p className="mt-3 font-mono text-xs text-muted">Nothing here.</p>}
      <ul className="mt-3 space-y-3">
        {posts.map((p) => (
          <li key={p.id} className="glass rounded-2xl p-4">
            <p className="font-body text-sm text-text">{p.body}</p>
            <p className="mt-1 font-mono text-[11px] text-muted">
              {p.place && `${p.place} · `}score {p.score} · {p.reports} report{p.reports === 1 ? "" : "s"}
              {p.hidden && " · HIDDEN"} · area {p.area} · {new Date(p.created_at).toLocaleString()}
            </p>
            {p.board_reports?.some((r) => r.reason) && (
              <p className="mt-1 font-mono text-[11px] text-heading">
                Reasons: {p.board_reports.map((r) => r.reason).filter(Boolean).join("; ")}
              </p>
            )}
            <div className="mt-3 flex gap-3 font-mono text-xs">
              {p.hidden && (
                <button onClick={() => act(p.id, "restore")} className="rounded-full bg-accent px-3 py-1 font-bold text-on-accent">
                  Restore
                </button>
              )}
              <button onClick={() => act(p.id, "remove")} className="glass rounded-full px-3 py-1 text-text">
                Remove
              </button>
              <button onClick={() => act(p.id, "ban")} className="rounded-full bg-[#ff7a9a] px-3 py-1 font-bold text-on-accent">
                Ban poster
              </button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );

  return (
    <main className="grid-floor min-h-dvh px-6 py-8">
      <Link href="/" className="font-mono text-2xl text-text" aria-label="Back">
        ‹
      </Link>
      <p className="mt-8 font-mono text-sm tracking-[0.2em] text-accent">ADMIN</p>
      <h1 className="mt-2 font-display text-4xl font-bold text-heading">Campus board</h1>
      {error && <p className="mt-6 font-mono text-sm text-muted">{error} Sign in with the owner account.</p>}
      {data && (
        <>
          {list("REPORTED OR HIDDEN", data.flagged)}
          {list("RECENT POSTS", data.recent)}
        </>
      )}
    </main>
  );
}
