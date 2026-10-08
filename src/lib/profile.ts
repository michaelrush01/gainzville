"use client";

import { pushLogEntry, pushProfile } from "./sync";
import type { LogEntry, Profile } from "./types";

// The browser copy is the source the app reads from. Signed-in users also get
// every change written to their account (see sync.ts), so it follows them across devices.

const PROFILE_KEY = "gz.profile";
const LOG_KEY = "gz.log";

export const DEFAULT_PROFILE: Profile = {
  onboarded: false,
  goal: "maintain",
  training: "committed",
  weightLb: null,
  heightIn: null,
  age: null,
  proteinTarget: 150,
  calorieTarget: 2400,
  weeklyBudget: 50,
  location: null,
};

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function write(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage blocked: the app still works for this visit */
  }
}

export function getProfile(): Profile {
  return { ...DEFAULT_PROFILE, ...read<Partial<Profile>>(PROFILE_KEY, {}) };
}

export function saveProfile(p: Profile, opts: { sync?: boolean } = {}) {
  write(PROFILE_KEY, p);
  if (opts.sync !== false) pushProfile(p).catch(() => {});
}

function isToday(iso: string) {
  return new Date(iso).toDateString() === new Date().toDateString();
}

export function getTodayLog(): LogEntry[] {
  return read<LogEntry[]>(LOG_KEY, []).filter((e) => isToday(e.at));
}

export function addToLog(entry: Omit<LogEntry, "id" | "at">) {
  const all = read<LogEntry[]>(LOG_KEY, []).filter((e) => isToday(e.at));
  const full = { ...entry, id: crypto.randomUUID(), at: new Date().toISOString() };
  all.push(full);
  write(LOG_KEY, all);
  pushLogEntry(full).catch(() => {});
}

/** Replace today's log with a synced copy (after sign-in). */
export function setTodayLog(entries: LogEntry[]) {
  write(LOG_KEY, entries);
}

/** Forget everything stored on this device. */
export function clearLocalData() {
  try {
    localStorage.removeItem(PROFILE_KEY);
    localStorage.removeItem(LOG_KEY);
  } catch {}
}

export function todayTotals() {
  return getTodayLog().reduce(
    (t, e) => ({
      protein: t.protein + e.protein,
      calories: t.calories + e.calories,
      spent: t.spent + (e.cost ?? 0),
    }),
    { protein: 0, calories: 0, spent: 0 },
  );
}

// Session hand-off between the scan screen and the result screen
const RESULT_KEY = "gz.lastResult";
export function stashResult(r: unknown) {
  try {
    sessionStorage.setItem(RESULT_KEY, JSON.stringify(r));
  } catch {}
}
export function readStashedResult<T>(): T | null {
  try {
    const raw = sessionStorage.getItem(RESULT_KEY);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}
