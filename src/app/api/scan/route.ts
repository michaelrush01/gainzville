import { aiConfigured, askStructured } from "@/lib/ai";
import { checkLimit, clientIp } from "@/lib/rate-limit";
import type { ScanResult } from "@/lib/types";

const DAILY_AI_SCANS = 15;
const MAX_IMAGE_BYTES = 4_000_000;

const SYSTEM = `You read food photos for a budget nutrition app for college students who lift.
Decide if the image is a NUTRITION LABEL or a MEAL.
- Label: read the numbers exactly as printed, per serving.
- Meal: identify each food, estimate portions, and estimate total calories, protein, carbs, and fat. Estimate a rough US cost to make or buy it.
- If the image is too blurry, too dark, or not food, set retake_reason to one short sentence and give your best guess or zeros.
Be honest about uncertainty. Never invent brand names. Keep the name short, like "Chicken & rice".`;

const SCHEMA = {
  type: "object",
  properties: {
    kind: { type: "string", enum: ["meal", "label"] },
    name: { type: "string" },
    tags: { type: "array", items: { type: "string" }, description: "Detected foods, max 5" },
    calories: { type: "number" },
    protein: { type: "number" },
    carbs: { type: "number" },
    fat: { type: "number" },
    cost_usd: { type: ["number", "null"], description: "Rough cost, null for labels" },
    serving_label: { type: ["string", "null"] },
    retake_reason: { type: ["string", "null"] },
  },
  required: ["kind", "name", "tags", "calories", "protein", "carbs", "fat", "cost_usd", "retake_reason"],
};

type ModelOut = {
  kind: "meal" | "label";
  name: string;
  tags: string[];
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  cost_usd: number | null;
  serving_label?: string | null;
  retake_reason: string | null;
};

export async function POST(request: Request) {
  if (!aiConfigured()) {
    return Response.json(
      { error: "Meal and label scanning isn't switched on yet. Barcode scanning still works." },
      { status: 503 },
    );
  }

  const body = await request.json().catch(() => null);
  const { image, mediaType, mode, correction, previous } = body ?? {};

  // Corrections ("that's turkey, not chicken") are text-only and don't count as a new scan.
  const isCorrection = typeof correction === "string" && correction.trim() && previous;
  if (!isCorrection) {
    if (typeof image !== "string" || !["image/jpeg", "image/png", "image/webp"].includes(mediaType)) {
      return Response.json({ error: "Send a JPEG, PNG, or WebP photo." }, { status: 400 });
    }
    if (image.length * 0.75 > MAX_IMAGE_BYTES) {
      return Response.json({ error: "That photo is too large." }, { status: 413 });
    }
    const limit = checkLimit(clientIp(request), DAILY_AI_SCANS);
    if (!limit.ok) {
      return Response.json({ error: "Daily scan limit reached. Barcodes are still unlimited." }, { status: 429 });
    }
  }

  try {
    const out = await askStructured<ModelOut>({
      model: "vision",
      system: SYSTEM,
      toolName: "food_result",
      schema: SCHEMA,
      prompt: isCorrection
        ? `Previous estimate: ${JSON.stringify(previous)}. The user says: "${String(correction).slice(0, 300)}". Re-estimate the meal with this correction.`
        : mode === "label"
          ? "This should be a nutrition label. Read it."
          : mode === "meal"
            ? "This should be a meal. Estimate it."
            : "Classify this image and return the result.",
      image: isCorrection ? undefined : { base64: image, mediaType },
    });

    const result: ScanResult = {
      kind: out.kind,
      confidence: out.kind === "label" ? "verified" : "estimate",
      name: out.name,
      tags: (out.tags ?? []).slice(0, 5),
      calories: Math.round(out.calories),
      protein: Math.round(out.protein),
      carbs: Math.round(out.carbs),
      fat: Math.round(out.fat),
      cost: out.cost_usd == null ? null : Math.round(out.cost_usd * 100) / 100,
      servingLabel: out.serving_label ?? undefined,
      retakeReason: out.retake_reason,
    };
    return Response.json(result);
  } catch (err) {
    console.error("scan failed", err);
    return Response.json({ error: "Couldn't read that one. Try again." }, { status: 500 });
  }
}
