"use client";

import { useState } from "react";
import { BoardView } from "@/components/BoardView";
import type { Deal } from "@/lib/types";

// This week's protein deals near the user, best protein per dollar first.

export function dealValue(d: Deal) {
  return d.protein_g && d.price_usd ? d.protein_g / d.price_usd : null;
}

function ends(date: string) {
  const d = new Date(`${date}T12:00:00`);
  return d.toLocaleDateString(undefined, { weekday: "short", month: "numeric", day: "numeric" });
}

export function DealLine({ d, showChain = true }: { d: Deal; showChain?: boolean }) {
  const value = dealValue(d);
  return (
    <li className="space-y-0.5">
      <p className="font-body text-sm text-text">
        {showChain && <span className="font-bold text-heading">{d.chain}: </span>}
        {d.item}
      </p>
      <p className="font-mono text-[11px] text-muted">
        <span className="font-bold text-accent">{d.deal}</span>
        {d.protein_g ? ` · ≈${Math.round(d.protein_g)}g protein` : ""}
        {value ? ` · ${value.toFixed(1)}g per $` : ""}
        {` · ends ${ends(d.valid_to)}`}
        {d.source_url && (
          <>
            {" · "}
            <a href={d.source_url} target="_blank" rel="noreferrer" className="underline underline-offset-2">
              source
            </a>
          </>
        )}
      </p>
    </li>
  );
}

export function DealsPanel({ deals, center, onClose }: { deals: Deal[]; center: { lat: number; lng: number }; onClose: () => void }) {
  const [tab, setTab] = useState<"ads" | "board">(deals.length ? "ads" : "board");
  return (
    <div className="glass relative max-h-[55dvh] overflow-y-auto rounded-3xl px-5 py-4">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex gap-4 font-mono text-xs tracking-[0.15em]">
          {(["ads", "board"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={tab === t ? "font-bold text-accent underline decoration-2 underline-offset-8" : "text-muted"}
            >
              {t === "ads" ? `WEEKLY ADS${deals.length ? ` · ${deals.length}` : ""}` : "CAMPUS BOARD"}
            </button>
          ))}
        </div>
        <button onClick={onClose} aria-label="Close deals" className="font-mono text-sm text-muted">
          ✕
        </button>
      </div>
      {tab === "board" ? (
        <BoardView center={center} />
      ) : (
        <>
          {deals.length ? (
            <ul className="space-y-3">
              {deals.map((d, i) => (
                <DealLine key={`${d.chain}-${d.item}-${i}`} d={d} />
              ))}
            </ul>
          ) : (
            <p className="font-mono text-xs text-muted">Checking this week&apos;s ads near you. Deals show up within a few minutes.</p>
          )}
          <p className="mt-4 font-mono text-[10px] leading-relaxed text-muted">
            Found by AI from public weekly ads, checked daily. Prices can vary by store, so confirm in store.
          </p>
        </>
      )}
    </div>
  );
}
