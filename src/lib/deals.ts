import "server-only";
import { researchStructured } from "./ai";
import { adminClient } from "./quota";
import { adChain } from "./ad-chains";
import { CHAINS } from "./restaurants";
import type { Deal } from "./types";

// This week's protein deals near the user. A daily job asks Claude to read the public
// weekly ads for the grocery chains in an area (plus promos at nearby restaurant chains)
// and saves what it finds. Users only ever read the saved deals, so cost doesn't grow
// with traffic: it's one research call per area per day.


const RESTAURANT_NAMES = new Set(CHAINS.map((c) => c.name));
const MAX_GROCERY = 5;
const MAX_FOOD = 4;

/** ~50 km grid cell. Weekly ads are regional, so nearby campuses share one set of deals. */
export function areaFor(lat: number, lng: number) {
  return `${Math.round(lat * 2) / 2},${Math.round(lng * 2) / 2}`;
}

export function today() {
  return new Date().toISOString().slice(0, 10);
}

/** Active deals for an area, best protein value first. */
export async function readDeals(area: string): Promise<Deal[]> {
  const db = adminClient();
  if (!db) return [];
  const { data } = await db
    .from("deals")
    .select("chain,item,deal,price_usd,protein_g,valid_to,source_url")
    .eq("area", area)
    .gte("valid_to", today())
    .limit(80);
  const value = (d: Deal) => (d.protein_g && d.price_usd ? d.protein_g / d.price_usd : 0);
  return (data ?? []).sort((a, b) => value(b) - value(a));
}

/** Remember that someone opened the app here (and which chains are nearby). */
export async function noteArea(area: string, lat: number, lng: number, names: string[]) {
  const db = adminClient();
  if (!db) return;
  const grocery = [...new Set(names.map(adChain).filter((c): c is string => Boolean(c)))];
  const food = [...new Set(names.filter((n) => RESTAURANT_NAMES.has(n)))];
  const { data: existing } = await db.from("deal_areas").select("chains,place").eq("area", area).maybeSingle();
  const chains = [...new Set([...(existing?.chains ?? []), ...grocery, ...food])].slice(0, 20);
  const place = existing?.place ?? (await placeName(lat, lng));
  await db.from("deal_areas").upsert({ area, place, chains, last_requested: new Date().toISOString() });
}

/**
 * Refresh one area's deals if they're due and nobody else is already doing it. Returns true if it ran.
 * Weekly ads change once a week, so instead of paying for a search every day we refresh when the
 * current deals are about to run out (that's when the new ad is out) or every 3 days at the latest.
 */
export async function refreshArea(area: string): Promise<boolean> {
  const db = adminClient();
  if (!db) return false;
  const tomorrow = new Date(Date.now() + 86400_000).toISOString().slice(0, 10);
  const { count } = await db.from("deals").select("id", { count: "exact", head: true }).eq("area", area).gte("valid_to", tomorrow);
  const runningOut = !count; // every current deal ends today (or there are none yet)
  const hours = runningOut ? 6 : 72;
  const { data: claimed } = await db.rpc("claim_deal_refresh", { p_area: area, p_hours: hours });
  if (!claimed) return false;

  // Site-wide cap on research calls per day: the kill switch for this feature's API spend
  const { data: allowed } = await db.rpc("use_quota", {
    p_bucket: `deals:area:${area}`,
    p_max: 3,
    p_global: "deals:global",
    p_global_max: 25,
  });
  if (!allowed) {
    await db.from("deal_areas").update({ refreshing_since: null }).eq("area", area);
    return false;
  }

  const { data: row } = await db.from("deal_areas").select("place,chains").eq("area", area).single();
  const chains: string[] = row?.chains ?? [];
  const grocery = chains.filter((c) => !RESTAURANT_NAMES.has(c)).slice(0, MAX_GROCERY);
  const food = chains.filter((c) => RESTAURANT_NAMES.has(c)).slice(0, MAX_FOOD);
  if (!row || (!grocery.length && !food.length)) {
    await db.from("deal_areas").update({ refreshing_since: null, last_refreshed: new Date().toISOString() }).eq("area", area);
    return false;
  }

  try {
    const found = await findDeals(row.place, grocery, food);
    const allowedChains = new Set([...grocery, ...food].map((c) => c.toLowerCase()));
    const t = today();
    const limit = new Date(Date.now() + 21 * 86400_000).toISOString().slice(0, 10);
    const rows = found
      .filter((d) => allowedChains.has(d.chain.toLowerCase()))
      .filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d.valid_to) && d.valid_to >= t && d.valid_to <= limit)
      .map((d) => ({
        area,
        chain: [...grocery, ...food].find((c) => c.toLowerCase() === d.chain.toLowerCase())!,
        item: d.item.slice(0, 120),
        deal: d.deal.slice(0, 80),
        price_usd: d.price_usd != null && d.price_usd > 0 && d.price_usd < 200 ? d.price_usd : null,
        protein_g: d.protein_g != null && d.protein_g > 0 && d.protein_g < 2000 ? d.protein_g : null,
        valid_from: d.valid_from && /^\d{4}-\d{2}-\d{2}$/.test(d.valid_from) ? d.valid_from : null,
        valid_to: d.valid_to,
        source_url: d.source_url && /^https?:\/\//.test(d.source_url) ? d.source_url.slice(0, 500) : null,
      }));
    console.log(`deal refresh ${area}: found ${found.length}, kept ${rows.length}`);
    if (found.length && !rows.length) console.log("deal refresh sample", JSON.stringify(found.slice(0, 3)));
    // Replace this area's deals with the fresh set (keep the old ones if the search found nothing)
    if (rows.length) {
      await db.from("deals").delete().eq("area", area);
      await db.from("deals").insert(rows);
    }
    await db.from("deal_areas").update({ last_refreshed: new Date().toISOString(), refreshing_since: null }).eq("area", area);
    return true;
  } catch (e) {
    console.error("deal refresh failed", area, e instanceof Error ? e.message : e);
    await db.from("deal_areas").update({ refreshing_since: null }).eq("area", area);
    return false;
  }
}

