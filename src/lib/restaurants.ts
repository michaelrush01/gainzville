// "Better" fast-food chains with a high-protein order at each, for the map and the coach.
// Numbers are approximate: protein and calories from each chain's published nutrition for
// the listed build, prices are typical US prices and vary by location. Shown with "≈" in the app.

export type Chain = {
  key: string;
  name: string;
  /** Matches the OpenStreetMap name or brand tag */
  match: RegExp;
  order: string;
  protein: number;
  calories: number;
  price: number;
};

export const CHAINS: Chain[] = [
  { key: "chipotle", name: "Chipotle", match: /chipotle/i, order: "Bowl: double chicken, rice, black beans, fajita veggies, salsa", protein: 75, calories: 750, price: 13 },
  { key: "chick-fil-a", name: "Chick-fil-A", match: /chick-?fil-?a/i, order: "12-count grilled nuggets", protein: 38, calories: 200, price: 7 },
  { key: "panda", name: "Panda Express", match: /panda express/i, order: "Plate: 2× grilled teriyaki chicken + super greens", protein: 75, calories: 640, price: 11 },
  { key: "qdoba", name: "Qdoba", match: /qdoba/i, order: "Bowl: double chicken, rice, black beans, pico", protein: 70, calories: 750, price: 13 },
  { key: "moes", name: "Moe's", match: /moe'?s southwest/i, order: "Bowl: double chicken, rice, black beans, pico", protein: 60, calories: 700, price: 13 },
  { key: "cava", name: "CAVA", match: /^cava\b/i, order: "Greens + grains bowl, double grilled chicken", protein: 50, calories: 650, price: 16 },
  { key: "sweetgreen", name: "sweetgreen", match: /sweetgreen/i, order: "Protein plate with double chicken", protein: 50, calories: 650, price: 17 },
  { key: "subway", name: "Subway", match: /^subway\b/i, order: "Protein bowl, double rotisserie-style chicken", protein: 50, calories: 420, price: 11 },
  { key: "mcdonalds", name: "McDonald's", match: /mcdonald/i, order: "Double Quarter Pounder with Cheese", protein: 48, calories: 740, price: 9 },
  { key: "taco-bell", name: "Taco Bell", match: /taco bell/i, order: "Cantina Chicken Bowl", protein: 25, calories: 490, price: 7 },
  { key: "smoothie-king", name: "Smoothie King", match: /smoothie king/i, order: "Gladiator protein smoothie (20 oz)", protein: 45, calories: 220, price: 8 },
];

/** For the Overpass query: one case-insensitive pattern matching every chain */
export const CHAIN_PATTERN = "Chipotle|Chick-fil-A|Panda Express|Qdoba|Moe's|CAVA|sweetgreen|Subway|McDonald's|Taco Bell|Smoothie King";

export function chainFor(name: string): Chain | undefined {
  return CHAINS.find((c) => c.match.test(name.trim()));
}

export function chainByKey(key?: string): Chain | undefined {
  return CHAINS.find((c) => c.key === key);
}

export const gramsPerDollar = (c: Chain) => c.protein / c.price;
