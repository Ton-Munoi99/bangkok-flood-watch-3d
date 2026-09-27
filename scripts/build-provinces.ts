// Builds data/th_provinces.geojson (76 provinces, Bangkok left out: it has its own district layer).
// Source: geoBoundaries THA ADM1 (simplified), boundaries © OpenStreetMap contributors, ODbL 1.0.
// Run once: node scripts/build-provinces.ts <path to geoBoundaries-THA-ADM1_simplified.geojson>
// Shrinks it further: Douglas–Peucker at ~300 m, coordinates rounded to 3 decimals. Fine for a country-scale overview.
import { readFileSync, writeFileSync } from 'node:fs';

type Pt = [number, number];
const TOL = 0.003; // degrees ≈ 300 m
function dp(pts: Pt[]): Pt[] {
  if (pts.length < 3) return pts;
  const [a, b] = [pts[0], pts.at(-1)!];
  let max = 0, idx = 0;
  for (let i = 1; i < pts.length - 1; i++) {
    const [x, y] = pts[i], dx = b[0] - a[0], dy = b[1] - a[1];
    const d = Math.abs(dy * x - dx * y + b[0] * a[1] - b[1] * a[0]) / (Math.hypot(dx, dy) || 1);
    if (d > max) { max = d; idx = i; }
  }
  return max > TOL ? [...dp(pts.slice(0, idx + 1)).slice(0, -1), ...dp(pts.slice(idx))] : [a, b];
}
// A ring starts and ends on the same point, so split it at its middle and simplify both halves.
const ring = (r: Pt[]) => {
  const mid = r.length >> 1;
  const out = [...dp(r.slice(0, mid + 1)).slice(0, -1), ...dp(r.slice(mid))].map(([x, y]) => [+x.toFixed(3), +y.toFixed(3)] as Pt);
  return out.length >= 4 ? out : null; // drop slivers that collapse
};
const src = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const features = src.features.filter((f: any) => f.properties.shapeISO !== 'TH-10').map((f: any) => {
  const polys: Pt[][][] = f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates;
  const kept = polys.map((p) => p.map(ring).filter((r): r is Pt[] => !!r)).filter((p) => p.length);
  return { type: 'Feature', properties: { code: String(f.properties.shapeISO).replace('TH-', '') }, geometry: { type: 'MultiPolygon', coordinates: kept } };
});
writeFileSync('data/th_provinces.geojson', JSON.stringify({ type: 'FeatureCollection', attribution: 'geoBoundaries (THA ADM1) · © OpenStreetMap contributors, ODbL 1.0', features }));
console.log(features.length, 'provinces');
