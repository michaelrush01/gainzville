import { storeTier, type Store } from "@/lib/places";

// Nearby grocery stores from OpenStreetMap (free, ODbL).
// Tries the Overpass API first, falls back to Nominatim when Overpass is busy.
// Results are cached per ~1 km area so we stay polite to both services.

const UA = "Gainzville/0.1 (student project)";
const RADIUS_M = 3000;
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

  const stores = (await fromOverpass(lat, lng)) ?? (await fromNominatim(lat, lng)) ?? [];
  if (stores.length) cache.set(key, { at: Date.now(), stores });
  return Response.json(
    { stores },
    { headers: { "Cache-Control": stores.length ? "public, s-maxage=86400" : "no-store" } },
  );
}

async function fromOverpass(lat: number, lng: number): Promise<Store[] | null> {
  const query = `[out:json][timeout:8];nwr["shop"~"^(supermarket|wholesale|greengrocer)$"](around:${RADIUS_M},${lat},${lng});out center 40;`;
  try {
    const res = await fetch("https://overpass-api.de/api/interpreter", {
      method: "POST",
      headers: { "User-Agent": UA, "Content-Type": "application/x-www-form-urlencoded" },
      body: `data=${encodeURIComponent(query)}`,
      signal: AbortSignal.timeout(9000),
    });
    if (!res.ok) return null;
    const data = await res.json().catch(() => null);
    if (!data?.elements) return null;
    const stores: Store[] = [];
    for (const el of data.elements) {
      const name = el.tags?.name || el.tags?.brand;
      const pLat = el.lat ?? el.center?.lat;
      const pLng = el.lon ?? el.center?.lon;
      if (!name || pLat == null) continue;
      stores.push({ id: `osm-${el.type}-${el.id}`, name, lat: pLat, lng: pLng, tier: storeTier(name) });
    }
    return stores.length ? stores : null;
  } catch {
    return null;
  }
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
  return stores.length ? stores : null;
}
