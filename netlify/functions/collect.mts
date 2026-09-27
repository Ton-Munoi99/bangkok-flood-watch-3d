// Every 10 minutes: record Bangkok flood readings into Netlify Blobs (one file per day, 7 days kept).
// Runs on Netlify's (overseas) servers, so it uses only sources reachable from abroad:
// ThaiWater (incl. its relay of BMA road-flood sensors), Traffy and Longdo (events, traffic index). weather.bangkok.go.th blocks non-Thai IPs.
import { getStore } from '@netlify/blobs';
import https from 'node:https';
import tls from 'node:tls';
import { ALPHASSL_2025 } from './_shared/alphassl.ts';
import {
  BMA_FRESH_MS, DayBuilder, HISTORY_DAYS, addBmaCanals, LONGDO_EVENTS, LONGDO_TRAFFIC_INDEX, TRAFFY, TW, addCanal, addFloodRoad, addRain, addReports, parseLongdoEvents,
  emptyDay, emptyMeta, mergeDay, parseDams, parseDoh, parseProvinces, DOH_DASHBOARD, parseTmdWarnings, slot, TMD_WARNINGS, type DayFile, type DohFeed, type Meta, type Provinces, type TmdFeed, type Upstream,
} from '../../src/data/history.ts';

const getJson = async (url: string) => {
  const r = await fetch(url, { signal: AbortSignal.timeout(15_000), headers: { 'user-agent': 'BangkokFloodWatch3D/0.1 (+https://github.com/Ton-Munoi99/bangkok-flood-watch-3d)' } });
  if (!r.ok) throw new Error(`${r.status} ${url}`);
  return r.json();
};

// tmd.go.th serves an incomplete TLS chain; add the missing intermediate rather than turning verification off.
const getTmd = (url: string) => new Promise<string>((ok, fail) => {
  const req = https.get(url, { ca: [...tls.rootCertificates, ALPHASSL_2025], timeout: 15_000, headers: { 'user-agent': 'BangkokFloodWatch3D/0.1 (+https://github.com/Ton-Munoi99/bangkok-flood-watch-3d)' } }, (r) => {
    if (r.statusCode !== 200) { r.resume(); return fail(new Error(`${r.statusCode} ${url}`)); }
    let body = ''; r.setEncoding('utf8').on('data', (c) => (body += c)).on('end', () => ok(body));
  });
  req.on('timeout', () => req.destroy(new Error('timeout'))).on('error', fail);
});

export default async () => {
  const store = getStore('history');
  const now = Date.now();
  const meta = ((await store.get('meta', { type: 'json' })) as Meta | null) ?? emptyMeta();
  const b = new DayBuilder();
  // Road history must come from one source at a time, like the live page: the Mac's BMA push (~240 sensors)
  // while it is fresh, ThaiWater's relay (a dozen) only when it isn't. Mixing them made history jump 60 -> 12 -> 60.
  // So relay readings are kept only for times after the last push stopped counting as live.
  const bma = (await store.get('bma/latest', { type: 'json' })) as { fetchedAt: string } | null;
  const relaySince = Math.max(now - 3600_000, bma ? Date.parse(bma.fetchedAt) + BMA_FRESH_MS : 0);

  const results = await Promise.allSettled([
    // Only keep road readings from the last hour: ThaiWater's relay can stall and keep serving old values.
    getJson(`${TW}/flood_road`).then((d) => addFloodRoad(meta, b, d.data, relaySince)),
    getJson(`${TW}/waterlevel_load?province_code=10`).then((d) => addCanal(meta, b, d.waterlevel_data.data)),
    getJson(`${TW}/rain_24h?province_code=10`).then((d) => addRain(meta, b, d.data)),
    getJson(`${TW}/canal_waterlevel`).then((d) => addBmaCanals(meta, b, d.data)),
    getJson(`${TRAFFY}?limit=500`).then((d) => addReports(b, d.results)),
    // The feed also carries recent expired events, so this backfills itself.
    getJson(LONGDO_EVENTS).then((d) => parseLongdoEvents(d).forEach((e) => b.event(e, now))),
    getJson(LONGDO_TRAFFIC_INDEX).then((d) => Number.isFinite(d.index) && b.traffic(Number(d.time) * 1000, Number(d.index))),
    // Dept. of Highways flooded sections (incidents open and close within hours). 14 days back catches long-running ones.
    getJson(`${DOH_DASHBOARD}?${new URLSearchParams({ start: slot(now - 14 * 86400_000).day, end: slot(now).day })}`)
      .then((d) => store.setJSON('doh', { fetchedAt: new Date(now).toISOString(), items: parseDoh(d) } satisfies DohFeed)),
  ]);
  const names = ['flood_road', 'waterlevel', 'rain', 'canal_waterlevel', 'traffy', 'longdo_events', 'traffic_index', 'doh'];
  results.forEach((r, i) => r.status === 'rejected' && console.error(`source ${names[i]} failed:`, r.reason));

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
  // (also refetch a blob saved before all dams were kept)
  if (!up || now - Date.parse(up.fetchedAt) > 3 * 3600_000 || !up.dams.some((d) => d.cp === false)) {
    try {
      const dams = parseDams(await getJson(`${TW}/thailand_main`));
      if (dams.length) await store.setJSON('upstream', { fetchedAt: new Date(now).toISOString(), dams } satisfies Upstream);
    } catch (e) { console.error('dams failed:', e); }
  }

  // TMD warnings are issued a few times a day; hourly is plenty.
  const tmd = (await store.get('tmd', { type: 'json' })) as TmdFeed | null;
  if (!tmd || now - Date.parse(tmd.fetchedAt) > 3600_000) {
    try {
      const items = parseTmdWarnings(await getTmd(TMD_WARNINGS));
      if (items.length) await store.setJSON('tmd', { fetchedAt: new Date(now).toISOString(), items } satisfies TmdFeed);
    } catch (e) { console.error('tmd failed:', e); }
  }

  // Nationwide telemetry is 1.4 MB, so summarise it per province every 30 min rather than every run.
  const prov = (await store.get('provinces', { type: 'json' })) as Provinces | null;
  if (!prov || now - Date.parse(prov.fetchedAt) > 30 * 60_000) {
    try {
      const rows = parseProvinces((await getJson(`${TW}/waterlevel_load`)).waterlevel_data.data, now);
      if (rows.length) await store.setJSON('provinces', { fetchedAt: new Date(now).toISOString(), rows } satisfies Provinces);
    } catch (e) { console.error('provinces failed:', e); }
  }

  const { blobs } = await store.list({ prefix: 'day/' });
  for (const x of blobs) if (x.key.slice(4) < oldest) await store.delete(x.key);
  console.log('collected', [...b.days.keys()].filter((d) => d >= oldest).join(','), results.map((r) => r.status).join(','));
};

export const config = { schedule: '*/10 * * * *' };
