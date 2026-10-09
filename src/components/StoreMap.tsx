"use client";

import "maplibre-gl/dist/maplibre-gl.css";
import * as maplibregl from "maplibre-gl";
import type { Map as MLMap, ErrorEvent } from "maplibre-gl";
import { useEffect, useRef, useState } from "react";
import type { LatLng, Store } from "@/lib/places";

// Real 3D map of wherever the user is: MapLibre (open source) + OpenFreeMap tiles
// (free, no key, real building heights). Restyled to the Gainzville plum palette.

const STYLE_URL = "https://tiles.openfreemap.org/styles/liberty";
// The map's background worker is served from /public (copied there by scripts/copy-map-worker.mjs)
maplibregl.setWorkerUrl("/maplibre/maplibre-gl-worker.mjs");
const C = {
  ground: "#120e1f",
  land: "#17122a",
  park: "#1b1631",
  water: "#0d0a18",
  road: "#352a52",
  roadMajor: "#463870",
  building: "#2a2140",
  text: "#9a90b5",
};

type Props = {
  center: LatLng;
  stores: Store[];
  showUser: boolean;
  highlightId?: string | null;
  onSelect?: (s: Store) => void;
};

export function StoreMap({ center, stores, showUser, highlightId, onSelect }: Props) {
  const box = useRef<HTMLDivElement>(null);
  const map = useRef<MLMap | null>(null);
  const markers = useRef<maplibregl.Marker[]>([]);
  const [mode, setMode] = useState<"3d" | "flat">("3d");
  const [failed, setFailed] = useState(false);
  const [themed, setThemed] = useState(false);
  const fittedFor = useRef<string | null>(null);

  // Create the map once
  useEffect(() => {
    if (!box.current) return;
    let cancelled = false;
    (async () => {
      try {
        if (cancelled || !box.current) return;
        const m = new maplibregl.Map({
          container: box.current,
          style: STYLE_URL,
          center: [center.lng, center.lat],
          zoom: 14.6,
          pitch: 60,
          bearing: -20,
          attributionControl: { compact: true },
        });
        map.current = m;
        if (process.env.NODE_ENV === "development") (window as unknown as { __gzmap: MLMap }).__gzmap = m;
        m.on("error", (e: ErrorEvent) => console.warn("map", e.error?.message));
        m.on("style.load", () => {
          applyTheme(m);
          setThemed(true);
        });
      } catch {
        setFailed(true);
      }
    })();
    return () => {
      cancelled = true;
      map.current?.remove();
      map.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Fly when the location changes
  useEffect(() => {
    map.current?.flyTo({ center: [center.lng, center.lat], zoom: 14.6, essential: true });
  }, [center.lat, center.lng]);

  // Fly to a store when one is highlighted (tapped, or picked by the coach)
  useEffect(() => {
    const s = stores.find((x) => x.id === highlightId);
    if (s) map.current?.flyTo({ center: [s.lng, s.lat], zoom: 15.5, essential: true, duration: 1400 });
  }, [highlightId, stores]);

  // 3D / Flat toggle
  useEffect(() => {
    map.current?.easeTo({ pitch: mode === "3d" ? 60 : 0, bearing: mode === "3d" ? -20 : 0, duration: 700 });
  }, [mode]);

  // Store pins (drawn once the themed style has loaded)
  useEffect(() => {
    const m = map.current;
    if (!themed || !m) return;
    markers.current.forEach((mk) => mk.remove());
    markers.current = [];
    for (const s of stores) {
      const el = document.createElement("button");
      const hot = s.id === highlightId;
      el.className = `gz-pin ${s.tier === "budget" ? "gz-pin-budget" : ""} ${hot ? "gz-pin-hot" : ""}`;
      el.textContent = s.name;
      el.setAttribute("aria-label", `${s.name}${s.tier === "budget" ? ", budget store" : ""}`);
      el.onclick = () => onSelect?.(s);
      markers.current.push(new maplibregl.Marker({ element: el, anchor: "bottom" }).setLngLat([s.lng, s.lat]).addTo(m));
    }
    // First time we have stores for this place, frame them all (keeping the 3D tilt)
    const key = `${center.lat},${center.lng}`;
    if (stores.length && fittedFor.current !== key) {
      fittedFor.current = key;
      const bounds = new maplibregl.LngLatBounds([center.lng, center.lat], [center.lng, center.lat]);
      // Only frame stores near this place (ignores stale results from a previous location)
      stores.filter((s) => distanceKm(center, s) < 8).forEach((s) => bounds.extend([s.lng, s.lat]));
      m.fitBounds(bounds, { padding: { top: 110, bottom: 40, left: 40, right: 40 }, maxZoom: 15.2, pitch: m.getPitch(), bearing: m.getBearing(), duration: 1200 });
    }
    if (showUser) {
      const me = document.createElement("div");
      me.className = "gz-me";
      markers.current.push(new maplibregl.Marker({ element: me }).setLngLat([center.lng, center.lat]).addTo(m));
    }
  }, [themed, stores, highlightId, showUser, center, onSelect]);

  return (
    <div className="relative h-full w-full">
      {failed ? (
        <div className="grid-floor flex h-full items-center justify-center p-8 text-center font-body text-muted">
          Map couldn&apos;t load. Check your connection.
        </div>
      ) : (
        <div ref={box} className={`h-full w-full bg-ground transition-opacity duration-700 ${themed ? "opacity-100" : "opacity-0"}`} />
      )}
      <div className="glass absolute right-4 top-4 z-10 flex rounded-full p-1">
        {(["3d", "flat"] as const).map((m) => (
          <button
            key={m}
            onClick={() => setMode(m)}
            className={`rounded-full px-4 py-2 font-mono text-sm ${mode === m ? "bg-accent font-bold text-on-accent" : "text-text"}`}
          >
            {m === "3d" ? "3D" : "Flat"}
          </button>
        ))}
      </div>
    </div>
  );
}

/** Recolor the loaded OpenFreeMap style to the app palette. Each layer is themed on its own, so one bad layer can't break the map. */
function applyTheme(m: MLMap) {
  type Prop = Parameters<MLMap["setPaintProperty"]>[1];
  type Value = Parameters<MLMap["setPaintProperty"]>[2];
  const set = (id: string, prop: string, value: string | number) => {
    try {
      m.setPaintProperty(id, prop as Prop, value as Value);
    } catch {
      /* layer doesn't support this property */
    }
  };
  for (const l of m.getStyle().layers) {
    const id = l.id;
    // Drop busy or off-theme layers: POI icons, transit, shields, and the light shaded-relief raster
    if ((l.type === "symbol" && /poi|transit|aerialway|housenumber|shield/.test(id)) || l.type === "hillshade" || l.type === "raster") {
      m.removeLayer(id);
      continue;
    }
    if (l.type === "background") set(id, "background-color", C.ground);
    else if (l.type === "fill") {
      if (/building/.test(id)) {
        m.removeLayer(id); // the 3D layer replaces flat buildings
        continue;
      }
      set(id, "fill-color", /water/.test(id) ? C.water : /park|wood|grass|landcover|landuse/.test(id) ? C.park : C.land);
      set(id, "fill-outline-color", "rgba(0,0,0,0)");
    } else if (l.type === "line") {
      set(
        id,
        "line-color",
        /water|river|stream/.test(id) ? C.water : /boundary|admin/.test(id) ? "rgba(183,156,255,0.15)" : /motorway|trunk|primary/.test(id) ? C.roadMajor : C.road,
      );
    } else if (l.type === "fill-extrusion") {
      set(id, "fill-extrusion-color", C.building);
      set(id, "fill-extrusion-opacity", 0.92);
    } else if (l.type === "symbol") {
      set(id, "text-color", C.text);
      set(id, "text-halo-color", C.ground);
      set(id, "text-halo-width", 1.2);
    }
  }
}

function distanceKm(a: LatLng, b: LatLng) {
  const dLat = (b.lat - a.lat) * 111;
  const dLng = (b.lng - a.lng) * 111 * Math.cos((a.lat * Math.PI) / 180);
  return Math.hypot(dLat, dLng);
}
