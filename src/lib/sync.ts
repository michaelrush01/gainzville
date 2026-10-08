"use client";

import { supabase, supabaseConfigured } from "./supabase";
import type { LogEntry, Profile } from "./types";

// Keeps the browser copy and the account in step.
// The app always reads from the browser copy (fast, works offline); signed-in users
// also get every change written to their account so it follows them to any device.

async function userId() {
  if (!supabaseConfigured()) return null;
  const { data } = await supabase().auth.getSession();
  return data.session?.user.id ?? null;
}

export async function pushProfile(p: Profile) {
  const id = await userId();
  if (!id) return;
  await supabase().from("profiles").upsert({ id, data: p, updated_at: new Date().toISOString() });
}

export async function pushLogEntry(e: LogEntry) {
  if (!(await userId())) return;
  await supabase().from("food_logs").upsert({
    id: e.id,
    at: e.at,
    name: e.name,
    calories: Math.round(e.calories),
    protein: e.protein,
    cost: e.cost,
  });
}

/**
 * Run right after sign-in. If the account already has a plan, it wins (new device).
 * Otherwise the plan made on this device is saved to the account (first sign-up).
 * Today's log entries are merged both ways.
 */
export async function syncAfterSignIn(local: { profile: Profile; todayLog: LogEntry[] }) {
  const id = await userId();
  if (!id) return null;
  const db = supabase();

  const { data: row } = await db.from("profiles").select("data").eq("id", id).maybeSingle();
  let profile = local.profile;
  if (row?.data && (row.data as Profile).onboarded) {
    profile = { ...local.profile, ...(row.data as Profile) };
  } else if (local.profile.onboarded) {
    await pushProfile(local.profile);
  }

  for (const e of local.todayLog) await pushLogEntry(e);
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const { data: logs } = await db
    .from("food_logs")
    .select("id, at, name, calories, protein, cost")
    .gte("at", startOfDay.toISOString())
    .order("at");

  const todayLog: LogEntry[] = (logs ?? []).map((l) => ({
    id: l.id,
    at: l.at,
    name: l.name,
    calories: Number(l.calories),
    protein: Number(l.protein),
    cost: l.cost == null ? null : Number(l.cost),
  }));
  return { profile, todayLog };
}
