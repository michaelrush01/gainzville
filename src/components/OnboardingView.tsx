"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { getProfile, saveProfile } from "@/lib/profile";
import { getCoarsePosition } from "@/lib/geo";
import { CAMPUSES } from "@/lib/places";
import { computeTargets } from "@/lib/targets";
import type { Goal, Training, UserLocation } from "@/lib/types";

type Step = "goal" | "training" | "stats" | "budget" | "location" | "done";
const STEPS: Step[] = ["goal", "training", "stats", "budget", "location"];

type Choice<T> = { value: T; title: string; sub: string; icon: ReactNode };

const GOALS: Choice<Goal>[] = [
  { value: "cut", title: "Cut", sub: "Lose fat, keep muscle", icon: "↓" },
  { value: "maintain", title: "Maintain", sub: "Stay where you are", icon: "=" },
  { value: "bulk", title: "Bulk", sub: "Build muscle", icon: "↑" },
];
const TRAINING: Choice<Training>[] = [
  { value: "casual", title: "Casual", sub: "1-2 days a week", icon: "⌁" },
  { value: "committed", title: "Committed", sub: "3-4 days a week", icon: "↗" },
  { value: "dedicated", title: "Dedicated", sub: "5+ days a week", icon: "▥" },
];
const BUDGETS: Choice<number>[] = [
  { value: 30, title: "Lean", sub: "$30 a week", icon: "$" },
  { value: 50, title: "Balanced", sub: "$50 a week", icon: "$$" },
  { value: 75, title: "Flexible", sub: "$75+ a week", icon: "$$$" },
];

