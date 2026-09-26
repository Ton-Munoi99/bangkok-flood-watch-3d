// History storage format, shared by the Netlify collector, the backfill script and the browser.
// One JSON file per Bangkok calendar day, readings bucketed to 10 minutes (Bangkok local time).
// Pure logic only — no network, no storage — so every side can import it.

/** BMA/ThaiWater timestamps are Bangkok local time without an offset. */
export const bkkMs = (s: string) => Date.parse(/Z$|[+-]\d\d:?\d\d$/.test(s) ? s : `${s.replace(' ', 'T')}+07:00`);

export interface Meta {
  road: Record<string, { th: string; en: string; lng: number; lat: number }>;
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
}

export const emptyMeta = (): Meta => ({ road: {}, canal: {}, rain: {} });
export const emptyDay = (): DayFile => ({ road: {}, canal: {}, rain: {}, reports: {} });
export const HISTORY_DAYS = 7;

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
  report(id: string, lng: number, lat: number, iso: string, state: string) {
    this.get(slot(Date.parse(iso)).day).reports[id] = [lng, lat, iso, state];
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
    meta.road[code] = { th: s.floodroad_name.th.replace(/\s+/g, ' ').trim(), en: meta.road[code]?.en ?? '', lng: s.floodroad_long, lat: s.floodroad_lat };
    const ms = bkkMs(r.floodroad_datetime);
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
