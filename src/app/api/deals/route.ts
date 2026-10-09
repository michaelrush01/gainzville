import { after } from "next/server";
import { areaFor, noteArea, readDeals, refreshArea } from "@/lib/deals";
import { checkLimit, clientIp } from "@/lib/rate-limit";

// This week's deals near a point. Reading is free (saved deals only). If the area has never
// been checked, or its deals are running out, a refresh runs in the background after we reply.

export const maxDuration = 120;

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as { lat?: number; lng?: number; names?: string[] } | null;
  const lat = Number(body?.lat);
  const lng = Number(body?.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
    return Response.json({ error: "Bad location." }, { status: 400 });
  }
  const area = areaFor(lat, lng);
  const deals = await readDeals(area);

  // Background bookkeeping, at most a few times per visitor per day
  if (checkLimit(`deals:${clientIp(request)}`, 20).ok) {
    const names = (Array.isArray(body?.names) ? body.names : []).filter((n) => typeof n === "string").slice(0, 80);
    after(async () => {
      await noteArea(area, lat, lng, names);
      await refreshArea(area);
    });
  }
  return Response.json({ deals });
}
