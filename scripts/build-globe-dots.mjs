/**
 * Pre-computes the land dot-matrix used by the 3D globe.
 *
 *   node scripts/build-globe-dots.mjs
 *
 * Output: public/globe-dots.json  ->  { step, points: [[lat, lng], ...] }
 * Keeping this pre-computed means the browser never has to ship or parse
 * topojson / d3-geo at runtime.
 */
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { feature } from "topojson-client";
import { geoContains } from "d3-geo";

const require = createRequire(import.meta.url);
const topo = require("world-atlas/land-50m.json");
const land = feature(topo, topo.objects.land);

const STEP = 1.7; // degrees between dots
const points = [];

for (let lat = -84; lat <= 84; lat += STEP) {
  const circumference = Math.cos((lat * Math.PI) / 180);
  const count = Math.max(1, Math.round((360 / STEP) * circumference));
  for (let i = 0; i < count; i++) {
    const lng = -180 + (360 / count) * i;
    if (geoContains(land, [lng, lat])) {
      points.push([Math.round(lat * 100) / 100, Math.round(lng * 100) / 100]);
    }
  }
}

const out = path.join(process.cwd(), "public", "globe-dots.json");
fs.writeFileSync(out, JSON.stringify({ step: STEP, points }));
console.log(`✓ ${points.length} land dots -> public/globe-dots.json`);
