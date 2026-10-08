"use client";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// Browser-only Supabase client. The publishable key is safe in the browser:
// row level security in the database decides what each signed-in user can read or write.

let client: SupabaseClient | null = null;

export function supabaseConfigured() {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY);
}

export function supabase() {
  if (!client) {
    client = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, {
      auth: { flowType: "pkce", persistSession: true, detectSessionInUrl: true, storageKey: "gz.auth" },
    });
  }
  return client;
}

/** Adds the signed-in user's token so the server can give them signed-in limits. */
export async function authHeaders(): Promise<Record<string, string>> {
  if (!supabaseConfigured()) return {};
  const { data } = await supabase().auth.getSession();
  return data.session ? { Authorization: `Bearer ${data.session.access_token}` } : {};
}
