import "server-only";

// Find a packaged product by name in Open Food Facts (free, ODbL).
// Used when someone photographs the front of a package instead of the barcode.

export type ProductMatch = {
  code: string;
  name: string;
  imageUrl?: string;
  /** Macros per 100 g */
  per100g: { calories: number; protein: number; carbs: number; fat: number };
  /** Macros per serving, when the database has them */
  perServing: { calories: number; protein: number; carbs: number; fat: number } | null;
  servingSize?: string;
};

const UA = { "User-Agent": "Gainzville/0.1 (student project)" };

export async function searchProduct(query: string, brand?: string | null): Promise<ProductMatch | null> {
  const fields = "code,product_name,brands,nutriments,serving_size,image_front_small_url,countries_tags";
  const url = `https://search.openfoodfacts.org/search?q=${encodeURIComponent(query)}&page_size=8&fields=${fields}`;
  try {
    const res = await fetch(url, { headers: UA, signal: AbortSignal.timeout(6000) });
    if (!res.ok) return null;
    const data = await res.json();
    const hits: Record<string, unknown>[] = data.hits ?? [];
    const wanted = brand?.toLowerCase().trim();
    const usable = hits.filter((h) => {
      const n = (h.nutriments ?? {}) as Record<string, number>;
      if (n["energy-kcal_100g"] == null || n["proteins_100g"] == null) return false;
      // When we know the brand, the hit must match it (avoids "Quest" matching an Aldi cookie)
      if (!wanted) return true;
      const firstBrand = String([h.brands].flat()[0] ?? "").toLowerCase();
      const text = `${[h.brands].flat().join(" ")} ${h.product_name ?? ""}`.toLowerCase();
      return text.includes(wanted) || (firstBrand !== "" && wanted.includes(firstBrand));
    });
    // Prefer products sold in the US
    const isUS = (h: Record<string, unknown>) => ((h.countries_tags as string[]) ?? []).includes("en:united-states");
    const hit = usable.find(isUS) ?? usable[0];
    if (!hit) return null;

    const n = hit.nutriments as Record<string, number>;
    const r = (v: unknown) => Math.round(Number(v ?? 0) * 10) / 10;
    const brands = Array.isArray(hit.brands) ? hit.brands[0] : (hit.brands as string | undefined)?.split(",")[0];
    const productName = String(hit.product_name ?? "").trim();
    const name =
      brands && !productName.toLowerCase().startsWith(String(brands).toLowerCase())
        ? `${brands} ${productName}`
        : productName || String(brands ?? "Product");

    return {
      code: String(hit.code),
      name: name.replace(/\s+/g, " "),
      imageUrl: hit.image_front_small_url as string | undefined,
      per100g: {
        calories: r(n["energy-kcal_100g"]),
        protein: r(n["proteins_100g"]),
        carbs: r(n["carbohydrates_100g"]),
        fat: r(n["fat_100g"]),
      },
      perServing:
        n["energy-kcal_serving"] != null && n["proteins_serving"] != null
          ? {
              calories: r(n["energy-kcal_serving"]),
              protein: r(n["proteins_serving"]),
              carbs: r(n["carbohydrates_serving"]),
              fat: r(n["fat_serving"]),
            }
          : null,
      servingSize: (hit.serving_size as string | undefined) || undefined,
    };
  } catch {
    return null;
  }
}
