// Live data adapters. Each source is fetched independently; if one fails (or
// VITE_DATA_MODE=mock) it falls back to a saved snapshot in ./mock and is flagged
// `snapshot: true` so the UI can label it. Snapshots keep the raw API schema, so
// live and snapshot data go through the same parser.

import {
  LONGDO_EVENTS, LONGDO_TRAFFIC_INDEX, parseLatLng, BMA_FRESH_MS, SENSOR_SILENT_MS, realBank, type TwCanalRow, TW as TW_BASE, bkkMs, isActive, parseLongdoEvents, situation, slot, slotMs,
  parseC13, sensorTrends, type Trend, type Dam, type DayFile, type EventBy, type FloodEvent, type DohFeed, type DohFlood, type Meta, type ProvinceSum, type Provinces, type TmdFeed, type TmdWarning, type Upstream,
} from './history.ts';
export type { DohFlood, Trend, Dam, FloodEvent, ProvinceSum, TmdWarning };
export { bkkMs, parseLatLng };

export type Level = 0 | 1 | 2 | 3; // ปกติ / เฝ้าระวัง / เสี่ยงสูง / ท่วมหนัก

export interface RoadFlood {
  id: string; nameTh: string; nameEn: string; lng: number; lat: number;
  cm: number; maxCm: number | null; start: string | null; updated: string; url: string; level: Level;
}
export interface Canal {
  id: string; nameTh: string; nameEn: string; lng: number; lat: number;
  wl: number; bank: number | null; situation: number; updated: string; agency: string;
  // why the colour is grey: reading older than 1 h, or no usable bank level
  note?: 'stale' | 'nobank';
}
export interface Rain { id: string; nameTh: string; nameEn: string; lng: number; lat: number; mm: number; mm1h: number | null; updated: string }
export interface Report { id: string; lng: number; lat: number; text: string; address: string; photo: string; time: string; state: string }

// snapshot = not current data (labelled in the UI with asOf); stale = too old to show at all (items empty).
export interface Result<T> { items: T[]; snapshot: boolean; stale?: boolean; error?: string; asOf?: string }

const FORCE_MOCK = import.meta.env?.VITE_DATA_MODE === 'mock';
export const STALE_MS = 6 * 3600 * 1000;


async function withFallback<T>(live: () => Promise<T[]>, mock: () => Promise<T[]>, timeOf: (x: T) => string): Promise<Result<T>> {
  if (FORCE_MOCK) return fromSnapshot(mock, timeOf);
  try {
    return { items: await live(), snapshot: false };
  } catch (e) {
    console.warn('live source failed, using snapshot', e);
    return { ...(await fromSnapshot(mock, timeOf)), error: String(e) };
  }
}

/** A bundled snapshot as a labelled Result. Mock mode (offline dev/demos) always shows it; otherwise a
 *  snapshot older than STALE_MS is dropped entirely, since old readings shown during a live flood would mislead. */
