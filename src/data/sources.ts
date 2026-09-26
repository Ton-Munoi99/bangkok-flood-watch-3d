// Live data adapters. Each source is fetched independently; if one fails (or
// VITE_DATA_MODE=mock) it falls back to a saved snapshot in ./mock and is flagged
// `snapshot: true` so the UI can label it. Snapshots keep the raw API schema, so
// live and snapshot data go through the same parser.

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

/** BMA/ThaiWater timestamps are Bangkok local time without an offset. */
export const bkkMs = (s: string) => Date.parse(/Z$|[+-]\d\d:?\d\d$/.test(s) ? s : `${s.replace(' ', 'T')}+07:00`);

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

async function fetchOk(url: string) {
  // Fail fast so one unreachable source (e.g. BMA from overseas hosts) doesn't stall the page; its snapshot is used instead.
  const r = await fetch(url, { signal: AbortSignal.timeout(6000) });
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

export const fetchRoadFlood = () =>
  withFallback(
    async () => parseBma(extractJsonAfter(await (await fetchOk('/proxy/bma/flood/')).text(), 'const floodData =') as BmaRaw[]),
    async () => parseBma((await import('./mock/bma_flood.json')).default as BmaRaw[]),
    (r) => r.updated,
  );

// ---------- ThaiWater (คลังข้อมูลน้ำแห่งชาติ, สสน.) — public API, CORS enabled ----------
const TW = 'https://api-v3.thaiwater.net/api/v1/thaiwater30/public';

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
