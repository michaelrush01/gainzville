"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { CoachChat } from "@/components/CoachChat";
import { DealLine, DealsPanel } from "@/components/DealsPanel";
import { GridMap } from "@/components/GridMap";
import { Ring } from "@/components/Ring";
import { adChain } from "@/lib/ad-chains";
import { getCoarsePosition } from "@/lib/geo";
import { locationCenter, locationLabel, type Store } from "@/lib/places";
import { getProfile, saveProfile, todayTotals } from "@/lib/profile";
import { supabase, supabaseConfigured } from "@/lib/supabase";
import { chainByKey, gramsPerDollar } from "@/lib/restaurants";
import type { Deal, Profile } from "@/lib/types";

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

function Home({ profile: initial }: { profile: Profile }) {
  const [profile, setProfile] = useState(initial);
  const [totals] = useState(todayTotals);
  const center = useMemo(() => locationCenter(profile.location), [profile.location]);
  const [stores, setStores] = useState<Store[]>([]);
  const [budgetOnly, setBudgetOnly] = useState(false);
  const [showFood, setShowFood] = useState(true);
  const [selected, setSelected] = useState<Store | null>(null);
  const [loading, setLoading] = useState(Boolean(center));
  const [storeError, setStoreError] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!center) return;
    let cancelled = false;
    // Show the stores we saw here last time right away, then refresh them in the background
    const cacheKey = `gz.stores:${center.lat.toFixed(2)},${center.lng.toFixed(2)}`;
    let hadCache = false;
    let saved: { at: number; stores: Store[] } | null = null;
    try {
      saved = JSON.parse(localStorage.getItem(cacheKey) ?? "null");
    } catch {
      /* storage unavailable */
    }
    if (saved?.stores?.length && Date.now() - saved.at < 7 * 86400_000) {
      hadCache = true;
      const cached = saved.stores;
      queueMicrotask(() => {
        if (cancelled) return;
        setStores(cached);
        setLoading(false);
      });
    }
    // Free map data servers are sometimes slow or busy, so try twice before giving up
    const get = () => fetch(`/api/stores?lat=${center.lat}&lng=${center.lng}`).then((r) => r.json());
    get()
      .then((d) => (d.stores?.length ? d : get()))
      .then((d) => {
        if (cancelled) return;
        if (d.stores?.length) {
          setStores(d.stores);
          // Don't remember a partial list (grocery only, no restaurants); next visit should try for the full one
          if (d.partial) return;
          try {
            localStorage.setItem(cacheKey, JSON.stringify({ at: Date.now(), stores: d.stores }));
          } catch {
            /* storage full or unavailable */
          }
        }
        if (!hadCache) setStoreError(Boolean(d.error) || !d.stores?.length);
      })
      .catch(() => !cancelled && !hadCache && setStoreError(true))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [center, attempt]);

  // This week's deals for the chains around here. Saved deals load right away (a quick read);
  // once the nearby stores are known we send their names so the area gets researched if needed,
  // then check back a few times in case a fresh search is filling it in.
  const [deals, setDeals] = useState<Deal[]>([]);
  const [dealsOpen, setDealsOpen] = useState(false);
  const storesReady = stores.length > 0;
  useEffect(() => {
    if (!center) return;
    let cancelled = false;
    const ask = (names: string[]) =>
      fetch("/api/deals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lat: center.lat, lng: center.lng, names }),
      })
        .then((r) => r.json())
        .then((d) => {
          if (!cancelled && d.deals?.length) setDeals(d.deals);
          return (d.deals ?? []) as Deal[];
        })
        .catch(() => [] as Deal[]);
    if (!storesReady) {
      ask([]); // instant: whatever is already saved for this area
      return () => {
        cancelled = true;
      };
    }
    let tries = 0;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      const found = await ask([...new Set(stores.map((s) => s.name))]);
      if (!cancelled && !found.length && ++tries < 8) timer = setTimeout(poll, 20000);
    };
    poll();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
    // Only when the place changes or its stores first arrive, not on every store list update
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [center, storesReady]);
  const chainOf = useCallback((s: Store) => (s.kind === "food" ? s.name : adChain(s.name)), []);
  // Per store: how many deals, and the best one (deals arrive sorted best protein per dollar first)
  const dealCounts = useMemo(() => {
    const byChain = new Map<string, { n: number; best: Deal }>();
    for (const d of deals) {
      const cur = byChain.get(d.chain);
      byChain.set(d.chain, { n: (cur?.n ?? 0) + 1, best: cur?.best ?? d });
    }
    // Spell the deal out on the closest location of each chain; other locations just get a short tag,
    // so eight Publixes don't all repeat the same long label
    const out: Record<string, { n: number; best: string }> = {};
    const labeled = new Set<string>();
    const near = center ? [...stores].sort((a, b) => dist(a, center) - dist(b, center)) : stores;
    for (const s of near) {
      const chain = chainOf(s) ?? "";
      const hit = byChain.get(chain);
      if (!hit) continue;
      const first = !labeled.has(chain);
      labeled.add(chain);
      out[s.id] = { n: hit.n, best: first ? shortDeal(hit.best) : dealTag(hit.best) };
    }
    return out;
  }, [deals, stores, chainOf, center]);

  function retryStores() {
    setStoreError(false);
    setLoading(true);
    setAttempt((a) => a + 1);
  }

  // "Saved" confirmation after logging a food from the result screen
  const [justLogged, setJustLogged] = useState<string | null>(() => {
    try {
      return sessionStorage.getItem("gz.justLogged");
    } catch {
      return null;
    }
  });
  useEffect(() => {
    if (!justLogged) return;
    try {
      sessionStorage.removeItem("gz.justLogged");
    } catch {}
    const t = setTimeout(() => setJustLogged(null), 3000);
    return () => clearTimeout(t);
  }, [justLogged]);

  const [chatOpen, setChatOpen] = useState(false);
  const [locating, setLocating] = useState(false);
  const [locError, setLocError] = useState<string | null>(null);

  async function locateMe() {
    setLocating(true);
    setLocError(null);
    const r = await getCoarsePosition();
    setLocating(false);
    if (!r.ok) return setLocError(r.message);
    const updated = { ...profile, location: { type: "point" as const, lat: r.lat, lng: r.lng } };
    saveProfile(updated);
    setLoading(true);
    setStoreError(false);
    setSelected(null);
    setStores([]);
    setProfile(updated);
  }
  // If the user already allowed location, quietly refresh it on open so the map
  // follows them (e.g. home for the weekend) without pressing ◎. ZIP/campus picks are left alone.
  useEffect(() => {
    if (initial.location?.type !== "point" || !navigator.permissions) return;
    let cancelled = false;
    navigator.permissions
      .query({ name: "geolocation" })
      .then(async (perm) => {
        if (perm.state !== "granted") return;
        const r = await getCoarsePosition();
        const prev = initial.location;
        if (cancelled || !r.ok || prev?.type !== "point") return;
        if (Math.abs(r.lat - prev.lat) < 0.005 && Math.abs(r.lng - prev.lng) < 0.005) return;
        const updated = { ...initial, location: { type: "point" as const, lat: r.lat, lng: r.lng } };
        saveProfile(updated);
        setSelected(null);
        setStores([]);
        setLoading(true);
        setProfile(updated);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [initial]);

  const [signedIn, setSignedIn] = useState(false);
  useEffect(() => {
    if (!supabaseConfigured()) return;
    supabase()
      .auth.getSession()
      .then(({ data }) => setSignedIn(Boolean(data.session)));
  }, []);

  const shown = stores.filter((s) => (s.kind === "food" ? showFood : !budgetOnly || s.tier === "budget"));
  const selectedChain = selected?.kind === "food" ? chainByKey(selected.chain) : undefined;
  const selectedDeals = selected ? deals.filter((d) => d.chain === chainOf(selected)).slice(0, 2) : [];
  const onSelect = useCallback((s: Store) => setSelected(s), []);

  // Coach actions
  const applyPlan = useCallback(
    (change: Partial<Profile> & { summary?: string }) => {
      const { summary: _summary, ...fields } = change;
      void _summary;
      const updated = { ...profile, ...fields };
      saveProfile(updated);
      setProfile(updated);
    },
    [profile],
  );
  const highlight = useCallback(
    (ids: string[]) => {
      const first = stores.find((s) => s.id === ids[0]);
      if (first) {
        setBudgetOnly(false);
        setShowFood(true);
        setSelected(first);
      }
    },
    [stores],
  );
  const dailyBudget = profile.weeklyBudget / 7;

  return (
    <main className="relative flex h-dvh flex-col overflow-hidden">
      <header className="pointer-events-none absolute inset-x-0 top-5 z-10 pl-5">
        <h1 className="glitch font-display text-3xl font-bold text-text">
          Gainz<span className="text-accent">ville</span>
        </h1>
        {center && (
          <div className="pointer-events-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden mt-2 flex gap-2 overflow-x-auto pr-5 [&>*]:shrink-0 [&>*]:whitespace-nowrap">
            <Link href="/onboarding?step=location" className="glass rounded-full px-3 py-1 font-mono text-[11px] text-heading">
              ◎ <span className="inline-block max-w-[9rem] truncate align-bottom">{locationLabel(profile.location)}</span>
            </Link>
            <button
              onClick={() => setBudgetOnly((b) => !b)}
              className={`rounded-full px-3 py-1 font-mono text-[11px] ${budgetOnly ? "bg-accent font-bold text-on-accent" : "glass text-heading"}`}
            >
              $ Budget
            </button>
            <button
              onClick={() => setShowFood((f) => !f)}
              className={`rounded-full px-3 py-1 font-mono text-[11px] ${showFood ? "bg-food font-bold text-on-accent" : "glass text-heading"}`}
            >
              Food
            </button>
            <button
              onClick={() => setDealsOpen((o) => !o)}
              className={`rounded-full px-3 py-1 font-mono text-[11px] ${dealsOpen ? "bg-accent font-bold text-on-accent" : "glass text-heading"}`}
            >
              Deals{deals.length ? ` · ${deals.length}` : ""}
            </button>
          </div>
        )}
      </header>

      <div className="relative min-h-[24dvh] flex-1">
        {center ? (
          <StoreMap center={center} stores={shown} dealCounts={dealCounts} showUser={profile.location?.type === "point"} highlightId={selected?.id} onSelect={onSelect} />
        ) : (
          <>
            <GridMap />
            <Link href="/onboarding?step=location" className="glass absolute inset-x-8 top-1/3 rounded-3xl p-5 text-center font-mono text-sm text-heading">
              Set your location to see stores near you →
            </Link>
          </>
        )}
        <button
          onClick={locateMe}
          aria-label="Use my location"
          className="glass absolute bottom-12 right-4 z-10 flex h-11 w-11 items-center justify-center rounded-full font-mono text-lg text-heading"
        >
          {locating ? <span className="animate-pulse">…</span> : "◎"}
        </button>
        {justLogged && (
          <p role="status" className="absolute inset-x-4 top-28 z-20 mx-auto max-w-sm truncate rounded-full bg-accent px-4 py-2 text-center font-mono text-xs font-bold text-on-accent">
            ✓ Saved {justLogged}
          </p>
        )}
        {locError && (
          <div className="glass absolute inset-x-4 bottom-12 z-20 rounded-2xl p-4 pr-10">
            <p className="font-mono text-xs leading-relaxed text-heading">{locError}</p>
            <Link href="/onboarding?step=location" className="mt-2 inline-block font-mono text-xs text-accent underline underline-offset-4">
              Enter a ZIP instead
            </Link>
            <button onClick={() => setLocError(null)} aria-label="Dismiss" className="absolute right-3 top-3 font-mono text-sm text-muted">
              ✕
            </button>
          </div>
        )}
        {loading && (
          <p className="glass absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full px-4 py-1.5 font-mono text-xs text-muted">
            Finding stores near you…
          </p>
        )}
        {!loading && center && storeError && (
          <button
            onClick={retryStores}
            className="glass absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full px-4 py-1.5 font-mono text-xs text-heading"
          >
            Couldn&apos;t load stores · <span className="text-accent underline underline-offset-4">Try again</span>
          </button>
        )}
        {!loading && center && !storeError && stores.length === 0 && (
          <p className="glass absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full px-4 py-1.5 font-mono text-xs text-muted">
            No grocery stores found nearby yet
          </p>
        )}
      </div>

      <div className="relative z-10 space-y-4 px-4 pb-6">
        {selected && (
          <div className="glass rounded-3xl px-5 py-3">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="font-display text-lg font-bold text-text">{selected.name}</p>
              {selectedChain ? (
                <>
                  <p className="font-mono text-xs text-heading">{selectedChain.order}</p>
                  <p className="font-mono text-xs text-muted">
                    ≈{selectedChain.protein}g protein · ~${selectedChain.price} · {gramsPerDollar(selectedChain).toFixed(1)}g per $
                  </p>
                </>
              ) : (
                <p className="font-mono text-xs text-muted">
                  {selected.tier === "budget" ? "Budget pick for protein" : selected.tier === "premium" ? "Pricier, good for specialty items" : "Standard prices"}
                </p>
              )}
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
          {selectedDeals.length > 0 && (
            <ul className="mt-3 space-y-2 border-t border-white/10 pt-3">
              {selectedDeals.map((d, i) => (
                <DealLine key={i} d={d} showChain={false} />
              ))}
            </ul>
          )}
          </div>
        )}
        {dealsOpen && center && <DealsPanel deals={deals} center={center} onClose={() => setDealsOpen(false)} />}
        <div className={`glass flex justify-around rounded-3xl py-4 ${chatOpen || dealsOpen ? "hidden" : ""}`}>
          <Ring label="Protein" value={totals.protein} max={profile.proteinTarget} display={`${Math.round(totals.protein)}g`} />
          <Ring label="Calories" value={totals.calories} max={profile.calorieTarget} display={`${Math.round(totals.calories)}`} />
          <Ring label="Budget" value={totals.spent} max={dailyBudget} display={`$${totals.spent.toFixed(0)}`} />
        </div>
        <CoachChat
          profile={profile}
          today={totals}
          stores={stores}
          place={locationLabel(profile.location)}
          center={center}
          onApplyPlan={applyPlan}
          onHighlight={highlight}
          onOpenChange={setChatOpen}
        />
        <div className="flex justify-center gap-6 font-mono text-xs text-muted">
          <Link href="/account" className="underline-offset-4 hover:underline">{signedIn ? "✓ Account" : "Save progress"}</Link>
          <Link href="/onboarding" className="underline-offset-4 hover:underline">My plan</Link>
          <Link href="/about" className="underline-offset-4 hover:underline">About</Link>
        </div>
      </div>
    </main>
  );
}

/** "BOGO · chicken breast" style text that fits on a map pin. */
function shortDeal(d: Deal) {
  const strip = (t: string) => t.replace(/\s*\(.*?\)/g, "").split(/,| - /)[0].trim();
  const text = `${strip(d.deal)} · ${strip(d.item)}`;
  return text.length > 26 ? `${text.slice(0, 25)}…` : text;
}

/** Just the deal itself ("BOGO", "$1.99/lb") for the other locations of a chain. */
function dealTag(d: Deal) {
  const t = d.deal.replace(/\s*\(.*?\)/g, "").split(/,| - /)[0].trim();
  return t.length > 14 ? `${t.slice(0, 13)}…` : t;
}

function dist(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  return Math.hypot(a.lat - b.lat, (a.lng - b.lng) * Math.cos((b.lat * Math.PI) / 180));
}
