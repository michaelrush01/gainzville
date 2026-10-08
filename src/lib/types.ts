export type ScanKind = "meal" | "barcode" | "label";

export type ScanResult = {
  kind: ScanKind;
  /** Verified = barcode or label data. Estimate = AI read of a meal photo. */
  confidence: "verified" | "estimate";
  name: string;
  tags: string[];
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  /** Rough cost in USD, or null when unknown */
  cost: number | null;
  /** For barcode/label: macros are per serving and can be multiplied */
  servingLabel?: string;
  imageUrl?: string;
  /** Set when the model is unsure and wants a better photo */
  retakeReason?: string | null;
};

export type Goal = "cut" | "maintain" | "bulk";

export type Profile = {
  goal: Goal;
  weightLb: number | null;
  proteinTarget: number; // grams per day
  calorieTarget: number; // kcal per day
  weeklyBudget: number; // USD
};

export type LogEntry = {
  id: string;
  at: string; // ISO time
  name: string;
  calories: number;
  protein: number;
  cost: number | null;
};

export function proteinPerDollar(protein: number, cost: number | null) {
  if (!cost || cost <= 0) return null;
  return Math.round((protein / cost) * 10) / 10;
}
