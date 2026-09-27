// Builds data/dwr_cameras.json: Dept. of Water Resources (กรมทรัพยากรน้ำ) river/canal CCTV stations with coordinates.
// Run occasionally (stations rarely change): node scripts/build-dwr-cams.ts
// ⚠️ DWR's API returns camera device logins inside cctvSnapshotLink / cctvVideoLink. We keep ONLY the fields listed
// below and never store or show those links; images are loaded in the browser via DWR's public snapshot endpoints.
import { writeFileSync } from 'node:fs';

const API = 'https://telemetry.dwr.go.th/api/public';
const headers = { 'user-agent': 'BangkokFloodWatch3D/0.1 (+https://github.com/Ton-Munoi99/bangkok-flood-watch-3d)', 'content-type': 'application/json' };
const get = async (url: string, init?: RequestInit) => {
  const r = await fetch(url, { headers, signal: AbortSignal.timeout(30_000), ...init });
  if (!r.ok) throw new Error(`${r.status} ${url}`);
  return ((await r.json()) as { value: any }).value;
};

const list = await get(`${API}/reportCctv/listPaginate`, { method: 'POST', body: JSON.stringify({ paginate: { page: 1, pageSize: 1000, orders: [{ key: 'MAIN_BASIN', desc: false }] }, search: {} }) });
const rows: any[] = list.results;
const out: unknown[] = [];
for (let i = 0; i < rows.length; i += 8) {
  await Promise.all(rows.slice(i, i + 8).map(async (r) => {
    const e = r.entity;
    const p = (await get(`${API}/station/getByCode/${encodeURIComponent(e.stationCode)}`).catch(() => null))?.fullCon?.entity?.point;
    if (!p?.lat || !p?.lon) return console.warn('no coordinates:', e.stationCode);
    out.push({ id: String(e.id), code: String(e.stationCode), th: String(e.stnNameTh ?? '').trim(), en: String(e.stnNameEn ?? '').trim(),
      province: String(r.provinceNameTh ?? ''), provinceEn: String(r.provinceNameEn ?? ''), lat: +Number(p.lat).toFixed(5), lng: +Number(p.lon).toFixed(5) });
  }));
}
out.sort((a: any, b: any) => a.code.localeCompare(b.code));
if (JSON.stringify(out).includes('@') || /:\/\//.test(JSON.stringify(out))) throw new Error('refusing to write: a URL/credential slipped into the output');
writeFileSync('data/dwr_cameras.json', JSON.stringify({ source: 'https://telemetry.dwr.go.th/reportCctv', builtAt: new Date().toISOString(), cameras: out }) + '\n');
console.log(`wrote ${out.length}/${rows.length} cameras`);
