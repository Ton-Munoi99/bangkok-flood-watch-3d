// History storage format, shared by the Netlify collector, the backfill script and the browser.
// One JSON file per Bangkok calendar day, readings bucketed to 10 minutes (Bangkok local time).
// Pure logic only — no network, no storage — so every side can import it.

/** BMA/ThaiWater timestamps are Bangkok local time without an offset. */
export const bkkMs = (s: string) => Date.parse(/Z$|[+-]\d\d:?\d\d$/.test(s) ? s : `${s.replace(' ', 'T')}+07:00`);

export interface Meta {
  // seen = epoch ms of the station's latest reading; stations silent for days are left out of history views.
  road: Record<string, { th: string; en: string; lng: number; lat: number; seen?: number }>;
  canal: Record<string, { th: string; en: string; lng: number; lat: number; bank: number | null; ground: number | null; agency: string }>;
  rain: Record<string, { th: string; en: string; lng: number; lat: number }>;
}
export interface DayFile {
  // bucket "HH:MM" -> station -> value. A road bucket that exists means the feed was live then;
  // stations missing from it read 0 cm (only non-zero depths are stored to keep files small).
  road: Record<string, Record<string, number>>;
  canal: Record<string, Record<string, number>>; // water level, m MSL
  rain: Record<string, Record<string, number>>; // 24h accumulated rain, mm
  reports: Record<string, [lng: number, lat: number, iso: string, state: string]>;
  // Longdo/iTIC flood incidents, listed under every day they were active. Optional: older files lack it.
  events?: Record<string, [lng: number, lat: number, title: string, titleEn: string, text: string, start: string, stop: string, by: string, impassable: 0 | 1, image: string]>;
  traffic?: Record<string, number>; // bucket -> Longdo Bangkok traffic index (0–10)
}

export const emptyMeta = (): Meta => ({ road: {}, canal: {}, rain: {} });
export const emptyDay = (): DayFile => ({ road: {}, canal: {}, rain: {}, reports: {}, events: {} });
export const HISTORY_DAYS = 7;
/** A road sensor that hasn't reported for this long is treated as offline, not as "0 cm". */
export const SENSOR_SILENT_MS = 3 * 86400_000;
/** BMA readings pushed by the Mac collector count as live this long (it runs every 30 min). */
export const BMA_FRESH_MS = 45 * 60_000;

const BKK_OFFSET = 7 * 3600 * 1000;
/** Epoch ms -> Bangkok { day: "YYYY-MM-DD", bucket: "HH:MM" } floored to 10 minutes. */
export function slot(ms: number) {
  const iso = new Date(Math.floor((ms + BKK_OFFSET) / 600_000) * 600_000).toISOString();
  return { day: iso.slice(0, 10), bucket: iso.slice(11, 16) };
}
/** Inverse of slot(): Bangkok day + bucket -> epoch ms. */
export const slotMs = (day: string, bucket: string) => Date.parse(`${day}T${bucket}:00+07:00`);

/** ThaiWater "situation" band (1..5) from level vs ground/bank, same bands ThaiWater uses for storage %. */
export function situation(wl: number, ground: number | null, bank: number | null) {
  // BMA canal points have a bank level but no ground level: classify by distance to the bank instead.
  if (ground == null && bank != null) return wl >= bank ? 5 : bank - wl < 0.3 ? 4 : 3;
  if (ground == null || bank == null || bank <= ground) return 3;
  const pct = ((wl - ground) / (bank - ground)) * 100;
  return pct > 100 ? 5 : pct > 70 ? 4 : pct > 30 ? 3 : pct > 10 ? 2 : 1;
}

/** Merge `add` into `base` (mutates base). Later values for the same bucket/station win. */
export function mergeDay(base: DayFile, add: DayFile) {
  for (const k of ['road', 'canal', 'rain'] as const) {
    for (const [b, vals] of Object.entries(add[k])) base[k][b] = { ...base[k][b], ...vals };
  }
  Object.assign(base.reports, add.reports);
  base.events = { ...base.events, ...add.events };
  base.traffic = { ...base.traffic, ...add.traffic };
  return base;
}