async function fromSnapshot<T>(mock: () => Promise<T[]>, timeOf: (x: T) => string): Promise<Result<T>> {
  const items = await mock();
  const newest = Math.max(...items.map((x) => bkkMs(timeOf(x))));
  if (!Number.isFinite(newest)) return { items: [], snapshot: true, stale: true };
  if (!FORCE_MOCK && Date.now() - newest > STALE_MS) return { items: [], snapshot: true, stale: true };
  return { items, snapshot: true, asOf: new Date(newest).toISOString() };
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

export async function fetchRoadFlood(): Promise<Result<RoadFlood>> {
  const bundled = () => fromSnapshot(async () => parseBma((await import('./mock/bma_flood.json')).default as BmaRaw[]), (r) => r.updated);
  if (FORCE_MOCK) return bundled();
  roadVia = '';
  // 1. Direct read only works from a Thai IP, i.e. the local dev server; deployed, it would just time out.
  if (import.meta.env?.DEV) {
    try {
      return { items: parseBma(extractJsonAfter(await (await fetchOk('/proxy/bma/flood/', 6000)).text(), 'const floodData =') as BmaRaw[]), snapshot: false };
    } catch (e) { console.warn('direct BMA read failed', e); }
  }
  // 2. Readings pushed by our Thai-side collector (scripts/collect-bma.ts -> /api/ingest, every 30 min).
  const pushed = await roadFromIngest().catch(() => null);
  const age = pushed ? Date.now() - Date.parse(pushed.fetchedAt) : Infinity;
  if (pushed && age < BMA_FRESH_MS) return { items: pushed.items, snapshot: false };
  // 3. ThaiWater's relay of the same sensors (it sometimes stalls, so only if under an hour old).
  const relayed = await roadFromThaiWater(Date.now() - 3600_000).catch(() => []);
  if (relayed.length) { roadVia = 'thaiwater'; return { items: relayed, snapshot: false }; }
  // 4. The collector's last push, if the Mac slept or BMA blocked a few runs — shown with its time.
  if (pushed && age < STALE_MS) return { items: pushed.items, snapshot: true, asOf: pushed.fetchedAt };
  // 5. The bundled snapshot (same 6 h rule).
  return bundled();
}

async function roadFromIngest(): Promise<{ fetchedAt: string; items: RoadFlood[] } | null> {
  const p = (await getJson('/api/ingest')) as { fetchedAt: string; readings: { code: string; th: string; en: string; lng: number; lat: number; cm: number; updated: string }[] };
  if (!p?.readings?.length) return null;
  return {
    fetchedAt: p.fetchedAt,
    items: p.readings.map((r) => ({
      id: r.code, nameTh: r.th, nameEn: r.en || r.th, lng: r.lng, lat: r.lat, cm: r.cm, maxCm: null, start: null,
      updated: r.updated, level: roadLevel(r.cm), url: `https://floodbangkok.bangkok.go.th/device-info?sensor_profile_id=${encodeURIComponent(r.code)}`,
    })),
  };
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
interface TwRain { id: number; rain_24h: number | null; rain_1h?: number | null; rainfall_datetime: string; station: TwStation }

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
    lng: x.station.tele_station_long, lat: x.station.tele_station_lat, mm: Number(x.rain_24h),
    mm1h: x.rain_1h == null ? null : Number(x.rain_1h), updated: x.rainfall_datetime,
  }));

/** BMA's ~280 canal points (via ThaiWater) with real bank levels; grey when older than 1 h or bank unknown. */
const parseBmaCanals = (rows: TwCanalRow[], now: number): Canal[] =>
  rows.filter((r) => r.station?.canal_oldcode && r.station.canal_lat && r.canal_value != null && r.canal_datetime).map((r) => {
    const s = r.station!, bank = realBank(s.bank), wl = Number(r.canal_value);
    const stale = now - bkkMs(r.canal_datetime!) > 3600_000;
    return {
      id: s.canal_oldcode!, nameTh: s.canal_name?.th ?? s.canal_oldcode!, nameEn: '', lng: s.canal_long!, lat: s.canal_lat!,
      wl, bank, situation: stale || bank == null ? 0 : situation(wl, null, bank), updated: r.canal_datetime!.replace(' ', 'T'),
      agency: 'สนน.', note: stale ? 'stale' : bank == null ? 'nobank' : undefined,
    };
  });

export const fetchCanals = () =>
  withFallback(
    async () => {
      const [tele, bma] = await Promise.all([
        getJson(`${TW}/waterlevel_load?province_code=10`).then(parseCanal),
        getJson(`${TW}/canal_waterlevel`).then((d) => parseBmaCanals(d.data, Date.now())).catch(() => [] as Canal[]),
      ]);
      return [...tele, ...bma];
    },
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
    async () => {
      reportsVia = '';
      try {
        // Newest first; 500 covers several hours during heavy rain. Traffy often takes 15 s+ under load.
        return parseTraffy(await (await fetchOk('https://publicapi.traffy.in.th/share/teamchadchart/search?limit=500', 12_000)).json(), Date.now() - DAY);
      } catch (e) {
        // Our collector stores flood reports every 10 min (position/time/state only), so use its last 24 h instead.
        const stored = await reportsFromCollector(Date.now());
        if (!stored.length) throw e;
        reportsVia = 'collector';
        return stored;
      }
    },
    async () => parseTraffy((await import('./mock/traffy.json')).default as never, 0),
    (r) => r.time,
  );

/** Where the last report list came from ('' = Traffy directly). */
export let reportsVia = '';

async function reportsFromCollector(at: number): Promise<Report[]> {
  const days = [...new Set([slot(at).day, slot(at - DAY).day])];
  const files = await Promise.all(days.map((d) => getJson(`/api/history/${d}`).catch(() => null) as Promise<DayFile | null>));
  const out = new Map<string, Report>();
  for (const f of files) for (const [id, [lng, lat, time, state]] of Object.entries(f?.reports ?? {})) {
    if (Date.parse(time) <= at && Date.parse(time) > at - DAY) out.set(id, { id, lng, lat, time, state, text: '', address: '', photo: '' });
  }
  return [...out.values()];
}

