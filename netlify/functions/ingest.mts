// POST /api/ingest — BMA road-flood readings pushed by scripts/collect-bma.ts running on a Thai IP
// (weather.bangkok.go.th only answers Thai IPs, so Netlify can't fetch it itself).
// GET  /api/ingest — latest pushed readings for the page.
// Auth: `Authorization: Bearer $INGEST_TOKEN` (set in Netlify env vars; never in the repo).
import { getStore } from '@netlify/blobs';
import { DayBuilder, bkkMs, emptyDay, emptyMeta, mergeDay, type DayFile, type Meta } from '../../src/data/history.ts';

export interface BmaReading { code: string; th: string; en: string; lng: number; lat: number; cm: number; updated: string }
interface Payload { fetchedAt: string; readings: BmaReading[] }

const json = (body: unknown, status = 200, extra: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json; charset=utf-8', ...extra } });

export default async (req: Request) => {
  const store = getStore('history');

  if (req.method === 'GET') {
    const latest = await store.get('bma/latest');
    return new Response(latest ?? 'null', {
      status: latest ? 200 : 404,
      headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'public, max-age=60', 'netlify-cdn-cache-control': 'public, durable, s-maxage=120' },
    });
  }

  const token = process.env.INGEST_TOKEN;
  if (!token) return json({ error: 'ingest disabled' }, 503);
  if (req.headers.get('authorization') !== `Bearer ${token}`) return json({ error: 'unauthorized' }, 401);

  let p: Payload;
  try {
    p = await req.json();
    if (!Array.isArray(p.readings) || p.readings.length > 2000) throw new Error('bad readings');
    // Validate at the trust boundary: numbers must be numbers, names short strings.
    p.readings = p.readings.map((r) => ({
      code: String(r.code).slice(0, 40), th: String(r.th).slice(0, 200), en: String(r.en ?? '').slice(0, 200),
      lng: Number(r.lng), lat: Number(r.lat), cm: Number(r.cm), updated: String(r.updated).slice(0, 25),
    })).filter((r) => Number.isFinite(r.lng) && Number.isFinite(r.lat) && Number.isFinite(r.cm) && Number.isFinite(bkkMs(r.updated)));
  } catch (e) {
    return json({ error: String(e) }, 400);
  }

  await store.setJSON('bma/latest', { fetchedAt: new Date().toISOString(), readings: p.readings });

  // Also record into history (same format as collect.mts).
  const meta = ((await store.get('meta', { type: 'json' })) as Meta | null) ?? emptyMeta();
  const b = new DayBuilder();
  for (const r of p.readings) {
    meta.road[r.code] = { th: r.th, en: r.en || meta.road[r.code]?.en || '', lng: r.lng, lat: r.lat };
    b.road(bkkMs(r.updated), r.code, r.cm);
  }
  await store.setJSON('meta', meta);
  for (const [day, add] of b.days) {
    const base = ((await store.get(`day/${day}`, { type: 'json' })) as DayFile | null) ?? emptyDay();
    await store.setJSON(`day/${day}`, mergeDay(base, add));
  }
  return json({ ok: true, readings: p.readings.length });
};

export const config = { path: '/api/ingest', method: ['GET', 'POST'] };
