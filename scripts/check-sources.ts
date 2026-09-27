// Run: node scripts/check-sources.ts [path/to/saved/weather.bangkok.go.th-flood.html]
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { bkkMs, extractJsonAfter, roadLevel } from '../src/data/sources.ts';
import { DayBuilder, mergeDay, parseBmaHome, parseC13, parseDams, parseLongdoEvents, realBank, situation, slot, slotMs, parseLatLng, parseProvinces, parseTmdWarnings, thaiDay } from '../src/data/history.ts';


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

// Longdo events: flood filter, Bangkok bbox, reporter names stripped, passability, multi-day listing.
const evs = parseLongdoEvents([
  { eid: '1', title: 'น้ำท่วม รามอินทรา 8', title_en: 'Flood', description: 'น้ำท่วมสูงรถเก๋งห้าเข้า รายงานโดย Somchai Jaidee', latitude: '13.85', longitude: '100.61', start: '2026-09-25 22:00:00', stop: '2026-09-26 02:00:00', contributor: 'itic_user', icon: 'flood' },
  { eid: '2', title: 'รถเสีย', title_en: '', description: '', latitude: '13.7', longitude: '100.5', start: '2026-09-26 10:00:00', stop: '2026-09-26 11:00:00', contributor: 'DOH Admin', icon: 'carbreakdown' },
  { eid: '3', title: 'น้ำท่วม สระแก้ว', title_en: '', description: 'รถผ่านไม่ได้', latitude: '13.8', longitude: '102.0', start: '2026-09-26 10:00:00', stop: '2026-09-26 11:00:00', contributor: 'DOH Admin', icon: 'flood' },
] as never);
assert.strictEqual(evs.length, 1);
assert.strictEqual(evs[0].text, 'น้ำท่วมสูงรถเก๋งห้าเข้า');
assert.ok(evs[0].impassable && evs[0].by === 'public');
const eb = new DayBuilder();
eb.event(evs[0], Date.parse('2026-09-26T12:00:00+07:00'));
assert.deepStrictEqual([...eb.days.keys()], ['2026-09-25', '2026-09-26']);
console.log('events ok');

// Upstream parsers: only the four Chao Phraya dams, in order; C.13 by station code.
const dams = parseDams({ dam: { data: { data: [
  { dam_date: '2026-09-26', dam_storage_percent: 90.8, dam_inflow: 60, dam_released: 15, dam: { dam_name: { th: 'วชิราลงกรณ', en: 'Vajiralongkorn' } } },
  { dam_date: '2026-09-26', dam_storage_percent: 83, dam_inflow: 49, dam_released: 2.2, dam: { dam_name: { th: 'ป่าสักชลสิทธิ์', en: 'Pasak' } } },
  { dam_date: '2026-09-26', dam_storage_percent: 62.7, dam_inflow: 31.4, dam_released: 3, dam: { dam_name: { th: 'ภูมิพล', en: 'Bhumibol' } } },
] } } });
assert.deepStrictEqual(dams.map((d) => [d.th, d.cp]), [['ภูมิพล', true], ['ป่าสักชลสิทธิ์', true], ['วชิราลงกรณ', false]]);
assert.deepStrictEqual(parseC13({ waterlevel_data: { data: [
  { discharge: null, waterlevel_datetime: 'x', station: { tele_station_oldcode: 'C.2' } },
  { discharge: '1950.00', waterlevel_datetime: '2026-09-26 17:00', station: { tele_station_oldcode: 'C.13' } },
] } }), { discharge: 1950, time: '2026-09-26 17:00' });
console.log('upstream ok');

// BMA canals: bank-distance bands when there's no ground level; placeholder banks ignored.
assert.deepStrictEqual([situation(1.62, null, 1.5), situation(1.3, null, 1.5), situation(1.0, null, 1.5)], [5, 4, 3]);
assert.strictEqual(realBank(0), null);
assert.strictEqual(realBank(1.5), 1.5);
console.log('bma canals ok');

// TMD warnings: entity-decoded Thai, newest first, absolute links.
const tmd = parseTmdWarnings(`<div class="link-list-content"><div class="link-list-title"><a href="/w/&#xE1D;-14">&#xE1D;&#xE19;&#xE15;&#xE01; &amp; ฉบับที่ 14 </a></div>
  <div class="link-list-description"><a href="/w/x"> ฝนตก<br>หนัก </a></div><div class="caption-item d-flex"><div class="me-1">วันที่ข้อมูล:</div> <div>27 กันยายน 2569</div></div>
  <div class="link-list-content"><div class="link-list-title">no link</div>
  <div class="link-list-content"><div class="link-list-title"><a href="javascript:alert(1)">x</a></div>`);
assert.strictEqual(thaiDay('3 มกราคม 2570'), '2027-01-03');
assert.strictEqual(thaiDay('ไม่มี'), null);
assert.deepStrictEqual(tmd, [{ title: 'ฝนตก & ฉบับที่ 14', text: 'ฝนตก หนัก', date: '27 กันยายน 2569', day: '2026-09-27', url: 'https://www.tmd.go.th/w/%E0%B8%9D-14' }]);
console.log('tmd ok');

// Near me: Google Maps links (pin beats viewport), plain pairs, short links rejected.
assert.deepStrictEqual(parseLatLng('https://www.google.com/maps/place/X/@13.70,100.50,17z/data=!3m1!4b1!4m6!3m5!1s0x0:0x0!8m2!3d13.7563!4d100.5018'), { lat: 13.7563, lng: 100.5018 });
assert.deepStrictEqual(parseLatLng('https://www.google.com/maps/@13.8123,100.6001,15z'), { lat: 13.8123, lng: 100.6001 });
assert.deepStrictEqual(parseLatLng('https://maps.google.com/?q=13.75%2C100.55'), { lat: 13.75, lng: 100.55 });
assert.deepStrictEqual(parseLatLng(' 13.75, 100.55 '), { lat: 13.75, lng: 100.55 });
assert.strictEqual(parseLatLng('https://maps.app.goo.gl/AbCdEf123'), null);
assert.strictEqual(parseLatLng('99.1, 100.5'), null);
console.log('near-me ok');

// Provinces: fresh readings only, Bangkok skipped, worst first.
const pn = Date.parse('2026-09-27T08:00:00+07:00');
const pr = (code: string, th: string, lvl: number, time = '2026-09-27 07:30') => ({ waterlevel_datetime: time, situation_level: lvl, station: { tele_station_lat: 14, tele_station_long: 100 }, geocode: { province_code: code, province_name: { th, en: th } } });
assert.deepStrictEqual(parseProvinces([pr('10', 'กทม', 5), pr('12', 'นนท', 3), pr('14', 'อยุธยา', 5), pr('14', 'อยุธยา', 4), pr('14', 'อยุธยา', 5, '2026-09-26 07:00')], pn)
  .map((p) => [p.th, p.n, p.over, p.near]), [['อยุธยา', 2, 1, 1], ['นนท', 1, 0, 0]]);
console.log('provinces ok');
