"use client";

import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";

// Google's own sign-in button, run on our site. The consent screen then names
// Gainzville's domain instead of the Supabase project address. Google hands back
// an ID token, and Supabase turns it into a session. If Google's script can't
// load (blocked or offline), we fall back to the redirect flow through Supabase.

// OAuth client IDs are public by design (they ship to every browser).
const GOOGLE_CLIENT_ID = "394598034270-gdkk7n7g7bhqjim8akeih1mndfkjtomo.apps.googleusercontent.com";
const GSI_SRC = "https://accounts.google.com/gsi/client";

type GoogleId = {
  initialize: (o: Record<string, unknown>) => void;
  renderButton: (el: HTMLElement, o: Record<string, unknown>) => void;
};
type GoogleWindow = Window & { google?: { accounts: { id: GoogleId } } };

function loadGsi(): Promise<GoogleId> {
  const w = window as GoogleWindow;
  if (w.google?.accounts?.id) return Promise.resolve(w.google.accounts.id);
  return new Promise((resolve, reject) => {
    let s = document.querySelector<HTMLScriptElement>(`script[src="${GSI_SRC}"]`);
    if (!s) {
      s = document.createElement("script");
      s.src = GSI_SRC;
      s.async = true;
      document.head.appendChild(s);
    }
    s.addEventListener("load", () => (w.google?.accounts?.id ? resolve(w.google.accounts.id) : reject()));
    s.addEventListener("error", () => reject());
    setTimeout(() => reject(), 8000);
  });
}

/** Random nonce: the raw value goes to Supabase, its SHA-256 hash goes to Google. */
async function makeNonce() {
  const raw = btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32))));
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(raw));
  const hashed = [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
  return { raw, hashed };
}

export function GoogleButton({ onError }: { onError: (msg: string) => void }) {
  const box = useRef<HTMLDivElement>(null);
  const [fallback, setFallback] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [gsi, nonce] = await Promise.all([loadGsi(), makeNonce()]);
        if (cancelled || !box.current) return;
        gsi.initialize({
          client_id: GOOGLE_CLIENT_ID,
          nonce: nonce.hashed,
          use_fedcm_for_button: true,
          callback: async ({ credential }: { credential: string }) => {
            const { error } = await supabase().auth.signInWithIdToken({ provider: "google", token: credential, nonce: nonce.raw });
            if (error) onError("Google sign-in didn't go through. Try again or use email.");
          },
        });
        gsi.renderButton(box.current, {
          type: "standard",
          theme: "outline",
          size: "large",
          shape: "pill",
          text: "continue_with",
          logo_alignment: "center",
          width: Math.min(400, box.current.offsetWidth || 320),
        });
      } catch {
        if (!cancelled) setFallback(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [onError]);

  async function redirectSignIn() {
    const { error } = await supabase().auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/account` },
    });
    if (error) onError("Couldn't open Google sign-in. Try again or use email.");
  }

  if (fallback) {
    return (
      <button
        onClick={redirectSignIn}
        className="mt-8 flex w-full items-center justify-center gap-3 rounded-full bg-white py-4 font-display text-lg font-bold text-[#1f1f1f]"
      >
        <GoogleIcon />
        Continue with Google
      </button>
    );
  }
  // Google draws its button inside this box; reserve its height so nothing jumps
  return <div ref={box} className="mt-8 flex min-h-[44px] w-full justify-center" />;
}

function GoogleIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
      <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
    </svg>
  );
}
