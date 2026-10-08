import type { UserLocation } from "./types";

export type LatLng = { lat: number; lng: number };

/** Campus centers. Picking a campus drops the map there. */
export const CAMPUSES: { name: string; city: string; lat: number; lng: number }[] = [
  { name: "University of Florida", city: "Gainesville, FL", lat: 29.6436, lng: -82.3549 },
  { name: "Florida State", city: "Tallahassee, FL", lat: 30.4419, lng: -84.2985 },
  { name: "UCF", city: "Orlando, FL", lat: 28.6024, lng: -81.2001 },
  { name: "USF", city: "Tampa, FL", lat: 28.0587, lng: -82.4139 },
  { name: "FIU", city: "Miami, FL", lat: 25.7562, lng: -80.3755 },
  { name: "University of Miami", city: "Coral Gables, FL", lat: 25.7215, lng: -80.2793 },
  { name: "FAU", city: "Boca Raton, FL", lat: 26.3725, lng: -80.1012 },
  { name: "FAMU", city: "Tallahassee, FL", lat: 30.4251, lng: -84.2878 },
  { name: "UNF", city: "Jacksonville, FL", lat: 30.2697, lng: -81.5079 },
  { name: "Georgia", city: "Athens, GA", lat: 33.948, lng: -83.3773 },
  { name: "Georgia Tech", city: "Atlanta, GA", lat: 33.7756, lng: -84.3963 },
  { name: "Alabama", city: "Tuscaloosa, AL", lat: 33.2114, lng: -87.5401 },
  { name: "Auburn", city: "Auburn, AL", lat: 32.6032, lng: -85.4877 },
  { name: "South Carolina", city: "Columbia, SC", lat: 33.9938, lng: -81.0299 },
  { name: "Clemson", city: "Clemson, SC", lat: 34.6834, lng: -82.8374 },
  { name: "UNC", city: "Chapel Hill, NC", lat: 35.9049, lng: -79.0469 },
  { name: "Tennessee", city: "Knoxville, TN", lat: 35.9544, lng: -83.9295 },
  { name: "LSU", city: "Baton Rouge, LA", lat: 30.4133, lng: -91.18 },
  { name: "Texas", city: "Austin, TX", lat: 30.2849, lng: -97.7341 },
  { name: "Texas A&M", city: "College Station, TX", lat: 30.6187, lng: -96.3365 },
  { name: "Ohio State", city: "Columbus, OH", lat: 40.0067, lng: -83.0305 },
  { name: "Michigan", city: "Ann Arbor, MI", lat: 42.278, lng: -83.7382 },
  { name: "Penn State", city: "State College, PA", lat: 40.7982, lng: -77.8599 },
  { name: "UCLA", city: "Los Angeles, CA", lat: 34.0689, lng: -118.4452 },
  { name: "Arizona State", city: "Tempe, AZ", lat: 33.4242, lng: -111.9281 },
];

export function campusByName(name: string) {
  return CAMPUSES.find((c) => c.name === name) ?? null;
}

/** Where the map should open for a saved location. */
export function locationCenter(loc: UserLocation | null): LatLng | null {
  if (!loc) return null;
  if (loc.type === "point") return { lat: loc.lat, lng: loc.lng };
  if (loc.type === "campus") {
    const c = campusByName(loc.campus);
    return c ? { lat: c.lat, lng: c.lng } : null;
  }
  return loc.center ?? null;
}

export function locationLabel(loc: UserLocation | null) {
  if (!loc) return null;
  if (loc.type === "campus") return loc.campus;
  if (loc.type === "zip") return loc.place ? `${loc.place} ${loc.zip}` : loc.zip;
  return "Near you";
}

export type Store = {
  id: string;
  name: string;
  lat: number;
  lng: number;
  /** budget = discount chains and warehouse clubs */
  tier: "budget" | "standard" | "premium";
};

const BUDGET = /aldi|lidl|walmart|save.?a.?lot|costco|sam'?s club|food lion|winco|grocery outlet|bj'?s|dollar general|family dollar|price ?rite|food 4 less|fiesta|h-?e-?b|smart ?& ?final/i;
const PREMIUM = /whole foods|fresh market|sprouts|erewhon|wegmans|earth fare|natural grocers/i;

export function storeTier(name: string): Store["tier"] {
  if (BUDGET.test(name)) return "budget";
  if (PREMIUM.test(name)) return "premium";
  return "standard";
}