/** Collect readings into per-day files. */
export class DayBuilder {
  days = new Map<string, DayFile>();
  private get(day: string) {
    if (!this.days.has(day)) this.days.set(day, emptyDay());
    return this.days.get(day)!;
  }
  /** Road: call for every reading (incl. zeros) so the bucket is marked as covered. */
  road(ms: number, code: string, cm: number) {
    const { day, bucket } = slot(ms);
    const b = (this.get(day).road[bucket] ??= {});
    if (cm > 0) b[code] = cm;
  }
  canal(ms: number, id: string, wl: number) {
    const { day, bucket } = slot(ms);
    (this.get(day).canal[bucket] ??= {})[id] = wl;
  }
  rain(ms: number, id: string, mm: number) {
    const { day, bucket } = slot(ms);
    (this.get(day).rain[bucket] ??= {})[id] = mm;
  }
  traffic(ms: number, index: number) {
    const { day, bucket } = slot(ms);
    (this.get(day).traffic ??= {})[bucket] = index;
  }
  /** Record an incident under each Bangkok day it overlaps, up to `now`. */
  event(e: FloodEvent, now: number) {
    const last = slot(Math.min(Date.parse(e.stop), now)).day;
    for (let t = Date.parse(e.start), day = slot(t).day; day <= last; t += 86400_000, day = slot(t).day) {
      (this.get(day).events ??= {})[e.id] = [e.lng, e.lat, e.title, e.titleEn, e.text, e.start, e.stop, e.by, e.impassable ? 1 : 0, e.image];
    }
  }
  report(id: string, lng: number, lat: number, iso: string, state: string) {
    // ~11 m: enough to place a report on a street, not to pinpoint the reporter's house.
    this.get(slot(Date.parse(iso)).day).reports[id] = [+lng.toFixed(4), +lat.toFixed(4), iso, state];
  }
}

// ---------- parsers for the raw public APIs (used by collector + backfill) ----------
export const TW = 'https://api-v3.thaiwater.net/api/v1/thaiwater30/public';
export const TRAFFY = 'https://publicapi.traffy.in.th/share/teamchadchart/search';

interface TwFloodRoad { floodroad_datetime: string; floodroad_value: number | null; station: { floodroad_name: { th: string }; floodroad_lat: number; floodroad_long: number; floodroad_oldcode: string } }
interface TwStation { id: number; tele_station_name: { th: string; en: string }; tele_station_lat: number; tele_station_long: number; min_bank: number | null; ground_level: number | null }

export function addFloodRoad(meta: Meta, b: DayBuilder, rows: TwFloodRoad[], freshSince: number) {
  for (const r of rows) {
    const s = r.station, code = s.floodroad_oldcode;
    if (!code || !s.floodroad_lat) continue;
    const ms = bkkMs(r.floodroad_datetime);
    const seen = Math.max(meta.road[code]?.seen ?? 0, Number.isFinite(ms) ? ms : 0);
    meta.road[code] = { th: s.floodroad_name.th.replace(/\s+/g, ' ').trim(), en: meta.road[code]?.en ?? '', lng: s.floodroad_long, lat: s.floodroad_lat, seen };
    if (ms >= freshSince && r.floodroad_value != null) b.road(ms, code, Number(r.floodroad_value));
  }
}
export function addCanal(meta: Meta, b: DayBuilder, rows: { waterlevel_datetime: string; waterlevel_msl: string | null; station: TwStation; agency: { agency_shortname: { th: string } } }[]) {
  for (const r of rows) {
    const s = r.station, id = String(s.id);
    meta.canal[id] = {
      th: s.tele_station_name.th, en: s.tele_station_name.en, lng: s.tele_station_long, lat: s.tele_station_lat,
      bank: s.min_bank == null ? null : Number(s.min_bank), ground: s.ground_level == null ? null : Number(s.ground_level), agency: r.agency.agency_shortname.th,
    };
    if (r.waterlevel_msl != null) b.canal(bkkMs(r.waterlevel_datetime), id, Number(r.waterlevel_msl));
  }
}
export function addRain(meta: Meta, b: DayBuilder, rows: { rain_24h: number | null; rainfall_datetime: string; station: TwStation }[]) {
  for (const r of rows) {
    const s = r.station, id = String(s.id);
    meta.rain[id] = { th: s.tele_station_name.th, en: s.tele_station_name.en, lng: s.tele_station_long, lat: s.tele_station_lat };
    if (r.rain_24h != null) b.rain(bkkMs(r.rainfall_datetime), id, Number(r.rain_24h));
  }
}
export const isFloodReport = (x: { description: string | null; problem_type_abdul: string[] | null }) =>
  (x.description ?? '').includes('ท่วม') || (x.problem_type_abdul ?? []).includes('น้ำท่วม');
