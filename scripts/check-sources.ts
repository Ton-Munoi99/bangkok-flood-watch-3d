// Run: node scripts/check-sources.ts [path/to/saved/weather.bangkok.go.th-flood.html]
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { extractJsonAfter, roadLevel } from '../src/data/sources.ts';

const tricky = 'x const floodData = [{"a":"has ] and } and \\" inside","b":[1,{"c":2}]}];\nconst other = [9];';
assert.deepStrictEqual(extractJsonAfter(tricky, 'const floodData ='), [{ a: 'has ] and } and " inside', b: [1, { c: 2 }] }]);
assert.throws(() => extractJsonAfter('nothing here', 'const floodData ='));
assert.deepStrictEqual([0, 5, 10, 19.9, 20, 57].map(roadLevel), [0, 1, 2, 2, 3, 3]);

const page = process.argv[2];
if (page) {
  const rows = extractJsonAfter(readFileSync(page, 'utf8'), 'const floodData =') as { latitude: number }[];
  assert.ok(rows.length > 100 && rows[0].latitude > 13, 'real page parsed');
  console.log('real page rows:', rows.length);
}
console.log('ok');