export default function OnboardingView() {
  const router = useRouter();
  const start = getProfile();
  // "/onboarding?step=location" jumps straight to the location step (from the map)
  const [step, setStep] = useState<Step>(() =>
    start.onboarded && new URLSearchParams(window.location.search).get("step") === "location" ? "location" : "goal",
  );
  const [goal, setGoal] = useState<Goal | null>(start.onboarded ? start.goal : null);
  const [training, setTraining] = useState<Training | null>(start.onboarded ? start.training : null);
  const [weight, setWeight] = useState(start.weightLb ?? 165);
  const [heightIn, setHeightIn] = useState(start.heightIn ?? 70);
  const [age, setAge] = useState(start.age ?? 20);
  const [statsTouched, setStatsTouched] = useState(start.weightLb != null);
  const [budget, setBudget] = useState<number | null>(start.onboarded ? start.weeklyBudget : null);
  const [location, setLocation] = useState<UserLocation | null>(start.location);
  const [locMode, setLocMode] = useState<"none" | "zip" | "campus">("none");
  const [zip, setZip] = useState("");
  const [locNote, setLocNote] = useState<string | null>(null);
  const [campusQuery, setCampusQuery] = useState("");

  const idx = STEPS.indexOf(step as (typeof STEPS)[number]);
  const next = () => setStep(STEPS[idx + 1] ?? "done");

  const targets = computeTargets({
    goal: goal ?? "maintain",
    training: training ?? "committed",
    weightLb: statsTouched ? weight : null,
    age: statsTouched ? age : null,
  });

  function finish() {
    saveProfile({
      onboarded: true,
      goal: goal ?? "maintain",
      training: training ?? "committed",
      weightLb: statsTouched ? weight : null,
      heightIn: statsTouched ? heightIn : null,
      age: statsTouched ? age : null,
      weeklyBudget: budget ?? 50,
      location,
      ...targets,
    });
    router.replace("/");
  }

  async function locateMe() {
    setLocNote("Asking for location…");
    const r = await getCoarsePosition();
    if (!r.ok) return setLocNote(r.message);
    setLocation({ type: "point", lat: r.lat, lng: r.lng });
    setLocNote(null);
    setStep("done");
  }

  if (step === "done") {
    return (
      <Shell eyebrow="YOUR PLAN" title="You're set." progress={STEPS.length}>
        <div className="glass space-y-4 rounded-3xl p-6">
          <PlanRow label="Protein" value={`${targets.proteinTarget}g / day`} />
          <PlanRow label="Calories" value={`${targets.calorieTarget.toLocaleString()} / day`} />
          <PlanRow label="Budget" value={`$${budget ?? 50} / week`} />
          <p className="pt-2 font-body text-sm leading-relaxed text-muted">
            A starting point, not a rule. Track for a couple of weeks and adjust one thing at a time. Change it anytime with
            &quot;Edit my plan&quot; on the home screen.
          </p>
        </div>
        <PrivacyCard />
        <button onClick={finish} className="mt-6 w-full rounded-full bg-accent py-4 font-display text-lg font-bold text-on-accent">
          Start
        </button>
      </Shell>
    );
  }

  return (
    <Shell
      eyebrow={step === "stats" ? "YOUR STATS" : "CHOOSE YOUR PATH"}
      title={
        { goal: "What's your goal?", training: "How do you train?", stats: "Set your stats", budget: "Weekly food budget?", location: "Where do you shop?" }[step]
      }
      progress={idx}
      onBack={idx > 0 ? () => setStep(STEPS[idx - 1]) : undefined}
    >
      {step === "goal" && (
        <>
          <Choices items={GOALS} selected={goal} onPick={(v) => { setGoal(v); next(); }} />
          <a href="/account" className="mt-5 block text-center font-mono text-sm text-muted underline-offset-4 hover:underline">
            Already have an account? <span className="text-heading">Sign in</span>
          </a>
        </>
      )}
      {step === "training" && <Choices items={TRAINING} selected={training} onPick={(v) => { setTraining(v); next(); }} />}
      {step === "budget" && <Choices items={BUDGETS} selected={budget} onPick={(v) => { setBudget(v); next(); }} />}

      {step === "stats" && (
        <div className="space-y-4">
          <Stepper label="WEIGHT" display={`${weight} lb`} onChange={(d) => { setWeight((w) => clamp(w + d, 80, 400)); setStatsTouched(true); }} />
          <Stepper label="HEIGHT" display={`${Math.floor(heightIn / 12)}' ${heightIn % 12}"`} onChange={(d) => { setHeightIn((h) => clamp(h + d, 48, 90)); setStatsTouched(true); }} />
          <Stepper label="AGE" display={`${age} yrs`} onChange={(d) => { setAge((a) => clamp(a + d, 13, 99)); setStatsTouched(true); }} />
          <p className="text-center font-mono text-sm text-muted">Optional. Sharpens your protein target.</p>
          <div className="grid grid-cols-2 gap-3 pt-2">
            <button onClick={() => { setStatsTouched(false); next(); }} className="glass rounded-full py-3 font-mono text-sm text-muted">
              Skip
            </button>
            <button onClick={() => { setStatsTouched(true); next(); }} className="rounded-full bg-accent py-3 font-mono text-sm font-bold text-on-accent">
              Next
            </button>
          </div>
        </div>
      )}

      {step === "location" && (
        <div className="space-y-4">
          <OptionCard title="Use my location" sub="Approximate area only" icon="◎" onClick={locateMe} />
          <OptionCard title="Enter ZIP" sub="Find stores near a ZIP code" icon="#" selected={locMode === "zip"} onClick={() => setLocMode("zip")} />
          {locMode === "zip" && (
            <form
              className="flex gap-2"
              onSubmit={async (e) => {
                e.preventDefault();
                if (!/^\d{5}$/.test(zip)) return setLocNote("Enter a 5-digit ZIP.");
                setLocNote("Looking up that ZIP…");
                const res = await fetch(`/api/geocode?zip=${zip}`);
                const data = await res.json();
                if (!res.ok) return setLocNote(data.error ?? "Couldn't find that ZIP.");
                setLocation({ type: "zip", zip, place: data.place, center: { lat: data.lat, lng: data.lng } });
                setLocNote(null);
                setStep("done");
              }}
            >
              <input
                autoFocus
                inputMode="numeric"
                maxLength={5}
                value={zip}
                onChange={(e) => setZip(e.target.value.replace(/\D/g, ""))}
                placeholder="32601"
                className="glass min-w-0 flex-1 rounded-full px-5 py-3 font-mono text-text placeholder:text-muted focus:outline-none"
              />
              <button className="rounded-full bg-accent px-6 font-mono font-bold text-on-accent">Go</button>
            </form>
          )}
          <OptionCard title="Pick my campus" sub="Stores near your school" icon="⌂" selected={locMode === "campus"} onClick={() => setLocMode("campus")} />
          {locMode === "campus" && (
            <div className="space-y-2">
              <input
                autoFocus
                value={campusQuery}
                onChange={(e) => setCampusQuery(e.target.value)}
                placeholder="Search schools or cities"
                className="glass w-full rounded-full px-5 py-3 font-mono text-sm text-text placeholder:text-muted focus:outline-none"
              />
              <div className="glass max-h-48 space-y-1 overflow-y-auto rounded-3xl p-2">
                {CAMPUSES.filter((c) => `${c.name} ${c.city}`.toLowerCase().includes(campusQuery.toLowerCase())).map((c) => (
                  <button
                    key={c.name}
                    onClick={() => { setLocation({ type: "campus", campus: c.name }); setStep("done"); }}
                    className="flex w-full justify-between rounded-2xl px-4 py-2 text-left hover:bg-track"
                  >
                    <span className="font-mono text-sm text-text">{c.name}</span>
                    <span className="font-mono text-xs text-muted">{c.city}</span>
                  </button>
                ))}
                <p className="px-4 py-2 font-mono text-xs text-muted">Not listed? Use your ZIP instead.</p>
              </div>
            </div>
          )}
          {locNote && <p className="glass rounded-2xl px-4 py-3 text-center font-mono text-xs leading-relaxed text-heading">{locNote}</p>}
          <button onClick={() => setStep("done")} className="w-full font-mono text-sm text-muted underline-offset-4 hover:underline">
            Skip for now
          </button>
        </div>
      )}
    </Shell>
  );
}

