"use client";

import { ChatBar } from "@/components/ChatBar";
import { GridMap } from "@/components/GridMap";
import { Ring } from "@/components/Ring";
import { getProfile, todayTotals } from "@/lib/profile";

// Rendered in the browser only (see app/page.tsx), so saved data can be read directly.
export default function HomeView() {
  const profile = getProfile();
  const totals = todayTotals();

  const dailyBudget = profile.weeklyBudget / 7;

  return (
    <main className="relative flex h-dvh flex-col">
      <header className="absolute left-5 top-5 z-10">
        <h1 className="glitch font-display text-3xl font-bold text-text">
          Gainz<span className="text-accent">ville</span>
        </h1>
      </header>

      <div className="flex-1">
        <GridMap />
      </div>

      <div className="relative z-10 space-y-4 px-4 pb-6">
        <div className="glass flex justify-around rounded-3xl py-4">
          <Ring label="Protein" value={totals.protein} max={profile.proteinTarget} display={`${Math.round(totals.protein)}g`} />
          <Ring label="Calories" value={totals.calories} max={profile.calorieTarget} display={`${Math.round(totals.calories)}`} />
          <Ring label="Budget" value={totals.spent} max={dailyBudget} display={`$${totals.spent.toFixed(0)}`} />
        </div>
        <ChatBar />
        <a href="/about" className="block text-center font-mono text-xs text-muted underline-offset-4 hover:underline">
          Why Gainzville exists
        </a>
      </div>
    </main>
  );
}
