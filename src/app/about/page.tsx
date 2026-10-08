import Link from "next/link";

export const metadata = { title: "About · Gainzeville" };

export default function About() {
  return (
    <main className="grid-floor min-h-dvh px-6 py-8">
      <Link href="/" className="font-mono text-2xl text-text" aria-label="Back">
        ‹
      </Link>
      <p className="mt-8 font-mono text-sm uppercase tracking-widest text-accent">About</p>
      <h1 className="mt-2 font-display text-4xl font-bold text-heading">Why Gainzeville exists</h1>

      <div className="glass mt-8 space-y-4 rounded-3xl p-6 font-body leading-relaxed text-text">
        <p>
          I&apos;m a student at the University of Florida. I worked at a gym for two years and I&apos;ve been lifting for
          years, and the same question kept coming up: how do you hit your protein on a college budget, with a dorm
          kitchen and a meal plan?
        </p>
        <p>
          So I built this. Scan a meal or a barcode, see your protein and what it cost you, and find the best-value
          protein near you. It&apos;s made for students who lift and don&apos;t want to spend a fortune doing it.
        </p>
      </div>

      <div className="glass mt-4 space-y-2 rounded-3xl p-6 font-mono text-sm text-muted">
        <p className="font-bold text-heading">Private by design</p>
        <p>Meal photos are analyzed and not saved.</p>
        <p>Your goal and today&apos;s log stay in this browser for now.</p>
        <p>Not medical advice. Talk to a doctor or dietitian for medical needs.</p>
      </div>
    </main>
  );
}
