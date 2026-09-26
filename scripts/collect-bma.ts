// Pushes BMA road-flood readings to the site. Must run on a Thai IP (weather.bangkok.go.th blocks others),
// e.g. every 30 min from a Mac (launchd) or an AWS Lambda in ap-southeast-7.
//   INGEST_TOKEN=... node scripts/collect-bma.ts          # push to https://bangkokflood.netlify.app
//   node scripts/collect-bma.ts --dry                      # just print what would be sent
// Identifies itself honestly; reads only the public home page, once per run.
import { readFileSync } from 'node:fs';
import { parseBmaHome, slot } from '../src/data/history.ts';

const UA = 'BangkokFloodWatch3D/0.1 (+https://github.com/Ton-Munoi99/bangkok-flood-watch-3d)';
const INGEST_URL = process.env.INGEST_URL ?? 'https://bangkokflood.netlify.app/api/ingest';
const dry = process.argv.includes('--dry');

// Station list (codes, coordinates, English names) — BMA's sensor sites rarely change.
const stations = JSON.parse(readFileSync(new URL('../src/data/mock/bma_flood.json', import.meta.url), 'utf8')) as
  { flood_code: string; flood_name: string; flood_name_en: string; latitude: number; longitude: number }[];
const norm = (s: string) => s.replace(/\s+/g, ' ').trim();

const res = await fetch('https://weather.bangkok.go.th/', { headers: { 'user-agent': UA }, signal: AbortSignal.timeout(60_000) });
if (!res.ok) throw new Error(`BMA home ${res.status}`);
const flooded = new Map(parseBmaHome(await res.text()).map((r) => [norm(r.name), r.cm]));

const { day, bucket } = slot(Date.now());
const updated = `${day}T${bucket}`;
const readings = stations.filter((s) => s.latitude && s.longitude).map((s) => ({
  code: s.flood_code, th: norm(s.flood_name), en: s.flood_name_en ?? '', lng: s.longitude, lat: s.latitude,
  cm: flooded.get(norm(s.flood_name)) ?? 0, // the home page lists only flooded stations
  updated,
}));
const unmatched = [...flooded.keys()].filter((n) => !stations.some((s) => norm(s.flood_name) === n));
console.log(`${updated} flooded ${flooded.size}, unmatched ${unmatched.length}${unmatched.length ? ': ' + unmatched.join(' | ') : ''}`);

if (dry) {
  console.log(readings.filter((r) => r.cm > 0).map((r) => `${r.cm} ${r.th}`).join('\n'));
} else {
  const token = process.env.INGEST_TOKEN;
  if (!token) throw new Error('INGEST_TOKEN not set');
  const r = await fetch(INGEST_URL, {
    method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify({ fetchedAt: new Date().toISOString(), readings }), signal: AbortSignal.timeout(60_000),
  });
  console.log('ingest', r.status, await r.text());
  if (!r.ok) process.exit(1);
}