/** Areas someone opened in the last week whose deals are due. Used by the daily job. */
export async function dueAreas(): Promise<string[]> {
  const db = adminClient();
  if (!db) return [];
  const week = new Date(Date.now() - 7 * 86400_000).toISOString();
  const { data } = await db.from("deal_areas").select("area").gte("last_requested", week).limit(20);
  return (data ?? []).map((r) => r.area);
}

type Found = Deal & { valid_from: string | null };

async function findDeals(place: string, grocery: string[], food: string[]): Promise<Found[]> {
  const t = today();
  const { result } = await researchStructured<{ deals: Found[] }>({
    model: "chat",
    maxSearches: 8,
    maxFetches: 6,
    system: `You find current deals on high-protein foods for college students on a budget. Today is ${t}.
Sources: each chain's official weekly ad or deals page first; well-known deal sites that list the current weekly ad item by item are fine as a backup. Search for each grocery chain's current weekly ad, then open (fetch) the best page for each chain and read the full list, so you don't miss deals that search snippets leave out. Never invent a deal: include only deals you saw in a source this week, with that source's URL.
High-protein foods: chicken, turkey, beef, pork, fish, tuna, eggs, Greek yogurt, cottage cheese, milk, cheese, tofu, tempeh, beans, lentils, edamame, protein bars, shakes, protein powder, jerky, peanut butter, nuts.
For each deal give: chain (exactly as given), item, deal (short, e.g. "BOGO", "$1.99/lb", "2 for $5"), price_usd (what you pay for the quantity the deal covers, null if unclear), protein_g (approximate total protein in that quantity, null if unsure), valid_from and valid_to (YYYY-MM-DD; weekly ads usually run 7 days), source_url.
Aim for 4-8 deals per grocery chain, best protein per dollar first. Restaurant promos are optional: include one only if you find a current, specific offer. Skip deals that already ended.`,
    prompt: `Area: ${place}.
Grocery chains (weekly ad deals on protein foods): ${grocery.join(", ") || "none"}.
Restaurant chains (current promotions or app deals usable in this area, e.g. student or game-day offers, BOGO entrées): ${food.join(", ") || "none"}.`,
    schema: {
      type: "object",
      additionalProperties: false,
      required: ["deals"],
      properties: {
        deals: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            required: ["chain", "item", "deal", "price_usd", "protein_g", "valid_from", "valid_to", "source_url"],
            properties: {
              chain: { type: "string" },
              item: { type: "string" },
              deal: { type: "string" },
              price_usd: { type: ["number", "null"] },
              protein_g: { type: ["number", "null"] },
              valid_from: { type: ["string", "null"] },
              valid_to: { type: "string" },
              source_url: { type: ["string", "null"] },
            },
          },
        },
      },
    },
  });
  return result.deals ?? [];
}

async function placeName(lat: number, lng: number) {
  try {
    const res = await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=jsonv2&zoom=10`, {
      headers: { "User-Agent": "Gainzville/0.1 (student project)" },
      signal: AbortSignal.timeout(5000),
    });
    const a = (await res.json())?.address ?? {};
    const city = a.city || a.town || a.village || a.county;
    return [city, a.state].filter(Boolean).join(", ") || `${lat.toFixed(1)}, ${lng.toFixed(1)}`;
  } catch {
    return `${lat.toFixed(1)}, ${lng.toFixed(1)}`;
  }
}
