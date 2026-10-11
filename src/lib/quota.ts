import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { checkLimit, clientIp } from "./rate-limit";

// Daily limits for anything that costs money (AI calls). Counts live in the database,
// so they survive server restarts. Signed-in users get more than guests, and a site-wide
// cap per feature acts as a kill switch for API spending.

export type Feature = "scan" | "chat" | "fix";

const LIMITS: Record<Feature, { guest: number; user: number; global: number }> = {
  scan: { guest: 5, user: 15, global: 150 },
  chat: { guest: 15, user: 50, global: 500 },
  fix: { guest: 10, user: 10, global: 300 },
};

let admin: SupabaseClient | null = null;
/** Server-side database client with full access (secret key). Never sent to browsers. */
export function adminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const secret = process.env.SUPABASE_SECRET_KEY;
  if (!url || !secret) return null;
  if (!admin) admin = createClient(url, secret, { auth: { persistSession: false, autoRefreshToken: false } });
  return admin;
}

/** The signed-in user behind a request, verified from their access token (null for guests). */
export async function requestUser(request: Request, db = adminClient()) {
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token || !db) return null;
  const { data } = await db.auth.getUser(token);
  return data.user ? { id: data.user.id, email: data.user.email?.toLowerCase() ?? null } : null;
}

/** Who is asking: a signed-in user or a guest by IP. */
async function caller(request: Request, db: SupabaseClient | null) {
  const user = await requestUser(request, db);
  if (user) return { kind: "user" as const, id: user.id };
  return { kind: "guest" as const, id: clientIp(request) };
}

/** Accounts with no daily limits: the site owner (anyone listed as a board admin). */
async function isUnlimited(db: SupabaseClient, userId: string) {
  const { data } = await db.from("board_admins").select("user_id").eq("user_id", userId).maybeSingle();
  return Boolean(data);
}

export async function takeQuota(request: Request, feature: Feature) {
  const db = adminClient();
  const who = await caller(request, db);
  if (db && who.kind === "user" && (await isUnlimited(db, who.id))) return { ok: true, signedIn: true };
  const limits = LIMITS[feature];
  const max = who.kind === "user" ? limits.user : limits.guest;

  if (!db) {
    // Not configured (local dev without the secret key): fall back to in-memory counting
    const r = checkLimit(`${feature}:${who.id}`, max);
    return { ok: r.ok, signedIn: who.kind === "user" };
  }

  const { data, error } = await db.rpc("use_quota", {
    p_bucket: `${feature}:${who.kind}:${who.id}`,
    p_max: max,
    p_global: `${feature}:global`,
    p_global_max: limits.global,
  });
  if (error) {
    console.error("quota check failed", error.message);
    // Fail closed for guests, open for signed-in users, so a database hiccup can't run up costs
    return { ok: who.kind === "user", signedIn: who.kind === "user" };
  }
  return { ok: data === true, signedIn: who.kind === "user" };
}

export function limitMessage(feature: Feature, signedIn: boolean) {
  const what = feature === "chat" ? "coach messages" : feature === "fix" ? "fixes" : "photo scans";
  return signedIn
    ? `You've used today's ${what}. They reset tomorrow. Barcode scans are always unlimited.`
    : `You've used today's free ${what}. Sign in for more, or come back tomorrow. Barcode scans are always unlimited.`;
}