export function addReports(b: DayBuilder, rows: { ticket_id: string; description: string | null; coords: [string, string]; timestamp: string; state: string; problem_type_abdul: string[] | null }[]) {
  for (const x of rows) {
    if (!isFloodReport(x)) continue;
    const iso = new Date(x.timestamp.replace(' ', 'T').replace(/\+00$/, 'Z')).toISOString();
    b.report(x.ticket_id, Number(x.coords[0]), Number(x.coords[1]), iso, x.state);
  }
}

/** Rows of `var datatableflood = [['เขต','District','flood_name','short','cm',...], ...]` on weather.bangkok.go.th's
 *  home page — the one BMA page that accepts non-browser clients. Lists only stations currently flooded. */
export function parseBmaHome(html: string): { name: string; cm: number }[] {
  const start = html.indexOf('var datatableflood');
  if (start < 0) throw new Error('datatableflood not found');
  const block = html.slice(start, html.indexOf('];', start));
  const rows = block.match(/\[\s*'(?:[^'\\]|\\.)*'(?:\s*,\s*'(?:[^'\\]|\\.)*')*\s*\]/g) ?? [];
  return rows.map((row) => [...row.matchAll(/'((?:[^'\\]|\\.)*)'/g)].map((m) => m[1].replace(/\\'/g, "'")))
    .filter((f) => f.length >= 5 && Number.isFinite(Number(f[4])))
    .map((f) => ({ name: f[2].replace(/\s+/g, ' ').trim(), cm: Number(f[4]) }));
}

// ---------- Longdo Event (flood incidents curated by DOH / iTIC staff; also shown on live.iticfoundation.org) ----------
export const LONGDO_EVENTS = 'https://event.longdo.com/feed/json';
export const LONGDO_TRAFFIC_INDEX = 'https://traffic.longdo.com/api/json/traffic/index';
export type EventBy = 'doh' | 'itic' | 'public';
export interface FloodEvent {
  id: string; title: string; titleEn: string; text: string; lng: number; lat: number;
  start: string; stop: string; // ISO
  by: EventBy; impassable: boolean; image: string;
}
interface LongdoEventRaw {
  eid: string; title: string; title_en: string; description: string; latitude: string; longitude: string;
  start: string; stop: string; contributor: string; icon: string; images?: string[];
}
// "รถเล็กผ่านไม่ได้", "ท่วมทุกช่องทาง", "รถเก๋งห้ามเข้า" (also the common typo "ห้าเข้า")…
const IMPASSABLE = /รถเล็ก\S*\s*(ผ่านไม่ได้|ไม่ควรผ่าน|แนะ\S*หลีกเลี่ยง|หลีกเลี่ยง|ไม่สามารถ)|ทุกช่องทาง|ผ่านไม่ได้|ห้ามเข้า|ห้าเข้า/;
/** Drop "รายงานโดย <name>" so reporters' names aren't republished. */
export const stripReporter = (s: string) => s.replace(/\s*(รายงานโดย|แจ้งโดย|Report(ed)? by)\s.*$/i, '').trim();
const inBangkok = (lng: number, lat: number) => lat > 13.45 && lat < 14.0 && lng > 100.28 && lng < 100.98;

