// Every 10 minutes: record Bangkok flood readings into Netlify Blobs (one file per day, 7 days kept).
// Runs on Netlify's (overseas) servers, so it uses only sources reachable from abroad:
// ThaiWater (incl. its relay of BMA road-flood sensors), Traffy and Longdo (events, traffic index). weather.bangkok.go.th blocks non-Thai IPs.
import { getStore } from '@netlify/blobs';
import {
  DayBuilder, HISTORY_DAYS, LONGDO_EVENTS, LONGDO_TRAFFIC_INDEX, TRAFFY, TW, addCanal, addFloodRoad, addRain, addReports, parseLongdoEvents,
  emptyDay, emptyMeta, mergeDay, parseDams, slot, type DayFile, type Meta, type Upstream,
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
    // The feed also carries recent expired events, so this backfills itself.
    getJson(LONGDO_EVENTS).then((d) => parseLongdoEvents(d).forEach((e) => b.event(e, now))),
    getJson(LONGDO_TRAFFIC_INDEX).then((d) => Number.isFinite(d.index) && b.traffic(Number(d.time) * 1000, Number(d.index))),
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

  // Dam figures are daily and only ship inside ThaiWater's 10 MB thailand_main, so refresh them every 3 h, not every run.
  const up = (await store.get('upstream', { type: 'json' })) as Upstream | null;
  if (!up || now - Date.parse(up.fetchedAt) > 3 * 3600_000) {
    try {
      const dams = parseDams(await getJson(`${TW}/thailand_main`));
      if (dams.length) await store.setJSON('upstream', { fetchedAt: new Date(now).toISOString(), dams } satisfies Upstream);
    } catch (e) { console.error('dams failed:', e); }
  }

  const { blobs } = await store.list({ prefix: 'day/' });
  for (const x of blobs) if (x.key.slice(4) < oldest) await store.delete(x.key);
  console.log('collected', [...b.days.keys()].join(','), results.map((r) => r.status).join(','));
};

export const config = { schedule: '*/10 * * * *' };
