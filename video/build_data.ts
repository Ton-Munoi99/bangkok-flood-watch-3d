// Bangkok Flood Watch 3D -> data.js for the data-video-studio skill.
//   node video/build_data.ts video/studio/data.js
// Reads the site's public feeds (/api/history/*) and reuses the site's own parsers, so every number in the
// video is the number the map shows at the same moment. Nothing here is typed in by hand.
import { readFileSync, writeFileSync } from 'node:fs';
// sources.ts is the browser's data layer and fetches relative URLs; point them at the live site.
const SITE = process.env.SITE ?? 'https://bangkokflood.netlify.app';
const fetch0 = globalThis.fetch;
globalThis.fetch = ((u: RequestInfo | URL, i?: RequestInit) => fetch0(typeof u === 'string' && u.startsWith('/') ? SITE + u : u, i)) as typeof fetch;
const { fetchRoadFlood, fetchCanals, fetchTrends } = await import('../src/data/sources.ts');
import {
  RIVER_PROVINCES, bboxOf, inPolys, parseC13, parseRiver, STUCK_H,
  type DohFeed, type Provinces, type Ring, type TwLive, type Upstream,
} from '../src/data/history.ts';

const API = `${SITE}/api/history`;
const OUT = process.argv[2] ?? 'video/studio/data.js';
const get = async <T>(k: string): Promise<T> => {
  const r = await fetch(`${API}/${k}`, { signal: AbortSignal.timeout(30_000) });
  if (!r.ok) throw new Error(`${k}: HTTP ${r.status}`);
  return r.json() as Promise<T>;
};
const now = Date.now(), HOUR = 3600_000;
const [live, up, prov, doh, roadR, canalR, trends] = await Promise.all([
  get<TwLive>('twlive'), get<Upstream>('upstream'), get<Provinces>('provinces'), get<DohFeed>('doh'), fetchRoadFlood(), fetchCanals(), fetchTrends(),
]);
if (roadR.stale || canalR.stale) console.warn('warning: a live source is stale', roadR.error ?? '', canalR.error ?? '');

// ---------- Bangkok districts (English names) for "where" ----------
type Feat = { properties: { amp_en: string; amp_th: string }; geometry: { type: string; coordinates: unknown } };
const geo = JSON.parse(readFileSync(new URL('../data/bkk_districts.geojson', import.meta.url), 'utf8')) as { features: Feat[] };
const polys = geo.features.map((f) => {
  const p = (f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates) as Ring[][];
  return { en: f.properties.amp_en, th: f.properties.amp_th, p, bb: bboxOf(p) };
});
const districtAt = (lng: number, lat: number) => polys.find((d) => inPolys(lng, lat, d.p, d.bb));
const districtOf = (lng: number, lat: number) => districtAt(lng, lat)?.en ?? null;
const districtTh = (lng: number, lat: number) => districtAt(lng, lat)?.th ?? null;

// ---------- Bangkok roads and canals: exactly what the map shows (same fetchers, same stuck-sensor rule) ----------
const roads = roadR.items
  .filter((r) => r.cm > 0 && !((t) => t && t.flatV === r.cm && t.flatH >= STUCK_H.road)(trends?.road.get(r.id)))
  .map((r) => ({ th: r.nameTh, en: r.nameEn, district: districtOf(r.lng, r.lat), districtTh: districtTh(r.lng, r.lat), cm: r.cm, level: r.level, updated: r.updated }))
  .sort((a, b) => b.cm - a.cm);
const districtStatus: Record<string, 'critical' | 'warning'> = {};
for (const r of roads) if (r.district) districtStatus[r.district] = r.level === 3 || districtStatus[r.district] === 'critical' ? 'critical' : 'warning';
const canals = canalR.items
  .filter((c) => c.bank != null && !c.note && !((t) => t && t.flatV === c.wl && t.flatH >= STUCK_H.canal)(trends?.canal.get(c.id)))
  .map((c) => ({ th: c.nameTh, en: c.nameEn, district: districtOf(c.lng, c.lat), districtTh: districtTh(c.lng, c.lat), margin: +(c.wl - c.bank!).toFixed(2), updated: c.updated }))
  .sort((a, b) => b.margin - a.margin);
// The river gauges (Samsen, Krung Thep Bridge) also come through the canal feed: they belong to the river scene only.
const RIVER_TH = new Set(parseRiver(RIVER_PROVINCES.map((p) => (live.data as Record<string, unknown>)[`waterlevel_load?province_code=${p}`] as { waterlevel_data?: { data?: unknown[] } } ?? null)).map((r) => r.th));
for (let i = canals.length - 1; i >= 0; i--) if (RIVER_TH.has(canals[i].th)) canals.splice(i, 1);
const newest = (xs: { updated: string }[]) => xs.reduce((m, x) => (x.updated > m ? x.updated : m), '') || null;

