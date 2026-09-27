// Run: node scripts/check-sources.ts [path/to/saved/weather.bangkok.go.th-flood.html]
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { bkkMs, extractJsonAfter, roadLevel } from '../src/data/sources.ts';
import { DayBuilder, mergeDay, parseBmaHome, parseC13, parseDams, parseLongdoEvents, realBank, situation, slot, slotMs, parseLatLng, parseProvinces, parseTmdWarnings, thaiDay, sensorTrends, emptyDay, parseDoh, provinceLevel, inPolys, bboxOf, amphoeLevel, parseNation, parseRankings, type Ring } from '../src/data/history.ts';


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

// Trends: flat-line length, 1 h / 24 h deltas, readings outside the window ignored.
{
  const now = Date.parse('2026-09-27T10:00:00+07:00');
  const f0 = emptyDay(), f1 = emptyDay();
  for (let h = 0; h <= 10; h++) f1.road[`${String(h).padStart(2, '0')}:00`] = { A: 20, B: h === 10 ? 31.5 : 30 };
  f0.canal['10:00'] = { C: 1.0 }; f1.canal['09:00'] = { C: 1.2 }; f1.canal['10:00'] = { C: 1.25 };
  f0.road['01:00'] = { A: 20 }; // 33 h before now: outside the 26 h window
  const r = sensorTrends([['2026-09-26', f0], ['2026-09-27', f1]], 'road', now);
  assert.deepStrictEqual([r.get('A')!.flatH, r.get('B')!.flatH, r.get('B')!.d1h], [10, 0, 1.5]);
  const c = sensorTrends([['2026-09-26', f0], ['2026-09-27', f1]], 'canal', now).get('C')!;
  assert.deepStrictEqual([c.d1h, c.d24h], [0.05, 0.25]);
  console.log('trends ok');
}

// Reports kept in history are rounded to ~11 m.
{ const b = new DayBuilder(); b.report('T', 100.629751, 13.789659, '2026-09-27T01:00:00.000Z', 'x');
  assert.deepStrictEqual(b.days.get('2026-09-27')!.reports.T.slice(0, 2), [100.6298, 13.7897]); console.log('report rounding ok'); }

// DOH highways: open floods only, depth text parsed, red = impassable, personal fields dropped.
{
  const base = { latitude: '14.4', longitude: '99.7', incident_type_id: 1, end_date: null, province: 'กาญจนบุรี', amphoe: 'เลาขวัญ', road_code: '3443',
    section_name: 'ตลาดใหม่ - ตลุงเหนือ', km_start: '24+000', km_end: '26+665', direction_text: 'ซ้ายทาง', cause_of_accident: 'ฝนตก',
    lane_closure_color: '04D612', road_closure_text: null, bypass_desc: '', start_date: '2026-09-26T14:15:29Z', reporter_name: 'นาย ก', tel: '0812345678' };
  const out = parseDoh([
    { ...base, gid: 1, flood_level: '30-50' },
    { ...base, gid: 2, flood_level: 'สูง 10 ซม.', lane_closure_color: 'D63031', road_closure_text: 'น้ำท่วมสูง' },
    { ...base, gid: 3, flood_level: '20', end_date: '2026-09-27T01:00:00Z' },
    { ...base, gid: 4, flood_level: '20', incident_type_id: 3 },
  ] as never);
  assert.deepStrictEqual(out.map((x) => [x.id, x.cm, x.impassable, x.km]), [['1', 50, false, '24+000 – 26+665'], ['2', 10, true, '24+000 – 26+665']]);
  assert.ok(!JSON.stringify(out).includes('0812345678') && !JSON.stringify(out).includes('นาย ก'));
  console.log('doh ok');
}

// Province colours: stations and highways, whichever is worse.
assert.deepStrictEqual([
  provinceLevel({ n: 10, over: 3, near: 0 }, []), provinceLevel({ n: 10, over: 1, near: 0 }, []), provinceLevel({ n: 10, over: 0, near: 2 }, []),
  provinceLevel({ n: 10, over: 0, near: 0 }, []), provinceLevel(undefined, []), provinceLevel(undefined, [{ impassable: false }]),
  provinceLevel({ n: 5, over: 0, near: 0 }, [{ impassable: true }]),
], [3, 2, 1, 0, -1, 1, 2]);
console.log('province level ok');