function Shell({ eyebrow, title, progress, onBack, children }: { eyebrow: string; title: string; progress: number; onBack?: () => void; children: ReactNode }) {
  return (
    <main className="relative flex min-h-dvh flex-col overflow-hidden px-5 pb-6 pt-6">
      {/* faint tilted grid ties onboarding to the map screen */}
      <div className="pointer-events-none absolute inset-x-[-40%] top-[30%] h-[60%] opacity-70" style={{ perspective: "700px" }}>
        <div className="grid-floor h-full w-full" style={{ transform: "rotateX(60deg) rotateZ(-12deg)" }} />
      </div>

      <div className="relative flex items-center gap-3">
        {onBack ? (
          <button onClick={onBack} className="font-mono text-2xl text-text" aria-label="Back">‹</button>
        ) : (
          <span className="w-4" />
        )}
        <NodeTrail current={progress} />
      </div>

      <div className="relative mt-8 text-center">
        <p className="font-mono text-sm tracking-[0.2em] text-accent">{eyebrow}</p>
        <h1 className="mt-2 font-display text-4xl font-bold text-heading">{title}</h1>
      </div>

      <div className="relative mt-auto pt-10">{children}</div>

      <p className="relative mt-8 text-center font-mono text-xs text-muted">🔒 Private by design · no tracking</p>
    </main>
  );
}

function NodeTrail({ current }: { current: number }) {
  return (
    <div className="flex flex-1 items-center">
      {STEPS.map((s, i) => (
        <div key={s} className="flex flex-1 items-center last:flex-none">
          <span
            className={`block rounded-full ${
              i === current ? "h-5 w-5 border-[3px] border-accent" : i < current ? "h-3.5 w-3.5 bg-accent" : "h-3.5 w-3.5 bg-track"
            }`}
          />
          {i < STEPS.length - 1 && <span className={`h-1 flex-1 ${i < current ? "bg-accent" : "bg-track"}`} />}
        </div>
      ))}
    </div>
  );
}

