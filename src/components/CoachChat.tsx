"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { Store } from "@/lib/places";
import type { Profile } from "@/lib/types";

type PlanChange = Partial<Pick<Profile, "goal" | "training" | "calorieTarget" | "proteinTarget" | "weeklyBudget">> & {
  summary: string;
};
type Msg = {
  role: "user" | "assistant";
  content: string;
  plan?: PlanChange;
  planState?: "pending" | "applied" | "dismissed";
};

const HISTORY_KEY = "gz.chat";
const SUGGESTIONS = ["Cheapest protein near me?", "Dorm-friendly high protein dinner", "Switch me to a cut"];

function loadHistory(): Msg[] {
  try {
    return JSON.parse(sessionStorage.getItem(HISTORY_KEY) ?? "[]");
  } catch {
    return [];
  }
}

type Props = {
  profile: Profile;
  today: { protein: number; calories: number; spent: number };
  stores: Store[];
  place: string | null;
  onApplyPlan: (change: PlanChange) => void;
  onHighlight: (ids: string[]) => void;
  onOpenChange?: (open: boolean) => void;
};

/** The chat bar plus the coach conversation that opens above it. */
export function CoachChat({ profile, today, stores, place, onApplyPlan, onHighlight, onOpenChange }: Props) {
  const [messages, setMessages] = useState<Msg[]>(loadHistory);
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scroller = useRef<HTMLDivElement>(null);

  useEffect(() => {
    onOpenChange?.(open);
  }, [open, onOpenChange]);

  useEffect(() => {
    try {
      sessionStorage.setItem(HISTORY_KEY, JSON.stringify(messages.slice(-30)));
    } catch {}
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: "smooth" });
  }, [messages, busy]);

  async function send(content: string) {
    const trimmed = content.trim();
    if (!trimmed || busy) return;
    const next: Msg[] = [...messages, { role: "user", content: trimmed }];
    setMessages(next);
    setText("");
    setOpen(true);
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: next.map(({ role, content }) => ({ role, content })),
          profile,
          today,
          stores: stores.map(({ id, name, tier }) => ({ id, name, tier })),
          place,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Something went wrong.");
      const reply: Msg = { role: "assistant", content: data.reply };
      for (const a of data.actions ?? []) {
        if (a.type === "plan") {
          reply.plan = a.change;
          reply.planState = "pending";
        }
        if (a.type === "stores") onHighlight(a.ids);
      }
      setMessages((m) => [...m, reply]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  function decide(i: number, apply: boolean) {
    const plan = messages[i]?.plan;
    if (!plan) return;
    if (apply) onApplyPlan(plan);
    setMessages((m) => m.map((msg, j) => (j === i ? { ...msg, planState: apply ? "applied" : "dismissed" } : msg)));
  }

  return (
    <div className="space-y-2">
      {open && (
        <div className="glass relative flex max-h-[38dvh] flex-col rounded-3xl">
          <div className="flex items-center justify-between px-5 pt-3">
            <span className="font-mono text-xs tracking-widest text-accent">COACH</span>
            <div className="flex gap-4 font-mono text-xs text-muted">
              {messages.length > 0 && (
                <button onClick={() => setMessages([])} className="hover:text-text">
                  Clear
                </button>
              )}
              <button onClick={() => setOpen(false)} aria-label="Close chat" className="hover:text-text">
                ✕
              </button>
            </div>
          </div>
          <div ref={scroller} className="space-y-3 overflow-y-auto px-5 pb-4 pt-2">
            <p className="font-mono text-[11px] leading-relaxed text-muted">
              General fitness and food info, not medical advice. For medical stuff, check with a doctor or dietitian.
            </p>
            {messages.length === 0 && (
              <div className="flex flex-wrap gap-2">
                {SUGGESTIONS.map((s) => (
                  <button key={s} onClick={() => send(s)} className="rounded-full bg-track px-3 py-1.5 font-mono text-xs text-heading">
                    {s}
                  </button>
                ))}
              </div>
            )}
            {messages.map((m, i) =>
              m.role === "user" ? (
                <p key={i} className="ml-10 rounded-2xl rounded-br-md bg-accent/20 px-4 py-2 font-body text-sm text-text">
                  {m.content}
                </p>
              ) : (
                <div key={i} className="space-y-2">
                  <p className="whitespace-pre-line font-body text-sm leading-relaxed text-text">{withBold(m.content)}</p>
                  {m.plan && (
                    <div className="rounded-2xl border border-accent/40 bg-track/60 p-3">
                      <p className="font-mono text-xs text-muted">Plan change</p>
                      <p className="font-display text-base font-bold text-heading">{m.plan.summary}</p>
                      {m.planState === "pending" ? (
                        <div className="mt-2 flex gap-2">
                          <button onClick={() => decide(i, true)} className="rounded-full bg-accent px-4 py-1.5 font-mono text-xs font-bold text-on-accent">
                            Confirm
                          </button>
                          <button onClick={() => decide(i, false)} className="rounded-full bg-track px-4 py-1.5 font-mono text-xs text-text">
                            Not now
                          </button>
                        </div>
                      ) : (
                        <p className="mt-1 font-mono text-xs text-accent">{m.planState === "applied" ? "✓ Applied" : "Skipped"}</p>
                      )}
                    </div>
                  )}
                </div>
              ),
            )}
            {busy && <p className="animate-pulse font-mono text-xs text-muted">Coach is thinking…</p>}
            {error && <p className="font-mono text-xs text-accent">{error}</p>}
          </div>
        </div>
      )}

      <form
        className="glass flex items-center gap-2 rounded-full p-2"
        onSubmit={(e) => {
          e.preventDefault();
          send(text);
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
          onFocus={() => setOpen(true)}
          placeholder="Ask anything…"
          maxLength={500}
          className="min-w-0 flex-1 bg-transparent font-mono text-text placeholder:text-muted focus:outline-none"
        />
        <button
          type="submit"
          aria-label="Send"
          disabled={busy || !text.trim()}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-track text-text disabled:opacity-40"
        >
          ↑
        </button>
      </form>
    </div>
  );
}

function CameraIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
      <path d="M3 8h3l2-3h8l2 3h3v11H3z" strokeLinejoin="round" />
      <circle cx="12" cy="13" r="3.5" />
    </svg>
  );
}

/** Render **bold** from the model as real bold text (no other markdown). */
function withBold(text: string) {
  return text.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
    part.startsWith("**") && part.endsWith("**") ? (
      <strong key={i} className="font-medium text-heading">
        {part.slice(2, -2)}
      </strong>
    ) : (
      part
    ),
  );
}
