"use client";

// Asks the browser for the user's approximate location, with clear fixes when it fails.
// Many phones block location for all websites at the system level, so the browser
// never even shows a prompt. When that happens we say exactly where to turn it on.

export type GeoResult =
  | { ok: true; lat: number; lng: number }
  | { ok: false; reason: "denied" | "unavailable" | "timeout" | "unsupported" | "insecure"; message: string };

function platform() {
  const ua = navigator.userAgent;
  if (/iPhone|iPad|iPod/.test(ua)) return /CriOS/.test(ua) ? "ios-chrome" : "ios-safari";
  if (/Android/.test(ua)) return "android";
  return "desktop";
}

function deniedHelp() {
  switch (platform()) {
    case "ios-safari":
      return "Location is blocked. On iPhone: Settings → Privacy & Security → Location Services → Safari Websites → While Using the App. Then try again, or enter your ZIP.";
    case "ios-chrome":
      return "Location is blocked. On iPhone: Settings → Privacy & Security → Location Services → Chrome → While Using the App. Then try again, or enter your ZIP.";
    case "android":
      return "Location is blocked. Tap the icon left of the web address → Permissions → Location → Allow. Also check your phone's location is on. Or enter your ZIP.";
    default:
      return "Location is blocked for this site. Click the icon left of the web address and allow Location, or enter your ZIP.";
  }
}

/** Rounded to about 1 km: we only need the neighborhood, not the exact spot. */
export function getCoarsePosition(): Promise<GeoResult> {
  return new Promise((resolve) => {
    if (!window.isSecureContext) {
      return resolve({ ok: false, reason: "insecure", message: "Location only works on the secure (https) site. Enter your ZIP instead." });
    }
    if (!("geolocation" in navigator)) {
      return resolve({ ok: false, reason: "unsupported", message: "This browser can't share location. Enter your ZIP instead." });
    }
    navigator.geolocation.getCurrentPosition(
      (pos) =>
        resolve({
          ok: true,
          lat: Math.round(pos.coords.latitude * 100) / 100,
          lng: Math.round(pos.coords.longitude * 100) / 100,
        }),
      (err) => {
        if (err.code === err.PERMISSION_DENIED) resolve({ ok: false, reason: "denied", message: deniedHelp() });
        else if (err.code === err.TIMEOUT)
          resolve({ ok: false, reason: "timeout", message: "Finding your location took too long. Try again near a window, or enter your ZIP." });
        else
          resolve({ ok: false, reason: "unavailable", message: "Couldn't get your location. Check that location is on, or enter your ZIP." });
      },
      // Coarse and cached is fine: faster indoors and easier on battery
      { enableHighAccuracy: false, timeout: 15000, maximumAge: 10 * 60 * 1000 },
    );
  });
}
