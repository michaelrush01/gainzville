"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ChatBar } from "@/components/ChatBar";
import { GridMap } from "@/components/GridMap";
import { Ring } from "@/components/Ring";
import { locationCenter, locationLabel, type Store } from "@/lib/places";
import { getProfile, todayTotals } from "@/lib/profile";
import type { Profile } from "@/lib/types";

// The map library is large, so it loads separately from the rest of the page.
const StoreMap = dynamic(() => import("@/components/StoreMap").then((m) => m.StoreMap), { ssr: false });

// Rendered in the browser only (see app/page.tsx), so saved data can be read directly.
export default function HomeView() {
  const router = useRouter();
  const profile = getProfile();

  // First visit: send new users through onboarding
  useEffect(() => {
    if (!profile.onboarded) router.replace("/onboarding");
  }, [profile.onboarded, router]);
  if (!profile.onboarded) return null;

  return <Home profile={profile} />;
}

function Home({ profile }: { profile: Profile }) {
  const totals = todayTotals();
  const center = useMemo(() => locationCenter(profile.location), [profile.location]);
  const [stores, setStores] = useState<Store[]>([]);
  const [budgetOnly, setBudgetOnly] = useState(false);
  const [selected, setSelected] = useState<Store | null>(null);
  const [loading, setLoading] = useState(Boolean(center));

  useEffect(() => {
    if (!center) return;
    let cancelled = false;
    fetch(`/api/stores?lat=${center.lat}&lng=${center.lng}`)
      .then((r) => r.json())
      .then((d) => !cancelled && setStores(d.stores ?? []))
      .catch(() => {})
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [center]);

  const shown = budgetOnly ? stores.filter((s) => s.tier === "budget") : stores;
  const onSelect = useCallback((s: Store) => setSelected(s), []);
  const dailyBudget = profile.weeklyBudget / 7;

  return (
    <main className="relative flex h-dvh flex-col">
      <header className="absolute left-5 top-5 z-10">
        <h1 className="glitch font-display text-3xl font-bold text-text">
          Gainz<span className="text-accent">ville</span>
        </h1>
        {center && (
          <div className="mt-2 flex gap-2">
            <Link href="/onboarding" className="glass rounded-full px-3 py-1 font-mono text-[11px] text-heading">
              ◎ {locationLabel(profile.location)}
            </Link>
            <button
              onClick={() => setBudgetOnly((b) => !b)}
              className={`rounded-full px-3 py-1 font-mono text-[11px] ${budgetOnly ? "bg-accent font-bold text-on-accent" : "glass text-heading"}`}
            >
              $ Budget
            </button>
          </div>
        )}
      </header>

      <div className="relative flex-1">
        {center ? (
          <StoreMap center={center} stores={shown} showUser={profile.location?.type === "point"} highlightId={selected?.id} onSelect={onSelect} />
        ) : (
          <>
            <GridMap />
            <Link href="/onboarding" className="glass absolute inset-x-8 top-1/3 rounded-3xl p-5 text-center font-mono text-sm text-heading">
              Set your location to see stores near you →
            </Link>
          </>
        )}
        {loading && (
          <p className="glass absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full px-4 py-1.5 font-mono text-xs text-muted">
            Finding stores near you…
          </p>
        )}
        {!loading && center && stores.length === 0 && (
          <p className="glass absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full px-4 py-1.5 font-mono text-xs text-muted">
            No grocery stores found nearby yet
          </p>
        )}
      </div>

      <div className="relative z-10 space-y-4 px-4 pb-6">
        {selected && (
          <div className="glass flex items-center justify-between rounded-3xl px-5 py-3">
            <div>
              <p className="font-display text-lg font-bold text-text">{selected.name}</p>
              <p className="font-mono text-xs text-muted">
                {selected.tier === "budget" ? "Budget pick for protein" : selected.tier === "premium" ? "Pricier, good for specialty items" : "Standard prices"}
              </p>
            </div>
            <a
              href={`https://www.google.com/maps/dir/?api=1&destination=${selected.lat},${selected.lng}`}
              target="_blank"
              rel="noreferrer"
              className="rounded-full bg-accent px-4 py-2 font-mono text-xs font-bold text-on-accent"
            >
              Directions
            </a>
          </div>
        )}
        <div className="glass flex justify-around rounded-3xl py-4">
          <Ring label="Protein" value={totals.protein} max={profile.proteinTarget} display={`${Math.round(totals.protein)}g`} />
          <Ring label="Calories" value={totals.calories} max={profile.calorieTarget} display={`${Math.round(totals.calories)}`} />
          <Ring label="Budget" value={totals.spent} max={dailyBudget} display={`$${totals.spent.toFixed(0)}`} />
        </div>
        <ChatBar />
        <div className="flex justify-center gap-6 font-mono text-xs text-muted">
          <Link href="/onboarding" className="underline-offset-4 hover:underline">Edit my plan</Link>
          <Link href="/about" className="underline-offset-4 hover:underline">Why Gainzville exists</Link>
        </div>
      </div>
    </main>
  );
}