// ---------- History (recorded every 10 min by netlify/functions/collect.mts) ----------
export interface Snapshot { road: Result<RoadFlood>; canals: Result<Canal>; rain: Result<Rain>; reports: Result<Report>; events: Result<FloodEvent>; traffic: number | null }
const WINDOW = 3600_000; // a reading counts as "current" at time T for up to an hour

/** Dept. of Highways flooded sections, via our collector (every 10 min). Older than 1 h = labelled; older than 6 h = hidden. */
export async function fetchDoh(): Promise<Result<DohFlood>> {
  try {
    const f = (await getJson('/api/history/doh')) as DohFeed;
    const age = Date.now() - Date.parse(f.fetchedAt);
    if (age > STALE_MS) return { items: [], snapshot: true, stale: true, asOf: f.fetchedAt };
    return { items: f.items, snapshot: age > 3600_000, asOf: f.fetchedAt };
  } catch (e) {
    return { items: [], snapshot: false, stale: true, error: String(e) };
  }
}
/** Live-mode trends from today's + yesterday's history files (null if history is unavailable). */
export async function fetchTrends(now = Date.now()) {
  const get = (day: string) => fetch(`/api/history/${day}`, { signal: AbortSignal.timeout(20_000) }).then((r) => (r.ok ? r.json() : null)).catch(() => null);
  const d1 = slot(now - DAY).day, d0 = slot(now).day;
  const [a, b] = (await Promise.all([get(d1), get(d0)])) as (DayFile | null)[];
  const files = ([[d1, a], [d0, b]] as [string, DayFile | null][]).filter((x): x is [string, DayFile] => x[1] != null);
  return files.length ? { road: sensorTrends(files, 'road', now), canal: sensorTrends(files, 'canal', now) } : null;
}
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
  const road: RoadFlood[] = roadB ? Object.entries(meta.road).filter(([, m]) => m.seen == null || m.seen >= at - SENSOR_SILENT_MS).map(([code, m]) => {
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
    const noBank = m.ground == null && m.bank == null;
    return {
      id, nameTh: m.th, nameEn: m.en, lng: m.lng, lat: m.lat, wl: v, bank: m.bank, situation: noBank ? 0 : situation(v, m.ground, m.bank),
      updated: stamp, agency: m.agency, note: noBank ? 'nobank' as const : undefined,
    };
  });
  const rain: Rain[] = [...latest('rain')].filter(([id]) => meta.rain[id]).map(([id, { v, stamp }]) => {
    const m = meta.rain[id];
    return { id, nameTh: m.th, nameEn: m.en, lng: m.lng, lat: m.lat, mm: v, mm1h: null, updated: stamp };
  });
  // History keeps no report text/photos/addresses (privacy) — only position, time and state.
  const reports: Report[] = files.flatMap(([, f]) => Object.entries(f.reports))
    .filter(([, r]) => Date.parse(r[2]) <= at && Date.parse(r[2]) > at - DAY)
    .map(([id, [lng, lat, time, state]]) => ({ id, lng, lat, time, state, text: '', address: '', photo: '' }));

  const events: FloodEvent[] = [];
  const seen = new Set<string>();
  for (const [, f] of files) for (const [id, [lng, lat, title, titleEn, text, start, stop, by, impassable, image]] of Object.entries(f.events ?? {})) {
    if (seen.has(id) || !isActive({ start, stop }, at)) continue;
    seen.add(id);
    events.push({ id, lng, lat, title, titleEn, text, start, stop, by: by as EventBy, impassable: impassable === 1, image });
  }
  const tb = files.flatMap(([day, f]) => Object.entries(f.traffic ?? {}).map(([b, v]) => ({ ms: slotMs(day, b), v })))
    .filter((x) => x.ms <= at && x.ms > at - WINDOW).sort((a, b) => a.ms - b.ms).at(-1);

  const res = <T>(items: T[]): Result<T> => ({ items, snapshot: false, stale: items.length === 0 });
  const hasEvents = files.some(([, f]) => f.events);
  return {
    road: res(road), canals: res(canals), rain: res(rain), reports: { items: reports, snapshot: false },
    events: { items: events, snapshot: false, stale: !hasEvents }, traffic: tb?.v ?? null,
  };
}

// ---------- Traffic cameras (Longdo Traffic list; images/streams by iTIC Foundation & DOH) ----------
// Only positions + names are used. Images stay on Longdo's page (link out) — they belong to the camera
// owners, and the image server is often unreachable. Longdo marks the list cacheable for 4 h.
export interface Camera { id: string; title: string; org: string; lng: number; lat: number }
export const longdoCameraUrl = (id: string) => `https://traffic.longdo.com/cameralist?open=${encodeURIComponent(id)}`;

