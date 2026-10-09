import Link from "next/link";

// Shared layout for the privacy policy and terms pages.
export function LegalPage({ label, title, updated, children }: { label: string; title: string; updated: string; children: React.ReactNode }) {
  return (
    <main className="grid-floor min-h-dvh px-6 py-8">
      <Link href="/" className="font-mono text-2xl text-text" aria-label="Back">
        ‹
      </Link>
      <p className="mt-8 font-mono text-sm uppercase tracking-widest text-accent">{label}</p>
      <h1 className="mt-2 font-display text-4xl font-bold text-heading">{title}</h1>
      <p className="mt-2 font-mono text-xs text-muted">Last updated {updated}</p>
      <div className="glass mt-8 space-y-4 rounded-3xl p-6 font-body leading-relaxed text-text [&_h2]:pt-2 [&_h2]:font-display [&_h2]:text-xl [&_h2]:font-bold [&_h2]:text-heading [&_li]:ml-5 [&_li]:list-disc">
        {children}
      </div>
    </main>
  );
}

export const CONTACT_EMAIL = "michaelrushnyc@gmail.com";
