import { dueAreas, refreshArea } from "@/lib/deals";

// Runs once a day (see vercel.json). Refreshes areas someone opened this week whose deals are due.
// Safe to call by anyone: refreshArea only runs when an area is due, under a daily cap.

export const maxDuration = 300;

export async function GET() {
  const areas = await dueAreas();
  let refreshed = 0;
  for (const area of areas) if (await refreshArea(area)) refreshed++;
  return Response.json({ areas: areas.length, refreshed });
}
