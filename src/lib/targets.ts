import type { Goal, Training } from "./types";

// Starting targets from the knowledge base. Everything is person-dependent,
// so these are a starting point the user adjusts from tracked data.

export const CALORIE_FLOOR = 1500;

// Rough maintenance calories per pound of body weight, by training volume
const MAINTENANCE_PER_LB: Record<Training, number> = { casual: 14, committed: 15, dedicated: 16 };

// Protein per pound: ~0.8 to 1 g/lb, with cutters toward the top
const PROTEIN_PER_LB: Record<Goal, number> = { cut: 1.0, maintain: 0.85, bulk: 0.9 };

export function computeTargets(opts: { goal: Goal; training: Training; weightLb: number | null; age: number | null }) {
  const { goal, training, weightLb, age } = opts;
  const minor = age != null && age < 18;

  if (!weightLb) {
    // No stats given: sensible defaults
    const calories = { cut: 2000, maintain: 2400, bulk: 2800 }[goal];
    return { proteinTarget: goal === "cut" ? 150 : 140, calorieTarget: calories };
  }

  const maintenance = weightLb * MAINTENANCE_PER_LB[training];
  // Gentle changes: about 250 below for a cut, 300 above for a bulk. Smaller for under-18 users.
  const delta = goal === "cut" ? (minor ? -150 : -250) : goal === "bulk" ? (minor ? 200 : 300) : 0;
  const calorieTarget = Math.max(CALORIE_FLOOR, round(maintenance + delta, 50));
  const proteinTarget = round(weightLb * PROTEIN_PER_LB[goal], 5);
  return { proteinTarget, calorieTarget };
}

function round(n: number, step: number) {
  return Math.round(n / step) * step;
}
