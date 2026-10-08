"use client";

import type { LogEntry, Profile } from "./types";

// v1 keeps the profile and today's log in the browser only.
// Accounts come in a later step; this file is the one place to swap that in.

const PROFILE_KEY = "gz.profile";
const LOG_KEY = "gz.log";

export const DEFAULT_PROFILE: Profile = {
  goal: "maintain",
  weightLb: null,
  proteinTarget: 150,
  calorieTarget: 2400,
  weeklyBudget: 50,
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

export function saveProfile(p: Profile) {
  write(PROFILE_KEY, p);
}

function isToday(iso: string) {
  return new Date(iso).toDateString() === new Date().toDateString();
}

export function getTodayLog(): LogEntry[] {
  return read<LogEntry[]>(LOG_KEY, []).filter((e) => isToday(e.at));
}

export function addToLog(entry: Omit<LogEntry, "id" | "at">) {
  const all = read<LogEntry[]>(LOG_KEY, []).filter((e) => isToday(e.at));
  all.push({ ...entry, id: crypto.randomUUID(), at: new Date().toISOString() });
  write(LOG_KEY, all);
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
