import { after } from "next/server";
import { storeTier, type Store } from "@/lib/places";
import { adminClient } from "@/lib/quota";
import { CHAIN_PATTERN, chainFor } from "@/lib/restaurants";

// Nearby grocery stores and protein-friendly restaurant chains from OpenStreetMap (free, ODbL).
// Asks several Overpass servers at once and uses whichever answers first (the main one
// can take 15+ seconds when busy). Falls back to Nominatim if both fail.
// Results are saved per ~1 km area in our database (and in memory), so after one good answer
// the map no longer depends on these free services; stale lists refresh in the background.

export const maxDuration = 60;

const UA = "Gainzville/0.1 (student project)";
const RADIUS_M = 6000; // a short drive: big-box stores like Trader Joe's are rarely right on campus
const MAX_STORES = 45;
const MAX_FOOD = 20;
// Public Overpass mirrors; we race them and take the first good answer (any one can be overloaded)
const OVERPASS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
  "https://overpass.private.coffee/api/interpreter",
  "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
];
const cache = new Map<string, { at: number; stores: Store[] }>();
const DAY = 24 * 60 * 60 * 1000;

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const lat = Number(params.get("lat"));
  const lng = Number(params.get("lng"));
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
    return Response.json({ error: "Bad location." }, { status: 400 });
  }

  const key = `${lat.toFixed(2)},${lng.toFixed(2)}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < DAY) return Response.json({ stores: hit.stores });

  // 1) A full list we saved earlier: serve it now, refresh it in the background if it's getting old
  const saved = await readSaved(key);
  if (saved?.full) {
    const age = Date.now() - saved.at;
    if (age > DAY) after(() => refresh(key, lat, lng));
    cache.set(key, { at: Date.now(), stores: saved.stores });
    return Response.json({ stores: saved.stores }, { headers: { "Cache-Control": "public, s-maxage=3600" } });
  }

  // 2) Nothing good saved yet: ask OpenStreetMap now
  const full = await fromOverpass(lat, lng, 25000);
  if (full) {
    cache.set(key, { at: Date.now(), stores: full });
    after(() => save(key, full, true));
    return Response.json({ stores: full }, { headers: { "Cache-Control": "public, s-maxage=86400" } });
  }

  // 3) OpenStreetMap is busy: keep trying in the background (with more patience), and meanwhile
  // show a grocery-only list from the backup source so the map isn't empty
  after(() => refresh(key, lat, lng));
  if (saved) return Response.json({ stores: saved.stores, partial: true }, { headers: { "Cache-Control": "no-store" } });
  const partial = await fromNominatim(lat, lng);
  // Every source failed: say so, so the app can offer a retry instead of "no stores"
  if (!partial) return Response.json({ stores: [], error: "Store data is busy." }, { status: 503, headers: { "Cache-Control": "no-store" } });
  after(() => save(key, partial, false));
  return Response.json({ stores: partial, partial: true }, { headers: { "Cache-Control": "no-store" } });
}

async function readSaved(key: string): Promise<{ stores: Store[]; full: boolean; at: number } | null> {
  const db = adminClient();
  if (!db) return null;
  const { data } = await db.from("store_cache").select("stores,full_list,updated_at").eq("key", key).maybeSingle();
  return data ? { stores: data.stores as Store[], full: data.full_list, at: new Date(data.updated_at).getTime() } : null;
}

async function save(key: string, stores: Store[], full: boolean) {
  const db = adminClient();
  if (!db || !stores.length) return;
  if (!full) {
    // never replace a full list with a grocery-only one
    const { data } = await db.from("store_cache").select("full_list").eq("key", key).maybeSingle();
    if (data?.full_list) return;
  }
  await db.from("store_cache").upsert({ key, stores, full_list: full, updated_at: new Date().toISOString() });
}

const refreshing = new Set<string>();
/** Background retry with a longer timeout; saves the full list once OpenStreetMap answers. */
async function refresh(key: string, lat: number, lng: number) {
  if (refreshing.has(key)) return; // one retry per area at a time
  refreshing.add(key);
  try {
    const full = await fromOverpass(lat, lng, 50000);
    if (!full) return;
    cache.set(key, { at: Date.now(), stores: full });
    await save(key, full, true);
  } finally {
    refreshing.delete(key);
  }
}

async function fromOverpass(lat: number, lng: number, timeoutMs: number): Promise<Store[] | null> {
  const around = `(around:${RADIUS_M},${lat},${lng})`;
  const food = `["amenity"~"^(fast_food|restaurant)$"]`;
  const query = `[out:json][timeout:${Math.round(timeoutMs / 1000)}];(nwr["shop"~"^(supermarket|wholesale|greengrocer)$"]${around};nwr${food}["brand"~"^(${CHAIN_PATTERN})",i]${around};nwr${food}["name"~"^(${CHAIN_PATTERN})",i]${around};);out center tags;`;
  const ask = async (url: string) => {
    const res = await fetch(url, {
      method: "POST",
      headers: { "User-Agent": UA, "Content-Type": "application/x-www-form-urlencoded" },
      body: `data=${encodeURIComponent(query)}`,
      signal: AbortSignal.timeout(timeoutMs),
    });
    const data = res.ok ? await res.json().catch(() => null) : null;
    if (!data?.elements) throw new Error("no data");
    return data.elements as OverpassElement[];
  };
  try {
    const elements = await Promise.any(OVERPASS.map(ask));
    const groceries: Store[] = [];
    const restaurants: Store[] = [];
    for (const el of elements) {
      const name = el.tags?.name || el.tags?.brand;
      const pLat = el.lat ?? el.center?.lat;
      const pLng = el.lon ?? el.center?.lon;
      if (!name || pLat == null || pLng == null) continue;
      const base = { id: `osm-${el.type}-${el.id}`, lat: pLat, lng: pLng };
      if (el.tags?.shop) {
        groceries.push({ ...base, name, tier: storeTier(name), kind: "grocery" });
        continue;
      }
      const chain = chainFor(el.tags?.brand || name) ?? chainFor(name);
      if (chain) restaurants.push({ ...base, name: chain.name, tier: "standard", kind: "food", chain: chain.key });
    }
    if (!groceries.length) return null;
    // Up to 2 locations per chain, so the map shows variety instead of five Subways
    const perChain = new Map<string, number>();
    const food = nearest(restaurants, lat, lng).filter((r) => {
      const n = (perChain.get(r.chain!) ?? 0) + 1;
      perChain.set(r.chain!, n);
      return n <= 2;
    });
    return [...nearest(groceries, lat, lng), ...food.slice(0, MAX_FOOD)];
  } catch {
    return null;
  }
}

type OverpassElement = {
  type: string;
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
};

/** Closest first, capped so dense cities don't bury the map in pins. */
function nearest(stores: Store[], lat: number, lng: number) {
  const d = (s: Store) => Math.hypot(s.lat - lat, (s.lng - lng) * Math.cos((lat * Math.PI) / 180));
  return stores.sort((a, b) => d(a) - d(b)).slice(0, MAX_STORES);
}

async function fromNominatim(lat: number, lng: number): Promise<Store[] | null> {
  // ~3 km box around the point
  const dLat = RADIUS_M / 111_000;
  const dLng = RADIUS_M / (111_000 * Math.cos((lat * Math.PI) / 180));
  const viewbox = [lng - dLng, lat + dLat, lng + dLng, lat - dLat].join(",");
  const seen = new Set<string>();
  const stores: Store[] = [];
  // Nominatim asks for at most one request per second
  for (const [i, q] of ["supermarket", "wholesale"].entries()) {
    if (i > 0) await new Promise((r) => setTimeout(r, 1100));
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?q=${q}&format=jsonv2&limit=40&bounded=1&viewbox=${viewbox}`,
        { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(6000) },
      );
      if (!res.ok) continue;
      for (const p of await res.json()) {
        const id = `osm-${p.osm_type}-${p.osm_id}`;
        if (!p.name || seen.has(id)) continue;
        seen.add(id);
        stores.push({ id, name: p.name, lat: Number(p.lat), lng: Number(p.lon), tier: storeTier(p.name), kind: "grocery" });
      }
    } catch {
      /* try the next query */
    }
  }
  return stores.length ? nearest(stores, lat, lng) : null;
}