export async function fetchCameras(): Promise<Camera[]> {
  const d = (await getJson('https://traffic.longdo.com/camera.json')) as { item: { camid: string; title: string; organization: string; latitude: string; longitude: string }[] };
  return d.item
    .map((c) => ({ id: String(c.camid), title: String(c.title).replace(/\s+/g, ' ').trim(), org: String(c.organization ?? ''), lng: Number(c.longitude), lat: Number(c.latitude) }))
    // Bangkok and its edges
    .filter((c) => c.id && c.lat > 13.45 && c.lat < 14.0 && c.lng > 100.28 && c.lng < 100.98);
}

// ---------- Dept. of Water Resources river/canal CCTV (list bundled in data/dwr_cameras.json; images live, CORS-enabled) ----------
export interface DwrCamera { id: string; code: string; th: string; en: string; province: string; provinceEn: string; lng: number; lat: number }
const DWR_API = 'https://telemetry.dwr.go.th/api';
/** Latest snapshot as an object URL plus the capture time encoded in its path (/CODE/Y/M/D/H_M.jpg, Thai time). */
export async function fetchDwrSnapshot(id: string): Promise<{ url: string; time: number | null }> {
  // No Referer: DWR's server has been seen stalling on third-party referers.
  const init = { referrerPolicy: 'no-referrer' as const, signal: AbortSignal.timeout(20_000) };
  const pr = await fetch(`${DWR_API}/public/reportCctv/snapshot/${encodeURIComponent(id)}`, init);
  const path = pr.ok ? String(((await pr.json()) as { value?: string }).value ?? '').trim() : '';
  if (!path) throw new Error('no snapshot');
  const ir = await fetch(`${DWR_API}/file/image/cctv`, { ...init, method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ path }) });
  if (!ir.ok) throw new Error(`image ${ir.status}`);
  return { url: URL.createObjectURL(await ir.blob()), time: dwrPathTime(path) };
}
export function dwrPathTime(path: string) {
  const m = path.match(/\/(\d{4})\/(\d{1,2})\/(\d{1,2})\/(\d{1,2})_(\d{1,2})\.jpe?g$/i);
  const p2 = (x: string) => x.padStart(2, '0');
  return m ? Date.parse(`${m[1]}-${p2(m[2])}-${p2(m[3])}T${p2(m[4])}:${p2(m[5])}:00+07:00`) : null;
}

// ---------- Longdo Event flood incidents + Longdo Bangkok traffic index (public feeds, CORS enabled) ----------
export async function fetchEvents(): Promise<Result<FloodEvent>> {
  try {
    const now = Date.now();
    return { items: parseLongdoEvents(await getJson(LONGDO_EVENTS)).filter((e) => isActive(e, now)), snapshot: false };
  } catch (e) {
    console.warn('Longdo events unavailable', e);
    return { items: [], snapshot: false, stale: true, error: String(e) };
  }
}

/** Bangkok-wide congestion index 0–10 (Longdo Traffic), or null. */
export async function fetchTrafficIndex(): Promise<number | null> {
  const d = await getJson(LONGDO_TRAFFIC_INDEX).catch(() => null);
  return d && Number.isFinite(Number(d.index)) ? Number(d.index) : null;
}

// ---------- Upstream (น้ำเหนือ): dams via our collector, Chao Phraya Dam outflow (C.13) live from ThaiWater ----------
// Also carries the other slow-changing collector blobs: TMD warnings (tmd.go.th has no CORS and a broken TLS chain)
// and the per-province summary (the nationwide feed is too big to fetch in the browser).
export interface UpstreamView { dams: Dam[]; c13: { discharge: number; time: string } | null; tmd: TmdWarning[]; provinces: Provinces | null }
export async function fetchUpstream(): Promise<UpstreamView> {
  const [up, load, tmd, provinces] = await Promise.all([
    getJson('/api/history/upstream').catch(() => null) as Promise<Upstream | null>,
    getJson(`${TW_BASE}/waterlevel_load?province_code=18`).catch(() => null),
    getJson('/api/history/tmd').catch(() => null) as Promise<TmdFeed | null>,
    getJson('/api/history/provinces').catch(() => null) as Promise<Provinces | null>,
  ]);
  // Only warnings dated within the last 3 days; the page keeps old ones listed long after they expire.
  const since = slot(Date.now() - 3 * 86400_000).day;
  return { dams: up?.dams ?? [], c13: load ? parseC13(load) : null, tmd: (tmd?.items ?? []).filter((w) => w.day && w.day >= since), provinces };
}