// Amphoe helpers: point-in-polygon with a hole; colour rules.
{
  const sq: Ring[][] = [[[[0, 0], [4, 0], [4, 4], [0, 4], [0, 0]], [[1, 1], [2, 1], [2, 2], [1, 2], [1, 1]]]];
  assert.deepStrictEqual([inPolys(3, 3, sq), inPolys(1.5, 1.5, sq), inPolys(5, 1, sq, bboxOf(sq))], [true, false, false]);
  const z = { over: 0, near: 0, stations: 0, rainMax: null, hwImpassable: 0, hw: 0 };
  assert.deepStrictEqual([amphoeLevel({ ...z, over: 1 }), amphoeLevel({ ...z, hw: 1 }), amphoeLevel({ ...z, rainMax: 95 }), amphoeLevel({ ...z, rainMax: 40 }),
    amphoeLevel({ ...z, rainMax: 2 }), amphoeLevel({ ...z, stations: 3 }), amphoeLevel(z)], [3, 2, 2, 1, 0, 0, -1]);
  console.log('amphoe ok');
}

// Nation points: stale readings dropped, compact tuples.
{
  const now = Date.parse('2026-09-27T12:00:00+07:00');
  const st = { tele_station_lat: 14.123456, tele_station_long: 100.654321 };
  const n = parseNation(
    [{ waterlevel_datetime: '2026-09-27 11:00', situation_level: 5, station: st, geocode: { province_code: '14', province_name: { th: 'x', en: 'x' } } },
     { waterlevel_datetime: '2026-09-26 11:00', situation_level: 5, station: st, geocode: { province_code: '14', province_name: { th: 'x', en: 'x' } } }] as never,
    [{ rain_24h: 95.5, rainfall_datetime: '2026-09-27 11:30', station: st }, { rain_24h: null, rainfall_datetime: '2026-09-27 11:30', station: st }], now);
  assert.deepStrictEqual(n, { wl: [[100.6543, 14.1235, 5]], rain: [[100.6543, 14.1235, 95.5]] });
  console.log('nation points ok');
}

// Rankings: one row per province (its highest), stale and below-bank readings dropped, highest first.
{
  const now = Date.parse('2026-09-27T20:00:00+07:00');
  const g = (p: string) => ({ geocode: { province_code: '1', province_name: { th: p, en: p } } });
  const st = (n: string) => ({ tele_station_lat: 14, tele_station_long: 100, tele_station_name: { th: n } });
  const r = parseRankings(
    [{ ...g('กาญจนบุรี'), waterlevel_datetime: '2026-09-27 19:00', situation_level: 5, diff_wl_bank: '6.04', station: st('ปากแซง') },
     { ...g('กาญจนบุรี'), waterlevel_datetime: '2026-09-27 19:00', situation_level: 5, diff_wl_bank: '1.00', station: st('อื่น') },
     { ...g('ตาก'), waterlevel_datetime: '2026-09-26 19:00', situation_level: 5, diff_wl_bank: '9', station: st('เก่า') }] as never,
    [{ ...g('ระยอง'), rain_24h: 286, rainfall_datetime: '2026-09-27 18:00', station: st('หาดใหญ่') },
     { ...g('ตาก'), rain_24h: 0, rainfall_datetime: '2026-09-27 18:00', station: st('แห้ง') }] as never,
    [{ ...g('กรุงเทพมหานคร'), canal_datetime: '2026-09-27 19:30', canal_value: 2.77, station: { canal_name: { th: 'คลองลาดพร้าว' }, bank: 2.2, canal_lat: 13.8, canal_long: 100.6 } },
     { ...g('นนทบุรี'), canal_datetime: '2026-09-27 19:30', canal_value: 1.0, station: { canal_name: { th: 'ต่ำ' }, bank: 2.0 } }] as never, now);
  assert.deepStrictEqual(r.water.map((x) => [x.prov, x.station, x.value]), [['กาญจนบุรี', 'ปากแซง', 6.04], ['กรุงเทพมหานคร', 'คลองลาดพร้าว', 0.57]]);
  assert.deepStrictEqual(r.rain.map((x) => [x.prov, x.value]), [['ระยอง', 286]]);
  console.log('rankings ok');
}
