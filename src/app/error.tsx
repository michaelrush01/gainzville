"use client";

import Link from "next/link";
import { useEffect } from "react";

// Shown instead of a blank crash screen if something on a page throws.
// Saved data lives in the browser and the account, so nothing is lost.
export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="grid-floor flex min-h-dvh flex-col justify-center gap-4 px-6">
      <p className="font-mono text-sm tracking-[0.2em] text-accent">SOMETHING BROKE</p>
      <h1 className="font-display text-3xl font-bold text-heading">That screen hit an error.</h1>
      <p className="font-body text-muted">Your plan and food log are safe. Try again, or head home.</p>
      <div className="flex gap-3">
        <button onClick={reset} className="rounded-full bg-accent px-5 py-3 font-display font-bold text-on-accent">
          Try again
        </button>
        <Link href="/" className="glass rounded-full px-5 py-3 font-display font-bold text-text">
          Home
        </Link>
      </div>
    </main>
  );
}
