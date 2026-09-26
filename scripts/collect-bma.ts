// Pushes BMA road-flood readings to the site. Must run on a Thai IP (weather.bangkok.go.th blocks others),
// e.g. every 30 min from a Mac (launchd) or an AWS Lambda in ap-southeast-7.
//   INGEST_TOKEN=... node scripts/collect-bma.ts          # push to https://bangkokflood.netlify.app
//   node scripts/collect-bma.ts --dry                      # just print what would be sent
// Identifies itself honestly; reads only the public home page, once per run.
import { readFileSync } from 'node:fs';
import { TW, parseBmaHome, slot } from '../src/data/history.ts';

const UA = 'BangkokFloodWatch3D/0.1 (+https://github.com/Ton-Munoi99/bangkok-flood-watch-3d)';
const INGEST_URL = process.env.INGEST_URL ?? 'https://bangkokflood.netlify.app/api/ingest';
const dry = process.argv.includes('--dry');

// Station list (codes, coordinates, English names) saved from BMA's /flood/ page.
type Station = { flood_code: string; flood_name: string; flood_name_en: string; latitude: number; longitude: number };
const stations = JSON.parse(readFileSync(new URL('../src/data/mock/bma_flood.json', import.meta.url), 'utf8')) as Station[];
const norm = (s: string) => s.replace(/\s+/g, ' ').trim();

/** Coordinates for home-page names missing from the saved list, looked up in ThaiWater's copy of the same
 *  sensor network. Only names BMA is reporting right now are added, so stations ThaiWater still lists but
 *  that went silent years ago never appear as live "0 cm" readings. Fetched only when something is unmatched. */
async function placeUnmatched(names: string[]): Promise<Station[]> {
  const res = await fetch(`${TW}/flood_road`, { headers: { 'user-agent': UA }, signal: AbortSignal.timeout(30_000) });
  const rows = ((await res.json())?.data ?? []) as { station?: { floodroad_name?: { th?: string }; floodroad_oldcode?: string; floodroad_lat?: number; floodroad_long?: number } }[];
  const byName = new Map<string, Station>();
  for (const { station: t } of rows) {
    const name = t?.floodroad_name?.th, code = t?.floodroad_oldcode;
    if (!name || !code || !t.floodroad_lat || !t.floodroad_long) continue; // skip malformed rows, keep going
    byName.set(norm(name), { flood_code: code, flood_name: norm(name), flood_name_en: '', latitude: t.floodroad_lat, longitude: t.floodroad_long });
  }
  return names.map((n) => byName.get(n)).filter((x): x is Station => !!x);
}

// BMA's firewall intermittently answers 403 even to normal traffic; a block usually clears within minutes.
// Retry politely (same honest User-Agent, spaced out) rather than losing the whole 30-min slot.
async function fetchHome() {
  const waits = [0, 60_000, 180_000];
  for (let i = 0; ; i++) {
    await new Promise((r) => setTimeout(r, waits[i]));
    const res = await fetch('https://weather.bangkok.go.th/', { headers: { 'user-agent': UA }, signal: AbortSignal.timeout(60_000) }).catch((e) => e as Error);
    if (!(res instanceof Error) && res.ok) return res.text();
    const why = res instanceof Error ? res.message : `HTTP ${res.status}`;
    if (i === waits.length - 1) throw new Error(`BMA home failed after ${waits.length} tries: ${why}`);
    console.log(`BMA home ${why}; retrying in ${waits[i + 1] / 60_000} min`);
  }
}
const home = parseBmaHome(await fetchHome());
const flooded = new Map(home.map((r) => [norm(r.name), r.cm]));

// Name -> station. A name shared by two codes can't be placed reliably, so it's reported instead of doubled.
const byName = new Map<string, Station | null>();
for (const s of stations) { const n = norm(s.flood_name); byName.set(n, byName.has(n) ? null : s); }
const ambiguous = [...byName].filter(([, s]) => s === null).map(([n]) => n);
let unmatched = [...flooded.keys()].filter((n) => !byName.has(n));
if (unmatched.length) {
  const extra = await placeUnmatched(unmatched).catch((e) => { console.log('ThaiWater lookup failed:', (e as Error).message); return []; });
  for (const s of extra) { stations.push(s); byName.set(s.flood_name, s); }
  unmatched = unmatched.filter((n) => !byName.has(n));
}

const { day, bucket } = slot(Date.now());
const updated = `${day}T${bucket}`;
const readings = stations.filter((s) => s.latitude && s.longitude && byName.get(norm(s.flood_name)) === s).map((s) => ({
  code: s.flood_code, th: norm(s.flood_name), en: s.flood_name_en ?? '', lng: s.longitude, lat: s.latitude,
  cm: flooded.get(norm(s.flood_name)) ?? 0, // the home page lists only flooded stations
  updated,
}));
console.log(`${updated} flooded ${flooded.size}, unmatched ${unmatched.length}${unmatched.length ? ': ' + unmatched.join(' | ') : ''}`
  + (ambiguous.length ? `, ambiguous names skipped: ${ambiguous.join(' | ')}` : ''));

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
