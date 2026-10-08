"use client";

import { useState } from "react";

// Placeholder map for step 1: a tilted lilac grid with sample store pins.
// The real Mapbox map replaces this in step 3, keeping the same 3D / Flat toggle.
const PINS = [
  { name: "Aldi", x: 12, y: 44, highlight: true },
  { name: "Walmart", x: 66, y: 26 },
  { name: "Dining", x: 8, y: 72 },
  { name: "Publix", x: 82, y: 58 },
];

export function GridMap() {
  const [mode, setMode] = useState<"3d" | "flat">("3d");

  return (
    <div className="relative h-full w-full overflow-hidden" style={{ perspective: "900px" }}>
      <div
        className="grid-floor absolute -inset-[30%] transition-transform duration-700"
        style={{
          transform: mode === "3d" ? "rotateX(55deg) rotateZ(-28deg)" : "none",
          transformOrigin: "center center",
        }}
      >
        {/* roads */}
        <div className="absolute left-[38%] top-0 h-full w-8 bg-track/60" />
        <div className="absolute left-0 top-[52%] h-8 w-full bg-track/60" />
        {PINS.map((p) => (
          <div
            key={p.name}
            className={`absolute flex h-20 w-28 items-start justify-center rounded-md pt-2 ${
              p.highlight ? "bg-accent text-on-accent" : "bg-track text-text"
            }`}
            style={{ left: `${p.x + 15}%`, top: `${p.y + 10}%` }}
          >
            <span className="rounded-full bg-card/80 px-2 py-0.5 font-mono text-[10px] text-text">{p.name}</span>
          </div>
        ))}
        {/* you are here */}
        <div className="absolute left-[40%] top-[54%] h-4 w-4 rounded-full bg-[#5b8cff] shadow-[0_0_16px_#5b8cff]" />
      </div>

      <div className="glass absolute right-4 top-4 flex rounded-full p-1">
        {(["3d", "flat"] as const).map((m) => (
          <button
            key={m}
            onClick={() => setMode(m)}
            className={`rounded-full px-4 py-2 font-mono text-sm ${
              mode === m ? "bg-accent font-bold text-on-accent" : "text-text"
            }`}
          >
            {m === "3d" ? "3D" : "Flat"}
          </button>
        ))}
      </div>
    </div>
  );
}
