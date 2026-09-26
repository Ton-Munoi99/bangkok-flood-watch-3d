// Every 10 minutes: record Bangkok flood readings into Netlify Blobs (one file per day, 7 days kept).
// Runs on Netlify's (overseas) servers, so it uses only sources reachable from abroad:
// ThaiWater (incl. its relay of BMA road-flood sensors) and Traffy. weather.bangkok.go.th blocks non-Thai IPs.
import { getStore } from '@netlify/blobs';
import {
  DayBuilder, HISTORY_DAYS, TRAFFY, TW, addCanal, addFloodRoad, addRain, addReports,
  emptyDay, emptyMeta, mergeDay, slot, type DayFile, type Meta,
} from '../../src/data/history.ts';

const getJson = async (url: string) => {
  const r = await fetch(url, { signal: AbortSignal.timeout(20_000) });
  if (!r.ok) throw new Error(`${r.status} ${url}`);
  return r.json();
};

export default async () => {
  const store = getStore('history');
  const now = Date.now();
  const meta = ((await store.get('meta', { type: 'json' })) as Meta | null) ?? emptyMeta();
  const b = new DayBuilder();

  const results = await Promise.allSettled([
    // Only keep road readings from the last hour: ThaiWater's relay can stall and keep serving old values.
    getJson(`${TW}/flood_road`).then((d) => addFloodRoad(meta, b, d.data, now - 3600_000)),
    getJson(`${TW}/waterlevel_load?province_code=10`).then((d) => addCanal(meta, b, d.waterlevel_data.data)),
    getJson(`${TW}/rain_24h?province_code=10`).then((d) => addRain(meta, b, d.data)),
    getJson(`${TRAFFY}?limit=500`).then((d) => addReports(b, d.results)),
  ]);
  for (const r of results) if (r.status === 'rejected') console.error('source failed:', r.reason);

  await store.setJSON('meta', meta);
  const oldest = slot(now - HISTORY_DAYS * 86400_000).day;
  for (const [day, add] of b.days) {
    if (day < oldest) continue;
    // ponytail: read-modify-write without locking; fine for one writer every 10 min.
    const base = ((await store.get(`day/${day}`, { type: 'json' })) as DayFile | null) ?? emptyDay();
    await store.setJSON(`day/${day}`, mergeDay(base, add));
  }

  const { blobs } = await store.list({ prefix: 'day/' });
  for (const x of blobs) if (x.key.slice(4) < oldest) await store.delete(x.key);
  console.log('collected', [...b.days.keys()].join(','), results.map((r) => r.status).join(','));
};

export const config = { schedule: '*/10 * * * *' };