// ---------- Chao Phraya, upstream dams, provinces, highways ----------
const loads = RIVER_PROVINCES.map((p) => (live.data as Record<string, unknown>)[`waterlevel_load?province_code=${p}`] as { waterlevel_data?: { data?: unknown[] } } ?? null);
// English names for the 16 main-stem gauges (ThaiWater only names them in Thai). Upstream -> Bangkok.
const GAUGE_EN: Record<string, { en: string; prov: string }> = {
  'C.2': { en: 'Nakhon Sawan', prov: 'Nakhon Sawan' }, CPY002: { en: 'Phayuha Khiri', prov: 'Nakhon Sawan' }, CPY003: { en: 'Manorom', prov: 'Chai Nat' },
  CPY004: { en: 'Wat Thammamun', prov: 'Chai Nat' }, 'C.13': { en: 'Chao Phraya Dam', prov: 'Chai Nat' }, CPY005: { en: 'Sapphaya', prov: 'Chai Nat' },
  CPY006: { en: 'In Buri', prov: 'Sing Buri' }, 'C.3': { en: 'Ban Bang Phutsa', prov: 'Sing Buri' }, CPY007: { en: 'Phrom Buri', prov: 'Sing Buri' },
  'C.7A': { en: 'Ban Bang Kaeo', prov: 'Ang Thong' }, HDA009: { en: 'Pa Mok', prov: 'Ang Thong' }, 'C.35': { en: 'Ban Pom', prov: 'Ayutthaya' },
  CPY012: { en: 'Bang Pa-in', prov: 'Ayutthaya' }, CPY014: { en: 'Nuanchawee Bridge', prov: 'Nonthaburi' }, 'C.12': { en: 'Samsen', prov: 'Bangkok' },
  CPY015: { en: 'Krung Thep Bridge', prov: 'Bangkok' },
};
const PROV_TH: Record<string, string> = { 'Nakhon Sawan': 'นครสวรรค์', 'Chai Nat': 'ชัยนาท', 'Sing Buri': 'สิงห์บุรี', 'Ang Thong': 'อ่างทอง', Ayutthaya: 'อยุธยา', Nonthaburi: 'นนทบุรี', Bangkok: 'กรุงเทพฯ' };
const river = parseRiver(loads).map((r) => ({ code: r.code, th: r.th, ...GAUGE_EN[r.code], provTh: PROV_TH[GAUGE_EN[r.code]?.prov] ?? null, margin: r.wl != null && r.bank != null ? +(r.wl - r.bank).toFixed(2) : null, time: r.time }));
const samsen = river.find((r) => r.code === 'C.12');
const c13 = parseC13(loads.find((l) => parseC13(l ?? {})) ?? {});
const provEn = new Map(prov.rows.map((r) => [r.th, r.en]));
const provinces = prov.rows.filter((r) => /^\d\d$/.test(r.code) && r.over > 0).sort((a, b) => b.over - a.over || b.near - a.near)
  .map((r) => ({ en: r.en, th: r.th, over: r.over, near: r.near, n: r.n }));
const dohFresh = now - Date.parse(doh.fetchedAt) < 6 * HOUR;
const hwBy = new Map<string, { n: number; x: number }>();
for (const h of dohFresh ? doh.items : []) { const e = hwBy.get(h.province) ?? { n: 0, x: 0 }; e.n++; if (h.impassable) e.x++; hwBy.set(h.province, e); }
const highways = [...hwBy].map(([th, v]) => ({ th, en: provEn.get(th) ?? th, ...v })).sort((a, b) => b.n - a.n || b.x - a.x);

const iso = (ms: number | null) => (ms == null ? null : new Date(ms).toISOString());
const DATA = {
  asof: iso(now),
  sources: {
    road: { at: newest(roadR.items), snapshot: roadR.snapshot, name: 'BMA Drainage and Sewerage Dept. road sensors' },
    canal: { at: newest(canalR.items), snapshot: canalR.snapshot, name: 'BMA / HII canal gauges via ThaiWater' },
    river: { at: samsen?.time ?? null, name: 'RID / HII river gauges via ThaiWater' },
    dams: { at: up.dams[0]?.date ?? null, name: 'RID dam reports via ThaiWater' },
    provinces: { at: prov.fetchedAt, name: 'HII telemetry via ThaiWater' },
    highways: { at: dohFresh ? doh.fetchedAt : null, name: 'Dept. of Highways (HDMS)' },
  },
  road: { sensors: roadR.items.length, flooded: roads.length, severe: roads.filter((r) => r.level === 3).length, districts: new Set(roads.map((r) => r.district).filter(Boolean)).size, top: roads.slice(0, 3), districtStatus },
  canal: { gauges: canals.length, over: canals.filter((c) => c.margin >= 0).length, near: canals.filter((c) => c.margin < 0 && c.margin > -0.3).length, top: canals.slice(0, 4) },
  river: { gauges: river, over: river.filter((r) => r.margin != null && r.margin >= 0).length, samsen: samsen?.margin ?? null, c13: c13?.discharge ?? null },
  dams: up.dams.filter((d) => d.cp).map((d) => ({ en: d.en, th: d.th, pct: d.pct })).sort((a, b) => b.pct - a.pct),
  provinces: { over: provinces.reduce((s, r) => s + r.over, 0), count: provinces.length, top: provinces.slice(0, 5) },
  highways: { fresh: dohFresh, total: highways.reduce((s, r) => s + r.n, 0), impassable: highways.reduce((s, r) => s + r.x, 0), top: highways.slice(0, 5) },
};
writeFileSync(OUT, `window.DATA=${JSON.stringify(DATA)};`);
console.log(OUT, JSON.stringify(DATA, null, 1).slice(0, 4000));
