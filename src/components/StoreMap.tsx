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
  textBright: "#f1eef8",
  pin: "rgba(29,23,48,0.92)",
  pinEdge: "rgba(183,156,255,0.45)",
  accent: "#b79cff",
  heading: "#e6ddff",
  food: "#ffb38a",
  deal: "#8dffc5",
};

type Props = {
  center: LatLng;
  stores: Store[];
  showUser: boolean;
  highlightId?: string | null;
  onSelect?: (s: Store) => void;
  /** Store id -> this week's deals (count + best one), shown right on the pin */
  dealCounts?: Record<string, { n: number; best: string }>;
};

export function StoreMap({ center, stores, showUser, highlightId, onSelect, dealCounts }: Props) {
  const box = useRef<HTMLDivElement>(null);
  const map = useRef<MLMap | null>(null);
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
          // Phones report 3x pixel density; rendering a 3D map at 3x can run iPhones out of memory
          pixelRatio: Math.min(window.devicePixelRatio || 1, 2),
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
      const m = map.current;
      if (m) {
        // Free the GPU context right away; iOS Safari kills pages that keep old ones around
        const canvas = m.getCanvas();
        const gl = canvas.getContext("webgl2") ?? canvas.getContext("webgl");
        m.remove();
        gl?.getExtension("WEBGL_lose_context")?.loseContext();
      }
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

  // Tapping a pin selects that store (kept in a ref so the map's click handler stays current)
  const selectRef = useRef(onSelect);
  const storesRef = useRef(stores);
  useEffect(() => {
    selectRef.current = onSelect;
    storesRef.current = stores;
  }, [onSelect, stores]);

  // Pin layers, added once the themed style has loaded. Drawn by the map itself
  // so overlapping labels hide automatically and more appear as you zoom in.
  useEffect(() => {
    const m = map.current;
    if (!themed || !m || m.getSource("stores")) return;
    addPinImages(m);
    m.addSource("stores", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
    m.addLayer({
      id: "store-pins",
      type: "symbol",
      source: "stores",
      layout: {
        // Store name, plus its best deal of the week on a second line in green
        "text-field": [
          "case",
          ["get", "hasDeal"],
          ["format", ["get", "name"], {}, "\n", {}, ["get", "deal"], { "font-scale": 0.88, "text-color": C.deal }],
          ["get", "name"],
        ],
        "text-line-height": 1.35,
        "text-max-width": 16,
        "text-font": ["Noto Sans Bold"],
        "text-size": 11,
        "icon-image": ["case", ["get", "hot"], "pin-hot", ["get", "hasDeal"], "pin-deal", ["==", ["get", "kind"], "food"], "pin-food", ["==", ["get", "tier"], "budget"], "pin-budget", "pin"],
        "icon-text-fit": "both",
        "icon-text-fit-padding": [2, 8, 2, 8],
        "text-anchor": "bottom",
        "icon-anchor": "bottom",
            "symbol-sort-key": ["get", "rank"],
        "text-justify": "center",
        "text-padding": 4,
      },
      paint: {
        "text-color": ["case", ["get", "hot"], C.ground, ["get", "hasDeal"], C.textBright, ["any", ["==", ["get", "tier"], "budget"], ["==", ["get", "kind"], "food"]], C.ground, C.textBright],
      },
    });
    m.on("click", "store-pins", (e) => {
      const id = e.features?.[0]?.properties?.id;
      const s = storesRef.current.find((x) => x.id === id);
      if (s) selectRef.current?.(s);
    });
    m.on("mouseenter", "store-pins", () => (m.getCanvas().style.cursor = "pointer"));
    m.on("mouseleave", "store-pins", () => (m.getCanvas().style.cursor = ""));
  }, [themed]);

  // Keep pin data in sync with the store list and the selection
  useEffect(() => {
    const m = map.current;
    if (!themed || !m) return;
    const src = m.getSource("stores") as maplibregl.GeoJSONSource | undefined;
    src?.setData({
      type: "FeatureCollection",
      features: stores.map((s, i) => {
        const hot = s.id === highlightId;
        return {
          type: "Feature",
          geometry: { type: "Point", coordinates: [s.lng, s.lat] },
          properties: {
            id: s.id,
            name: s.name,
            deal: dealCounts?.[s.id] ? `${dealCounts[s.id].best}${dealCounts[s.id].n > 1 ? `  +${dealCounts[s.id].n - 1} more` : ""}` : "",
            hasDeal: Boolean(dealCounts?.[s.id]),
            tier: s.tier ?? "standard",
            kind: s.kind ?? "grocery",
            hot,
            // Placement priority when labels collide: selected, then stores with deals, then budget, then nearest
            rank: hot ? 0 : (dealCounts?.[s.id] ? 1 : s.tier === "budget" ? 2 : s.kind === "food" ? 500 : 1000) + i,
          },
        };
      }),
    });

    // First time we have stores for this place, frame the nearby ones (keeping the 3D tilt)
    const key = `${center.lat},${center.lng}`;
    if (stores.length && fittedFor.current !== key) {
      fittedFor.current = key;
      const bounds = new maplibregl.LngLatBounds([center.lng, center.lat], [center.lng, center.lat]);
      // Closest dozen only, so one far-off store doesn't zoom the map way out
      stores
        .filter((s) => s.kind !== "food" && distanceKm(center, s) < 8)
        .slice(0, 12)
        .forEach((s) => bounds.extend([s.lng, s.lat]));
      m.fitBounds(bounds, { padding: { top: 110, bottom: 40, left: 40, right: 40 }, maxZoom: 15.2, pitch: m.getPitch(), bearing: m.getBearing(), duration: 1200 });
    }
  }, [themed, stores, highlightId, center, dealCounts]);

  // "You are here" dot
  useEffect(() => {
    const m = map.current;
    if (!themed || !m || !showUser) return;
    const me = document.createElement("div");
    me.className = "gz-me";
    const marker = new maplibregl.Marker({ element: me }).setLngLat([center.lng, center.lat]).addTo(m);
    return () => {
      marker.remove();
    };
  }, [themed, showUser, center]);

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

/** Stretchable pill backgrounds for the pin labels (the map stretches them to fit each name). */
function addPinImages(m: MLMap) {
  const make = (name: string, fill: string, edge: string, edgeWidth: number) => {
    const r = 12;
    const size = r * 2 + 2;
    const ratio = 2;
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = size * ratio;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.scale(ratio, ratio);
    ctx.beginPath();
    ctx.roundRect(edgeWidth / 2, edgeWidth / 2, size - edgeWidth, size - edgeWidth, r - edgeWidth / 2);
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.lineWidth = edgeWidth;
    ctx.strokeStyle = edge;
    ctx.stroke();
    const data = ctx.getImageData(0, 0, canvas.width, canvas.height);
    m.addImage(name, data, {
      pixelRatio: ratio,
      stretchX: [[r * ratio, (r + 2) * ratio]],
      stretchY: [[r * ratio, (r + 2) * ratio]],
      content: [r * ratio * 0.5, r * ratio * 0.5, (size - r * 0.5) * ratio, (size - r * 0.5) * ratio],
    });
  };
  make("pin", C.pin, C.pinEdge, 1);
  make("pin-budget", C.accent, C.accent, 1);
  make("pin-food", C.food, C.food, 1);
  make("pin-hot", C.accent, C.heading, 3);
  make("pin-deal", "rgba(16,40,30,0.94)", C.deal, 2);
}

function distanceKm(a: LatLng, b: LatLng) {
  const dLat = (b.lat - a.lat) * 111;
  const dLng = (b.lng - a.lng) * 111 * Math.cos((a.lat * Math.PI) / 180);
  return Math.hypot(dLat, dLng);
}
