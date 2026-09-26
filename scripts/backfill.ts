// One-off: fill the last 7 days of history before the collector existed.
//   node scripts/backfill.ts --dry <outDir>     # write day files locally to inspect
//   NETLIFY_SITE_ID=... NETLIFY_AUTH_TOKEN=... node scripts/backfill.ts   # merge into the site's Blobs
// Sources: ThaiWater per-station graphs (road flood + canal levels, 10-min) and Traffy by date.
// No rain: ThaiWater has no public 24h-rain history endpoint. Existing (collector) values win over backfilled ones.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { getStore } from '@netlify/blobs';
import {
  DayBuilder, HISTORY_DAYS, TRAFFY, TW, addCanal, addFloodRoad, addReports, bkkMs,
  emptyMeta, mergeDay, slot, type DayFile, type Meta,
} from '../src/data/history.ts';

const dry = process.argv[2] === '--dry' ? process.argv[3] : null;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function getJson(url: string) {
  await sleep(250); // be polite: sequential, spaced requests
  const r = await fetch(url, { signal: AbortSignal.timeout(60_000) });
  if (!r.ok) throw new Error(`${r.status} ${url}`);
  return r.json();
}

const now = Date.now();
const from = slot(now - HISTORY_DAYS * 86400_000).day;
const to = slot(now).day;
const meta: Meta = emptyMeta();
const b = new DayBuilder();

// English road names come from the BMA snapshot (ThaiWater only has Thai).
const bmaEn = new Map((JSON.parse(readFileSync(new URL('../src/data/mock/bma_flood.json', import.meta.url), 'utf8')) as { flood_code: string; flood_name_en: string }[])
  .map((f) => [f.flood_code, f.flood_name_en]));

// Road flood sensors (BMA, relayed by ThaiWater)
const road = (await getJson(`${TW}/flood_road`)).data as { station: { id: number; floodroad_oldcode: string } }[];
addFloodRoad(meta, b, road as never, Infinity); // meta only
for (const [code, m] of Object.entries(meta.road)) m.en = bmaEn.get(code) ?? '';
let n = 0;
for (const { station } of road) {
  const g = (await getJson(`${TW}/flood_road_graph?station_id=${station.id}&date_start=${from}&date_end=${to}`)).data as { floodroad_datetime: string; floodroad_value: number | null }[];
  for (const p of g) if (p.floodroad_value != null) b.road(bkkMs(p.floodroad_datetime), station.floodroad_oldcode, Number(p.floodroad_value));
  if (++n % 25 === 0) console.log(`road ${n}/${road.length}`);
}

// Canal / river levels
const wl = (await getJson(`${TW}/waterlevel_load?province_code=10`)).waterlevel_data.data;
addCanal(meta, b, wl);
for (const id of Object.keys(meta.canal)) {
  const g = (await getJson(`${TW}/waterlevel_graph?station_type=tele_waterlevel&station_id=${id}&start_date=${from}&end_date=${to}`)).data.graph_data as { datetime: string; value: number | null }[];
  for (const p of g) if (p.value != null) b.canal(bkkMs(p.datetime), id, Number(p.value));
}
console.log('canal done');

// Traffy: date filter is by UTC day, max 1000 per page.
for (let t = now - (HISTORY_DAYS + 1) * 86400_000; t <= now; t += 86400_000) {
  const day = new Date(t).toISOString().slice(0, 10);
  for (let offset = 0; ; offset += 1000) {
    const d = await getJson(`${TRAFFY}?limit=1000&offset=${offset}&start=${day}&end=${day}`);
    addReports(b, d.results);
    if (d.results.length < 1000) break;
  }
  console.log('traffy', day);
}

const store = dry ? null : getStore({ name: 'history', siteID: process.env.NETLIFY_SITE_ID!, token: process.env.NETLIFY_AUTH_TOKEN! });
if (dry) mkdirSync(dry, { recursive: true });
for (const [day, add] of [...b.days].sort()) {
  if (day < from) continue;
  const summary = `${day}: road buckets ${Object.keys(add.road).length}, canal ${Object.keys(add.canal).length}, reports ${Object.keys(add.reports).length}`;
  if (dry) {
    writeFileSync(`${dry}/${day}.json`, JSON.stringify(add));
  } else {
    const existing = ((await store!.get(`day/${day}`, { type: 'json' })) as DayFile | null);
    await store!.setJSON(`day/${day}`, existing ? mergeDay(add, existing) : add);
  }
  console.log(summary);
}
if (dry) writeFileSync(`${dry}/meta.json`, JSON.stringify(meta));
else {
  const existing = ((await store!.get('meta', { type: 'json' })) as Meta | null) ?? emptyMeta();
  // Keep backfilled English names; everything else from whichever is newer (collector).
  for (const [k, v] of Object.entries(meta.road)) existing.road[k] = { ...v, ...existing.road[k], en: v.en || existing.road[k]?.en || '' };
  existing.canal = { ...meta.canal, ...existing.canal };
  await store!.setJSON('meta', existing);
}
console.log('done');
