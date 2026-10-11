"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Ring } from "@/components/Ring";
import { addToLog, getProfile, readStashedResult, stashResult, todayTotals } from "@/lib/profile";
import { goalTip } from "@/lib/tips";
import { proteinPerDollar, type ScanResult } from "@/lib/types";
import { authHeaders } from "@/lib/supabase";

// Rendered in the browser only (see app/scan/result/page.tsx).
export default function ResultView() {
  const router = useRouter();
  const [result, setResult] = useState<ScanResult | null>(() => readStashedResult<ScanResult>());
  const [profile] = useState(getProfile);
  const [eatenToday] = useState(() => todayTotals().protein);
  const [servings, setServings] = useState(1);
  const [priceInput, setPriceInput] = useState("");
  const [fixOpen, setFixOpen] = useState(false);
  const [fixText, setFixText] = useState("");
  const [fixing, setFixing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!result) router.replace("/scan");
  }, [result, router]);

  if (!result) return null;

  const isPackaged = result.kind !== "meal";
  const mult = isPackaged ? servings : 1;
  const protein = Math.round(result.protein * mult);
  const calories = Math.round(result.calories * mult);
  const typedPrice = parseFloat(priceInput);
  const cost = !Number.isNaN(typedPrice) ? typedPrice : result.cost != null ? result.cost * mult : null;
  const ppd = proteinPerDollar(protein, cost);

  const target = profile.proteinTarget;
  const before = Math.min(eatenToday / target, 1);
  const after = Math.min((eatenToday + protein) / target, 1);
  const tip = goalTip({ goal: profile.goal, proteinLeft: target - eatenToday - protein, mealCalories: calories });

  async function applyFix() {
    if (!fixText.trim() || !result) return;
    setFixing(true);
    setError(null);
    const { imageUrl, ...previous } = result;
    const res = await fetch("/api/scan", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(await authHeaders()) },
      body: JSON.stringify({ correction: fixText, previous }),
    });
    const data = await res.json();
    setFixing(false);
    if (!res.ok) return setError(data.error ?? "Couldn't update that.");
    const updated = { ...(data as ScanResult), imageUrl };
    setResult(updated);
    stashResult(updated);
    setFixOpen(false);
    setFixText("");
  }

  function save() {
    addToLog({ name: result!.name, calories, protein, cost });
    try {
      sessionStorage.setItem("gz.justLogged", result!.name);
      sessionStorage.removeItem("gz.lastResult"); // drop the photo preview from memory
    } catch {}
    router.push("/");
  }

  return (
    <main className="relative min-h-dvh px-5 pb-8 pt-5">
      {/* photo fading into the background */}
      {result.imageUrl && (
        <div
          className="pointer-events-none absolute inset-x-0 top-0 h-80 bg-cover bg-center opacity-50"
          style={{
            backgroundImage: `url(${result.imageUrl})`,
            maskImage: "linear-gradient(to bottom, black 30%, transparent)",
            WebkitMaskImage: "linear-gradient(to bottom, black 30%, transparent)",
          }}
        />
      )}

      <div className="relative">
        <div className="flex items-center justify-between">
          <button onClick={() => router.push("/")} className="font-mono text-2xl text-text" aria-label="Back">
            ‹
          </button>
          <span className={`font-mono text-sm ${result.confidence === "verified" ? "text-accent" : "text-muted"}`}>
            {result.confidence === "verified" ? "✓ Verified" : "Estimate"}
          </span>
        </div>

        <div className={result.imageUrl ? "mt-44" : "mt-10"}>
          {result.tags.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {result.tags.map((t) => (
                <span key={t} className="rounded-full bg-accent px-4 py-1.5 font-mono text-sm font-bold capitalize text-on-accent">
                  {t}
                </span>
              ))}
            </div>
          )}
          <h1 className="mt-3 font-display text-4xl font-bold text-text">{result.name}</h1>
          {isPackaged && (
            <div className="mt-3 flex items-center gap-3 font-mono text-sm text-muted">
              <span>Servings ({result.servingLabel})</span>
              <button onClick={() => setServings((s) => Math.max(0.5, s - 0.5))} className="h-8 w-8 rounded-full bg-track text-accent">−</button>
              <span className="text-text">{servings}</span>
              <button onClick={() => setServings((s) => s + 0.5)} className="h-8 w-8 rounded-full bg-track text-accent">+</button>
            </div>
          )}
        </div>

        <div className="glass mt-5 flex justify-around rounded-3xl py-5">
          <Ring label="Protein" value={protein} max={target} display={`${protein}g`} />
          <Ring label="Calories" value={calories} max={profile.calorieTarget} display={`${calories}`} />
          <Ring label="Cost" value={cost ?? 0} max={profile.weeklyBudget / 7} display={cost != null ? `$${cost.toFixed(2)}` : "?"} />
        </div>

        <div className="mt-3 flex items-center justify-between px-1 font-mono text-xs text-muted">
          <span>Protein per dollar: <span className="text-accent">{ppd != null ? `${ppd}g` : "add a price"}</span></span>
          <label className="flex items-center gap-1">
            $
            <input
              inputMode="decimal"
              value={priceInput}
              onChange={(e) => setPriceInput(e.target.value)}
              placeholder={result.cost != null ? (result.cost * mult).toFixed(2) : "price"}
              className="w-16 rounded-md bg-track px-2 py-1 text-text placeholder:text-muted focus:outline-none"
            />
          </label>
        </div>

        <div className="glass mt-4 rounded-3xl p-5">
          <div className="flex justify-between font-mono text-sm">
            <span className="text-muted">Today&apos;s protein goal</span>
            <span className="font-bold text-accent">+{protein}g</span>
          </div>
          <div className="relative mt-4 h-2.5 overflow-hidden rounded-full bg-track">
            <div className="absolute inset-y-0 left-0 bg-accent" style={{ width: `${after * 100}%` }} />
            <div className="absolute inset-y-0 left-0 bg-text" style={{ width: `${before * 100}%` }} />
          </div>
          <p className="mt-4 font-body text-sm text-muted">{tip}</p>
        </div>

        {(result.kind === "meal" || result.kind === "product") && (
          <div className="mt-5">
            {!fixOpen ? (
              <button onClick={() => setFixOpen(true)} className="font-mono text-sm text-muted">
                Not quite right?{" "}
                <span className="text-heading underline underline-offset-4">
                  {result.kind === "product" ? "Fix product" : "Fix portions"}
                </span>
              </button>
            ) : (
              <div className="flex gap-2">
                <input
                  autoFocus
                  value={fixText}
                  onChange={(e) => setFixText(e.target.value)}
                  placeholder={result.kind === "product" ? "e.g. it's the BBQ flavor" : "e.g. that's turkey, double rice"}
                  className="glass min-w-0 flex-1 rounded-full px-4 py-3 font-mono text-sm text-text placeholder:text-muted focus:outline-none"
                />
                <button onClick={applyFix} disabled={fixing} className="rounded-full bg-accent px-4 font-mono text-sm font-bold text-on-accent disabled:opacity-50">
                  {fixing ? "…" : "Fix"}
                </button>
              </div>
            )}
          </div>
        )}
        {error && <p className="mt-2 font-mono text-xs text-accent">{error}</p>}

        <div className="mt-8 grid grid-cols-2 gap-3">
          <button onClick={() => router.push("/scan")} className="glass rounded-full py-4 font-display text-lg font-bold text-text">
            Retake
          </button>
          <button onClick={save} className="rounded-full bg-accent py-4 font-display text-lg font-bold text-on-accent">
            Save to log
          </button>
        </div>

        {result.matchedFrom && (
          <p className="mt-3 font-mono text-xs text-muted">Matched from your photo: {result.matchedFrom}</p>
        )}
        {(result.kind === "barcode" || (result.kind === "product" && result.confidence === "verified")) && (
          <p className="mt-6 text-center font-mono text-[10px] text-muted">
            Product data from Open Food Facts (ODbL)
          </p>
        )}
      </div>
    </main>
  );
}
