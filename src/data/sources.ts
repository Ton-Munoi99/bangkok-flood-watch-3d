// Live data adapters. Each source is fetched independently; if one fails (or
// VITE_DATA_MODE=mock) it falls back to a saved snapshot in ./mock and is flagged
// `snapshot: true` so the UI can label it. Snapshots keep the raw API schema, so
// live and snapshot data go through the same parser.

import { TW as TW_BASE, bkkMs, situation, slot, slotMs, type DayFile, type Meta } from './history.ts';
export { bkkMs };

export type Level = 0 | 1 | 2 | 3; // ปกติ / เฝ้าระวัง / เสี่ยงสูง / ท่วมหนัก

export interface RoadFlood {
  id: string; nameTh: string; nameEn: string; lng: number; lat: number;
  cm: number; maxCm: number | null; start: string | null; updated: string; url: string; level: Level;
}
export interface Canal {
  id: string; nameTh: string; nameEn: string; lng: number; lat: number;
  wl: number; bank: number | null; situation: number; updated: string; agency: string;
}
export interface Rain { id: string; nameTh: string; nameEn: string; lng: number; lat: number; mm: number; updated: string }
export interface Report { id: string; lng: number; lat: number; text: string; address: string; photo: string; time: string; state: string }

export interface Result<T> { items: T[]; snapshot: boolean; stale?: boolean; error?: string }

const FORCE_MOCK = import.meta.env?.VITE_DATA_MODE === 'mock';
export const STALE_MS = 6 * 3600 * 1000;


async function withFallback<T>(live: () => Promise<T[]>, mock: () => Promise<T[]>, timeOf: (x: T) => string): Promise<Result<T>> {
  if (FORCE_MOCK) return { items: await mock(), snapshot: true };
  try {
    return { items: await live(), snapshot: false };
  } catch (e) {
    console.warn('live source failed, using snapshot', e);
    const items = await mock();
    const newest = Math.max(...items.map((x) => bkkMs(timeOf(x))));
    // Old readings shown during a live flood would mislead, so a stale snapshot is dropped entirely.
    if (Date.now() - newest > STALE_MS) return { items: [], snapshot: true, stale: true, error: String(e) };
    return { items, snapshot: true, error: String(e) };
  }
}

