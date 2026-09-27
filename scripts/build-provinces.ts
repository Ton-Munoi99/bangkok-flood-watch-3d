// Builds data/th_provinces.geojson (76 provinces, Bangkok left out: it has its own district layer).
// Source: geoBoundaries THA ADM1 (simplified), boundaries © OpenStreetMap contributors, ODbL 1.0.
// Run once: node scripts/build-provinces.ts <path to geoBoundaries-THA-ADM1_simplified.geojson>
// Shrinks it further: Douglas–Peucker at ~300 m, coordinates rounded to 3 decimals. Fine for a country-scale overview.
import { readFileSync, writeFileSync } from 'node:fs';

import { simplifyPolys } from './simplify.ts';

const src = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const features = src.features.filter((f: any) => f.properties.shapeISO !== 'TH-10').map((f: any) => {
  const kept = simplifyPolys(f.geometry, 0.003); // ≈ 300 m
  return { type: 'Feature', properties: { code: String(f.properties.shapeISO).replace('TH-', '') }, geometry: { type: 'MultiPolygon', coordinates: kept } };
});
writeFileSync('data/th_provinces.geojson', JSON.stringify({ type: 'FeatureCollection', attribution: 'geoBoundaries (THA ADM1) · © OpenStreetMap contributors, ODbL 1.0', features }));
console.log(features.length, 'provinces');
