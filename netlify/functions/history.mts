// GET /api/history/meta | /api/history/upstream | /api/history/tmd | /api/history/provinces | /api/history/doh | /api/history/nation | /api/history/YYYY-MM-DD — serves what collect.mts stored.
import { getStore } from '@netlify/blobs';
import { emptyDay, mergeDay, slot, type DayFile } from '../../src/data/history.ts';

export default async (_req: Request, context: { params: Record<string, string> }) => {
  const key = context.params.key ?? '';
  if (!/^(meta|upstream|tmd|provinces|doh|nation|twlive|\d{4}-\d{2}-\d{2})$/.test(key)) return new Response('bad key', { status: 400 });

  const store = getStore('history');
  let body: string | null;
  if (/^\d/.test(key)) {
    // A day = the collector's file + the BMA pushes (separate blobs so the two writers never overwrite each other).
    const [a, b] = (await Promise.all([store.get(`day/${key}`, { type: 'json' }), store.get(`bmaday/${key}`, { type: 'json' })])) as (DayFile | null)[];
    body = a || b ? JSON.stringify(mergeDay(mergeDay(emptyDay(), a ?? emptyDay()), b ?? emptyDay())) : null;
  } else body = await store.get(key, { type: 'text' });
  const headers: Record<string, string> = { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'public, max-age=60' };
  if (body == null) return new Response('null', { status: 404, headers });

  // Today/yesterday still receive new buckets; older days are final.
  const recent = !/^\d/.test(key) || key >= slot(Date.now() - 86400_000).day;
  // twlive changes every 10 min and pages treat it as live, so keep the CDN copy short.
  headers['netlify-cdn-cache-control'] = `public, durable, ${key === 'twlive' ? 's-maxage=60, stale-while-revalidate=120' : recent ? 's-maxage=300, stale-while-revalidate=600' : 's-maxage=86400'}`;
  return new Response(body, { headers });
};

export const config = { path: '/api/history/:key' };
