// Run: node scripts/check-sources.ts [path/to/saved/weather.bangkok.go.th-flood.html]
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { bkkMs, extractJsonAfter, roadLevel } from '../src/data/sources.ts';
import { DayBuilder, mergeDay, parseBmaHome, situation, slot, slotMs } from '../src/data/history.ts';


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

// Bangkok-local timestamps (no offset) vs explicit UTC must agree.
assert.strictEqual(bkkMs('2026-09-26T06:10:00'), Date.parse('2026-09-25T23:10:00Z'));
assert.strictEqual(bkkMs('2026-09-26 06:10'), Date.parse('2026-09-25T23:10:00Z'));
assert.strictEqual(bkkMs('2026-09-25T23:10:00.000Z'), Date.parse('2026-09-25T23:10:00Z'));
console.log('bkkMs ok');

// History buckets: Bangkok day/10-min slot, round trip, and midnight rollover.
assert.deepStrictEqual(slot(Date.parse('2026-09-25T23:17:59Z')), { day: '2026-09-26', bucket: '06:10' });
assert.deepStrictEqual(slot(Date.parse('2026-09-25T16:59:00Z')), { day: '2026-09-25', bucket: '23:50' });
assert.strictEqual(slotMs('2026-09-26', '06:10'), Date.parse('2026-09-25T23:10:00Z'));
assert.strictEqual(situation(2.78, -0.33, 2.2), 5); // Lat Phrao @ Wat Bang Bua: over bank
assert.strictEqual(situation(1.0, 0, 2), 3);
const db = new DayBuilder();
db.road(Date.parse('2026-09-25T13:10:00Z'), 'FL.A', 0); // zero still marks the bucket as covered
db.road(Date.parse('2026-09-25T13:10:00Z'), 'FL.B', 12.5);
assert.deepStrictEqual(db.days.get('2026-09-25')!.road, { '20:10': { 'FL.B': 12.5 } });
const merged = mergeDay({ road: { '20:10': { 'FL.A': 1 } }, canal: {}, rain: {}, reports: {} }, db.days.get('2026-09-25')!);
assert.deepStrictEqual(merged.road['20:10'], { 'FL.A': 1, 'FL.B': 12.5 });
console.log('history ok');

// BMA home-page table parser (escaped quotes, non-numeric rows ignored).
const home = "x var datatableflood = [\n ['จตุจักร','Chatuchak','ซ.เสนานิคม','ซ.เสนานิคม','63.3','ขาเข้า'],\n ['บางนา','Bang Na','ถ.O\\'Neil  ช่วง 2','s','5.7','x'],\n ['a','b','bad','s','n/a','x']\n];";
assert.deepStrictEqual(parseBmaHome(home), [{ name: 'ซ.เสนานิคม', cm: 63.3 }, { name: "ถ.O'Neil ช่วง 2", cm: 5.7 }]);
console.log('bma home ok');
