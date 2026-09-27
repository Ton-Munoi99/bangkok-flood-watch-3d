// GET /api/history/meta | /api/history/upstream | /api/history/tmd | /api/history/provinces | /api/history/doh | /api/history/YYYY-MM-DD — serves what collect.mts stored.
import { getStore } from '@netlify/blobs';
import { slot } from '../../src/data/history.ts';

export default async (_req: Request, context: { params: Record<string, string> }) => {
  const key = context.params.key ?? '';
  if (!/^(meta|upstream|tmd|provinces|doh|\d{4}-\d{2}-\d{2})$/.test(key)) return new Response('bad key', { status: 400 });

  const body = await getStore('history').get(/^\d/.test(key) ? `day/${key}` : key);
  const headers: Record<string, string> = { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'public, max-age=60' };
  if (body == null) return new Response('null', { status: 404, headers });

  // Today/yesterday still receive new buckets; older days are final.
  const recent = !/^\d/.test(key) || key >= slot(Date.now() - 86400_000).day;
  headers['netlify-cdn-cache-control'] = `public, durable, ${recent ? 's-maxage=300, stale-while-revalidate=600' : 's-maxage=86400'}`;
  return new Response(body, { headers });
};

export const config = { path: '/api/history/:key' };
