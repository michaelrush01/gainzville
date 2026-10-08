import { aiConfigured, askStructured } from "@/lib/ai";
import { searchProduct } from "@/lib/food-search";
import { limitMessage, takeQuota } from "@/lib/quota";
import type { ScanResult } from "@/lib/types";

const MAX_IMAGE_BYTES = 4_000_000;

const SYSTEM = `You read food photos for a budget nutrition app for college students who lift.
Classify the image as one of:
- LABEL: a nutrition facts panel. Read the numbers exactly as printed, per serving.
- PRODUCT: the front of a packaged food (chips, protein bar, cereal, a drink). Identify the brand, product, and flavor as precisely as you can read them, and write a short search query like "Lay's Classic Potato Chips". Estimate one typical serving in grams and its macros from your knowledge of that product.
- MEAL: a plate, bowl, or prepared food. Identify each food and estimate portion sizes using visual cues (plate size, utensils, hands, containers). Then estimate total calories, protein, carbs, and fat. Estimate a rough US cost to make or buy it.
Always give your best estimate. Only set retake_reason when you truly cannot tell what the food is (not food, far too dark, or completely blurred). A slightly blurry or angled photo is fine.
Never invent brand names you cannot read. Keep the name short, like "Chicken & rice".`;

const SCHEMA = {
  type: "object",
  properties: {
    kind: { type: "string", enum: ["meal", "label", "product"] },
    name: { type: "string" },
    brand: { type: ["string", "null"], description: "Brand printed on the package, only for kind=product" },
    search_query: { type: ["string", "null"], description: "Brand plus product and flavor, only for kind=product" },
    serving_grams: { type: ["number", "null"], description: "Typical serving weight in grams, for products" },
    tags: { type: "array", items: { type: "string" }, description: "Detected foods, max 5" },
    calories: { type: "number" },
    protein: { type: "number" },
    carbs: { type: "number" },
    fat: { type: "number" },
    cost_usd: { type: ["number", "null"], description: "Rough cost of this meal or one serving, null for labels" },
    serving_label: { type: ["string", "null"] },
    retake_reason: { type: ["string", "null"] },
  },
  required: [
    "kind", "name", "brand", "search_query", "serving_grams", "tags", "calories", "protein",
    "carbs", "fat", "cost_usd", "serving_label", "retake_reason",
  ],
  additionalProperties: false,
};

type ModelOut = {
  kind: "meal" | "label" | "product";
  name: string;
  brand: string | null;
  search_query: string | null;
  serving_grams: number | null;
  tags: string[];
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  cost_usd: number | null;
  serving_label: string | null;
  retake_reason: string | null;
};

const MODE_PROMPTS: Record<string, string> = {
  label: "This should be a nutrition label. Read it.",
  meal: "This should be a meal. Estimate it.",
  product: "This should be the front of a packaged product. Identify it.",
};

export async function POST(request: Request) {
  if (!aiConfigured()) {
    return Response.json(
      { error: "Photo scanning isn't switched on yet. Barcode scanning still works." },
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
  }
  const quota = await takeQuota(request, isCorrection ? "fix" : "scan");
  if (!quota.ok) {
    return Response.json(
      { error: limitMessage(isCorrection ? "fix" : "scan", quota.signedIn), limited: true, signedIn: quota.signedIn },
      { status: 429 },
    );
  }

  try {
    const out = await askStructured<ModelOut>({
      model: "vision",
      system: SYSTEM,
      schema: SCHEMA,
      prompt: isCorrection
        ? `Previous result: ${JSON.stringify(previous)}. The user says: "${String(correction).slice(0, 300)}". Return a corrected result. If it is a packaged product, update the search query too.`
        : (MODE_PROMPTS[mode] ?? "Classify this image and return the result."),
      image: isCorrection ? undefined : { base64: image, mediaType },
    });

    if (out.kind === "product" && !out.retake_reason) {
      return Response.json(await productResult(out));
    }

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

/** Match a photographed package to the food database; fall back to the model's estimate. */
async function productResult(out: ModelOut): Promise<ScanResult> {
  const match = out.search_query ? await searchProduct(out.search_query, out.brand) : null;
  const cost = out.cost_usd == null ? null : Math.round(out.cost_usd * 100) / 100;

  if (!match) {
    return {
      kind: "product",
      confidence: "estimate",
      name: out.name,
      tags: [],
      calories: Math.round(out.calories),
      protein: Math.round(out.protein),
      carbs: Math.round(out.carbs),
      fat: Math.round(out.fat),
      cost,
      servingLabel: out.serving_label ?? (out.serving_grams ? `${out.serving_grams} g` : "1 serving"),
      retakeReason: null,
    };
  }

  // Prefer the database's own per-serving numbers; otherwise scale per-100 g by the estimated serving
  const grams = out.serving_grams && out.serving_grams > 0 ? out.serving_grams : 100;
  const macros = match.perServing ?? {
    calories: (match.per100g.calories * grams) / 100,
    protein: (match.per100g.protein * grams) / 100,
    carbs: (match.per100g.carbs * grams) / 100,
    fat: (match.per100g.fat * grams) / 100,
  };

  return {
    kind: "product",
    confidence: "verified",
    name: match.name,
    tags: [],
    calories: Math.round(macros.calories),
    protein: Math.round(macros.protein * 10) / 10,
    carbs: Math.round(macros.carbs * 10) / 10,
    fat: Math.round(macros.fat * 10) / 10,
    cost,
    servingLabel: match.perServing ? match.servingSize || "1 serving" : `${Math.round(grams)} g`,
    imageUrl: match.imageUrl,
    matchedFrom: out.name,
    retakeReason: null,
  };
}
