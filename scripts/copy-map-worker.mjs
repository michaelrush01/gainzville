// Copies MapLibre's web worker into /public so the browser can load it.
// Runs automatically before dev and build, so it always matches the installed version.
import { copyFileSync, mkdirSync } from "node:fs";

mkdirSync("public/maplibre", { recursive: true });
copyFileSync("node_modules/maplibre-gl/dist/maplibre-gl-worker.mjs", "public/maplibre/maplibre-gl-worker.mjs");
console.log("copied maplibre worker");