export function parseLongdoEvents(raw: LongdoEventRaw[]): FloodEvent[] {
  return raw
    .filter((x) => x.icon === 'flood' || /ท่วม/.test(x.title))
    .map((x) => {
      const text = stripReporter(String(x.description ?? ''));
      const by: EventBy = x.contributor === 'DOH Admin' ? 'doh' : /^itic\./.test(x.contributor) ? 'itic' : 'public';
      const img = (x.images ?? []).find((u) => /^https:\/\//.test(u)) ?? '';
      return {
        id: String(x.eid), title: stripReporter(String(x.title)), titleEn: stripReporter(String(x.title_en ?? '')), text,
        lng: Number(x.longitude), lat: Number(x.latitude),
        start: new Date(bkkMs(x.start)).toISOString(), stop: new Date(bkkMs(x.stop)).toISOString(),
        by, impassable: IMPASSABLE.test(`${x.title} ${x.description}`), image: img,
      };
    })
    .filter((e) => Number.isFinite(e.lng) && Number.isFinite(e.lat) && inBangkok(e.lng, e.lat) && e.start <= e.stop);
}
export const isActive = (e: { start: string; stop: string }, at: number) => Date.parse(e.start) <= at && at <= Date.parse(e.stop);

// ---------- Upstream (น้ำเหนือ): the four main Chao Phraya-basin dams + Chao Phraya Dam outflow (C.13) ----------
// Srinagarind/Vajiralongkorn are in the Mae Klong basin and don't drain through Bangkok, so they're left out.
export const CHAO_PHRAYA_DAMS = ['ภูมิพล', 'สิริกิติ์', 'แควน้อยบำรุงแดน', 'ป่าสักชลสิทธิ์'];
// inflow/release: million m³/day; cp = one of the four main Chao Phraya-basin dams draining through Bangkok
export interface Dam { th: string; en: string; date: string; pct: number; inflow: number; release: number; basin: string; basinEn: string; cp: boolean }
export interface Upstream { fetchedAt: string; dams: Dam[] }

/** All large dams from ThaiWater's (10 MB) thailand_main payload: the four Chao Phraya dams first (fixed order), then the rest by % full. */
export function parseDams(main: { dam?: { data?: unknown } }): Dam[] {
  const d = main?.dam?.data as { data?: unknown[] } | unknown[] | undefined;
  const rows = (Array.isArray(d) ? d : d?.data ?? []) as {
    dam_date: string; dam_storage_percent: number | null; dam_inflow: number | null; dam_released: number | null;
    dam?: { dam_name?: { th?: string; en?: string } }; basin?: { basin_name?: { th?: string; en?: string } };
  }[];
  const dams: Dam[] = rows.filter((r) => r.dam?.dam_name?.th && r.dam_storage_percent != null).map((r) => ({
    th: r.dam!.dam_name!.th!, en: r.dam?.dam_name?.en ?? '', date: r.dam_date,
    pct: Number(r.dam_storage_percent), inflow: Number(r.dam_inflow), release: Number(r.dam_released),
    basin: r.basin?.basin_name?.th ?? '', basinEn: (r.basin?.basin_name?.en ?? '').replace(/ Basin Basin$/, ' Basin'),
    cp: CHAO_PHRAYA_DAMS.includes(r.dam!.dam_name!.th!),
  }));
  const rank = (d: Dam) => (d.cp ? CHAO_PHRAYA_DAMS.indexOf(d.th) : CHAO_PHRAYA_DAMS.length);
  return dams.sort((a, b) => rank(a) - rank(b) || b.pct - a.pct);
}

/** Chao Phraya Dam tailwater station C.13 (Chainat): outflow in m³/s, from ThaiWater waterlevel_load for Chainat (18). */
export function parseC13(load: { waterlevel_data?: { data?: unknown[] } }) {
  const rows = (load?.waterlevel_data?.data ?? []) as { discharge: string | number | null; waterlevel_datetime: string; station?: { tele_station_oldcode?: string } }[];
  const r = rows.find((x) => x.station?.tele_station_oldcode === 'C.13' && x.discharge != null);
  return r ? { discharge: Number(r.discharge), time: r.waterlevel_datetime } : null;
}

// ---------- BMA canal network (สนน., ~280 points) as relayed by ThaiWater, with real bank levels ----------
// weather.bangkok.go.th's own canal data only has BMA's operating "critical" levels, not banks.
export interface TwCanalRow {
  canal_datetime: string | null; canal_value: number | null;
  station?: { canal_name?: { th?: string }; canal_lat?: number; canal_long?: number; canal_oldcode?: string; bank?: number | null };
}
/** A bank of 0 or below is a placeholder in the source, not a real level. */
export const realBank = (b: number | null | undefined) => (b != null && Number(b) > 0 ? Number(b) : null);

export function addBmaCanals(meta: Meta, b: DayBuilder, rows: TwCanalRow[]) {
  for (const r of rows) {
    const s = r.station, code = s?.canal_oldcode;
    if (!s || !code || !s.canal_lat || !s.canal_long) continue;
    meta.canal[code] = { th: s.canal_name?.th ?? code, en: '', lng: s.canal_long, lat: s.canal_lat, bank: realBank(s.bank), ground: null, agency: 'สนน.' };
    if (r.canal_value != null && r.canal_datetime) b.canal(bkkMs(r.canal_datetime), code, Number(r.canal_value));
  }
}

// ---------- TMD weather warnings (tmd.go.th server-renders them, Thai text as &#x..; entities) ----------
export const TMD_WARNINGS = 'https://www.tmd.go.th/warning-and-events/warning-storm';
export interface TmdWarning { title: string; text: string; date: string; day: string | null; url: string }
const TH_MONTHS = ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน', 'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'];
/** '27 กันยายน 2569' -> '2026-09-27' (Buddhist year), or null. */
export function thaiDay(s: string) {
  const m = s.match(/(\d{1,2})\s+(\S+)\s+(\d{4})/);
  const mo = m ? TH_MONTHS.indexOf(m[2]) + 1 : 0;
  return m && mo ? `${Number(m[3]) - 543}-${String(mo).padStart(2, '0')}-${m[1].padStart(2, '0')}` : null;
}
export interface TmdFeed { fetchedAt: string; items: TmdWarning[] }
const unent = (s: string) => s
  .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
  .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
  .replace(/&(amp|quot|lt|gt|nbsp|#39);/g, (_, e) => ({ amp: '&', quot: '"', lt: '<', gt: '>', nbsp: ' ', '#39': "'" })[e as string]!);
const txt = (s = '') => s.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
// ponytail: regex over a known template; if TMD redesigns, this returns [] and the UI just hides the card.
export function parseTmdWarnings(html: string, max = 3): TmdWarning[] {
  return unent(html).split('class="link-list-content"').slice(1, max + 1).flatMap((b) => {
    const a = b.match(/link-list-title[^>]*>\s*<a[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/);
    const url = a && new URL(a[1], TMD_WARNINGS).href;
    // Scraped links end up in the page, so only ever link back to tmd.go.th.
    if (!a || !url?.startsWith('https://www.tmd.go.th/')) return [];
    const date = txt(b.match(/วันที่ข้อมูล:\s*<\/div>\s*<div>([\s\S]*?)<\/div>/)?.[1]);
    return [{
      title: txt(a[2]),
      text: txt(b.match(/link-list-description[^>]*>([\s\S]*?)<\/div>/)?.[1]).slice(0, 400),
      date, day: thaiDay(date),
      url,
    }];
  });
}

// ---------- "near me": coordinates from a pasted Google Maps link or "lat, lng" ----------
/** Place pin (!3d..!4d..) first, then map centre (@lat,lng), then any "lat, lng" pair (q=, ll=, plain text). */
export function parseLatLng(s: string): { lat: number; lng: number } | null {
  let d = s;
  try { d = decodeURIComponent(s); } catch { /* keep raw */ }
  const m = d.match(/!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/) ?? d.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/) ?? d.match(/(-?\d{1,2}\.\d+)\s*,\s*\+?(-?\d{1,3}\.\d+)/);
  const lat = Number(m?.[1]), lng = Number(m?.[2]);
  return m && Math.abs(lat) <= 90 && Math.abs(lng) <= 180 ? { lat, lng } : null;
}

// ---------- ต่างจังหวัด: ThaiWater's nationwide telemetry, summarised per province by our collector ----------
export interface ProvinceSum { code: string; th: string; en: string; lng: number; lat: number; n: number; over: number; near: number }
export interface Provinces { fetchedAt: string; rows: ProvinceSum[] }
interface TwNationRow { waterlevel_datetime: string; situation_level?: number | null; station: { tele_station_lat: number; tele_station_long: number }; geocode: { province_code: string; province_name: { th: string; en: string } } }
/** Stations reporting within 6 h, per province (Bangkok excluded — the map covers it). situation_level 5 = over bank, 4 = near. */
export function parseProvinces(rows: TwNationRow[], now: number): ProvinceSum[] {
  const by = new Map<string, ProvinceSum & { sx: number; sy: number }>();
  for (const r of rows) {
    const g = r.geocode, lat = Number(r.station?.tele_station_lat), lng = Number(r.station?.tele_station_long);
    if (!g?.province_code || g.province_code === '10' || !lat || !lng || now - bkkMs(r.waterlevel_datetime) > 6 * 3600_000) continue;
    let p = by.get(g.province_code);
    if (!p) by.set(g.province_code, p = { code: g.province_code, th: g.province_name.th, en: g.province_name.en, lng: 0, lat: 0, n: 0, over: 0, near: 0, sx: 0, sy: 0 });
    p.n++; p.sx += lng; p.sy += lat;
    if (r.situation_level === 5) p.over++; else if (r.situation_level === 4) p.near++;
  }
  return [...by.values()].map(({ sx, sy, ...p }) => ({ ...p, lng: +(sx / p.n).toFixed(3), lat: +(sy / p.n).toFixed(3) }))
    .sort((a, b) => b.over - a.over || b.near - a.near || a.th.localeCompare(b.th, 'th'));
}

// ---------- trends + flat-lined sensors, from the last ~26 h of day files ----------
/** flatH: hours the latest reading has stayed exactly flatV. d1h/d24h: latest minus the reading ~1 h / ~24 h earlier. */
export interface Trend { flatV: number; flatH: number; d1h: number | null; d24h: number | null }
/** Hours a value must stay identical before we call the sensor possibly stuck (real water moves at least a cm). */
export const STUCK_H = { road: 6, canal: 12 } as const;
export function sensorTrends(files: [day: string, f: DayFile][], kind: 'road' | 'canal', now: number): Map<string, Trend> {
  const series = new Map<string, [number, number][]>();
  for (const [day, f] of files) for (const [b, vals] of Object.entries(f[kind])) {
    const ms = slotMs(day, b);
    if (ms > now || ms < now - 26 * 3600_000) continue;
    for (const [id, v] of Object.entries(vals)) (series.get(id) ?? series.set(id, []).get(id)!).push([ms, v]);
  }
  const out = new Map<string, Trend>();
  for (const [id, s] of series) {
    s.sort((a, b) => a[0] - b[0]);
    const [lastMs, v] = s.at(-1)!;
    let i = s.length - 1;
    while (i > 0 && s[i - 1][1] === v) i--;
    // Reading closest to `ago` before the latest, within ±tol, else null.
    const at = (ago: number, tol: number) => {
      let best: [number, number] | null = null;
      for (const p of s) if (Math.abs(lastMs - ago - p[0]) <= tol && (!best || Math.abs(lastMs - ago - p[0]) < Math.abs(lastMs - ago - best[0]))) best = p;
      return best ? +(v - best[1]).toFixed(2) : null;
    };
    out.set(id, { flatV: v, flatH: (lastMs - s[i][0]) / 3600_000, d1h: at(3600_000, 20 * 60_000), d24h: at(86400_000, 3600_000) });
  }
  return out;
}