function Choices<T extends string | number>({ items, selected, onPick }: { items: Choice<T>[]; selected: T | null; onPick: (v: T) => void }) {
  return (
    <div className="space-y-4">
      {items.map((c) => (
        <OptionCard key={String(c.value)} title={c.title} sub={c.sub} icon={c.icon} selected={selected === c.value} onClick={() => onPick(c.value)} />
      ))}
    </div>
  );
}

function OptionCard({ title, sub, icon, selected, onClick }: { title: string; sub: string; icon: ReactNode; selected?: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`glass flex w-full items-center gap-5 rounded-[2rem] p-5 text-left transition ${
        selected ? "border-accent shadow-[12px_0_40px_-12px_var(--accent)]" : ""
      }`}
    >
      <span
        className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-full font-mono text-xl font-bold ${
          selected ? "bg-accent text-on-accent" : "bg-track text-accent"
        }`}
      >
        {icon}
      </span>
      <span>
        <span className="block font-display text-2xl font-bold text-text">{title}</span>
        <span className="block font-mono text-sm text-muted">{sub}</span>
      </span>
    </button>
  );
}

function Stepper({ label, display, onChange }: { label: string; display: string; onChange: (delta: number) => void }) {
  return (
    <div className="glass flex items-center justify-between rounded-[2rem] px-6 py-5">
      <div>
        <p className="font-mono text-xs tracking-widest text-muted">{label}</p>
        <p className="mt-1 font-mono text-3xl font-bold text-text">{display}</p>
      </div>
      <div className="flex gap-3">
        <HoldButton label={`Decrease ${label}`} onStep={() => onChange(-1)}>−</HoldButton>
        <HoldButton label={`Increase ${label}`} onStep={() => onChange(1)}>+</HoldButton>
      </div>
    </div>
  );
}

/** Tap to step once; press and hold to keep stepping, speeding up the longer you hold. */
function HoldButton({ label, onStep, children }: { label: string; onStep: () => void; children: ReactNode }) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stepRef = useRef(onStep);
  useEffect(() => {
    stepRef.current = onStep;
  });

  function stop() {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  }

  function start() {
    stop();
    stepRef.current();
    let delay = 400; // pause before repeating starts
    const tick = () => {
      stepRef.current();
      delay = Math.max(40, delay * 0.8); // accelerate
      timer.current = setTimeout(tick, delay);
    };
    timer.current = setTimeout(tick, delay);
  }

  useEffect(() => stop, []);

  return (
    <button
      aria-label={label}
      onPointerDown={(e) => {
        e.preventDefault();
        start();
      }}
      onPointerUp={stop}
      onPointerLeave={stop}
      onPointerCancel={stop}
      onContextMenu={(e) => e.preventDefault()}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onStep();
        }
      }}
      className="h-12 w-12 touch-none select-none rounded-full bg-track font-mono text-xl text-accent active:bg-accent active:text-on-accent"
    >
      {children}
    </button>
  );
}

function PlanRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between">
      <span className="font-mono text-sm text-muted">{label}</span>
      <span className="font-display text-2xl font-bold text-text">{value}</span>
    </div>
  );
}

function PrivacyCard() {
  return (
    <div className="glass mt-4 space-y-1.5 rounded-3xl p-5 font-mono text-xs leading-relaxed text-muted">
      <p className="font-bold text-heading">🔒 Private by design</p>
      <p>Meal photos are analyzed and not saved.</p>
      <p>Location is a ZIP, campus, or rough area. Never continuous tracking.</p>
      <p>Your plan and log stay on this device. Clear them anytime in your browser.</p>
    </div>
  );
}

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}
