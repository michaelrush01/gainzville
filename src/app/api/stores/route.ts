import { storeTier, type Store } from "@/lib/places";

// Nearby grocery stores from OpenStreetMap (free, ODbL).
// Asks two Overpass servers at once and uses whichever answers first (the main one
// can take 15+ seconds when busy). Falls back to Nominatim if both fail.
// Results are cached per ~1 km area so we stay polite to these free services.

export const maxDuration = 30;

const UA = "Gainzville/0.1 (student project)";
const RADIUS_M = 6000; // a short drive: big-box stores like Trader Joe's are rarely right on campus
const MAX_STORES = 45;
const OVERPASS = ["https://overpass-api.de/api/interpreter", "https://overpass.kumi.systems/api/interpreter"];
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

  const stores = (await fromOverpass(lat, lng)) ?? (await fromNominatim(lat, lng));
  // Every source failed: say so, so the app can offer a retry instead of "no stores"
  if (!stores) return Response.json({ stores: [], error: "Store data is busy." }, { status: 503, headers: { "Cache-Control": "no-store" } });
  cache.set(key, { at: Date.now(), stores });
  return Response.json({ stores }, { headers: { "Cache-Control": "public, s-maxage=86400" } });
}

async function fromOverpass(lat: number, lng: number): Promise<Store[] | null> {
  const query = `[out:json][timeout:20];nwr["shop"~"^(supermarket|wholesale|greengrocer)$"](around:${RADIUS_M},${lat},${lng});out center tags;`;
  const ask = async (url: string) => {
    const res = await fetch(url, {
      method: "POST",
      headers: { "User-Agent": UA, "Content-Type": "application/x-www-form-urlencoded" },
      body: `data=${encodeURIComponent(query)}`,
      signal: AbortSignal.timeout(22000),
    });
    const data = res.ok ? await res.json().catch(() => null) : null;
    if (!data?.elements) throw new Error("no data");
    return data.elements as OverpassElement[];
  };
  try {
    const elements = await Promise.any(OVERPASS.map(ask));
    const stores: Store[] = [];
    for (const el of elements) {
      const name = el.tags?.name || el.tags?.brand;
      const pLat = el.lat ?? el.center?.lat;
      const pLng = el.lon ?? el.center?.lon;
      if (!name || pLat == null || pLng == null) continue;
      stores.push({ id: `osm-${el.type}-${el.id}`, name, lat: pLat, lng: pLng, tier: storeTier(name) });
    }
    return stores.length ? nearest(stores, lat, lng) : null;
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
        stores.push({ id, name: p.name, lat: Number(p.lat), lng: Number(p.lon), tier: storeTier(p.name) });
      }
    } catch {
      /* try the next query */
    }
  }
  return stores.length ? nearest(stores, lat, lng) : null;
}
