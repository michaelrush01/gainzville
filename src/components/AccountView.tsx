"use client";

import type { Session } from "@supabase/supabase-js";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { clearLocalData, getProfile, getTodayLog, saveProfile, setTodayLog } from "@/lib/profile";
import { supabase, supabaseConfigured } from "@/lib/supabase";
import { syncAfterSignIn } from "@/lib/sync";

type Status = "idle" | "sending" | "sent" | "syncing" | "synced" | "error";

export default function AccountView() {
  const router = useRouter();
  const [session, setSession] = useState<Session | null>(null);
  const [checking, setChecking] = useState(supabaseConfigured);
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [message, setMessage] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const syncedFor = useRef<string | null>(null);

  useEffect(() => {
    if (!supabaseConfigured()) return;
    const auth = supabase().auth;

    async function sync(s: Session) {
      if (syncedFor.current === s.user.id) return;
      syncedFor.current = s.user.id;
      setStatus("syncing");
      try {
        const merged = await syncAfterSignIn({ profile: getProfile(), todayLog: getTodayLog() });
        if (merged) {
          saveProfile(merged.profile, { sync: false });
          setTodayLog(merged.todayLog);
        }
        setStatus("synced");
      } catch {
        setStatus("error");
        setMessage("Signed in, but syncing failed. Your data is still on this device.");
      }
    }

    auth.getSession().then(({ data }) => {
      setSession(data.session);
      setChecking(false);
      if (data.session) sync(data.session);
    });
    const { data: sub } = auth.onAuthStateChange((_event, s) => {
      setSession(s);
      setChecking(false);
      if (s) sync(s);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  async function sendLink(e: React.FormEvent) {
    e.preventDefault();
    if (!/^\S+@\S+\.\S+$/.test(email)) return setMessage("Enter a valid email.");
    setStatus("sending");
    setMessage(null);
    const { error } = await supabase().auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${window.location.origin}/account` },
    });
    if (error) {
      setStatus("error");
      setMessage(error.message.includes("rate") ? "Too many emails sent. Wait a few minutes and try again." : error.message);
      return;
    }
    setStatus("sent");
  }

  async function signOut() {
    await supabase().auth.signOut();
    clearLocalData();
    router.replace("/onboarding");
  }

  async function deleteAccount() {
    setMessage(null);
    const { error } = await supabase().rpc("delete_my_account");
    if (error) return setMessage("Couldn't delete the account. Try again.");
    await supabase().auth.signOut();
    clearLocalData();
    router.replace("/onboarding");
  }

  const onboarded = getProfile().onboarded;

  return (
    <main className="grid-floor min-h-dvh px-6 py-8">
      <Link href={onboarded ? "/" : "/onboarding"} className="font-mono text-2xl text-text" aria-label="Back">
        ‹
      </Link>
      <p className="mt-8 font-mono text-sm tracking-[0.2em] text-accent">ACCOUNT</p>
      <h1 className="mt-2 font-display text-4xl font-bold text-heading">
        {session ? "You're signed in." : "Save your progress"}
      </h1>

      {!supabaseConfigured() && (
        <p className="glass mt-8 rounded-3xl p-5 font-mono text-sm text-muted">Accounts aren&apos;t switched on yet.</p>
      )}

      {checking && supabaseConfigured() && <p className="mt-8 font-mono text-sm text-muted">Checking…</p>}

      {!checking && supabaseConfigured() && !session && (
        <>
          <p className="mt-4 font-body text-muted">
            Keep your plan and food log on every device. No password: we email you a sign-in link.
          </p>
          {status === "sent" ? (
            <div className="glass mt-8 space-y-2 rounded-3xl p-6">
              <p className="font-display text-xl font-bold text-text">Check your email</p>
              <p className="font-body text-sm text-muted">
                We sent a link to <span className="text-heading">{email}</span>. Open it on this device to finish signing
                in. It can take a minute, and check spam.
              </p>
              <button onClick={() => setStatus("idle")} className="pt-2 font-mono text-xs text-muted underline underline-offset-4">
                Use a different email
              </button>
            </div>
          ) : (
            <form onSubmit={sendLink} className="mt-8 space-y-3">
              <input
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value.trim())}
                placeholder="you@school.edu"
                className="glass w-full rounded-full px-5 py-4 font-mono text-text placeholder:text-muted focus:outline-none"
              />
              <button
                disabled={status === "sending"}
                className="w-full rounded-full bg-accent py-4 font-display text-lg font-bold text-on-accent disabled:opacity-50"
              >
                {status === "sending" ? "Sending…" : "Email me a sign-in link"}
              </button>
            </form>
          )}
        </>
      )}

      {session && (
        <div className="mt-8 space-y-4">
          <div className="glass space-y-1 rounded-3xl p-6">
            <p className="font-mono text-xs text-muted">Signed in as</p>
            <p className="font-mono text-text">{session.user.email}</p>
            <p className="pt-2 font-mono text-xs text-accent">
              {status === "syncing" ? "Syncing…" : status === "error" ? "Sync problem" : "✓ Plan and today's log synced"}
            </p>
          </div>
          {status !== "syncing" && (
            <Link
              href={getProfile().onboarded ? "/" : "/onboarding"}
              className="block w-full rounded-full bg-accent py-4 text-center font-display text-lg font-bold text-on-accent"
            >
              {getProfile().onboarded ? "Go to Gainzville" : "Set up your plan"}
            </Link>
          )}
          <button onClick={signOut} className="glass w-full rounded-full py-3 font-mono text-sm text-text">
            Sign out
          </button>

          <div className="pt-6">
            {!confirmDelete ? (
              <button onClick={() => setConfirmDelete(true)} className="font-mono text-xs text-muted underline underline-offset-4">
                Delete my account
              </button>
            ) : (
              <div className="glass space-y-3 rounded-3xl p-5">
                <p className="font-mono text-sm text-text">Delete your account and everything saved to it? This can&apos;t be undone.</p>
                <div className="grid grid-cols-2 gap-3">
                  <button onClick={() => setConfirmDelete(false)} className="glass rounded-full py-3 font-mono text-sm text-text">
                    Cancel
                  </button>
                  <button onClick={deleteAccount} className="rounded-full bg-[#ff7a9a] py-3 font-mono text-sm font-bold text-on-accent">
                    Delete
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {message && <p className="mt-4 font-mono text-xs text-accent">{message}</p>}

      <p className="mt-10 font-mono text-xs leading-relaxed text-muted">
        🔒 We store your email, plan, and food log. Meal photos are never saved. Delete everything anytime.
      </p>
    </main>
  );
}
