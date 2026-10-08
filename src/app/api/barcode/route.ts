import type { ScanResult } from "@/lib/types";

// Barcode lookups use Open Food Facts (free, no AI call). Data: ODbL, attribution shown in the UI.
export async function GET(request: Request) {
  const code = new URL(request.url).searchParams.get("code") ?? "";
  if (!/^\d{6,14}$/.test(code)) {
    return Response.json({ error: "That doesn't look like a barcode." }, { status: 400 });
  }

  const fields = "product_name,brands,nutriments,serving_size,image_front_small_url";
  const res = await fetch(
    `https://world.openfoodfacts.org/api/v2/product/${code}.json?fields=${fields}`,
    { headers: { "User-Agent": "Gainzeville/0.1 (student project)" } },
  );
  if (!res.ok) return Response.json({ error: "Food database is not responding. Try again." }, { status: 502 });

  const data = await res.json();
  if (data.status !== 1 || !data.product) {
    return Response.json({ error: "Product not found. Try scanning the nutrition label instead." }, { status: 404 });
  }

  const p = data.product;
  const n = p.nutriments ?? {};
  // Prefer per-serving values; fall back to per 100 g
  const perServing = n["proteins_serving"] != null;
  const pick = (key: string) => Number(n[`${key}_${perServing ? "serving" : "100g"}`] ?? 0);

  const result: ScanResult = {
    kind: "barcode",
    confidence: "verified",
    name: productName(p.brands, p.product_name),
    tags: [],
    calories: Math.round(pick("energy-kcal")),
    protein: Math.round(pick("proteins") * 10) / 10,
    carbs: Math.round(pick("carbohydrates") * 10) / 10,
    fat: Math.round(pick("fat") * 10) / 10,
    cost: null,
    servingLabel: perServing ? p.serving_size || "1 serving" : "100 g",
    imageUrl: p.image_front_small_url,
  };
  return Response.json(result);
}

function productName(brands?: string, name?: string) {
  const brand = brands?.split(",")[0]?.trim();
  if (!name) return brand || "Unknown product";
  // Skip the brand when the product name already starts with it ("Nutella Nutella")
  if (!brand || name.toLowerCase().startsWith(brand.toLowerCase())) return name;
  return `${brand} ${name}`;
}
