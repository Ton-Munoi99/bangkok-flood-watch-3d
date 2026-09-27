// Builds data/th_amphoe.geojson: ~878 amphoe outside Bangkok (Bangkok's 50 khet have their own layer).
// Source: geoBoundaries THA ADM2 (Royal Thai Survey Department / OCHA ROAP, CC BY 3.0 IGO).
// Thai names + province come from ThaiWater rain stations that fall inside each amphoe (the source has English only).
//   node scripts/build-amphoe.ts <geoBoundaries-THA-ADM2_simplified.geojson> <rain_24h.json from ThaiWater>
import { readFileSync, writeFileSync } from 'node:fs';
import { simplifyPolys } from './simplify.ts';
import { bboxOf, inPolys, type Ring } from '../src/data/history.ts';

const [adm2Path, rainPath] = process.argv.slice(2);
const adm2 = JSON.parse(readFileSync(adm2Path, 'utf8'));
const stations = (JSON.parse(readFileSync(rainPath, 'utf8')).data as any[]).map((r) => ({
  x: Number(r.station?.tele_station_long), y: Number(r.station?.tele_station_lat),
  th: String(r.geocode?.amphoe_name?.th ?? ''), prov: String(r.geocode?.province_name?.th ?? ''), code: String(r.geocode?.province_code ?? ''),
})).filter((s) => s.x && s.y);
const bkk = JSON.parse(readFileSync('data/bkk_districts.geojson', 'utf8')).features
  .map((f: any) => (f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates) as Ring[][]);

// Province for amphoe with no station inside: which province polygon holds its bbox centre.
const provs = JSON.parse(readFileSync('data/th_provinces.geojson', 'utf8')).features
  .map((f: any) => ({ code: String(f.properties.code), polys: f.geometry.coordinates as Ring[][] }));
const mode = (xs: string[]) => [...xs.reduce((m, x) => m.set(x, (m.get(x) ?? 0) + 1), new Map<string, number>())].sort((a, b) => b[1] - a[1])[0]?.[0] ?? '';
let skippedBkk = 0;
const features = adm2.features.flatMap((f: any, i: number) => {
  const polys = simplifyPolys(f.geometry, 0.004) as Ring[][]; // ≈ 400 m: fine at the zooms this layer shows
  if (!polys.length) return [];
  const bb = bboxOf(polys);
  // Bangkok khet: the centre of the bbox lies in one of our Bangkok district polygons.
  const cx = (bb[0] + bb[2]) / 2, cy = (bb[1] + bb[3]) / 2;
  if (bkk.some((p: Ring[][]) => inPolys(cx, cy, p))) { skippedBkk++; return []; }
  const inside = stations.filter((s) => inPolys(s.x, s.y, polys, bb));
  return [{ type: 'Feature', id: i, properties: { id: i, en: String(f.properties.shapeName), th: mode(inside.map((s) => s.th)),
    prov: mode(inside.map((s) => s.prov)), code: mode(inside.map((s) => s.code)) || (provs.find((p: any) => inPolys(cx, cy, p.polys))?.code ?? '') }, geometry: { type: 'MultiPolygon', coordinates: polys } }];
});
writeFileSync('data/th_amphoe.geojson', JSON.stringify({ type: 'FeatureCollection',
  attribution: 'geoBoundaries (THA ADM2) · Royal Thai Survey Department / OCHA ROAP, CC BY 3.0 IGO', features }));
const noTh = features.filter((f: any) => !f.properties.th).length;
console.log(`${features.length} amphoe, skipped ${skippedBkk} Bangkok khet, ${noTh} without a Thai name (no station inside), ${features.filter((f: any) => !f.properties.code).length} without a province`);
