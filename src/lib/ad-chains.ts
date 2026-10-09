// Grocery chains that publish a weekly ad, matched from store names. Shared by the
// deals job (server) and the map (browser), so a pin can show its chain's deals.

const AD_CHAINS: [RegExp, string][] = [
  [/publix/i, "Publix"],
  [/aldi/i, "Aldi"],
  [/winn-?dixie/i, "Winn-Dixie"],
  [/walmart/i, "Walmart"],
  [/target/i, "Target"],
  [/kroger/i, "Kroger"],
  [/food lion/i, "Food Lion"],
  [/safeway/i, "Safeway"],
  [/albertsons/i, "Albertsons"],
  [/h-?e-?b\b/i, "H-E-B"],
  [/meijer/i, "Meijer"],
  [/hy-?vee/i, "Hy-Vee"],
  [/harris teeter/i, "Harris Teeter"],
  [/wegmans/i, "Wegmans"],
  [/sprouts/i, "Sprouts"],
  [/whole foods/i, "Whole Foods Market"],
  [/lidl/i, "Lidl"],
  [/save.?a.?lot/i, "Save A Lot"],
  [/giant/i, "Giant"],
  [/stop ?& ?shop/i, "Stop & Shop"],
  [/shoprite/i, "ShopRite"],
  [/hannaford/i, "Hannaford"],
  [/fresh market/i, "The Fresh Market"],
  [/ralphs/i, "Ralphs"],
  [/fred meyer/i, "Fred Meyer"],
  [/king soopers/i, "King Soopers"],
  [/jewel/i, "Jewel-Osco"],
  [/vons/i, "Vons"],
  [/winco/i, "WinCo"],
];

export function adChain(name: string): string | undefined {
  return AD_CHAINS.find(([re]) => re.test(name))?.[1];
}
