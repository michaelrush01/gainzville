import type { Goal } from "./types";

// Cheap protein anchors from the student-budget knowledge base.
// Prices are rough national averages, labeled as estimates in the UI.
const CHEAP_FIXES = [
  { food: "Greek yogurt", protein: 17, cost: 1.0 },
  { food: "two eggs", protein: 12, cost: 0.6 },
  { food: "a can of tuna", protein: 20, cost: 1.3 },
  { food: "a scoop of whey", protein: 24, cost: 1.1 },
];

/** One short, goal-based tip shown under a scan result. */
export function goalTip(opts: { goal: Goal; proteinLeft: number; mealCalories: number }) {
  const { goal, proteinLeft, mealCalories } = opts;
  if (proteinLeft <= 0) {
    return goal === "cut"
      ? "Protein goal hit. On a cut, keep the rest of today light and high in volume."
      : "Protein goal hit for today. Nice work.";
  }
  const fix =
    goal === "cut"
      ? CHEAP_FIXES.find((f) => f.food === "Greek yogurt")!
      : proteinLeft > 40
        ? CHEAP_FIXES.find((f) => f.food === "a scoop of whey")!
        : CHEAP_FIXES.find((f) => f.food === "a can of tuna")!;
  const base = `${Math.round(proteinLeft)}g to go. ${cap(fix.food)} is a cheap fix, about ${fix.protein}g for ~$${fix.cost.toFixed(2)}.`;
  if (goal === "cut" && mealCalories > 900) return `${base} That meal was heavy, so lean on low-calorie protein later.`;
  if (goal === "bulk" && mealCalories < 400) return `${base} On a bulk, add a carb side to meals this small.`;
  return base;
}

function cap(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
