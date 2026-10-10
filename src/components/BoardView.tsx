"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { authHeaders } from "@/lib/supabase";

// Campus deals board: anonymous posts from students nearby, voted up or down like Yik Yak.

type Post = {
  id: number;
  body: string;
  place: string | null;
  score: number;
  createdAt: string;
  expiresAt: string;
  mine: boolean;
  myVote: -1 | 0 | 1;
};

function ago(iso: string) {
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 60) return `${Math.max(1, m)}m`;
  const h = Math.round(m / 60);
  return h < 24 ? `${h}h` : `${Math.round(h / 24)}d`;
}

function endsIn(iso: string) {
  const h = Math.round((new Date(iso).getTime() - Date.now()) / 3_600_000);
  return h < 24 ? `ends in ${Math.max(1, h)}h` : `ends in ${Math.round(h / 24)}d`;
}

export function BoardView({ center }: { center: { lat: number; lng: number } }) {
  const [posts, setPosts] = useState<Post[] | null>(null);
  const [signedIn, setSignedIn] = useState(false);
  const [sort, setSort] = useState<"hot" | "new">("hot");
  const [composing, setComposing] = useState(false);
  const [body, setBody] = useState("");
  const [place, setPlace] = useState("");
  const [days, setDays] = useState(3);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [menuFor, setMenuFor] = useState<number | null>(null);

  const load = useCallback(async () => {
    const res = await fetch(`/api/board?lat=${center.lat}&lng=${center.lng}&sort=${sort}`, { headers: await authHeaders() });
    const d = await res.json().catch(() => null);
    setPosts(d?.posts ?? []);
    setSignedIn(Boolean(d?.signedIn));
  }, [center.lat, center.lng, sort]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const res = await fetch(`/api/board?lat=${center.lat}&lng=${center.lng}&sort=${sort}`, { headers: await authHeaders() });
      const d = await res.json().catch(() => null);
      if (cancelled) return;
      setPosts(d?.posts ?? []);
      setSignedIn(Boolean(d?.signedIn));
    })();
    return () => {
      cancelled = true;
    };
  }, [center.lat, center.lng, sort]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMessage(null);
    const res = await fetch("/api/board", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(await authHeaders()) },
      body: JSON.stringify({ lat: center.lat, lng: center.lng, body, place, days }),
    });
    const d = await res.json().catch(() => null);
    setBusy(false);
    if (!res.ok) return setMessage(d?.error ?? "Couldn't post.");
    setBody("");
    setPlace("");
    setComposing(false);
    setSort("new");
    load();
  }

  async function act(post: Post, action: "up" | "down" | "clear" | "report" | "delete") {
    setMenuFor(null);
    if (!signedIn) return setMessage("Sign in to vote or report. You'll still show as anonymous.");
    // Show votes right away, then sync with the server's count
    if (action === "up" || action === "down" || action === "clear") {
      const value = action === "up" ? 1 : action === "down" ? -1 : 0;
      setPosts((ps) => ps?.map((p) => (p.id === post.id ? { ...p, myVote: value, score: p.score - p.myVote + value } : p)) ?? null);
    }
    if (action === "delete" || action === "report") setPosts((ps) => ps?.filter((p) => p.id !== post.id) ?? null);
    const res = await fetch("/api/board/action", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(await authHeaders()) },
      body: JSON.stringify({ id: post.id, action }),
    });
    const d = await res.json().catch(() => null);
    if (!res.ok) {
      setMessage(d?.error ?? "Something went wrong.");
      load();
    } else if (typeof d?.score === "number") {
      setPosts((ps) => ps?.map((p) => (p.id === post.id ? { ...p, score: d.score } : p)) ?? null);
    }
    if (action === "report") setMessage("Thanks. Reported posts are hidden after two reports.");
  }

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <div className="flex gap-1 font-mono text-[11px]">
          {(["hot", "new"] as const).map((s) => (
            <button
              key={s}
              onClick={() => setSort(s)}
              className={`rounded-full px-3 py-1 ${sort === s ? "bg-accent font-bold text-on-accent" : "text-muted"}`}
            >
              {s === "hot" ? "Hot" : "New"}
            </button>
          ))}
        </div>
        {signedIn ? (
          <button onClick={() => setComposing((c) => !c)} className="font-mono text-xs font-bold text-accent">
            {composing ? "Cancel" : "+ Post a deal"}
          </button>
        ) : (
          <Link href="/account" className="font-mono text-xs text-accent underline underline-offset-4">
            Sign in to post
          </Link>
        )}
      </div>

      {composing && (
        <form onSubmit={submit} className="mb-4 space-y-2">
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value.slice(0, 280))}
            rows={3}
            placeholder="Chipotle: wear a jersey on game day, free bowl…"
            className="w-full resize-none rounded-2xl bg-white/5 p-3 font-body text-sm text-text placeholder:text-muted focus:outline-none"
          />
          <div className="flex gap-2">
            <input
              value={place}
              onChange={(e) => setPlace(e.target.value.slice(0, 60))}
              placeholder="Where (optional)"
              className="min-w-0 flex-1 rounded-full bg-white/5 px-3 py-2 font-mono text-xs text-text placeholder:text-muted focus:outline-none"
            />
            <select
              value={days}
              onChange={(e) => setDays(Number(e.target.value))}
              aria-label="How long the deal lasts"
              className="rounded-full bg-white/5 px-3 py-2 font-mono text-xs text-text"
            >
              {[1, 3, 7, 14].map((d) => (
                <option key={d} value={d} className="bg-ground">
                  {d === 1 ? "Today only" : `${d} days`}
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-center justify-between">
            <span className="font-mono text-[10px] text-muted">Anonymous · {280 - body.length} left</span>
            <button
              disabled={busy || body.trim().length < 3}
              className="rounded-full bg-accent px-4 py-2 font-mono text-xs font-bold text-on-accent disabled:opacity-40"
            >
              {busy ? "Checking…" : "Post"}
            </button>
          </div>
        </form>
      )}

      {message && <p className="mb-3 font-mono text-[11px] text-accent">{message}</p>}

      {posts === null ? (
        <p className="font-mono text-xs text-muted">Loading…</p>
      ) : posts.length === 0 ? (
        <p className="font-mono text-xs leading-relaxed text-muted">
          No posts near you yet. Seen a good deal? Post it so other students can find it.
        </p>
      ) : (
        <ul className="space-y-3">
          {posts.map((p) => (
            <li key={p.id} className="relative flex gap-3 rounded-2xl bg-white/5 p-3">
              <div className="min-w-0 flex-1">
                <p className="whitespace-pre-wrap break-words font-body text-sm text-text">{p.body}</p>
                <p className="mt-1 font-mono text-[10px] text-muted">
                  {p.place && <span className="text-heading">{p.place} · </span>}
                  {ago(p.createdAt)} · {endsIn(p.expiresAt)}
                  {p.mine && " · you"}
                </p>
                <button onClick={() => setMenuFor(menuFor === p.id ? null : p.id)} aria-label="More" className="mt-1 font-mono text-xs text-muted">
                  •••
                </button>
                {menuFor === p.id && (
                  <div className="mt-1 flex gap-4 font-mono text-[11px]">
                    {p.mine ? (
                      <button onClick={() => act(p, "delete")} className="text-[#ff7a9a]">
                        Delete
                      </button>
                    ) : (
                      <button onClick={() => act(p, "report")} className="text-[#ff7a9a]">
                        Report
                      </button>
                    )}
                  </div>
                )}
              </div>
              <div className="flex flex-col items-center font-mono text-sm">
                <button
                  onClick={() => act(p, p.myVote === 1 ? "clear" : "up")}
                  aria-label="Upvote"
                  className={p.myVote === 1 ? "text-accent" : "text-muted"}
                >
                  ▲
                </button>
                <span className="font-bold text-heading">{p.score}</span>
                <button
                  onClick={() => act(p, p.myVote === -1 ? "clear" : "down")}
                  aria-label="Downvote"
                  className={p.myVote === -1 ? "text-[#ff7a9a]" : "text-muted"}
                >
                  ▼
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-4 font-mono text-[10px] leading-relaxed text-muted">
        Posts are anonymous but tied to your account. No names, contact info, or harassment. Posts hide at −5 or after two reports.
      </p>
    </div>
  );
}
