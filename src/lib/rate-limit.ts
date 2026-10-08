import "server-only";

// Simple per-IP daily limit so a public demo can't drain API credit.
// In-memory: resets when the server restarts. Swap for a database counter once accounts exist.
const hits = new Map<string, { day: string; count: number }>();

export function checkLimit(ip: string, max: number) {
  const day = new Date().toISOString().slice(0, 10);
  const entry = hits.get(ip);
  if (!entry || entry.day !== day) {
    hits.set(ip, { day, count: 1 });
    return { ok: true, remaining: max - 1 };
  }
  if (entry.count >= max) return { ok: false, remaining: 0 };
  entry.count += 1;
  return { ok: true, remaining: max - entry.count };
}

export function clientIp(request: Request) {
  return request.headers.get("x-forwarded-for")?.split(",")[0].trim() || "local";
}