// Per-request timeout so one unreachable source doesn't stall the page; its fallback is used instead.
// BMA gets a short one (it never answers from overseas hosts); Traffy can be slow under load.
async function fetchOk(url: string, timeoutMs = 15_000) {
  const r = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
  if (!r.ok) throw new Error(`${r.status} ${url}`);
  return r;
}
const getJson = async (url: string) => (await fetchOk(url)).json();
// Third-party URLs end up in href/src attributes; never allow javascript: etc.
const httpsOnly = (u: string | null) => (u && /^https:\/\//.test(u) ? u : '');

// ---------- BMA road-flood sensors (สำนักการระบายน้ำ กทม.) ----------
// No JSON API with CORS: the public page weather.bangkok.go.th/flood/ embeds
// `const floodData = [...]`. We fetch it through a same-origin proxy (/proxy/bma,
// see vite.config.ts / netlify.toml) and pull that array out.

export const roadLevel = (cm: number): Level => (cm <= 0 ? 0 : cm < 10 ? 1 : cm < 20 ? 2 : 3);

/** Returns the JSON array/object literal that starts right after `marker`. */
export function extractJsonAfter(src: string, marker: string): unknown {
  const start = src.indexOf('[', src.indexOf(marker) + marker.length);
  if (src.indexOf(marker) < 0 || start < 0) throw new Error(`marker not found: ${marker}`);
  let depth = 0, inStr = false;
  for (let i = start; i < src.length; i++) {
    const c = src[i];
    if (inStr) {
      if (c === '\\') i++;
      else if (c === '"') inStr = false;
    } else if (c === '"') inStr = true;
    else if (c === '[' || c === '{') depth++;
    else if ((c === ']' || c === '}') && --depth === 0) return JSON.parse(src.slice(start, i + 1));
  }
  throw new Error('unterminated JSON');
}

interface BmaRaw {
  flood_code: string; flood_name: string; flood_name_en: string; flood: number | null;
  flood_start: string | null; flood_max: number | null; latitude: number; longitude: number;
  site_timestamp: string; web_url: string;
}
const parseBma = (raw: BmaRaw[]): RoadFlood[] =>
  raw.filter((f) => f.latitude && f.longitude).map((f) => {
    const cm = Number(f.flood) || 0;
    return {
      id: f.flood_code, nameTh: f.flood_name, nameEn: f.flood_name_en, lng: f.longitude, lat: f.latitude,
      cm, maxCm: f.flood_max == null ? null : Number(f.flood_max), start: f.flood_start, updated: f.site_timestamp,
      url: httpsOnly(f.web_url), level: roadLevel(cm),
    };
  });

/** Where the live road data came from on the last fetch ('' = BMA directly). */
export let roadVia = '';

export const fetchRoadFlood = () =>
  withFallback(
    async () => {
      try {
        const rows = parseBma(extractJsonAfter(await (await fetchOk('/proxy/bma/flood/', 6000)).text(), 'const floodData =') as BmaRaw[]);
        roadVia = '';
        return rows;
      } catch (e) {
        // BMA's site only answers Thai IPs. Next best: readings pushed by our Thai-side collector
        // (scripts/collect-bma.ts -> /api/ingest) if under 20 min old…
        const pushed = await roadFromIngest(Date.now() - 20 * 60_000).catch(() => []);
        if (pushed.length) { roadVia = ''; return pushed; }
        // …then ThaiWater's relay of the same sensors, which sometimes stalls, so only if under an hour old.
        const fresh = await roadFromThaiWater(Date.now() - 3600_000);
        if (!fresh.length) throw e;
        roadVia = 'thaiwater';
        return fresh;
      }
    },
    async () => parseBma((await import('./mock/bma_flood.json')).default as BmaRaw[]),
    (r) => r.updated,
  );

async function roadFromIngest(since: number): Promise<RoadFlood[]> {
  const p = (await getJson('/api/ingest')) as { fetchedAt: string; readings: { code: string; th: string; en: string; lng: number; lat: number; cm: number; updated: string }[] };
  if (!p || Date.parse(p.fetchedAt) < since) return [];
  return p.readings.map((r) => ({
    id: r.code, nameTh: r.th, nameEn: r.en || r.th, lng: r.lng, lat: r.lat, cm: r.cm, maxCm: null, start: null,
    updated: r.updated, level: roadLevel(r.cm), url: `https://floodbangkok.bangkok.go.th/device-info?sensor_profile_id=${encodeURIComponent(r.code)}`,
  }));
}

async function roadFromThaiWater(since: number): Promise<RoadFlood[]> {
  const rows = (await getJson(`${TW_BASE}/flood_road`)).data as {
    floodroad_datetime: string; floodroad_value: number | null;
    station: { floodroad_name: { th: string }; floodroad_lat: number; floodroad_long: number; floodroad_oldcode: string };
  }[];
  return rows
    .filter((r) => r.floodroad_value != null && r.station.floodroad_lat && bkkMs(r.floodroad_datetime) >= since)
    .map((r) => {
      const cm = Number(r.floodroad_value) || 0, name = r.station.floodroad_name.th.replace(/\s+/g, ' ').trim();
      return {
        id: r.station.floodroad_oldcode, nameTh: name, nameEn: name, lng: r.station.floodroad_long, lat: r.station.floodroad_lat,
        cm, maxCm: null, start: null, updated: r.floodroad_datetime.replace(' ', 'T'), level: roadLevel(cm),
        url: `https://floodbangkok.bangkok.go.th/device-info?sensor_profile_id=${encodeURIComponent(r.station.floodroad_oldcode)}`,
      };
    });
}

// ---------- ThaiWater (คลังข้อมูลน้ำแห่งชาติ, สสน.) — public API, CORS enabled ----------
const TW = TW_BASE;

interface TwStation {
  id: number;
  tele_station_name: { th: string; en: string };
  tele_station_lat: number; tele_station_long: number; min_bank: number | null;
}
interface TwWl { id: number; waterlevel_datetime: string; waterlevel_msl: string | null; situation_level: number; station: TwStation; agency: { agency_shortname: { th: string } } }
interface TwRain { id: number; rain_24h: number | null; rainfall_datetime: string; station: TwStation }

const parseCanal = (raw: { waterlevel_data: { data: TwWl[] } }): Canal[] =>
  raw.waterlevel_data.data.filter((x) => x.waterlevel_msl != null).map((x) => ({
    id: String(x.station.id), nameTh: x.station.tele_station_name.th, nameEn: x.station.tele_station_name.en,
    lng: x.station.tele_station_long, lat: x.station.tele_station_lat,
    wl: Number(x.waterlevel_msl), bank: x.station.min_bank == null ? null : Number(x.station.min_bank), situation: Number(x.situation_level) || 0,
    updated: x.waterlevel_datetime, agency: x.agency.agency_shortname.th,
  }));

const parseRain = (raw: { data: TwRain[] }): Rain[] =>
  raw.data.filter((x) => x.rain_24h != null).map((x) => ({
    id: String(x.station.id), nameTh: x.station.tele_station_name.th, nameEn: x.station.tele_station_name.en,
    lng: x.station.tele_station_long, lat: x.station.tele_station_lat, mm: Number(x.rain_24h), updated: x.rainfall_datetime,
  }));

export const fetchCanals = () =>
  withFallback(
    async () => parseCanal(await getJson(`${TW}/waterlevel_load?province_code=10`)),
    async () => parseCanal((await import('./mock/thaiwater_waterlevel.json')).default as never),
    (c) => c.updated,
  );

export const fetchRain = () =>
  withFallback(
    async () => parseRain(await getJson(`${TW}/rain_24h?province_code=10`)),
    async () => parseRain((await import('./mock/thaiwater_rain.json')).default as never),
    (r) => r.updated,
  );

// ---------- Traffy Fondue citizen reports (NECTEC × กทม.) — public share API ----------
interface TraffyRaw {
  ticket_id: string; description: string | null; coords: [string, string]; photo_url: string;
  address: string; timestamp: string; state: string; problem_type_abdul: string[] | null;
}
const DAY = 24 * 3600 * 1000;
// Traffy timestamps look like "2026-09-25 23:12:58.77+00" (UTC).
const traffyTime = (t: string) => new Date(t.replace(' ', 'T').replace(/\+00$/, 'Z')).toISOString();

const parseTraffy = (raw: { results: TraffyRaw[] }, since: number): Report[] =>
  raw.results
    // ponytail: keyword match on "ท่วม"; new tickets are often not yet categorised, so problem_type alone misses most.
    .filter((x) => (x.description ?? '').includes('ท่วม') || (x.problem_type_abdul ?? []).includes('น้ำท่วม'))
    .map((x) => ({
      id: x.ticket_id, lng: Number(x.coords[0]), lat: Number(x.coords[1]), text: x.description ?? '',
      address: x.address, photo: httpsOnly(x.photo_url), time: traffyTime(x.timestamp), state: x.state,
    }))
    .filter((x) => Date.parse(x.time) >= since);

export const fetchReports = () =>
  withFallback(
    // Newest first; 500 covers several hours during heavy rain.
    async () => parseTraffy(await getJson('https://publicapi.traffy.in.th/share/teamchadchart/search?limit=500'), Date.now() - DAY),
    async () => parseTraffy((await import('./mock/traffy.json')).default as never, 0),
    (r) => r.time,
  );

// ---------- History (recorded every 10 min by netlify/functions/collect.mts) ----------
export interface Snapshot { road: Result<RoadFlood>; canals: Result<Canal>; rain: Result<Rain>; reports: Result<Report> }
const WINDOW = 3600_000; // a reading counts as "current" at time T for up to an hour

export async function loadHistory(at: number): Promise<Snapshot> {
  const get = async (key: string) => {
    const r = await fetch(`/api/history/${key}`, { signal: AbortSignal.timeout(15_000) });
    return r.ok ? r.json() : null;
  };
  const d0 = slot(at).day, d1 = slot(at - DAY).day;
  const [meta, today, prev] = (await Promise.all([get('meta'), get(d0), get(d1)])) as [Meta | null, DayFile | null, DayFile | null];
  if (!meta) throw new Error('history unavailable');
  const files: [string, DayFile][] = [];
  if (prev) files.push([d1, prev]);
  if (today) files.push([d0, today]);

  // Buckets inside (at - WINDOW, at], oldest first.
  const inWindow = (k: 'road' | 'canal' | 'rain') =>
    files.flatMap(([day, f]) => Object.entries(f[k]).map(([b, v]) => ({ ms: slotMs(day, b), stamp: `${day}T${b}`, v })))
      .filter((x) => x.ms <= at && x.ms > at - WINDOW)
      .sort((a, b) => a.ms - b.ms);

  // Road: latest bucket only — stations absent from a bucket read 0 cm.
  const roadB = inWindow('road').at(-1);
  const dayMax = (code: string) => Math.max(0, ...Object.entries(today?.road ?? {}).filter(([b]) => slotMs(d0, b) <= at).map(([, v]) => v[code] ?? 0));
  const road: RoadFlood[] = roadB ? Object.entries(meta.road).map(([code, m]) => {
    const cm = roadB.v[code] ?? 0;
    return {
      id: code, nameTh: m.th, nameEn: m.en || m.th, lng: m.lng, lat: m.lat, cm, maxCm: dayMax(code) || null, start: null,
      updated: roadB.stamp, level: roadLevel(cm), url: `https://floodbangkok.bangkok.go.th/device-info?sensor_profile_id=${encodeURIComponent(code)}`,
    };
  }) : [];

  // Canal/rain: each station's most recent value in the window.
  const latest = (k: 'canal' | 'rain') => {
    const out = new Map<string, { v: number; stamp: string }>();
    for (const x of inWindow(k)) for (const [id, v] of Object.entries(x.v)) out.set(id, { v, stamp: x.stamp });
    return out;
  };
  const canals: Canal[] = [...latest('canal')].filter(([id]) => meta.canal[id]).map(([id, { v, stamp }]) => {
    const m = meta.canal[id];
    return { id, nameTh: m.th, nameEn: m.en, lng: m.lng, lat: m.lat, wl: v, bank: m.bank, situation: situation(v, m.ground, m.bank), updated: stamp, agency: m.agency };
  });
  const rain: Rain[] = [...latest('rain')].filter(([id]) => meta.rain[id]).map(([id, { v, stamp }]) => {
    const m = meta.rain[id];
    return { id, nameTh: m.th, nameEn: m.en, lng: m.lng, lat: m.lat, mm: v, updated: stamp };
  });
  // History keeps no report text/photos/addresses (privacy) — only position, time and state.
  const reports: Report[] = files.flatMap(([, f]) => Object.entries(f.reports))
    .filter(([, r]) => Date.parse(r[2]) <= at && Date.parse(r[2]) > at - DAY)
    .map(([id, [lng, lat, time, state]]) => ({ id, lng, lat, time, state, text: '', address: '', photo: '' }));

  const res = <T>(items: T[]): Result<T> => ({ items, snapshot: false, stale: items.length === 0 });
  return { road: res(road), canals: res(canals), rain: res(rain), reports: { items: reports, snapshot: false } };
}
