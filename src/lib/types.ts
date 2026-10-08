export type ScanKind = "meal" | "barcode" | "label" | "product";

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
  /** For product photos: what the AI read off the package before matching */
  matchedFrom?: string;
  /** Set when the model is unsure and wants a better photo */
  retakeReason?: string | null;
};

export type Goal = "cut" | "maintain" | "bulk";

export type Training = "casual" | "committed" | "dedicated";

/** Coarse location only: a ZIP, a campus, or a rounded point. Never continuous tracking. */
export type UserLocation =
  | { type: "zip"; zip: string; place?: string; center?: { lat: number; lng: number } }
  | { type: "campus"; campus: string }
  | { type: "point"; lat: number; lng: number };

export type Profile = {
  onboarded: boolean;
  goal: Goal;
  training: Training;
  weightLb: number | null;
  heightIn: number | null;
  age: number | null;
  proteinTarget: number; // grams per day
  calorieTarget: number; // kcal per day
  weeklyBudget: number; // USD
  location: UserLocation | null;
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
