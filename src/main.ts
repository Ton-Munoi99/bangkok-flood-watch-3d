import * as maplibregl from 'maplibre-gl';
// MapLibre v6 finds its worker next to its own file, which breaks once bundled; ship it as a separate asset instead.
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
import 'maplibre-gl/dist/maplibre-gl.css';
import './style.css';
import districtsUrl from '../data/bkk_districts.geojson?url';
import dwrCamsUrl from '../data/dwr_cameras.json?url';
import provincesGeoUrl from '../data/th_provinces.geojson?url';
import amphoeGeoUrl from '../data/th_amphoe.geojson?url';
import { amphoeLevel, bboxOf, inPolys, provinceLevel, type Ring as PolyRing } from './data/history';
import simData from '../data/bkk_data.json';
import {
  fetchCanals, fetchRain, fetchReports, fetchRoadFlood, loadHistory, roadVia, reportsVia, bkkMs, fetchCameras, longdoCameraUrl, fetchDwrSnapshot, fetchTrends, fetchDoh, type DohFlood, type DwrCamera, type Trend,
  fetchEvents, fetchTrafficIndex, fetchUpstream, parseLatLng, type RiverRow, type Dam, type FloodEvent, type ProvinceSum, type TopRow, type UpstreamView,
  type Camera, type Canal, type Level, type Rain, type Report, type Result, type RoadFlood,
} from './data/sources';

// ---------------- i18n ----------------
type Lang = 'th' | 'en';
interface Summary { pts: number; districts: number; heavy: number; worst: string; rain: string; reports: number; events: number; impassable: number }
const T = {
  th: {
    riskTitle: 'ดัชนีความเสี่ยงน้ำท่วมรวม', waterReal: 'น้ำท่วมถนนสูงสุด', waterSim: 'ระดับน้ำจำลอง',
    floodedTitle: 'เขตที่มีน้ำท่วมขัง', floodedSub: 'จากเซนเซอร์ กทม.', floodedSim: 'จำลอง: เขตที่น้ำล้น', msl: 'ม.รทก.', rainTitle: 'ฝนสะสม 24 ชม. สูงสุด', rainLbl: 'ฝน 24 ชม.',
    search: 'ค้นหาเขต เช่น จตุจักร, บางเขน', simBanner: 'โหมดจำลอง — สีเขตคำนวณจากความสูงพื้นที่สมมติ ไม่ใช่สถานการณ์จริง',
    homeBtn: 'กลับหน้าเริ่มต้น (กรุงเทพฯ ข้อมูลสด)', rotL: 'หมุนซ้าย 45°', rotR: 'หมุนขวา 45°', spinBtn: 'หมุนรอบ 360° (กดอีกครั้งเพื่อหยุด)',
    sideTitle: 'สถานการณ์น้ำท่วมตอนนี้', sideTitleAt: (t: string) => `สถานการณ์ ณ ${t}`,
    liveBtn: '● สด', traffic: '🚗 Google Maps', trafficTip: 'เปิด Google Maps พร้อมชั้นจราจรแบบสด ตรงตำแหน่งที่แผนที่แสดงอยู่', histLbl: 'ดูย้อนหลัง', histBanner: (t: string) => `กำลังดูข้อมูลย้อนหลัง ณ ${t} — กด "● สด" เพื่อกลับมาดูปัจจุบัน`,
    histNoRoad: 'ไม่มีข้อมูลเซนเซอร์ กทม. ในช่วงเวลานี้', histFail: 'โหลดข้อมูลย้อนหลังไม่ได้ (ใช้ได้เฉพาะบนเว็บที่ deploy แล้ว)',
    histRange: 'ย้อนหลังได้ 7 วัน · ข้อมูลฝนมีเฉพาะช่วงที่ระบบเริ่มเก็บ', histReport: 'แจ้งน้ำท่วม (ข้อมูลย้อนหลังไม่เก็บข้อความ/รูปภาพ)', via: 'ผ่าน สสน.', viaCollector: 'ผ่านตัวเก็บข้อมูล ≤10 นาที', nearestSensor: (n: string, km: string, cm: number) => `ไม่มีเซนเซอร์ กทม. ในเขตนี้ · ใกล้สุด: ${n} (${km} กม.) ${cm} ซม.`, histSrc: 'ย้อนหลัง', refresh: '↻ อัปเดต', simMode: 'โหมดจำลอง (ข้อมูลสมมติ)',
    play: '▶ จำลองฝนตก', pause: '⏸ หยุด', layers: '🗂 ชั้นข้อมูล', layersHint: 'เลือกสิ่งที่แสดงบนแผนที่',
    l0: 'ปกติ', l1: 'เฝ้าระวัง', l2: 'เสี่ยงสูง', l3: 'ท่วมหนัก',
    lyRoad: 'เซนเซอร์น้ำท่วมถนน (กทม.)', lyCanal: 'ระดับน้ำคลอง/แม่น้ำ', lyRain: 'ฝน 24 ชม.', lyReports: 'ประชาชนแจ้งน้ำท่วม (Traffy)',
    lyDistrict: 'สีระดับความเสี่ยงรายเขต', lyBuild: 'อาคาร 3D', lySat: 'ภาพดาวเทียม', lyTerrain: 'ภูมิประเทศ (Terrain)',
    terrainNote: 'Terrain ความละเอียด ~30 ม. — พื้นที่ กทม. ราบมาก (ส่วนใหญ่ 0–2 ม. รทก.) จึงไม่เหมาะเป็นข้อมูลความสูงหลักสำหรับประเมินน้ำท่วม',
    alerts: '⚠ แจ้งเตือน: จุดท่วมหนัก', districts: 'เขตที่ได้รับผลกระทบ', canals: 'ระดับน้ำคลอง/แม่น้ำ',
    unavailable: 'ไม่พร้อมใช้งาน', needSensor: 'ต้องใช้ข้อมูลเซนเซอร์ กทม.',
    staleBanner: 'ข้อมูลไม่พร้อมใช้งานตอนนี้ (เชื่อมต่อไม่ได้ และข้อมูลสำรองเก่าเกิน 6 ชม. จึงไม่แสดง):',
    summaryNoRoad: (rain: string, reports: number) => `ไม่มีข้อมูลเซนเซอร์น้ำท่วมถนนของ กทม. จึงบอกไม่ได้ว่าถนนไหนท่วม`
      + (rain ? ` · ฝนสะสมสูงสุด ${rain}` : '') + ` · ประชาชนแจ้งน้ำท่วมผ่าน Traffy <b>${reports} เรื่อง</b> ใน 24 ชม.`,
    riverTitle: '🌊 แม่น้ำเจ้าพระยา (เหนือ → กทม.)', riverFlow: 'น้ำไหลผ่าน', riverSamsen: 'สามเสน', riverOver: (m: string) => `สูงกว่าตลิ่ง ${m} ม.`, riverBelow: (m: string) => `ต่ำกว่าตลิ่ง ${m} ม.`,
    riverNote: 'ระดับน้ำ ม.รทก. เทียบตลิ่งของสถานี (ไม่ใช่ความสูงคันกั้นน้ำ) · กรมชลประทาน / สสน. ผ่าน ThaiWater · เรียงจากต้นน้ำลงมา กทม.',
    upTitle: '🏞️ น้ำเหนือ (ลุ่มเจ้าพระยา)', upC13: 'เขื่อนเจ้าพระยา (C.13) ระบาย', upUnit: 'ลบ.ม./วิ',
    upDam: (pct: number, inflow: number, release: number) => `ความจุ ${pct.toFixed(0)}% · ไหลเข้า ${inflow.toFixed(1)} · ระบาย ${release.toFixed(1)} ล้าน ลบ.ม./วัน`,
    upNote: 'ข้อมูลกรมชลประทาน ผ่านคลังข้อมูลน้ำแห่งชาติ · น้ำจากเขื่อนเหล่านี้ไหลลงเจ้าพระยาผ่าน กทม.', upOthers: (n: number) => `เขื่อนอื่นทั่วประเทศ (${n})`, upNone: 'ยังไม่มีข้อมูลเขื่อน',
    provTitle: (o: number, n: number, p: number) => `🗺️ ต่างจังหวัด · ล้นตลิ่ง ${o}/${n} สถานี (${p} จังหวัด)`, provRow: (o: number, nr: number, n: number) => `ล้นตลิ่ง ${o} · ใกล้ล้น ${nr} · จาก ${n} สถานี`,
    provNote: 'สถานีโทรมาตรทั่วประเทศ ผ่านคลังข้อมูลน้ำแห่งชาติ (สสน.) · นับเฉพาะสถานีที่รายงานภายใน 6 ชม.', provNone: 'ไม่มีจังหวัดที่น้ำล้นหรือใกล้ล้นตลิ่ง', provOpen: 'ดูสถานีที่ ThaiWater ↗',
    tmdTitle: '📢 ประกาศเตือนภัย กรมอุตุฯ', tmdRead: 'อ่านประกาศเต็มที่ tmd.go.th ↗',
    nearBtn: '📍 รอบบ้านฉัน', nearTitle: '📍 ดูสถานการณ์รอบบ้าน (รัศมี 2 กม.)', nearGps: '📡 ใช้ตำแหน่งปัจจุบันของฉัน', nearGo: 'ดู',
    nearPh: 'วางลิงก์ Google Maps หรือพิกัด เช่น 13.75, 100.55', nearBad: 'อ่านพิกัดไม่ได้ · ลิงก์สั้น (maps.app.goo.gl) ให้เปิดก่อนแล้วคัดลอก URL เต็มจากแถบที่อยู่ หรือพิมพ์พิกัด',
    nearGpsFail: 'ขอตำแหน่งไม่ได้ (ไม่ได้อนุญาตหรือเครื่องไม่รองรับ) · วางลิงก์หรือพิกัดแทนได้', nearWait: 'กำลังหาตำแหน่ง…',
    nearNote: 'ตำแหน่งใช้คำนวณในเครื่องนี้เท่านั้น ไม่ถูกส่งหรือบันทึกที่ใด (ยกเว้นถ้ากด "ดูพยากรณ์ฝนจุดนี้" ตำแหน่งโดยประมาณจะถูกส่งไปเปิดที่ Windy)',
    nearFc: '🌧️ ดูพยากรณ์ฝนจุดนี้ (Windy) ↗', nearFcNote: 'เป็นการพยากรณ์ ไม่ใช่ค่าวัดจริง', nearHere: 'รอบจุดนี้ 2 กม.', nearOutside: 'อยู่นอก กทม. · ข้อมูลในแผนที่นี้ครอบคลุมเฉพาะ กทม.',
    nearRoad: 'ถนนน้ำท่วม', nearCanal: 'คลองล้น/ใกล้ล้นตลิ่ง', nearRain: 'ฝนสถานีใกล้สุด', nearEvents: 'เหตุการณ์จราจร/น้ำท่วม', nearReports: 'แจ้งน้ำท่วม Traffy',
    nearNone: '✅ ไม่พบรายงานน้ำท่วมในรัศมี 2 กม.', nearPts: (n: number, max: number) => `${n} จุด · สูงสุด ${max} ซม.`,
    linksBtn: '🔗 ลิงก์', linksTitle: '🔗 ลิงก์ติดตามสถานการณ์',
    links: [['Google Flood Hub', 'https://sites.research.google/floods/l/13.75/100.55/9', 'พยากรณ์ระดับน้ำในแม่น้ำ ล่วงหน้า 7 วัน'],
      ['ThaiWater (สสน.)', 'https://www.thaiwater.net', 'ระดับน้ำ ฝน เรดาร์ และรายงานสถานการณ์น้ำทั่วประเทศ'],
      ['iTIC Live', 'https://live.iticfoundation.org/', 'ถนนน้ำท่วม เหตุการณ์ และกล้อง CCTV ทั่วกรุงเทพฯ'],
      ['เว็บระดับน้ำท่วมถนน กทม.', 'https://weather.bangkok.go.th/flood/', 'สำนักการระบายน้ำ (เปิดได้จากในประเทศไทย)'],
      ['Traffy Fondue', 'https://share.traffy.in.th/teamchadchart', 'แจ้งเหตุและติดตามเรื่องร้องเรียนกับ กทม.'],
      ['กรมอุตุนิยมวิทยา', 'https://www.tmd.go.th', 'พยากรณ์อากาศและประกาศเตือนภัย'],
      ['เรดาร์ฝน กรมอุตุฯ', 'https://weather.tmd.go.th', 'ภาพเรดาร์ตรวจฝนล่าสุด'],
      ['ThaiWater One Map', 'https://www.thaiwater.net/new4all', 'ภาพรวมน้ำ เขื่อน และพื้นที่เฝ้าระวังทั่วประเทศ'],
      ['กรมทางหลวง (HDMS)', 'https://hdms.doh.go.th/dashboard', 'ทางหลวงที่ได้รับผลกระทบ ผ่านได้/ผ่านไม่ได้ ทั่วประเทศ'],
      ['CCTV จราจร กทม.', 'https://cpudapp.bangkok.go.th/bmatraffic', 'กล้องจราจรของกรุงเทพมหานคร'],
      ['แผนผังคลอง กทม.', 'https://weather.bangkok.go.th/KlongMap', 'ระดับน้ำและทิศทางการไหลของคลอง (เปิดได้จากในประเทศไทย)'],
      ['GISTDA Life Dee', 'https://lifedee.gistda.or.th/map/flood', 'คาดการณ์พื้นที่เสี่ยงน้ำท่วมล่วงหน้า 1–3 วัน (เป็นการคาดการณ์ ไม่ใช่ค่าวัดจริง)'],
      ['Google DeepMind WeatherLab', 'https://deepmind.google.com/science/weatherlab', 'พยากรณ์อากาศรายจุดจากโมเดล AI WeatherNext (ทดลอง ต้องล็อกอิน Google · ไม่ใช่ประกาศทางการ)']] as [string, string, string][],
    hotlineBtn: '📞 สายด่วน', rainBtn: '🌧️ พยากรณ์ฝน', hotlineTitle: '📞 สายด่วนขอความช่วยเหลือ',
    hotlineNote: 'บนมือถือ กดที่เบอร์เพื่อโทรได้ทันที', lineDdpm: 'ปภ. ทาง LINE: @1784DDPM',
    careTitle: '🧓 บ้านที่มีผู้สูงอายุ ผู้ป่วยติดเตียง หรือคนเดินเองไม่ได้',
    careText: 'ถ้าน้ำเข้าบ้านหรือขึ้นเร็ว และต้องการคนช่วยเคลื่อนย้าย โทร 1669 (เจ็บป่วยฉุกเฉิน) หรือ 1784 (ปภ.) · ในกรุงเทพฯ แจ้ง 1555 หรือสำนักงานเขต · ส่งเว็บนี้ให้ญาติหรือคนดูแลไว้เปิดดูค่าล่าสุดได้ เว็บนี้ไม่เก็บข้อมูลผู้ป่วยหรือที่อยู่',
    shareSite: '🔗 ส่งเว็บนี้ให้ญาติ/คนดูแล', shareDistrict: '🔗 แชร์ลิงก์เขตนี้', copied: '✓ คัดลอกลิงก์แล้ว',
    greenNote: 'สีบอกระดับน้ำในคลองเทียบตลิ่งเท่านั้น สีเขียวไม่ได้แปลว่าไม่ท่วม ถนนและบ้านรอบๆ ท่วมได้แม้คลองยังต่ำกว่าตลิ่ง ดูจุดน้ำท่วมถนนและรายงาน Traffy ประกอบ', rainTitle2: '🌧️ พยากรณ์ฝน กทม. และปริมณฑล',
    rainTabFc: 'พยากรณ์ฝน', rainTabRadar: 'เรดาร์', rainTabAccu: 'ฝนสะสม', rainNote: 'ข้อมูลจาก Windy (โมเดล ECMWF) — ใช้แถบเวลาด้านล่างเพื่อดูล่วงหน้า',
    hotlines: [['1784', 'ปภ. แจ้งเหตุสาธารณภัย'], ['1669', 'เจ็บป่วยฉุกเฉิน'], ['191', 'เหตุด่วนเหตุร้าย'], ['199', 'ดับเพลิง / กู้ภัย'], ['1130', 'ไฟรั่ว / ไฟดูด (การไฟฟ้านครหลวง: กทม. นนทบุรี สมุทรปราการ)'], ['1129', 'ไฟรั่ว / ไฟดูด (การไฟฟ้าส่วนภูมิภาค: จังหวัดอื่น)'],
      ['1555', 'กรุงเทพมหานคร'], ['02-248-5115', 'ศูนย์ป้องกันสถานการณ์น้ำท่วม กทม.'], ['1460', 'กรมชลประทาน'], ['1182', 'กรมอุตุนิยมวิทยา'], ['1586', 'กรมทางหลวง (เส้นทางน้ำท่วม)'], ['1146', 'กรมทางหลวงชนบท']],
    lyEvents: 'เหตุการณ์น้ำท่วม (iTIC/Longdo)', eventsList: 'เหตุการณ์น้ำท่วม (iTIC/Longdo)', eventsEmpty: 'ไม่มีเหตุการณ์น้ำท่วมที่ยังไม่คลี่คลาย',
    impassable: '🚫 ถนนที่รถเล็กไม่ควรผ่าน', impassableTag: 'รถเล็กไม่ควรผ่าน', evBy: 'ลงข้อมูลโดย', evWhen: 'ช่วงเวลา', evOpen: 'ดูบน iTIC Live',
    byLabel: { doh: 'เจ้าหน้าที่กรมทางหลวง', itic: 'เจ้าหน้าที่ iTIC', public: 'ผู้ใช้แอป iTIC' } as Record<string, string>, events: 'เหตุการณ์',
    srcDoh: 'ทางหลวง: กรมทางหลวง (HDMS)', lyDoh: 'ทางหลวงน้ำท่วม กรมทางหลวง',
    nationBtn: '🗺️ ต่างจังหวัด', nationTip: 'แสดงสีรายจังหวัด ทางหลวง และกล้องทั่วประเทศ (ปิด = เฉพาะ กทม.)',
    provLegend: 'สีจังหวัด (แม่น้ำ/ทางหลวง ไม่ใช่เซนเซอร์ถนนแบบ กทม.): แดง = สถานีล้นตลิ่ง 3 จุดขึ้นไป · ส้ม = ล้นตลิ่ง 1–2 จุด หรือทางหลวงผ่านไม่ได้ · เหลือง = ใกล้ล้นตลิ่ง หรือทางหลวงมีน้ำท่วม · เขียว = สถานีปกติ · เทา = ไม่มีรายงานใน 6 ชม.',
    provNoData: 'ไม่มีสถานีรายงานใน 6 ชม.',
    topRain: '🌧️ ฝนสะสม 24 ชม. สูงสุดรายจังหวัด', topWater: '🌊 น้ำล้นตลิ่งสูงสุดรายจังหวัด', topOver: 'ล้นตลิ่ง', topNone: 'ไม่มีสถานีรายงานน้ำล้นตลิ่งในขณะนี้', topRainNone: 'ไม่มีสถานีรายงานฝนในขณะนี้', topRainNA: 'ข้อมูลฝนไม่พร้อมใช้งานในรอบนี้ (ดึงจาก ThaiWater ไม่สำเร็จ)',
    topNote: (t: string) => `สถานีสูงสุดของแต่ละจังหวัด จากคลังข้อมูลน้ำแห่งชาติ (ThaiWater) · ข้อมูลเมื่อ ${t}`,
    ampLegend: 'ซูมเข้าจะเห็นรายอำเภอ: แดง = สถานีล้นตลิ่ง หรือทางหลวงผ่านไม่ได้ · ส้ม = ใกล้ล้นตลิ่ง ทางหลวงมีน้ำท่วม หรือฝนตกหนักมาก (>90 มม./24 ชม.) · เหลือง = ฝนตกหนัก (35–90 มม.) · เขียว = ปกติ · เทา = ไม่มีสถานีในอำเภอ (ไม่ได้แปลว่าไม่ท่วม)',
    ampTitle: 'อำเภอ', ampStations: 'สถานีวัดน้ำ', ampRain: 'ฝนสูงสุด 24 ชม.', ampNoStation: 'ไม่มีสถานีวัดน้ำหรือวัดฝนในอำเภอนี้ จึงไม่มีสี (ไม่ได้แปลว่าไม่ท่วม)',
    ampStRow: (n: number, o: number, nr: number) => `${n} สถานี · ล้นตลิ่ง ${o} · ใกล้ล้น ${nr}`, ampNote: 'จากสถานีโทรมาตร ThaiWater ฝน และกรมทางหลวง ภายใน 6 ชม.',
    dohTitle: (n: number, x: number) => `🛣️ ทางหลวงน้ำท่วม (${n}) · ผ่านไม่ได้ ${x}`, dohNo: 'ผ่านไม่ได้', dohYes: 'ผ่านได้', dohRoad: 'ทางหลวงหมายเลข',
    dohDepth: 'ระดับน้ำ', dohKm: 'ช่วง กม.', dohCause: 'สาเหตุ', dohDetour: 'ทางเลี่ยง', dohSide: 'ช่องทาง', dohOpen: 'ดูที่ระบบกรมทางหลวง',
    dohNote: 'รายงานโดยเจ้าหน้าที่กรมทางหลวง เฉพาะทางหลวงแผ่นดิน ไม่รวมถนนในเมือง', nearDoh: 'ทางหลวงน้ำท่วม',
    srcEvents: 'เหตุการณ์: iTIC / Longdo Event', srcTitle: 'แหล่งข้อมูล',
    srcCams: 'กล้อง: <a href="https://traffic.longdo.com/cameralist" target="_blank" rel="noopener">Longdo Traffic</a> / มูลนิธิ iTIC / กรมทางหลวง',
    srcDistricts: 'ขอบเขตเขต: <a href="https://github.com/chingchai/OpenGISData-Thailand" target="_blank" rel="noopener">OpenGISData-Thailand</a> (chingchai)', trafficIdx: '🚦 จราจร', trafficTipIdx: 'ดัชนีการจราจร กทม. 0–10 จาก Longdo Traffic (ยิ่งสูงยิ่งติด)',
    stuckRoad: (h: number) => `⚠️ ค่าเท่าเดิมมา ${h} ชม. อาจเป็นค่าค้างหรือค่าประมาณ (ไม่ใช่ค่าวัดสด) จึงไม่นับในสรุปและสีของเขต`,
    stuckCanal: (h: number) => `⚠️ ค่าไม่เปลี่ยนมา ${h} ชม. เครื่องวัดอาจค้าง`, stuckSum: (n: number) => ` · ไม่นับ ${n} จุดที่ค่าไม่เปลี่ยนเกิน 6 ชม. (อาจค้าง)`,
    trend1h: '1 ชม.', trend24h: '24 ชม.', trendLbl: 'เปลี่ยนแปลง',
    lyDwr: 'กล้องแม่น้ำ/คลอง กรมทรัพยากรน้ำ', dwrAgency: 'กรมทรัพยากรน้ำ', dwrLoading: 'กำลังโหลดภาพ…', dwrFail: 'โหลดภาพไม่ได้ในขณะนี้',
    dwrOld: 'ภาพเก่ากว่า 1 ชม. อาจไม่ใช่สภาพปัจจุบัน', dwrShot: 'ถ่ายเมื่อ', dwrNote: 'ภาพประกอบเท่านั้น ไม่ใช่ค่าระดับน้ำ', dwrOpen: 'ดูสถานีที่เว็บกรมทรัพยากรน้ำ', dwrProv: 'จังหวัด',
    lyCams: 'กล้องจราจร (Longdo/iTIC)', camTitle: 'กล้องจราจร', camOwner: 'เจ้าของกล้อง', camOpen: 'ดูภาพสดที่ Longdo Traffic',
    camNear: (name: string, m: number) => `📷 กล้องใกล้จุดนี้ (${m} ม.): ${name}`,
    traffyList: 'ประชาชนแจ้งล่าสุด (Traffy Fondue)', traffyEmpty: 'ไม่มีเรื่องแจ้งน้ำท่วมใน 24 ชม.', traffyOpen: 'ดูเรื่องนี้ใน Traffy Fondue', traffyMore: (n: number) => `ดูอีก ${n} เรื่อง`,
    noAlerts: 'ไม่มีจุดท่วมหนักในขณะนี้', loading: 'กำลังโหลดข้อมูลล่าสุด…', more: (n: number) => `ดูอีก ${n} จุด`, noDistricts: 'ยังไม่มีเขตที่มีน้ำท่วมขัง',
    pts: 'จุดท่วม', reports: 'แจ้งเหตุ', since: 'ท่วมตั้งแต่', max: 'สูงสุด', updated: 'อัปเดต',
    district: 'เขต', districtLbl: 'เขต', area: 'พื้นที่', status: 'สถานะ', maxRoad: 'น้ำท่วมถนนสูงสุด', rainMax: 'ฝน 24 ชม. สูงสุด',
    elevSim: 'ความสูงพื้นที่ (จำลอง)', marginSim: 'ระยะก่อนน้ำล้น (จำลอง)', waterNow: 'ระดับน้ำ', bank: 'ระดับตลิ่ง',
    toBank: 'ระยะก่อนล้นตลิ่ง', overBank: 'ล้นตลิ่ง', agency: 'หน่วยงาน', detail: 'ดูรายละเอียดที่ กทม.',
    noSensor: 'ไม่มีข้อมูลในเขตนี้ตอนนี้', stateLbl: 'สถานะเรื่อง', live: 'สด', snapshot: 'ข้อมูลสำรอง',
    mockBanner: 'บางแหล่งเชื่อมต่อไม่ได้ — กำลังแสดงข้อมูลล่าสุดที่มี ไม่ใช่ข้อมูลปัจจุบัน:', asOf: (t: string, ago: string) => `ข้อมูลเมื่อ ${t} (${ago}ที่แล้ว)`,
    agoFmt: (h: number, m: number) => (h ? `${h} ชม. ` : '') + `${m} นาที`, l4: 'ไม่มีข้อมูล',
    situation: ['', 'น้อยวิกฤต', 'น้อย', 'ปกติ', 'มาก', 'ล้นตลิ่ง'],
    // BMA canal points are classed by distance to the bank instead of ThaiWater's storage bands
    bankSit: ['', '', '', 'ห่างตลิ่ง', 'ใกล้ตลิ่ง (<30 ซม.)', 'ถึง/เกินตลิ่ง'], canalStale: 'ข้อมูลเกิน 1 ชม.', canalNoBank: 'ไม่มีข้อมูลตลิ่ง',
    canalFresh: (fresh: number, all: number) => `ส่งค่าใน 1 ชม. ${fresh}/${all}`,
    canalSum: (over: number, near: number, fresh: number, all: number) => ` · คลอง: ถึง/เกินตลิ่ง <b>${over} จุด</b> ใกล้ตลิ่ง ${near} จุด (ส่งค่าใน 1 ชม. ${fresh}/${all})`,
    rain1h: (n: number, all: number, max: number) => ` · ฝน 1 ชม. ล่าสุด: ตก ${n} จาก ${all} สถานี${n ? ` มากสุด ${max} มม.` : ''}`,
    noFloodReport: 'ไม่มีรายงานน้ำท่วม', readMore: 'อ่านต่อ ▾', readLess: 'ย่อ ▴',
    rainCls: (mm: number) => (mm > 90 ? 'หนักมาก' : mm > 35 ? 'หนัก' : mm > 10 ? 'ปานกลาง' : 'เล็กน้อย'),
    summary: (s: Summary) =>
      s.pts === 0
        ? 'เซนเซอร์ของ กทม. ไม่พบน้ำท่วมขังบนถนน'
        : `มีน้ำท่วมขังถนน <b>${s.pts} จุด</b> ใน <b>${s.districts} เขต</b> · ท่วมหนัก (≥20 ซม.) <b>${s.heavy} จุด</b> · หนักสุดที่ ${s.worst}`
          + (s.rain ? ` · ฝนสะสมสูงสุด ${s.rain}` : '') + (s.reports ? ` · ประชาชนแจ้งน้ำท่วมผ่าน Traffy <b>${s.reports} เรื่อง</b> ใน 24 ชม.` : '')
          + (s.events ? ` · เหตุการณ์น้ำท่วมที่ยังไม่คลี่คลาย (iTIC/Longdo) <b>${s.events} จุด</b>${s.impassable ? `, รถเล็กไม่ควรผ่าน <b>${s.impassable} จุด</b>` : ''}` : ''),
    srcRoad: 'น้ำท่วมถนน: สำนักการระบายน้ำ กทม.', srcCanal: 'ระดับน้ำ: คลังข้อมูลน้ำแห่งชาติ (สสน.)',
    srcRain: 'ฝน: คลังข้อมูลน้ำแห่งชาติ (สสน.)', srcTraffy: 'แจ้งเหตุ: Traffy Fondue',
    srcSim: 'ความสูงพื้นที่รายเขต: ข้อมูลจำลองจากต้นแบบ (ไม่ใช่ DEM จริง)',
  },
  en: {
    riskTitle: 'City flood risk index', waterReal: 'Max road flooding', waterSim: 'Simulated water level',
    floodedTitle: 'Districts with flooding', floodedSub: 'from BMA sensors', floodedSim: 'simulated: flooded districts', msl: 'm MSL', rainTitle: 'Max 24h rainfall', rainLbl: '24h rain',
    search: 'Search district, e.g. Chatuchak', simBanner: 'Simulation mode — district colours use hypothetical ground heights, not the real situation',
    homeBtn: 'Back to the start view (Bangkok, live data)', rotL: 'Rotate left 45°', rotR: 'Rotate right 45°', spinBtn: 'Orbit 360° (press again to stop)',
    sideTitle: 'Flood situation now', sideTitleAt: (t: string) => `Situation at ${t}`,
    liveBtn: '● Live', traffic: '🚗 Google Maps', trafficTip: 'Open Google Maps with the live traffic layer at the current map view', histLbl: 'History', histBanner: (t: string) => `Viewing history at ${t} — press "● Live" to return to now`,
    histNoRoad: 'No BMA sensor data for this time', histFail: 'Could not load history (works on the deployed site only)',
    histRange: 'Up to 7 days back · rain only from when recording started', histReport: 'Flood report (history keeps no text/photos)', via: 'via HII', viaCollector: 'via our collector, ≤10 min old', nearestSensor: (n: string, km: string, cm: number) => `No BMA sensor in this district · nearest: ${n} (${km} km) ${cm} cm`, histSrc: 'history', refresh: '↻ Refresh', simMode: 'Simulation mode (hypothetical)',
    play: '▶ Simulate rain', pause: '⏸ Pause', layers: '🗂 Layers', layersHint: 'choose what the map shows',
    l0: 'Normal', l1: 'Watch', l2: 'High risk', l3: 'Severe',
    lyRoad: 'Road flood sensors (BMA)', lyCanal: 'Canal/river levels', lyRain: '24h rainfall', lyReports: 'Citizen flood reports (Traffy)',
    lyDistrict: 'District risk colours', lyBuild: '3D buildings', lySat: 'Satellite', lyTerrain: 'Terrain',
    terrainNote: 'Terrain is ~30 m resolution and Bangkok is very flat (mostly 0–2 m MSL), so it is not suitable as the primary elevation source for flood assessment.',
    alerts: '⚠ Alerts: severe flooding', districts: 'Affected districts', canals: 'Canal/river levels',
    unavailable: 'unavailable', needSensor: 'needs BMA sensor data',
    staleBanner: 'Unavailable right now (unreachable, and the saved snapshot is over 6 h old so it is hidden):',
    summaryNoRoad: (rain: string, reports: number) => `No BMA road-flood sensor data, so flooded roads cannot be shown`
      + (rain ? ` · max rainfall ${rain}` : '') + ` · <b>${reports}</b> citizen flood reports on Traffy in 24h`,
    riverTitle: '🌊 Chao Phraya River (upstream → Bangkok)', riverFlow: 'Flow', riverSamsen: 'Samsen', riverOver: (m: string) => `${m} m above bank`, riverBelow: (m: string) => `${m} m below bank`,
    riverNote: 'Water level (m MSL) against each gauge\'s bank, not the flood-wall height · RID / HII via ThaiWater · listed from upstream down to Bangkok',
    upTitle: '🏞️ Upstream (Chao Phraya basin)', upC13: 'Chao Phraya Dam (C.13) outflow', upUnit: 'm³/s',
    upDam: (pct: number, inflow: number, release: number) => `${pct.toFixed(0)}% full · in ${inflow.toFixed(1)} · out ${release.toFixed(1)} million m³/day`,
    upNote: 'Royal Irrigation Dept. data via ThaiWater · these dams drain down the Chao Phraya through Bangkok', upOthers: (n: number) => `Other dams nationwide (${n})`, upNone: 'No dam data yet',
    provTitle: (o: number, n: number, p: number) => `🗺️ Other provinces · over bank ${o}/${n} stations (${p} provinces)`, provRow: (o: number, nr: number, n: number) => `over bank ${o} · near ${nr} · of ${n} stations`,
    provNote: 'Nationwide telemetry via ThaiWater (HII) · only stations reporting within 6 h', provNone: 'No province has water over or near bank', provOpen: 'Stations on ThaiWater ↗',
    tmdTitle: '📢 TMD weather warnings', tmdRead: 'Full announcement (Thai) at tmd.go.th ↗',
    nearBtn: '📍 Near me', nearTitle: '📍 What\'s around me (2 km radius)', nearGps: '📡 Use my current location', nearGo: 'Go',
    nearPh: 'Paste a Google Maps link or coordinates, e.g. 13.75, 100.55', nearBad: 'Couldn\'t read coordinates · for short links (maps.app.goo.gl) open them first and copy the full URL, or type coordinates',
    nearGpsFail: 'Location unavailable (permission denied or unsupported) · paste a link or coordinates instead', nearWait: 'Finding you…',
    nearNote: 'Your location is only used on this device; it is never sent or stored (unless you tap "Rain forecast here", which opens Windy at the approximate spot).',
    nearFc: '🌧️ Rain forecast here (Windy) ↗', nearFcNote: 'a forecast, not a measurement', nearHere: 'Within 2 km of here', nearOutside: 'Outside Bangkok · this map only covers Bangkok',
    nearRoad: 'Flooded roads', nearCanal: 'Canals over/near bank', nearRain: 'Nearest rain gauge', nearEvents: 'Traffic/flood incidents', nearReports: 'Traffy flood reports',
    nearNone: '✅ No flooding reported within 2 km', nearPts: (n: number, max: number) => `${n} pts · max ${max} cm`,
    linksBtn: '🔗 Links', linksTitle: '🔗 Follow the situation',
    links: [['Google Flood Hub', 'https://sites.research.google/floods/l/13.75/100.55/9', '7-day river flood forecasts'],
      ['ThaiWater (HII)', 'https://www.thaiwater.net', 'Water levels, rain, radar and national reports'],
      ['iTIC Live', 'https://live.iticfoundation.org/', 'Flooded roads, incidents and CCTV across Bangkok'],
      ['BMA road-flood sensors', 'https://weather.bangkok.go.th/flood/', 'Drainage & Sewerage Dept. (reachable from Thailand)'],
      ['Traffy Fondue', 'https://share.traffy.in.th/teamchadchart', 'Report and track issues with the BMA'],
      ['Thai Meteorological Dept.', 'https://www.tmd.go.th', 'Forecasts and weather warnings'],
      ['TMD rain radar', 'https://weather.tmd.go.th', 'Latest weather-radar images'],
      ['ThaiWater One Map', 'https://www.thaiwater.net/new4all', 'National overview of water, dams and watch areas'],
      ['Dept. of Highways (HDMS)', 'https://hdms.doh.go.th/dashboard', 'Affected highways nationwide, passable or not'],
      ['BMA traffic CCTV', 'https://cpudapp.bangkok.go.th/bmatraffic', 'Bangkok traffic cameras'],
      ['BMA canal map', 'https://weather.bangkok.go.th/KlongMap', 'Canal levels and flow directions (reachable from Thailand)'],
      ['GISTDA Life Dee', 'https://lifedee.gistda.or.th/map/flood', '1–3 day flood-risk forecast (a forecast, not a measurement)'],
      ['Google DeepMind WeatherLab', 'https://deepmind.google.com/science/weatherlab', 'Point forecasts from the WeatherNext AI model (experimental, Google sign-in · not an official warning)']] as [string, string, string][],
    hotlineBtn: '📞 Hotlines', rainBtn: '🌧️ Rain forecast', hotlineTitle: '📞 Emergency hotlines (Thailand)',
    hotlineNote: 'On a phone, tap a number to call.', lineDdpm: 'DDPM on LINE: @1784DDPM',
    careTitle: '🧓 Homes with elderly, bedridden or mobility-impaired people',
    careText: 'If water enters the house or rises fast and you need help moving someone, call 1669 (medical) or 1784 (DDPM) · in Bangkok also 1555 or your district office · Send this site to relatives or carers so they can check the latest readings. This site stores no patient or address data.',
    shareSite: '🔗 Send this site to family/carers', shareDistrict: '🔗 Share this district', copied: '✓ Link copied',
    greenNote: 'Colour shows the canal level against its bank only. Green does not mean no flooding: roads and homes nearby can flood while the canal is below bank. Check road-flood points and Traffy reports too.', rainTitle2: '🌧️ Rain forecast — Bangkok & vicinity',
    rainTabFc: 'Forecast', rainTabRadar: 'Radar', rainTabAccu: 'Accumulated', rainNote: 'Data from Windy (ECMWF model) — use the timeline to look ahead.',
    hotlines: [['1784', 'Disaster Prevention (DDPM)'], ['1669', 'Medical emergency'], ['191', 'Police emergency'], ['199', 'Fire / rescue'], ['1130', 'Electrical leak / shock (MEA: Bangkok, Nonthaburi, Samut Prakan)'], ['1129', 'Electrical leak / shock (PEA: other provinces)'],
      ['1555', 'Bangkok Metropolitan Administration'], ['02-248-5115', 'BMA Flood Prevention Centre'], ['1460', 'Royal Irrigation Dept.'], ['1182', 'Thai Meteorological Dept.'], ['1586', 'Dept. of Highways (flooded routes)'], ['1146', 'Dept. of Rural Roads']],
    lyEvents: 'Flood incidents (iTIC/Longdo)', eventsList: 'Flood incidents (iTIC/Longdo)', eventsEmpty: 'No active flood incidents',
    impassable: '🚫 Roads impassable for small cars', impassableTag: 'impassable for small cars', evBy: 'Posted by', evWhen: 'Period', evOpen: 'View on iTIC Live',
    byLabel: { doh: 'DOH staff', itic: 'iTIC staff', public: 'iTIC app user' } as Record<string, string>, events: 'incidents',
    srcDoh: 'Highways: Dept. of Highways (HDMS)', lyDoh: 'Flooded highways, Dept. of Highways',
    nationBtn: '🗺️ Provinces', nationTip: 'Show province colours, highways and cameras nationwide (off = Bangkok only)',
    provLegend: 'Province colours (rivers/highways, not Bangkok-style road sensors): red = 3+ stations over bank · orange = 1–2 over bank or an impassable highway · yellow = near bank or a flooded highway · green = stations normal · grey = no report in 6 h',
    provNoData: 'No station reported in the last 6 h',
    topRain: '🌧️ Highest 24 h rain by province', topWater: '🌊 Highest over-bank water by province', topOver: 'over bank', topNone: 'No station reports water over its bank right now', topRainNone: 'No station reports rain right now', topRainNA: 'Rain data unavailable this round (ThaiWater fetch failed)',
    topNote: (t: string) => `Highest station in each province, from ThaiWater · data as of ${t}`,
    ampLegend: 'Zoom in for districts (amphoe): red = a station over bank or an impassable highway · orange = near bank, a flooded highway or very heavy rain (>90 mm/24 h) · yellow = heavy rain (35–90 mm) · green = normal · grey = no gauge in the district (not "no flooding")',
    ampTitle: 'District', ampStations: 'Water-level stations', ampRain: 'Max rain 24 h', ampNoStation: 'No water-level or rain gauge in this district, so no colour (not "no flooding")',
    ampStRow: (n: number, o: number, nr: number) => `${n} stations · over bank ${o} · near ${nr}`, ampNote: 'From ThaiWater gauges, rain gauges and DOH highways, last 6 h',
    dohTitle: (n: number, x: number) => `🛣️ Flooded highways (${n}) · impassable ${x}`, dohNo: 'Impassable', dohYes: 'Passable', dohRoad: 'Highway',
    dohDepth: 'Water depth', dohKm: 'Km', dohCause: 'Cause', dohDetour: 'Detour', dohSide: 'Lanes', dohOpen: 'View on DOH system',
    dohNote: 'Reported by Dept. of Highways staff · national highways only, not city streets', nearDoh: 'Flooded highways',
    srcEvents: 'Incidents: iTIC / Longdo Event', srcTitle: 'Data sources',
    srcCams: 'Cameras: <a href="https://traffic.longdo.com/cameralist" target="_blank" rel="noopener">Longdo Traffic</a> / iTIC Foundation / DOH',
    srcDistricts: 'District boundaries: <a href="https://github.com/chingchai/OpenGISData-Thailand" target="_blank" rel="noopener">OpenGISData-Thailand</a> (chingchai)', trafficIdx: '🚦 Traffic', trafficTipIdx: 'Bangkok traffic index 0–10 from Longdo Traffic (higher = worse)',
    stuckRoad: (h: number) => `⚠️ Same value for ${h} h — likely stuck or an estimate, not a live reading; left out of the summary and district colours`,
    stuckCanal: (h: number) => `⚠️ Unchanged for ${h} h — the gauge may be stuck`, stuckSum: (n: number) => ` · ${n} points unchanged for 6+ h (possibly stuck) not counted`,
    trend1h: '1 h', trend24h: '24 h', trendLbl: 'Change',
    lyDwr: 'River/canal cameras, Dept. of Water Resources', dwrAgency: 'Dept. of Water Resources', dwrLoading: 'Loading image…', dwrFail: 'Image unavailable right now',
    dwrOld: 'Image is over 1 h old — may not show current conditions', dwrShot: 'Taken', dwrNote: 'For context only — not a water-level reading', dwrOpen: 'Station on DWR website', dwrProv: 'Province',
    lyCams: 'Traffic cameras (Longdo/iTIC)', camTitle: 'Traffic camera', camOwner: 'Owner', camOpen: 'Live view on Longdo Traffic',
    camNear: (name: string, m: number) => `📷 Nearest camera (${m} m): ${name}`,
    traffyList: 'Latest citizen reports (Traffy Fondue)', traffyEmpty: 'No flood reports in the last 24 h', traffyOpen: 'Open in Traffy Fondue', traffyMore: (n: number) => `Show ${n} more`,
    noAlerts: 'No severe flooding right now', loading: 'Loading latest data…', more: (n: number) => `Show ${n} more`, noDistricts: 'No district has road flooding',
    pts: 'points', reports: 'reports', since: 'Since', max: 'Max', updated: 'Updated',
    district: '', districtLbl: 'District', area: 'Area', status: 'Status', maxRoad: 'Max road flooding', rainMax: 'Max 24h rain',
    elevSim: 'Ground height (simulated)', marginSim: 'Margin before flooding (simulated)', waterNow: 'Water level', bank: 'Bank level',
    toBank: 'Margin to bank', overBank: 'Over bank', agency: 'Agency', detail: 'Details at BMA',
    noSensor: 'No data for this district right now', stateLbl: 'Ticket status', live: 'live', snapshot: 'snapshot',
    mockBanner: 'Some sources are unreachable — showing the latest data available, not current:', asOf: (t: string, ago: string) => `data as of ${t} (${ago} ago)`,
    agoFmt: (h: number, m: number) => (h ? `${h} h ` : '') + `${m} min`, l4: 'No data',
    situation: ['', 'Critically low', 'Low', 'Normal', 'High', 'Overflowing'],
    bankSit: ['', '', '', 'Below bank', 'Near bank (<30 cm)', 'At/over bank'], canalStale: 'Reading over 1 h old', canalNoBank: 'No bank level',
    canalFresh: (fresh: number, all: number) => `${fresh}/${all} reported in the last hour`,
    canalSum: (over: number, near: number, fresh: number, all: number) => ` · canals: <b>${over}</b> at/over bank, ${near} near bank (${fresh}/${all} reported in 1 h)`,
    rain1h: (n: number, all: number, max: number) => ` · last hour: rain at ${n} of ${all} gauges${n ? `, max ${max} mm` : ''}`,
    noFloodReport: 'No flooding reported', readMore: 'Read more ▾', readLess: 'Show less ▴',
    rainCls: (mm: number) => (mm > 90 ? 'very heavy' : mm > 35 ? 'heavy' : mm > 10 ? 'moderate' : 'light'),
    summary: (s: Summary) =>
      s.pts === 0
        ? 'BMA sensors report no road flooding.'
        : `Road flooding at <b>${s.pts} points</b> in <b>${s.districts} districts</b> · severe (≥20 cm) <b>${s.heavy}</b> · worst at ${s.worst}`
          + (s.rain ? ` · max rainfall ${s.rain}` : '') + (s.reports ? ` · <b>${s.reports}</b> citizen flood reports on Traffy in 24h` : '')
          + (s.events ? ` · <b>${s.events}</b> active flood incidents (iTIC/Longdo)${s.impassable ? `, <b>${s.impassable}</b> impassable for small cars` : ''}` : ''),
    srcRoad: 'Road flooding: BMA Drainage & Sewerage Dept.', srcCanal: 'Water level: Thai National Water Data (HII)',
    srcRain: 'Rain: Thai National Water Data (HII)', srcTraffy: 'Reports: Traffy Fondue',
    srcSim: 'District ground heights: simulated prototype data (not a real DEM)',
  },
};
let lang: Lang = 'th';
const t = () => T[lang];

// ---------------- helpers ----------------
const $ = <E extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as E;
const esc = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const LEVEL_COLORS = ['#3ed598', '#f5c748', '#f5924b', '#f2495c'];
// Shared with the legend swatch via the --l-none CSS variable (MapLibre paint can't read CSS variables itself).
const NO_DATA_COLOR = getComputedStyle(document.documentElement).getPropertyValue('--l-none').trim() || '#9aa3b2';
const SITUATION_COLORS = ['#8996b0', '#8996b0', '#8996b0', '#3ed598', '#f5924b', '#f2495c'];
const hhmm = (s: string | null) => (s ? s.replace('T', ' ').slice(11, 16) : '-'); // BMA/ThaiWater times are already Bangkok local
const bkkTime = (iso: string) => new Date(iso).toLocaleString(lang === 'th' ? 'th-TH' : 'en-GB', { timeZone: 'Asia/Bangkok', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
const name = (x: { nameTh: string; nameEn: string }) => (lang === 'th' ? x.nameTh : x.nameEn || x.nameTh);
const lvlName = (l: number) => t()[`l${l}` as 'l0'];

type Ring = number[][];
const inRing = ([x, y]: number[], r: Ring) => {
  let c = false;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    const [xi, yi] = r[i], [xj, yj] = r[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
};
const inMultiPolygon = (p: number[], mp: Ring[][]) => mp.some(([outer, ...holes]) => inRing(p, outer) && !holes.some((h) => inRing(p, h)));

// ---------------- districts ----------------
interface District {
  code: string; th: string; en: string; area: number; elev: number;
  geom: Ring[][]; bbox: [number, number, number, number];
  road: RoadFlood[]; reports: number; events: number; impassable: number; rainMax: Rain | null; level: Level | -1; simLevel: Level;
}
let districts: District[] = [];
const dName = (d: District) => (lang === 'th' ? d.th : d.en);
const maxCm = (d: District) => Math.max(0, ...d.road.map((r) => r.cm));
const elevByEn = new Map(simData.districts.map((d) => [d.en, d.elev]));

function findDistrict(lng: number, lat: number) {
  return districts.find((d) => lng >= d.bbox[0] && lng <= d.bbox[2] && lat >= d.bbox[1] && lat <= d.bbox[3] && inMultiPolygon([lng, lat], d.geom));
}

// ---------------- state ----------------
let road: Result<RoadFlood> = { items: [], snapshot: false };
let canals: Result<Canal> = { items: [], snapshot: false };
let rain: Result<Rain> = { items: [], snapshot: false };
let reports: Result<Report> = { items: [], snapshot: false };
let events: Result<FloodEvent> = { items: [], snapshot: false };
let trafficIdx: number | null = null;
let upstream: UpstreamView | null = null; // live only (dams update daily)
let historyAt: number | null = null; // null = live
const openSecs = new Set(['alerts']); // side-panel sections the viewer has open
let summaryOpen = false; // long summary expanded by the viewer
const secOpen = (id: string) => openSecs.has(id);
let loaded = false; // false until the first fetch finishes — avoids showing a fake "all clear"
let cameras: Camera[] = [];
let dwrCams: DwrCamera[] = [];
let doh: Result<DohFlood> = { items: [], snapshot: false };
// Bangkok is the focus: nationwide layers (province colours, highways, DWR cameras) show only when 🗺️ is ticked.
const BKK_TH = 'กรุงเทพมหานคร';
let nationOn = false;
try { nationOn = localStorage.getItem('nation') === '1'; } catch { /* storage blocked */ }
const dohLive = () => (historyAt == null ? doh.items : []).filter((d) => nationOn || d.province === BKK_TH);
const dwrShown = () => dwrCams.filter((c) => nationOn || c.province === BKK_TH);
// Live mode only: from the last ~26 h of history. Refetched at most every 20 min.
let trends: Awaited<ReturnType<typeof fetchTrends>> = null, trendsAt = 0;
const STUCK_ROAD_H = 6, STUCK_CANAL_H = 12;
/** Hours a live road reading has been frozen at its current value (0 = moving / unknown). */
const roadStuckH = (r: RoadFlood) => {
  const tr = historyAt == null && r.cm > 0 ? trends?.road.get(r.id) : undefined;
  return tr && tr.flatV === r.cm && tr.flatH >= STUCK_ROAD_H ? Math.floor(tr.flatH) : 0;
};
const liveRoad = () => road.items.filter((r) => !roadStuckH(r));
const canalTrend = (c: Canal): Trend | undefined => (historyAt == null ? trends?.canal.get(c.id) : undefined);
let simOn = false;
let simCm = 60;

// ---------------- map ----------------
maplibregl.setWorkerUrl(workerUrl);
// The view the page opens with; the 🏠 button and unticking 🗺️ return here.
const HOME = { center: [100.56, 13.77] as [number, number], zoom: 10.6, pitch: 45, bearing: 0 };
const map = new maplibregl.Map({
  container: 'map',
  // Detailed light basemap (roads coloured by class, POIs, transit, land use) — closest to Google Maps.
  style: 'https://tiles.openfreemap.org/styles/liberty',
  center: HOME.center,
  zoom: HOME.zoom,
  pitch: HOME.pitch,
  maxPitch: 80,
  attributionControl: { compact: true },
});
map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), 'bottom-right');

// Rotate ±45° and a continuous 360° orbit. Any user drag/scroll/touch stops the orbit.
let spinning = false;
const spinStep = () => spinning && map.easeTo({ bearing: map.getBearing() + 90, duration: 6000, easing: (x) => x });
const setSpin = (on: boolean) => {
  spinning = on;
  document.getElementById('spinBtn')?.classList.toggle('spin-on', on);
  if (on) spinStep(); else map.stop();
};
map.on('moveend', () => spinning && spinStep());
for (const ev of ['mousedown', 'touchstart', 'wheel'] as const) map.on(ev, () => spinning && setSpin(false));
map.addControl({
  onAdd() {
    const el = document.createElement('div');
    el.className = 'maplibregl-ctrl maplibregl-ctrl-group rotate-ctrl';
    const btn = (id: string, label: string, onClick: () => void) => {
      const b = document.createElement('button');
      b.type = 'button'; b.id = id; b.textContent = label; b.addEventListener('click', onClick);
      el.appendChild(b);
    };
    // 🏠 back to the opening view: live data, Bangkok, no popup. Layer and 🗺️ choices are kept.
    btn('homeBtn', '🏠', () => {
      setSpin(false);
      popup.remove();
      if (location.hash) history.replaceState(null, '', location.pathname + location.search);
      $('sidebar').classList.remove('open');
      if (historyAt != null) $('histLive').click();
      map.flyTo({ ...HOME, duration: 1200 });
    });
    btn('rotL', '⟲', () => { setSpin(false); map.easeTo({ bearing: map.getBearing() - 45, duration: 600 }); });
    btn('rotR', '⟳', () => { setSpin(false); map.easeTo({ bearing: map.getBearing() + 45, duration: 600 }); });
    btn('spinBtn', '360°', () => setSpin(!spinning));
    return el;
  },
  onRemove() {},
}, 'bottom-right');
const popup = new maplibregl.Popup({ maxWidth: '300px', focusAfterOpen: false });
// Hover summary (mouse only): no close button, never grabs focus, doesn't close on map clicks by itself.
const hover = new maplibregl.Popup({ maxWidth: '260px', closeButton: false, closeOnClick: false, focusAfterOpen: false, offset: 14, className: 'hover-pop' });

const fc = <T>(items: T[], coords: (x: T) => [number, number], props: (x: T) => Record<string, unknown>) => ({
  type: 'FeatureCollection' as const,
  features: items.map((x, i) => ({ type: 'Feature' as const, geometry: { type: 'Point' as const, coordinates: coords(x) }, properties: { i, ...props(x) } })),
});
const setData = (id: string, data: ReturnType<typeof fc>) => (map.getSource(id) as maplibregl.GeoJSONSource).setData(data);

map.on('load', async () => {
  const firstLabel = map.getStyle().layers.find((l) => l.type === 'symbol')?.id;
  // Liberty ships its own 3D buildings; drop them so ours (with the layer toggle) is the only set.
  if (map.getLayer('building-3d')) map.removeLayer('building-3d');
  // Make street names readable over 3D buildings and district colours.
  for (const id of ['highway-name-path', 'highway-name-minor', 'highway-name-major']) {
    if (!map.getLayer(id)) continue;
    map.setPaintProperty(id, 'text-color', '#1f2937');
    map.setPaintProperty(id, 'text-halo-color', '#ffffff');
    map.setPaintProperty(id, 'text-halo-width', 1.6);
    map.setLayoutProperty(id, 'text-size', ['interpolate', ['linear'], ['zoom'], 13, 12, 16, 15]);
  }

  map.addSource('satellite', {
    type: 'raster',
    tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'],
    tileSize: 256, maxzoom: 19,
    attribution: 'Powered by <a href="https://www.esri.com">Esri</a> | Imagery: Esri, Maxar, Earthstar Geographics, and the GIS User Community',
  });
  map.addLayer({ id: 'satellite', type: 'raster', source: 'satellite', layout: { visibility: 'none' } }, firstLabel);

  map.addSource('terrain', {
    type: 'raster-dem',
    tiles: ['https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png'],
    encoding: 'terrarium', tileSize: 256, maxzoom: 15,
    attribution: '<a href="https://github.com/tilezen/joerd/blob/master/docs/attribution.md">Terrain Tiles</a> (Mapzen/Tilezen, AWS Open Data; SRTM, GMTED2010, ETOPO1)',
  });

  // District polygons: fill colour comes from feature-state `level` (-1 = no data).
  const gj = await (await fetch(districtsUrl)).json();
  districts = gj.features.map((f: { properties: Record<string, string & number>; geometry: { type: string; coordinates: unknown } }) => {
    const geom = (f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates) as Ring[][];
    const pts = geom.flat(2);
    const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
    return {
      code: f.properties.amp_code, th: f.properties.amp_th, en: f.properties.amp_en,
      area: f.properties.area_sqkm, elev: elevByEn.get(f.properties.amp_en) ?? 0, geom,
      bbox: [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)],
      road: [], reports: 0, events: 0, impassable: 0, rainMax: null, level: -1, simLevel: 0,
    } as District;
  });
  map.addSource('districts', {
    type: 'geojson', data: gj, promoteId: 'amp_code',
  });
  const lvlState: maplibregl.ExpressionSpecification = ['coalesce', ['feature-state', 'level'], -1];
  map.addLayer({
    id: 'district-fill', type: 'fill', source: 'districts',
    paint: {
      'fill-color': ['match', lvlState, 0, LEVEL_COLORS[0], 1, LEVEL_COLORS[1], 2, LEVEL_COLORS[2], 3, LEVEL_COLORS[3], NO_DATA_COLOR],
      // Strong at city scale, faint at street level so the basemap detail (shops, alleys, names) shows through.
      'fill-opacity': ['interpolate', ['linear'], ['zoom'],
        11, ['case', ['<', lvlState, 0], 0.12, 0.32],
        15, ['case', ['<', lvlState, 0], 0.03, 0.1]],
    },
  }, firstLabel);
  map.addLayer({ id: 'district-lines', type: 'line', source: 'districts', paint: { 'line-color': '#1e6e8c', 'line-width': 1, 'line-opacity': 0.6 } }, firstLabel);

  // OSM building heights (OpenMapTiles render_height, metres).
  map.addLayer({
    id: 'buildings-3d', type: 'fill-extrusion', source: 'openmaptiles', 'source-layer': 'building', minzoom: 13,
    paint: {
      // Many Bangkok footprints have no height; without the coalesce the colour expression fails and renders black.
      'fill-extrusion-color': ['interpolate', ['linear'], ['coalesce', ['get', 'render_height'], 0], 0, '#ebe4dc', 60, '#dcd2c8', 200, '#c9bdb2'],
      'fill-extrusion-height': ['coalesce', ['get', 'render_height'], 3],
      'fill-extrusion-base': ['coalesce', ['get', 'render_min_height'], 0],
      'fill-extrusion-opacity': 0.8,
    },
  }, firstLabel);

  const empty = { type: 'FeatureCollection' as const, features: [] };
  map.addSource('rain', { type: 'geojson', data: empty });
  map.addSource('reports', { type: 'geojson', data: empty });
  map.addSource('canal', { type: 'geojson', data: empty });
  map.addSource('events', { type: 'geojson', data: empty });
  map.addSource('cameras', { type: 'geojson', data: empty });
  map.addSource('dwr-cams', { type: 'geojson', data: empty });
  map.addSource('doh', { type: 'geojson', data: empty });
  map.addSource('road', { type: 'geojson', data: empty });

  map.addLayer({
    id: 'rain', type: 'circle', source: 'rain', layout: { visibility: 'none' },
    paint: {
      'circle-radius': ['interpolate', ['linear'], ['get', 'mm'], 0, 3, 90, 9, 200, 14],
      // TMD 24h classes: light ≤10, moderate ≤35, heavy ≤90, very heavy >90 mm
      'circle-color': ['step', ['get', 'mm'], '#9ecae1', 10, '#4292c6', 35, '#2171b5', 90, '#7b3fb8'],
      'circle-opacity': 0.75, 'circle-stroke-width': 1, 'circle-stroke-color': '#0b1322',
    },
  });
  map.addLayer({
    id: 'reports', type: 'circle', source: 'reports',
    paint: { 'circle-radius': ['interpolate', ['linear'], ['zoom'], 10, 4, 13, 6, 16, 9], 'circle-color': '#c084fc', 'circle-opacity': 0.9, 'circle-stroke-width': 1, 'circle-stroke-color': '#fff' },
  });
  map.addLayer({
    id: 'canal', type: 'circle', source: 'canal',
    paint: {
      // ~280 BMA canal points: smaller rings than the few ThaiWater river/canal stations
      // (MapLibre only allows "zoom" at the top of an interpolate, so the case goes inside each stop)
      'circle-radius': ['interpolate', ['linear'], ['zoom'], 10, ['case', ['get', 'small'], 3.5, 8], 14, ['case', ['get', 'small'], 6, 8]],
      'circle-color': '#0b1322', 'circle-stroke-width': ['case', ['get', 'small'], 2.5, 4],
      'circle-stroke-color': ['match', ['get', 'situation'], 5, SITUATION_COLORS[5], 4, SITUATION_COLORS[4], 3, SITUATION_COLORS[3], SITUATION_COLORS[0]],
    },
  });
  map.addImage('cam-icon', cameraIcon(), { pixelRatio: 1.4 });
  map.addImage('dwr-icon', cameraIcon('#2dd4bf'), { pixelRatio: 1.4 });
  map.addImage('ev-icon', eventIcon('#f5924b'), { pixelRatio: 1.4 });
  map.addImage('ev-icon-x', eventIcon('#f2495c'), { pixelRatio: 1.4 });
  map.addLayer({
    id: 'events', type: 'symbol', source: 'events',
    layout: { 'icon-image': ['case', ['get', 'x'], 'ev-icon-x', 'ev-icon'], 'icon-allow-overlap': true, 'symbol-sort-key': ['case', ['get', 'x'], 1, 0] },
  });
  map.addLayer({
    id: 'cameras', type: 'symbol', source: 'cameras', layout: { visibility: 'none', 'icon-image': 'cam-icon', 'icon-allow-overlap': true },
  });
  map.addLayer({
    id: 'doh', type: 'circle', source: 'doh', layout: { 'circle-sort-key': ['case', ['get', 'x'], 1, 0] },
    paint: {
      'circle-radius': ['interpolate', ['linear'], ['zoom'], 5, 4, 12, 8], 'circle-color': ['case', ['get', 'x'], LEVEL_COLORS[3], LEVEL_COLORS[2]],
      'circle-stroke-width': 2, 'circle-stroke-color': '#fff',
    },
  });
  map.addLayer({
    // Hidden at country scale (126 icons would bury the province colours); they appear once you zoom into a region.
    id: 'dwr-cams', type: 'symbol', source: 'dwr-cams', minzoom: 7, layout: { 'icon-image': 'dwr-icon', 'icon-allow-overlap': true },
  });
  map.addLayer({
    id: 'road', type: 'circle', source: 'road',
    layout: { 'circle-sort-key': ['get', 'cm'] },
    paint: {
      'circle-radius': ['interpolate', ['linear'], ['get', 'cm'], 0, 3, 10, 7, 30, 11, 60, 15],
      'circle-color': ['match', ['get', 'level'], 1, LEVEL_COLORS[1], 2, LEVEL_COLORS[2], 3, LEVEL_COLORS[3], '#56627a'],
      'circle-stroke-width': ['case', ['>', ['get', 'cm'], 0], 1.5, 0.5], 'circle-stroke-color': '#fff',
    },
  });
  map.addLayer({
    id: 'road-label', type: 'symbol', source: 'road', minzoom: 11.5, filter: ['>', ['get', 'cm'], 0],
    layout: {
      'text-field': ['concat', ['to-string', ['get', 'cm']], ' cm'], 'text-font': ['Noto Sans Regular'], 'text-size': 11,
      'text-offset': [0, 1.4], 'text-anchor': 'top', 'symbol-sort-key': ['-', 0, ['get', 'cm']],
    },
    paint: { 'text-color': '#fff', 'text-halo-color': '#070b16', 'text-halo-width': 1.5 },
  });

  // Click priority: most specific layer first.
  const clickable = ['road', 'events', 'canal', 'cameras', 'dwr-cams', 'doh', 'reports', 'rain', 'district-fill', 'amp-fill', 'prov-fill'];
  // Top-most clickable feature near a point, with some slack so small markers are easy to hit
  // (a fingertip needs more than a mouse pointer).
  const pick = (pt: maplibregl.Point) => {
    const k = matchMedia('(pointer: coarse)').matches ? 14 : 6;
    const box: [maplibregl.PointLike, maplibregl.PointLike] = [[pt.x - k, pt.y - k], [pt.x + k, pt.y + k]];
    // Province/amphoe layers only exist after 🗺️ is first ticked; querying a missing layer throws, which
    // silently broke every tap for anyone who never ticked it. Only ask for layers that exist and are shown.
    const layers = clickable.filter((l) => map.getLayer(l) && map.getLayoutProperty(l, 'visibility') !== 'none');
    return map.queryRenderedFeatures(box, { layers })[0];
  };
  map.on('click', (e) => {
    hover.remove();
    const f = pick(e.point);
    if (!f) return;
    const i = f.properties.i as number;
    if (f.layer.id === 'road') showRoad(road.items[i]);
    else if (f.layer.id === 'canal') showCanal(canals.items[i]);
    else if (f.layer.id === 'reports') showReport(reports.items[i]);
    else if (f.layer.id === 'rain') showRain(rain.items[i]);
    else if (f.layer.id === 'cameras') showCamera(cameras[i]);
    else if (f.layer.id === 'dwr-cams') showDwrCamera(dwrShown()[i]);
    else if (f.layer.id === 'amp-fill') showAmphoe(Number(f.id), e.lngLat);
    else if (f.layer.id === 'prov-fill') showProvinceByCode(String(f.id), e.lngLat);
    else if (f.layer.id === 'doh') showDoh(dohLive()[i]);
    else if (f.layer.id === 'events') showEvent(events.items[i]);
    else showDistrict(districts.find((d) => d.code === f.id)!, e.lngLat);
  });

  // Mouse users: a short summary follows the pointer over districts and markers; click still opens the full popup.
  // Touch screens have no hover, so they keep tap-only.
  if (matchMedia('(hover: hover)').matches) {
    let last = '', frame = 0;
    map.on('mousemove', (e) => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        const f = pick(e.point);
        const html = f && hoverHtml(f.layer.id, f.properties.i as number, f.id);
        map.getCanvas().style.cursor = f ? 'pointer' : '';
        if (!html) { hover.remove(); last = ''; return; }
        const key = `${f!.layer.id}:${f!.id ?? f!.properties.i}`;
        if (key !== last) { hover.setHTML(`<div class="pop">${html}</div>`); last = key; }
        hover.setLngLat(e.lngLat).addTo(map);
      });
    });
    map.getCanvas().addEventListener('mouseleave', () => { hover.remove(); last = ''; });
  }
  for (const l of clickable) {
    map.on('mouseenter', l, () => (map.getCanvas().style.cursor = 'pointer'));
    map.on('mouseleave', l, () => (map.getCanvas().style.cursor = ''));
  }

  // On phones start the credit line folded behind the ⓘ button (still one tap away).
  if (matchMedia('(max-width: 820px)').matches) document.querySelector('.maplibregl-ctrl-attrib')?.classList.remove('maplibregl-compact-show');
  // Keep the layer picker open on roomy screens; small screens start folded (the button stays visible).
  if (innerWidth >= 1200 && innerHeight >= 800) (document.querySelector('details.layers') as HTMLDetailsElement).open = true;
  wireControls();
  applyLang();
  setNation(nationOn, false); // restore the viewer's last choice without moving the map
  // Camera list is static-ish and optional: load once, never block the page on it.
  fetchCameras().then((c) => {
    cameras = c;
    setData('cameras', fc(cameras, (x) => [x.lng, x.lat], () => ({})));
  }).catch((e) => console.warn('camera list unavailable', e));
  fetch(dwrCamsUrl).then((r) => r.json()).then((d: { cameras: DwrCamera[] }) => {
    dwrCams = d.cameras;
    setData('dwr-cams', fc(dwrShown(), (x) => [x.lng, x.lat], () => ({})));
  }).catch((e) => console.warn('DWR camera list unavailable', e));
  await refresh(firstFetch);
  setInterval(() => historyAt == null && refresh(), 5 * 60 * 1000);
});

// ---------------- data refresh ----------------
const fetchAll = () => [fetchRoadFlood(), fetchCanals(), fetchRain(), fetchReports(), fetchEvents(), fetchTrafficIndex()] as const;
// Start downloading data immediately — no need to wait for map tiles.
const firstFetch = fetchAll();

async function refresh(pending = fetchAll()) {
  if (historyAt != null) return showHistory(historyAt);
  $('refresh').setAttribute('disabled', '');
  fetchUpstream().then((v) => { upstream = v; render(); colourProvinces(); });
  fetchDoh().then((v) => { doh = v; apply(); });
  if (Date.now() - trendsAt > 20 * 60_000) {
    trendsAt = Date.now();
    fetchTrends().then((tr) => { trends = tr; if (historyAt == null) apply(); });
  }
  // Show each source as soon as it arrives instead of waiting for the slowest one.
  // Road decides the "all clear" wording, so the page stays in its loading state until road is in.
  const [pRoad, pCanal, pRain, pReports, pEvents, pTraffic] = pending;
  const use = <T>(p: Promise<T>, set: (v: T) => void) => p.then((v) => {
    if (historyAt != null) return; // user switched to history while this was loading
    set(v);
    apply();
  });
  await Promise.all([
    use(pRoad, (v) => { road = v; loaded = true; }),
    use(pCanal, (v) => (canals = v)),
    use(pRain, (v) => (rain = v)),
    use(pReports, (v) => (reports = v)),
    use(pEvents, (v) => (events = v)),
    use(pTraffic, (v) => (trafficIdx = v)),
  ]);
  $('refresh').removeAttribute('disabled');
}

async function showHistory(at: number) {
  historyAt = at;
  $('refresh').setAttribute('disabled', '');
  try {
    ({ road, canals, rain, reports, events, traffic: trafficIdx } = await loadHistory(at));
    loaded = true;
    $('histError').hidden = true;
  } catch (e) {
    console.warn(e);
    $('histError').hidden = false;
  }
  $('refresh').removeAttribute('disabled');
  apply();
}

function apply() {
  for (const d of districts) Object.assign(d, { road: [], reports: 0, events: 0, impassable: 0, rainMax: null });
  for (const r of liveRoad()) findDistrict(r.lng, r.lat)?.road.push(r);
  for (const r of reports.items) { const d = findDistrict(r.lng, r.lat); if (d) d.reports++; }
  for (const e of events.items) { const d = findDistrict(e.lng, e.lat); if (d) { d.events++; if (e.impassable) d.impassable++; } }
  for (const r of rain.items) { const d = findDistrict(r.lng, r.lat); if (d && (!d.rainMax || r.mm > d.rainMax.mm)) d.rainMax = r; }
  for (const d of districts) {
    const lvl = Math.max(0, ...d.road.map((r) => r.level)) as Level;
    // ponytail: citizen reports can only raise a quiet district to "watch"; sensors decide anything higher.
    // Staff-verified "impassable for small cars" counts as high risk; any other incident or 3+ citizen reports as watch.
    const other: Level = d.impassable ? 2 : d.events || d.reports >= 3 ? 1 : 0;
    d.level = d.road.length === 0 && other === 0 ? -1 : (Math.max(lvl, other) as Level);
  }
  if (pendingDistrict && districts.length && (road.items.length || road.stale || road.error)) {
    const d = districts.find((x) => slug(x) === pendingDistrict || x.th === pendingDistrict);
    pendingDistrict = '';
    if (d) showDistrict(d);
  }

  setData('road', fc(road.items, (r) => [r.lng, r.lat], (r) => ({ cm: r.cm, level: roadStuckH(r) ? 0 : r.level })));
  setData('canal', fc(canals.items, (c) => [c.lng, c.lat], (c) => ({ situation: c.situation, small: c.agency === 'สนน.' })));
  setData('rain', fc(rain.items, (r) => [r.lng, r.lat], (r) => ({ mm: r.mm })));
  setData('reports', fc(reports.items, (r) => [r.lng, r.lat], () => ({})));
  setData('events', fc(events.items, (e) => [e.lng, e.lat], (e) => ({ x: e.impassable })));
  setData('doh', fc(dohLive(), (d) => [d.lng, d.lat], (d) => ({ x: d.impassable })));
  colourProvinces();
  render();
}

// ---------------- simulation (prototype logic) ----------------
const simLevel = (margin: number): Level => (margin > 40 ? 0 : margin > 15 ? 1 : margin > 0 ? 2 : 3);
let timer: number | undefined;
function stopSim() {
  clearInterval(timer);
  timer = undefined;
  $('playBtn').textContent = t().play;
}

// ---------------- render ----------------
const bkkLabel = (ms: number) => new Date(ms).toLocaleString(lang === 'th' ? 'th-TH' : 'en-GB', { timeZone: 'Asia/Bangkok', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

function render() {
  const L = t();
  $('simBanner').hidden = !simOn;
  $('sideTitle').textContent = historyAt == null ? L.sideTitle : L.sideTitleAt(bkkLabel(historyAt));
  $('histLive').classList.toggle('live-on', historyAt == null);
  if (!loaded) {
    for (const id of ['riskValue', 'waterValue', 'floodCount', 'rainValue']) $(id).textContent = '--';
    $('summary').textContent = L.loading;
    return;
  }
  for (const d of districts) {
    d.simLevel = simLevel(d.elev - simCm);
    map.setFeatureState({ source: 'districts', id: d.code }, { level: simOn ? d.simLevel : d.level });
  }

  // Risk index (prototype weighting): severe 1, high .6, watch .3
  const lv = districts.map((d) => (simOn ? d.simLevel : d.level));
  const score = districts.length ? Math.round((100 * lv.reduce<number>((a, l) => a + [0, 0.3, 0.6, 1][Math.max(l, 0)], 0)) / districts.length) : 0;
  const overall = score >= 60 ? 3 : score >= 35 ? 2 : score >= 15 ? 1 : 0;
  // Without sensors the index would read "normal" during a flood, so show nothing rather than a false all-clear.
  const noRoad = !!road.stale && !simOn;
  $('riskValue').textContent = noRoad ? '--' : String(score);
  $('riskValue').style.color = noRoad ? '' : LEVEL_COLORS[overall];
  $('riskLabel').textContent = noRoad ? L.needSensor : lvlName(overall);

  const flooded = liveRoad().filter((r) => r.cm > 0).sort((a, b) => b.cm - a.cm);
  const stuckN = road.items.filter((r) => roadStuckH(r)).length;
  const worst = flooded[0];
  const worstD = worst && findDistrict(worst.lng, worst.lat);
  const topRain = [...rain.items].sort((a, b) => b.mm - a.mm)[0];
  if (simOn) {
    $('waterTitle').textContent = L.waterSim;
    $('waterValue').textContent = `${Math.round(simCm)} cm`;
    $('waterSub').textContent = L.srcSim;
    $('floodCount').textContent = `${lv.filter((l) => l === 3).length}/50`;
    $('floodedSub').textContent = L.floodedSim;
  } else if (noRoad) {
    $('waterTitle').textContent = L.waterReal;
    for (const id of ['waterValue', 'floodCount']) $(id).textContent = '--';
    for (const id of ['waterSub', 'floodedSub']) $(id).textContent = L.unavailable;
  } else {
    $('waterTitle').textContent = L.waterReal;
    $('waterValue').textContent = worst ? `${worst.cm} cm` : '0 cm';
    $('waterSub').textContent = worst ? `${name(worst)}${worstD ? ` (${dName(worstD)})` : ''}` : '';
    $('floodCount').textContent = `${districts.filter((d) => maxCm(d) > 0).length}/50`;
    $('floodedSub').textContent = L.floodedSub;
  }
  $('rainValue').textContent = topRain ? `${topRain.mm} mm` : '--';
  $('rainSub').textContent = topRain ? `${name(topRain)} · ${L.rainCls(topRain.mm)}` : '';

  // Summary + sidebar
  const heavy = flooded.filter((r) => r.level === 3);
  const affected = districts.filter((d) => maxCm(d) > 0 || d.reports >= 3 || d.events > 0)
    .sort((a, b) => maxCm(b) - maxCm(a) || b.impassable - a.impassable || b.events - a.events || b.reports - a.reports);
  const rainTxt = topRain ? `<b>${topRain.mm} mm</b> (${esc(name(topRain))})` : '';
  const bmaCanals = canals.items.filter((c) => c.agency === 'สนน.');
  const canalTxt = bmaCanals.length ? L.canalSum(bmaCanals.filter((c) => c.situation === 5).length, bmaCanals.filter((c) => c.situation === 4).length,
    bmaCanals.filter((c) => c.note !== 'stale').length, bmaCanals.length) : '';
  const rain1h = rain.items.filter((r) => r.mm1h != null);
  const rainNow = historyAt == null && rain1h.length ? L.rain1h(rain1h.filter((r) => r.mm1h! > 0).length, rain1h.length, Math.max(0, ...rain1h.map((r) => r.mm1h!))) : '';
  $('summary').innerHTML = (noRoad ? L.summaryNoRoad(rainTxt, reports.items.length) : L.summary({
    pts: flooded.length,
    districts: new Set(flooded.map((r) => findDistrict(r.lng, r.lat)?.code)).size,
    heavy: heavy.length,
    worst: worst ? `<b>${esc(name(worst))}</b>${worstD ? ` (${esc(dName(worstD))})` : ''} <b>${worst.cm} cm</b>` : '',
    rain: rainTxt,
    reports: reports.items.length,
    events: events.items.length,
    impassable: events.items.filter((e) => e.impassable).length,
  })) + (stuckN && !noRoad ? L.stuckSum(stuckN) : '') + canalTxt + rainNow;
  // Show 'read more' only when the 4-line clamp actually hides something.
  const sum = $('summary'), more = $('summaryMore');
  sum.classList.toggle('clamp', !summaryOpen);
  more.hidden = !summaryOpen && sum.scrollHeight <= sum.clientHeight + 2;
  more.textContent = summaryOpen ? L.readLess : L.readMore;
  const tIdx = $('trafficIdx');
  tIdx.hidden = trafficIdx == null;
  if (trafficIdx != null) {
    tIdx.textContent = `${L.trafficIdx} ${trafficIdx.toFixed(1)}/10`;
    tIdx.style.color = trafficIdx >= 7 ? LEVEL_COLORS[3] : trafficIdx >= 4 ? LEVEL_COLORS[2] : LEVEL_COLORS[0];
  }

  const overBank = canals.items.filter((c) => c.bank != null && c.wl >= c.bank && c.note !== 'stale');
  const evName = (e: FloodEvent) => (lang === 'th' ? e.title : e.titleEn || e.title);
  const eventItem = (e: FloodEvent, cls = '') => {
    const d = findDistrict(e.lng, e.lat);
    return `<button class="item ${cls}" style="--c:${e.impassable ? LEVEL_COLORS[3] : LEVEL_COLORS[2]}" data-event="${events.items.indexOf(e)}">
      <div class="t"><span>${esc(evName(e))}</span>${e.impassable ? `<span>🚫</span>` : ''}</div>
      <div class="s">${[bkkTime(e.start), d && esc(dName(d)), L.byLabel[e.by]].filter(Boolean).join(' · ')}</div></button>`;
  };
  const impassable = events.items.filter((e) => e.impassable).sort((a, b) => Date.parse(b.start) - Date.parse(a.start));
  // Collapsible sections so the panel fits the screen; only the flood alerts start open (top 3).
  // Open/closed state survives re-renders (data refreshes every 5 min).
  const section = (id: string, title: string, body: string) =>
    `<details class="sec" data-sec="${id}"${secOpen(id) ? ' open' : ''}><summary><h4>${title}</h4></summary>${body}</details>`;
  const list = (items: string[], first: number, more: (n: number) => string) =>
    items.slice(0, first).join('') + (items.length > first ? `<details><summary class="empty">${more(items.length - first)}</summary>${items.slice(first).join('')}</details>` : '');

  const alertItems = [...overBank.map((c) => `<button class="item alert" data-canal="${canals.items.indexOf(c)}">
      <div class="t"><span>${esc(name(c))}</span><span>+${(c.wl - c.bank!).toFixed(2)} m</span></div>
      <div class="s">${L.overBank} · ${L.waterNow} ${c.wl.toFixed(2)} ${L.msl} · ${esc(c.agency)} ${hhmm(c.updated)}</div></button>`), ...heavy.map((r) => {
    const d = findDistrict(r.lng, r.lat);
    return `<button class="item alert" data-road="${road.items.indexOf(r)}">
      <div class="t"><span>${esc(name(r))}</span><span>${r.cm} cm</span></div>
      <div class="s">${[d && esc(dName(d)), r.start && `${L.since} ${hhmm(r.start)}`, r.maxCm != null && `${L.max} ${r.maxCm} cm`].filter(Boolean).join(' · ')}</div></button>`;
  })];
  let html = section('alerts', `${L.alerts} (${alertItems.length})`,
    alertItems.length ? list(alertItems, 3, L.more) : `<div class="empty">${L.noAlerts}</div>`);

  // Latest Thai Meteorological Department warnings (Thai only; TMD publishes no English version here).
  if (historyAt == null && upstream?.tmd.length) {
    html += section('tmd', `${L.tmdTitle} (${upstream.tmd.length})`, upstream.tmd.map((w, i) => `<a class="item${i ? '' : ' alert'}"${i ? ' style="--c:var(--accent)"' : ''} href="${esc(w.url)}" target="_blank" rel="noopener">
      <div class="t"><span>${esc(w.title)}</span></div><div class="s${i ? '' : ' clamp'}">${esc(w.date)}${i ? '' : ` · ${esc(w.text)}`}</div>
      ${i ? '' : `<div class="s" style="color:var(--accent)">${L.tmdRead}</div>`}</a>`).join(''));
  }

  const districtItems = affected.map((d) => {
    const max = maxCm(d);
    const lvl = simOn ? d.simLevel : Math.max(d.level, 0);
    return `<button class="item" style="--c:${LEVEL_COLORS[lvl]}" data-district="${d.code}">
      <div class="t"><span>${esc(dName(d))}</span><span>${max ? `${max} cm` : lvlName(lvl)}</span></div>
      <div class="s">${d.road.filter((r) => r.cm > 0).length} ${L.pts} · ${d.events} ${L.events}${d.impassable ? ' 🚫' : ''} · ${d.reports} ${L.reports}${d.rainMax ? ` · ☔ ${d.rainMax.mm} mm` : ''}</div></button>`;
  });
  html += section('districts', `${L.districts} (${affected.length})`,
    districtItems.length ? districtItems.join('') : `<div class="empty">${noRoad ? L.summaryNoRoad('', reports.items.length) : L.noDistricts}</div>`);

  const latestEvents = [...events.items].sort((a, b) => Date.parse(b.start) - Date.parse(a.start));
  html += section('events', `📍 ${L.eventsList} (${latestEvents.length})`,
    latestEvents.length ? list(latestEvents.map((e) => eventItem(e)), 10, L.traffyMore) : `<div class="empty">${events.stale ? L.unavailable : L.eventsEmpty}</div>`);
  const dohItems = [...dohLive()].sort((a, b) => +b.impassable - +a.impassable || (b.cm ?? 0) - (a.cm ?? 0));
  if (dohItems.length) html += section('doh', L.dohTitle(dohItems.length, dohItems.filter((d) => d.impassable).length),
    `<div class="empty" style="margin:0 0 6px">${L.dohNote}</div>` + list(dohItems.map((d) => `<button class="item${d.impassable ? ' alert' : ''}" style="--c:${d.impassable ? LEVEL_COLORS[3] : LEVEL_COLORS[2]}" data-doh="${dohLive().indexOf(d)}">
      <div class="t"><span>${L.dohRoad} ${esc(Number(d.road) || d.road)} ${esc(d.section)}</span><span>${d.cm != null ? `${d.cm} cm` : ''}</span></div>
      <div class="s">${[esc(d.province), esc(d.amphoe), d.impassable ? `🚫 ${L.dohNo}` : L.dohYes, d.start && bkkTime(d.start)].filter(Boolean).join(' · ')}</div></button>`), 5, L.more));

  // Latest citizen reports — clickable so the purple dots can be found from the list too.
  const latestReports = [...reports.items].sort((a, b) => Date.parse(b.time) - Date.parse(a.time)).slice(0, 60);
  const reportItem = (r: Report) => {
    const d = findDistrict(r.lng, r.lat);
    return `<button class="item" style="--c:#c084fc" data-report="${reports.items.indexOf(r)}">
      <div class="t"><span>${esc(r.text ? r.text.slice(0, 60) : L.histReport)}</span></div>
      <div class="s">${[bkkTime(r.time), d && esc(dName(d)), esc(r.state)].filter(Boolean).join(' · ')}</div></button>`;
  };
  html += section('traffy', `🟣 ${L.traffyList} (${reports.items.length})`,
    latestReports.length ? list(latestReports.map(reportItem), 10, L.traffyMore) : `<div class="empty">${L.traffyEmpty}</div>`);

  const canalItems = [...canals.items].sort((a, b) => b.situation - a.situation || (a.bank ?? 99) - a.wl - ((b.bank ?? 99) - b.wl))
    .map((c) => `<button class="item" style="--c:${SITUATION_COLORS[c.situation]}" data-canal="${canals.items.indexOf(c)}">
      <div class="t"><span>${esc(name(c))}</span><span>${c.wl.toFixed(2)} m</span></div>
      <div class="s">${canalStatus(c)}${c.bank != null ? ` · ${L.toBank} ${(c.bank - c.wl).toFixed(2)} m` : ''} · ${hhmm(c.updated)}${canalTrend(c)?.d1h != null ? ` · ${trendTxt(c).split(' · ')[0]}` : ''}${canalStuckH(c) ? ' · ⚠️' : ''}</div></button>`);
  const canalFresh = canals.items.filter((c) => c.note !== 'stale').length;
  html += section('canals', `${L.canals} (${canals.items.length}) · ${L.canalFresh(canalFresh, canals.items.length)}`, `<div class="empty" style="margin:0 0 6px">${L.greenNote}</div>` + list(canalItems, 10, L.traffyMore));

  // Chao Phraya main stem, upstream → Bangkok: the river that decides riverside flooding in Bangkok.
  if (historyAt == null && upstream?.river.length) {
    const rowHtml = (r: RiverRow) => {
      const gap = r.wl != null && r.bank != null ? r.bank - r.wl : null;
      const c = gap == null ? 'var(--accent)' : gap <= 0 ? LEVEL_COLORS[3] : gap < 0.3 ? LEVEL_COLORS[2] : gap < 0.5 ? LEVEL_COLORS[1] : LEVEL_COLORS[0];
      const canal = canals.items.find((x) => x.nameTh === r.th); // Bangkok gauges also have trends from our history
      const trend = canal ? trendTxt(canal) : '';
      return `<button class="item" style="--c:${c}" data-top="${r.lng},${r.lat}">
        <div class="t"><span>${esc(r.th)} (${esc(r.code)})</span><span>${r.wl != null ? `${r.wl.toFixed(2)} m` : ''}</span></div>
        <div class="s">${[gap != null ? (gap <= 0 ? L.riverOver((-gap).toFixed(2)) : L.riverBelow(gap.toFixed(2))) : '', r.discharge != null ? `${L.riverFlow} ${r.discharge.toLocaleString()} ${L.upUnit}` : '', trend, esc(r.time.slice(11, 16))].filter(Boolean).join(' · ')}</div></button>`;
    };
    // Headline = Samsen (C.12), Bangkok's reference gauge; upstream stations can be over bank without Bangkok being so.
    const ss = upstream.river.find((r) => r.code === 'C.12' && r.wl != null && r.bank != null), gap = ss ? ss.bank! - ss.wl! : null;
    html += section('river', `${L.riverTitle}${gap != null ? ` · ${L.riverSamsen} ${gap <= 0 ? L.riverOver((-gap).toFixed(2)) : L.riverBelow(gap.toFixed(2))}` : ''}`,
      upstream.river.map(rowHtml).join('') + `<div class="empty" style="margin:4px 0 8px">${L.riverNote}</div>`);
  }

  if (historyAt == null && upstream && (upstream.dams.length || upstream.c13)) {
    const damColor = (p: number) => (p >= 100 ? LEVEL_COLORS[3] : p >= 80 ? LEVEL_COLORS[2] : LEVEL_COLORS[0]);
    const c13 = upstream.c13 ? `<div class="item" style="--c:var(--accent)"><div class="t"><span>${L.upC13}</span><span>${upstream.c13.discharge.toLocaleString()} ${L.upUnit}</span></div>
      <div class="s">${esc(upstream.c13.time)}</div></div>` : '';
    const damItem = (d: Dam, withBasin: boolean) => `<div class="item" style="--c:${damColor(d.pct)}"><div class="t"><span>${esc(lang === 'th' ? d.th : d.en || d.th)}</span><span>${d.pct.toFixed(0)}%</span></div>
      <div class="s">${withBasin && (d.basin || d.basinEn) ? `${esc(lang === 'th' ? d.basin : d.basinEn || d.basin)} · ` : ''}${L.upDam(d.pct, d.inflow, d.release)} · ${esc(d.date)}</div></div>`;
    // cp flag missing = blob saved before all dams were kept -> treat as the Chao Phraya four.
    const others = upstream.dams.filter((d) => d.cp === false);
    const dams = upstream.dams.filter((d) => d.cp !== false).map((d) => damItem(d, false)).join('')
      + (others.length ? `<details><summary class="empty">${L.upOthers(others.length)}</summary>${others.map((d) => damItem(d, true)).join('')}</details>` : '');
    html += section('upstream', upstream.c13 ? `${L.upTitle} · ${upstream.c13.discharge.toLocaleString()} ${L.upUnit}` : L.upTitle,
      c13 + (dams || `<div class="empty">${L.upNone}</div>`) + `<div class="empty" style="margin:4px 0 8px">${L.upNote}</div>`);
  }

  const prov = historyAt == null && nationOn ? upstream?.provinces?.rows : null;
  if (prov?.length) {
    const hit = prov.filter((p) => p.over || p.near);
    const items = hit.map((p) => `<button class="item" style="--c:${p.over ? LEVEL_COLORS[3] : LEVEL_COLORS[2]}" data-prov="${prov.indexOf(p)}">
      <div class="t"><span>${esc(lang === 'th' ? p.th : p.en)}</span><span>${p.over}/${p.n}</span></div><div class="s">${L.provRow(p.over, p.near, p.n)}</div></button>`);
    const sum = (k: 'over' | 'n') => prov.reduce((a, p) => a + p[k], 0);
    html += section('provinces', L.provTitle(sum('over'), sum('n'), prov.filter((p) => p.over).length),
      `<div class="empty" style="margin:0 0 6px">${L.provLegend}</div><div class="empty" style="margin:0 0 6px">${L.ampLegend}</div>` + (items.length ? list(items, 5, L.more) : `<div class="empty">${L.provNone}</div>`) + `<div class="empty" style="margin:4px 0 8px">${L.provNote}</div>`);
  }

  // ThaiWater-style top-10 lists (🗺️ mode only, like everything nationwide).
  const top = historyAt == null && nationOn ? upstream?.nation?.top : null;
  if (top) {
    const note = `<div class="empty" style="margin:4px 0 8px">${L.topNote(bkkTime(upstream!.nation!.fetchedAt))}</div>`;
    const row2 = (r: TopRow, i: number, val: string, c: string) => `<button class="item" style="--c:${c}" data-top="${r.lng},${r.lat}">
      <div class="t"><span>${i + 1}. ${esc(r.prov)}</span><span>${val}</span></div><div class="s">${esc(r.station)} · ${esc(r.time.slice(11, 16))}</div></button>`;
    html += section('toprain', L.topRain, (top.rain == null ? `<div class="empty">${L.topRainNA}</div>` : top.rain.length
      ? top.rain.map((r, i) => row2(r, i, `${r.value} mm`, r.value > 90 ? LEVEL_COLORS[3] : r.value > 35 ? LEVEL_COLORS[2] : LEVEL_COLORS[1])).join('')
      : `<div class="empty">${L.topRainNone}</div>`) + note);
    html += section('topwater', L.topWater, (top.water.length ? top.water.map((r, i) => row2(r, i, `+${r.value.toFixed(2)} m`, LEVEL_COLORS[3])).join('') : `<div class="empty">${L.topNone}</div>`) + note);
  }

  // Last, as asked: roads staff reported as impassable for small cars.
  if (impassable.length) html += section('impassable', `${L.impassable} (${impassable.length})`, impassable.map((e) => eventItem(e, 'alert')).join(''));
  $('sideBody').innerHTML = html;

  // Source status (live vs snapshot) — snapshot data must always be labelled.
  const srcs: [string, Result<unknown>][] = [[L.srcRoad, road], [L.srcCanal, canals], [L.srcRain, rain], [L.srcTraffy, reports], [L.srcEvents, events], ...(historyAt == null ? [[L.srcDoh, doh] as [string, Result<unknown>]] : [])];
  const srcUrl = new Map<string, string>([
    [L.srcRoad, 'https://weather.bangkok.go.th/flood/'], [L.srcCanal, 'https://www.thaiwater.net'], [L.srcRain, 'https://www.thaiwater.net'],
    [L.srcTraffy, 'https://share.traffy.in.th/teamchadchart'], [L.srcEvents, 'https://live.iticfoundation.org/'], [L.srcDoh, 'https://hdms.doh.go.th/dashboard'],
  ]);
  const link = (n: string) => `<a href="${srcUrl.get(n)}" target="_blank" rel="noopener">${esc(n)}</a>`;
  const asOf = (r: Result<unknown>) => {
    if (!r.asOf) return L.snapshot;
    const mins = Math.max(0, Math.round((Date.now() - Date.parse(r.asOf)) / 60_000));
    return L.asOf(bkkTime(r.asOf), L.agoFmt(Math.floor(mins / 60), mins % 60));
  };
  const status = (r: Result<unknown>) => r.stale ? L.unavailable : historyAt != null ? L.histSrc : r.snapshot ? asOf(r) : r === road && roadVia ? `${L.live} (${L.via})` : r === reports && reportsVia ? `${L.live} (${L.viaCollector})` : L.live;
  // Data-layer credits live here (with links) rather than in the map's credit line, which stays basemap-only and short.
  $('sources').innerHTML = `<b>${L.srcTitle}</b>` + srcs.map(([n, r]) => `<div>${link(n)} — <span class="${r.snapshot || r.stale ? 'snap' : 'live'}">● ${status(r)}</span></div>`).join('')
    + `<div>${L.srcCams}</div><div>${L.srcDistricts}</div><div>${esc(L.srcSim)}</div>`;
  const names = (f: (r: Result<unknown>) => boolean) => srcs.filter(([, r]) => f(r)).map(([n]) => n).join(', ');
  const stale = names((r) => !!r.stale);
  const snaps = srcs.filter(([, r]) => r.snapshot && !r.stale).map(([n, r]) => `${n} — ${asOf(r)}`).join(', ');
  $('histBanner').hidden = historyAt == null;
  if (historyAt != null) $('histBanner').textContent = L.histBanner(bkkLabel(historyAt)) + (road.stale ? ` · ${L.histNoRoad}` : '');
  $('mockBanner').hidden = historyAt != null || (!stale && !snaps);
  $('mockBanner').textContent = [stale && `${L.staleBanner} ${stale}`, snaps && `${L.mockBanner} ${snaps}`].filter(Boolean).join(' · ');
}

// ---------------- cameras ----------------
/** 28×28 (@2x) camera glyph drawn on a canvas — MapLibre's glyph fonts have no emoji. */
function cameraIcon(lens = '#38bdf8') {
  const c = document.createElement('canvas');
  c.width = c.height = 28;
  const g = c.getContext('2d')!;
  g.fillStyle = '#0b1322'; g.strokeStyle = '#e8ecf4'; g.lineWidth = 2;
  g.beginPath(); g.roundRect(2, 7, 20, 15, 3); g.fill(); g.stroke();
  g.beginPath(); g.moveTo(22, 12); g.lineTo(27, 9); g.lineTo(27, 20); g.lineTo(22, 17); g.closePath(); g.fillStyle = '#e8ecf4'; g.fill();
  g.beginPath(); g.arc(12, 14.5, 4, 0, Math.PI * 2); g.fillStyle = lens; g.fill();
  return g.getImageData(0, 0, 28, 28);
}
/** Metres between two points (equirectangular — plenty accurate within a city). */
const metres = (a: { lng: number; lat: number }, b: { lng: number; lat: number }) => {
  const k = Math.PI / 180, x = (b.lng - a.lng) * k * Math.cos(((a.lat + b.lat) / 2) * k), y = (b.lat - a.lat) * k;
  return Math.round(Math.hypot(x, y) * 6_371_000);
};
function nearCameraRow(p: { lng: number; lat: number }) {
  let best: Camera | undefined, bestM = 1001;
  for (const c of cameras) { const m = metres(p, c); if (m < bestM) { best = c; bestM = m; } }
  return best ? `<div class="r"><a href="${esc(longdoCameraUrl(best.id))}" target="_blank" rel="noopener">${esc(t().camNear(best.title, bestM))} ↗</a></div>` : '';
}
/** Warning-diamond marker for Longdo/iTIC incidents (orange; red = impassable for small cars). */
function eventIcon(color: string) {
  const c = document.createElement('canvas');
  c.width = c.height = 28;
  const g = c.getContext('2d')!;
  g.beginPath(); g.moveTo(14, 1); g.lineTo(27, 14); g.lineTo(14, 27); g.lineTo(1, 14); g.closePath();
  g.fillStyle = color; g.fill(); g.lineWidth = 2; g.strokeStyle = '#fff'; g.stroke();
  g.fillStyle = '#fff'; g.font = 'bold 16px system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('!', 14, 15);
  return g.getImageData(0, 0, 28, 28);
}
function showEvent(e: FloodEvent, fly = false) {
  const L = t(), d = findDistrict(e.lng, e.lat);
  open([e.lng, e.lat], `<b>${esc(lang === 'th' ? e.title : e.titleEn || e.title)}</b>` +
    (e.impassable ? `<span class="tag" style="color:${LEVEL_COLORS[3]}">🚫 ${L.impassableTag}</span>` : '') +
    (e.text ? `<div style="margin-top:4px">${esc(e.text)}</div>` : '') +
    (d ? row(L.districtLbl, esc(dName(d))) : '') +
    row(L.evWhen, `${bkkTime(e.start)} – ${bkkTime(e.stop)}`) + row(L.evBy, L.byLabel[e.by]) +
    (e.image ? `<img src="${esc(e.image)}" alt="" loading="lazy">` : '') +
    `<div class="r"><a href="https://live.iticfoundation.org/" target="_blank" rel="noopener">${L.evOpen} ↗</a></div>` + nearCameraRow(e), fly);
}
let dwrObjectUrl = '';
// ---------- 🗺️ nationwide mode ----------
let provGeo: { features: { properties: { code: string } }[] } | null = null;
let provLoading = false;
async function ensureProvinceLayer() {
  if (provGeo || provLoading) return; // ticking twice quickly must not add the source twice
  provLoading = true;
  try { provGeo = await (await fetch(provincesGeoUrl)).json(); } finally { provLoading = false; }
  map.addSource('provinces', { type: 'geojson', data: provGeo as never, promoteId: 'code', attribution: 'Province boundaries: geoBoundaries / © OpenStreetMap contributors (ODbL)' });
  const lvl: maplibregl.ExpressionSpecification = ['coalesce', ['feature-state', 'level'], -1];
  map.addLayer({ id: 'prov-fill', type: 'fill', source: 'provinces', maxzoom: AMP_ZOOM, layout: { visibility: nationOn ? 'visible' : 'none' }, paint: {
    'fill-color': ['match', lvl, 0, LEVEL_COLORS[0], 1, LEVEL_COLORS[1], 2, LEVEL_COLORS[2], 3, LEVEL_COLORS[3], NO_DATA_COLOR],
    'fill-opacity': ['interpolate', ['linear'], ['zoom'], 6, ['case', ['<', lvl, 0], 0.15, 0.4], 10, ['case', ['<', lvl, 0], 0.05, 0.15]],
  } }, 'district-fill');
  map.addLayer({ id: 'prov-line', type: 'line', source: 'provinces', maxzoom: AMP_ZOOM, layout: { visibility: nationOn ? 'visible' : 'none' },
    paint: { 'line-color': '#56627a', 'line-width': 0.8, 'line-opacity': 0.7 } }, 'district-fill');
  colourProvinces();
}
// Amphoe (district) view: loaded the first time someone zooms in with 🗺️ on; replaces province colours from AMP_ZOOM.
const AMP_ZOOM = 7.5;
type AmpFeature = { properties: { id: number; en: string; th: string; prov: string; code: string }; geometry: { coordinates: PolyRing[][] } };
let ampGeo: { features: AmpFeature[] } | null = null, ampLoading = false;
const ampBox = new Map<number, [number, number, number, number]>();
const ampStats = new Map<number, { over: number; near: number; stations: number; rainMax: number | null; hwImpassable: number; hw: number }>();
async function ensureAmphoeLayer() {
  if (ampGeo || ampLoading || !nationOn || map.getZoom() < AMP_ZOOM - 0.5) return;
  ampLoading = true;
  try { ampGeo = await (await fetch(amphoeGeoUrl)).json(); } finally { ampLoading = false; } // a failed load retries on the next zoom
  for (const f of ampGeo!.features) ampBox.set(f.properties.id, bboxOf(f.geometry.coordinates));
  map.addSource('amphoe', { type: 'geojson', data: ampGeo as never, promoteId: 'id', attribution: 'District boundaries: geoBoundaries / Royal Thai Survey Dept., OCHA ROAP (CC BY 3.0 IGO)' });
  const lvl: maplibregl.ExpressionSpecification = ['coalesce', ['feature-state', 'level'], -1];
  map.addLayer({ id: 'amp-fill', type: 'fill', source: 'amphoe', minzoom: AMP_ZOOM, layout: { visibility: nationOn ? 'visible' : 'none' }, paint: {
    'fill-color': ['match', lvl, 0, LEVEL_COLORS[0], 1, LEVEL_COLORS[1], 2, LEVEL_COLORS[2], 3, LEVEL_COLORS[3], NO_DATA_COLOR],
    'fill-opacity': ['interpolate', ['linear'], ['zoom'], AMP_ZOOM, ['case', ['<', lvl, 0], 0.12, 0.4], 12, ['case', ['<', lvl, 0], 0.04, 0.12]],
  } }, 'district-fill');
  map.addLayer({ id: 'amp-line', type: 'line', source: 'amphoe', minzoom: AMP_ZOOM, layout: { visibility: nationOn ? 'visible' : 'none' },
    paint: { 'line-color': '#56627a', 'line-width': 0.6, 'line-opacity': 0.6 } }, 'district-fill');
  colourAmphoe();
}
let ampKey = '';
function colourAmphoe() {
  if (!ampGeo) return;
  const n = historyAt == null ? upstream?.nation : null;
  // ~900 polygons × ~5,000 points is ~0.1 s, and apply() runs once per arriving source: only redo it when the inputs change.
  const key = `${n?.fetchedAt}|${doh.asOf}|${doh.items.length}|${historyAt}`;
  if (key === ampKey) return;
  ampKey = key;
  for (const f of ampGeo.features) {
    const id = f.properties.id, bb = ampBox.get(id)!, polys = f.geometry.coordinates;
    const hit = <T extends number[]>(pts: T[]) => pts.filter((p) => inPolys(p[0], p[1], polys, bb));
    const wl = hit(n?.wl ?? []), rain = hit(n?.rain ?? []);
    const hw = historyAt == null ? doh.items.filter((d) => inPolys(d.lng, d.lat, polys, bb)) : [];
    const st = { over: wl.filter((p) => p[2] === 5).length, near: wl.filter((p) => p[2] === 4).length, stations: wl.length,
      rainMax: rain.length ? Math.max(...rain.map((p) => p[2])) : null, hwImpassable: hw.filter((d) => d.impassable).length, hw: hw.length };
    ampStats.set(id, st);
    map.setFeatureState({ source: 'amphoe', id }, { level: amphoeLevel(st) });
  }
}
function showAmphoe(id: number, at: maplibregl.LngLat) {
  const L = t(), f = ampGeo?.features.find((x) => x.properties.id === id), st = ampStats.get(id);
  if (!f || !st) return;
  const p = f.properties;
  const provName = p.prov || upstream?.provinces?.rows.find((r) => r.code === p.code)?.th || '';
  const name = lang === 'th' ? p.th || p.en : p.en;
  const lvl = amphoeLevel(st);
  open(at, `<b>${L.ampTitle} ${esc(name)}</b>${provName ? ` · ${esc(provName)}` : ''}` +
    (lvl < 0 ? `<div class="empty">${L.ampNoStation}</div>` :
      (st.stations ? row(L.ampStations, L.ampStRow(st.stations, st.over, st.near)) : '') +
      (st.rainMax != null ? row(L.ampRain, `${st.rainMax} mm`) : '') +
      (st.hw ? row(`🛣️ ${L.nearDoh}`, `${st.hw} · ${L.dohNo} ${st.hwImpassable}`) : '')) +
    `<div class="empty" style="margin-top:4px">${L.ampNote}</div>`);
}
function colourProvinces() {
  if (!provGeo) return;
  const byCode = new Map((upstream?.provinces?.rows ?? []).map((r) => [r.code, r]));
  for (const f of provGeo.features) {
    const r = byCode.get(f.properties.code);
    const level = historyAt == null ? provinceLevel(r, r ? doh.items.filter((d) => d.province === r.th) : []) : -1;
    map.setFeatureState({ source: 'provinces', id: f.properties.code }, { level });
  }
  colourAmphoe();
}
function setNation(on: boolean, move = true) {
  nationOn = on;
  try { localStorage.setItem('nation', on ? '1' : '0'); } catch { /* storage blocked */ }
  $<HTMLInputElement>('lyNation').checked = on;
  $('nationLbl').classList.toggle('on', on);
  if (on) ensureProvinceLayer();
  if (on) ensureAmphoeLayer();
  for (const l of ['prov-fill', 'prov-line', 'amp-fill', 'amp-line']) if (map.getLayer(l)) map.setLayoutProperty(l, 'visibility', on ? 'visible' : 'none');
  setData('dwr-cams', fc(dwrShown(), (x) => [x.lng, x.lat], () => ({})));
  apply();
  if (!move) return;
  popup.remove();
  $('sidebar').classList.remove('open'); // on phones the panel covers the map; show the zoom-out/in that just happened
  // Phones: the stats/search panels cover the top ~260 px and the legend the bottom, so keep the country clear of them.
  const pad = innerWidth < 820 ? { top: 260, bottom: 130, left: 10, right: 10 } : { top: 30, bottom: 30, left: 30, right: 360 };
  if (on) map.fitBounds([[97.3, 5.6], [105.7, 20.5]], { padding: pad, pitch: 0, duration: 1500 });
  else map.flyTo({ ...HOME, duration: 1500 });
}
function showProvinceByCode(code: string, at: maplibregl.LngLat) {
  const r = upstream?.provinces?.rows.find((x) => x.code === code);
  if (r) return showProvince(r, at);
  open(at, `<div class="empty">${t().provNoData}</div>`);
}
/** One-glance summary for the hover popup; '' = nothing to show. */
function hoverHtml(layer: string, i: number, id: unknown) {
  const L = t();
  const line = (...xs: (string | false | null | undefined)[]) => xs.filter(Boolean).join(' · ');
  switch (layer) {
    case 'district-fill': {
      const d = districts.find((x) => x.code === id);
      if (!d) return '';
      const lvl = simOn ? d.simLevel : d.level;
      return `<b>${L.district}${esc(dName(d))}</b>` + `<span style="color:${lvl < 0 ? 'inherit' : LEVEL_COLORS[lvl]}">${lvl < 0 ? L.noSensor : lvlName(lvl)}</span>` +
        `<div class="s">${line(maxCm(d) > 0 && `${L.maxRoad} ${maxCm(d)} cm`, d.road.filter((r) => r.cm > 0).length > 0 && `${L.pts} ${d.road.filter((r) => r.cm > 0).length}`, d.reports > 0 && `${L.reports} ${d.reports}`)}</div>`;
    }
    case 'road': { const r = road.items[i]; return r ? `<b>${esc(name(r))}</b><div class="s">${line(`${r.cm} cm`, r.cm > 0 ? lvlName(r.level) : L.noFloodReport, roadStuckH(r) > 0 && '⚠️', hhmm(r.updated))}</div>` : ''; }
    case 'canal': { const c = canals.items[i]; return c ? `<b>${esc(name(c))}</b><div class="s">${line(`${c.wl.toFixed(2)} ${L.msl}`, canalStatus(c), c.bank != null && `${L.toBank} ${(c.bank - c.wl).toFixed(2)} m`, trendTxt(c).split(' · ')[0], hhmm(c.updated))}</div>` : ''; }
    case 'rain': { const r = rain.items[i]; return r ? `<b>${esc(name(r))}</b><div class="s">${line(`${r.mm} mm / 24h`, r.mm1h != null && `${r.mm1h} mm / 1h`)}</div>` : ''; }
    case 'reports': { const r = reports.items[i]; return r ? `<b>Traffy Fondue</b><div class="s">${line(esc(r.state), bkkTime(r.time))}</div>` : ''; }
    case 'events': { const e = events.items[i]; return e ? `<b>${esc(lang === 'th' ? e.title : e.titleEn || e.title)}</b><div class="s">${line(e.impassable && `🚫 ${L.impassableTag}`, bkkTime(e.start))}</div>` : ''; }
    case 'doh': { const d = dohLive()[i]; return d ? `<b>🛣️ ${L.dohRoad} ${esc(Number(d.road) || d.road)} ${esc(d.section)}</b><div class="s">${line(d.cm != null && `${d.cm} cm`, d.impassable ? `🚫 ${L.dohNo}` : L.dohYes)}</div>` : ''; }
    case 'cameras': { const c = cameras[i]; return c ? `<b>📷 ${esc(c.title)}</b>` : ''; }
    case 'dwr-cams': { const c = dwrShown()[i]; return c ? `<b>📷 ${esc(lang === 'th' ? c.th : c.en || c.th)}</b><div class="s">${L.dwrAgency}</div>` : ''; }
    case 'amp-fill': {
      const f = ampGeo?.features.find((x) => x.properties.id === Number(id)), st = ampStats.get(Number(id));
      if (!f || !st) return '';
      return `<b>${L.ampTitle} ${esc(lang === 'th' ? f.properties.th || f.properties.en : f.properties.en)}</b><div class="s">${line(st.stations > 0 && L.ampStRow(st.stations, st.over, st.near), st.rainMax != null && `${st.rainMax} mm / 24h`) || L.ampNoStation}</div>`;
    }
    case 'prov-fill': { const r = upstream?.provinces?.rows.find((x) => x.code === String(id)); return r ? `<b>${esc(lang === 'th' ? r.th : r.en)}</b><div class="s">${L.provRow(r.over, r.near, r.n)}</div>` : ''; }
  }
  return '';
}
function showDoh(d: DohFlood, fly = false) {
  const L = t();
  open([d.lng, d.lat], `<b>🛣️ ${L.dohRoad} ${esc(Number(d.road) || d.road)} ${esc(d.section)}</b>` +
    row(L.status, `<span style="color:${d.impassable ? LEVEL_COLORS[3] : LEVEL_COLORS[2]}">${d.impassable ? `🚫 ${L.dohNo}${d.closure ? ` (${esc(d.closure)})` : ''}` : L.dohYes}</span>`) +
    row(L.dohDepth, d.depth ? `${esc(d.depth)}${/^[\d.\s-]+$/.test(d.depth) ? ' cm' : ''}` : '-') + row(L.dohKm, esc(d.km)) + (d.direction ? row(L.dohSide, esc(d.direction)) : '') +
    row(L.dwrProv, `${esc(d.province)} · ${esc(d.amphoe)}`) + (d.cause ? row(L.dohCause, esc(d.cause)) : '') + (d.detour ? row(L.dohDetour, esc(d.detour)) : '') +
    (d.start ? row(L.since, bkkTime(d.start)) : '') +
    `<div class="r"><a href="https://hdms.doh.go.th/dashboard" target="_blank" rel="noopener">${L.dohOpen} ↗</a></div>`, fly);
}
function showDwrCamera(c: DwrCamera) {
  const L = t();
  open([c.lng, c.lat], `<b>📷 ${esc(lang === 'th' ? c.th : c.en || c.th)}</b>` + row(L.camOwner, L.dwrAgency) +
    row(L.dwrProv, esc(lang === 'th' ? c.province : c.provinceEn || c.province)) +
    `<div class="cam-img" data-dwr="${esc(c.id)}"><div class="empty">${L.dwrLoading}</div></div><div class="empty">${L.dwrNote}</div>` +
    `<div class="r"><a href="https://telemetry.dwr.go.th/station/${encodeURIComponent(c.code)}" target="_blank" rel="noopener">${L.dwrOpen} ↗</a></div>`);
  fetchDwrSnapshot(c.id).then(({ url, time }) => {
    const box = document.querySelector<HTMLElement>(`.cam-img[data-dwr="${CSS.escape(c.id)}"]`);
    if (!box) return URL.revokeObjectURL(url); // popup already moved on
    if (dwrObjectUrl) URL.revokeObjectURL(dwrObjectUrl);
    dwrObjectUrl = url;
    const old = time == null || Date.now() - time > 3600_000;
    box.innerHTML = `<img src="${url}" alt="">` + `<div class="s" style="${old ? 'color:var(--l2);font-weight:600' : ''}">` +
      (time != null ? `${L.dwrShot} ${esc(new Date(time).toLocaleString(lang === 'th' ? 'th-TH' : 'en-GB', { timeZone: 'Asia/Bangkok', dateStyle: 'medium', timeStyle: 'short' }))}` : '') +
      (old ? ` · ⚠️ ${L.dwrOld}` : '') + '</div>';
  }).catch(() => {
    const box = document.querySelector<HTMLElement>(`.cam-img[data-dwr="${CSS.escape(c.id)}"]`);
    if (box) box.innerHTML = `<div class="empty">${L.dwrFail}</div>`;
  });
}
function showCamera(c: Camera) {
  const L = t();
  open([c.lng, c.lat], `<b>📷 ${esc(c.title)}</b>` + row(L.camOwner, esc(c.org)) +
    `<div class="r"><a href="${esc(longdoCameraUrl(c.id))}" target="_blank" rel="noopener">${L.camOpen} ↗</a></div>`);
}

// ---------------- popups ----------------
const row = (k: string, v: string) => `<div class="r"><span>${k}</span><span>${v}</span></div>`;
function open(lngLat: [number, number] | maplibregl.LngLat, html: string, fly = false) {
  // Land the point below the stats panel (and left of the sidebar on desktop) so its popup isn't covered.
  const offset: [number, number] = innerWidth > 820 ? [-170, 130] : [0, 140];
  if (fly) map.flyTo({ center: lngLat, zoom: Math.max(map.getZoom(), 15), duration: 1200, offset });
  if (location.hash) history.replaceState(null, '', location.pathname + location.search);
  popup.setLngLat(lngLat).setHTML(`<div class="pop">${html}</div>`).addTo(map);
}
function showRoad(r: RoadFlood, fly = false) {
  const L = t(), d = findDistrict(r.lng, r.lat);
  open([r.lng, r.lat], `<b>${esc(name(r))}</b>` +
    row(L.status, `<span style="color:${LEVEL_COLORS[r.level]}">${r.cm > 0 ? lvlName(r.level) : L.noFloodReport}</span>`) +
    (d ? row(L.districtLbl, esc(dName(d))) : '') +
    row(L.waterNow, `${r.cm} cm`) + (r.maxCm != null ? row(L.max, `${r.maxCm} cm`) : '') + (r.start ? row(L.since, hhmm(r.start)) : '') + row(L.updated, hhmm(r.updated)) +
    (roadStuckH(r) ? `<div class="empty" style="color:var(--l2)">${L.stuckRoad(roadStuckH(r))}</div>` : '') +
    `<div class="r"><a href="${esc(r.url)}" target="_blank" rel="noopener">${L.detail} ↗</a></div>` + nearCameraRow(r), fly);
}
/** Status text for a canal point: bank bands for BMA points, ThaiWater bands otherwise, or why it's grey. */
function canalStatus(c: Canal) {
  const L = t();
  if (c.note === 'stale') return L.canalStale;
  if (c.note === 'nobank') return L.canalNoBank;
  return (c.agency === 'สนน.' ? L.bankSit : L.situation)[c.situation] ?? '-';
}
/** "▲ +5 cm (1 h) · ▼ −12 cm (24 h)" from history; '' when unknown. */
function trendTxt(c: Canal) {
  const tr = canalTrend(c), L = t();
  const f = (d: number | null, lbl: string) => {
    if (d == null) return '';
    const cm = Math.round(d * 100);
    return `${cm > 0 ? '▲ +' : cm < 0 ? '▼ −' : '■ '}${Math.abs(cm)} cm (${lbl})`;
  };
  return tr ? [f(tr.d1h, L.trend1h), f(tr.d24h, L.trend24h)].filter(Boolean).join(' · ') : '';
}
const canalStuckH = (c: Canal) => { const tr = canalTrend(c); return tr && tr.flatV === c.wl && tr.flatH >= STUCK_CANAL_H ? Math.floor(tr.flatH) : 0; };
function showCanal(c: Canal, fly = false) {
  const L = t();
  open([c.lng, c.lat], `<b>${esc(name(c))}</b>` +
    row(L.status, `<span style="color:${SITUATION_COLORS[c.situation]}">${canalStatus(c)}</span>`) +
    row(L.waterNow, `${c.wl.toFixed(2)} ${L.msl}`) +
    (c.bank != null ? row(L.bank, `${c.bank.toFixed(2)} ${L.msl}`) + row(L.toBank, `${(c.bank - c.wl).toFixed(2)} m`) : '') +
    (trendTxt(c) ? row(L.trendLbl, trendTxt(c)) : '') + row(L.agency, esc(c.agency)) + row(L.updated, hhmm(c.updated)) +
    (canalStuckH(c) ? `<div class="empty" style="color:var(--l2)">${L.stuckCanal(canalStuckH(c))}</div>` : ''), fly);
}
function showRain(r: Rain, fly = false) {
  const L = t();
  open([r.lng, r.lat], `<b>${esc(name(r))}</b>` + row(L.rainLbl, `${r.mm} mm (${L.rainCls(r.mm)})`) + row(L.updated, hhmm(r.updated)), fly);
}
function showReport(r: Report, fly = false) {
  const L = t();
  open([r.lng, r.lat], `<b>Traffy Fondue</b><div>${esc(r.text || L.histReport)}</div>` + row(L.updated, bkkTime(r.time)) + row(L.stateLbl, esc(r.state)) +
    `<div style="color:var(--text-muted);font-size:11px;margin-top:4px">${esc(r.address)}</div>` +
    (r.photo ? `<img src="${esc(r.photo)}" alt="" loading="lazy">` : '') +
    `<div class="r"><a href="https://bangkok.traffy.in.th/detail?ticketID=${encodeURIComponent(r.id)}" target="_blank" rel="noopener">${L.traffyOpen} ↗</a></div>` + nearCameraRow(r), fly);
}
/** For districts without their own BMA sensor: the closest one, so "no data" still gives a hint. */
function nearestSensorRow(d: District) {
  if (d.road.length || !road.items.length) return '';
  const c = { lng: (d.bbox[0] + d.bbox[2]) / 2, lat: (d.bbox[1] + d.bbox[3]) / 2 };
  let best = road.items[0], bestM = Infinity;
  for (const r of road.items) { const m = metres(c, r); if (m < bestM) { best = r; bestM = m; } }
  return `<div class="empty" style="margin-top:4px">${esc(t().nearestSensor(name(best), (bestM / 1000).toFixed(1), best.cm))}</div>`;
}
function showProvince(p: ProvinceSum, at?: maplibregl.LngLat) {
  const L = t();
  if (!at) map.flyTo({ center: [p.lng, p.lat], zoom: 9, pitch: 0, duration: 1500 });
  const cams = dwrCams.filter((c) => c.province === p.th).length, hw = dohLive().filter((d) => d.province === p.th);
  open(at ?? [p.lng, p.lat], `<b>${esc(lang === 'th' ? p.th : p.en)}</b><div>${L.provRow(p.over, p.near, p.n)}</div>` + (hw.length ? row(`🛣️ ${L.nearDoh}`, `${hw.length} · ${L.dohNo} ${hw.filter((d) => d.impassable).length}`) : '') + (cams ? row(`📷 ${L.dwrAgency}`, String(cams)) : '') + `
    <div class="r"><a href="https://www.thaiwater.net/water/wl" target="_blank" rel="noopener">${L.provOpen}</a></div>`);
}
/** 📍 near me: everything currently loaded within 2 km of a point, shown in the map popup. */
function showNear(p: { lng: number; lat: number }) {
  const L = t();
  const near = <T extends { lng: number; lat: number }>(xs: T[]) => xs.filter((x) => metres(p, x) <= 2000);
  const flooded = near(liveRoad()).filter((r) => r.cm > 0);
  const canalHits = near(canals.items).filter((c) => c.situation >= 4);
  const evs = near(events.items), reps = near(reports.items), hws = near(dohLive());
  let gauge: Rain | null = null;
  for (const r of rain.items) if (!gauge || metres(p, r) < metres(p, gauge)) gauge = r;
  const d = findDistrict(p.lng, p.lat);
  const any = flooded.length || canalHits.length || evs.length || reps.length || hws.length;
  open([p.lng, p.lat], `<b>📍 ${L.nearHere}</b>` + (d ? row(L.district, esc(dName(d))) : `<div class="empty">${L.nearOutside}</div>`) +
    (flooded.length ? row(L.nearRoad, L.nearPts(flooded.length, Math.max(...flooded.map((r) => r.cm)))) : '') +
    (canalHits.length ? row(L.nearCanal, canalHits.map((c) => esc(name(c))).slice(0, 3).join(', ')) : '') +
    (hws.length ? row(L.nearDoh, String(hws.length)) : '') + (evs.length ? row(L.nearEvents, String(evs.length)) : '') + (reps.length ? row(L.nearReports, String(reps.length)) : '') +
    (any ? '' : `<div style="margin:4px 0">${L.nearNone}</div>`) +
    (gauge ? row(L.nearRain, `${esc(name(gauge))} (${(metres(p, gauge) / 1000).toFixed(1)} km) ${gauge.mm} mm/24h`) : '') +
    // Point forecast for this spot. Only leaves the device if tapped; rounded to ~100 m.
    ((lat: string, lng: string) => `<div class="r"><a href="https://www.windy.com/${lat}/${lng}?rain,${lat},${lng},12" target="_blank" rel="noopener noreferrer">${L.nearFc}</a></div><div class="empty">${L.nearFcNote}</div>`)(p.lat.toFixed(3), p.lng.toFixed(3)), true);
}
/** Native share sheet on phones; clipboard elsewhere (button text confirms). */
async function shareLink(url: string, btn: HTMLElement) {
  if (navigator.share) { await navigator.share({ title: document.title, url }).catch(() => {}); return; }
  await navigator.clipboard?.writeText(url).then(() => (btn.textContent = t().copied)).catch(() => {});
}
// Shareable district links: #d=bang-kapi opens that district on load.
const slug = (d: District) => d.en.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const districtUrl = (d: District) => `${location.origin}${location.pathname}#d=${slug(d)}`;
let pendingDistrict = decodeURIComponent(location.hash.match(/^#d=(.+)/)?.[1] ?? '');
function showDistrict(d: District, at?: maplibregl.LngLat) {
  const L = t();
  const lvl = simOn ? d.simLevel : d.level;
  const status = lvl < 0 ? L.noSensor : `<span style="color:${LEVEL_COLORS[lvl]}">${lvlName(lvl)}</span>`;
  if (!at) map.fitBounds([[d.bbox[0], d.bbox[1]], [d.bbox[2], d.bbox[3]]], { padding: 60, duration: 1200 });
  const margin = d.elev - simCm;
  open(at ?? [(d.bbox[0] + d.bbox[2]) / 2, (d.bbox[1] + d.bbox[3]) / 2], `<b>${L.district}${esc(dName(d))}</b>` +
    row(L.status, status) + row(L.area, `${d.area.toFixed(1)} km²`) + nearestSensorRow(d) +
    row(L.maxRoad, `${maxCm(d)} cm`) + row(L.pts, String(d.road.filter((r) => r.cm > 0).length)) + row(`${L.reports} (24h)`, String(d.reports)) +
    (d.rainMax ? row(L.rainMax, `${d.rainMax.mm} mm`) : '') +
    row(L.elevSim, `${d.elev} cm`) + (simOn ? row(L.marginSim, `${margin > 0 ? '+' : ''}${Math.round(margin)} cm`) : '') +
    `<div class="r"><button class="btn small" data-share-district="${esc(d.code)}">${L.shareDistrict}</button></div>`);
  history.replaceState(null, '', `#d=${slug(d)}`);
}

// ---------------- controls ----------------
function wireControls() {
  // Layers start as their checkbox says (only district colours are ticked by default), so apply that once now.
  const toggle = (id: string, fn: (on: boolean) => void, applyNow = true) => {
    const el = $<HTMLInputElement>(id);
    el.addEventListener('change', () => fn(el.checked));
    if (applyNow) fn(el.checked);
  };
  const setVis = (layers: string[], on: boolean) => layers.forEach((l) => map.setLayoutProperty(l, 'visibility', on ? 'visible' : 'none'));
  toggle('lyRoad', (on) => setVis(['road', 'road-label'], on));
  toggle('lyCanal', (on) => setVis(['canal'], on));
  toggle('lyRain', (on) => setVis(['rain'], on));
  toggle('lyReports', (on) => setVis(['reports'], on));
  toggle('lyCams', (on) => setVis(['cameras'], on));
  toggle('lyDwr', (on) => setVis(['dwr-cams'], on));
  toggle('lyDoh', (on) => setVis(['doh'], on));
  map.on('zoomend', () => { ensureAmphoeLayer(); });
  $<HTMLInputElement>('lyNation').addEventListener('change', (e) => setNation((e.target as HTMLInputElement).checked));
  toggle('lyEvents', (on) => setVis(['events'], on));
  toggle('lyDistrict', (on) => setVis(['district-fill'], on));
  toggle('lyBuild', (on) => setVis(['buildings-3d'], on));
  toggle('lySat', (on) => setVis(['satellite'], on));
  toggle('lyTerrain', (on) => {
    map.setTerrain(on ? { source: 'terrain', exaggeration: 1.5 } : null);
    $('terrainNote').hidden = !on;
  }, false); // terrain starts off anyway; don't touch it before the user asks

  toggle('simMode', (on) => {
    simOn = on;
    $('simControls').hidden = !on;
    if (!on) stopSim();
    render();
  });
  const slider = $<HTMLInputElement>('waterSlider');
  slider.addEventListener('input', () => { stopSim(); simCm = +slider.value; render(); });
  $('playBtn').addEventListener('click', () => {
    if (timer) return stopSim();
    if (simCm >= 180) simCm = 0;
    $('playBtn').textContent = t().pause;
    timer = window.setInterval(() => {
      simCm = Math.min(180, simCm + 0.8);
      slider.value = String(simCm);
      render();
      if (simCm >= 180) stopSim();
    }, 120);
  });

  $('refresh').addEventListener('click', () => refresh());


  // Link out to Google Maps' live traffic layer at the current view (a link only — no Google data is copied here).
  // MapLibre uses 512 px tiles, Google 256 px, hence +1 zoom.
  $('trafficBtn').addEventListener('click', () => {
    const c = map.getCenter();
    const z = Math.min(21, Math.max(3, Math.round(map.getZoom() + 1)));
    ($('trafficBtn') as HTMLAnchorElement).href = `https://www.google.com/maps/@${c.lat.toFixed(5)},${c.lng.toFixed(5)},${z}z/data=!5m1!1e1`;
  });

  // History picker: values are Bangkok local time regardless of the viewer's timezone.
  const histAt = $<HTMLInputElement>('histAt');
  const toInput = (ms: number) => new Date(ms + 7 * 3600_000).toISOString().slice(0, 16);
  const setRange = () => {
    const now = Date.now();
    histAt.min = toInput(now - 7 * 86400_000);
    histAt.max = toInput(now);
    if (historyAt == null) histAt.value = toInput(now);
  };
  setRange();
  histAt.title = t().histRange;
  histAt.addEventListener('focus', setRange);
  histAt.addEventListener('change', () => {
    const at = bkkMs(histAt.value);
    if (!Number.isFinite(at)) return;
    popup.remove();
    // Picking "now" (or later) means live.
    if (at >= Date.now() - 10 * 60_000) { historyAt = null; refresh(); } else showHistory(Math.max(at, Date.now() - 7 * 86400_000));
  });
  $('histLive').addEventListener('click', () => {
    historyAt = null;
    $('histError').hidden = true;
    setRange();
    popup.remove();
    refresh();
  });
  $('sideToggle').addEventListener('click', () => $('sidebar').classList.toggle('open'));
  $('sideBody').addEventListener('toggle', (e) => {
    const d = e.target as HTMLDetailsElement;
    if (!d.classList.contains('sec')) return;
    if (d.open) openSecs.add(d.dataset.sec!); else openSecs.delete(d.dataset.sec!);
  }, true);
  $('sideBody').addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest<HTMLElement>('button.item');
    if (!b) return;
    if (b.dataset.road) showRoad(road.items[+b.dataset.road], true);
    else if (b.dataset.canal) showCanal(canals.items[+b.dataset.canal], true);
    else if (b.dataset.report) showReport(reports.items[+b.dataset.report], true);
    else if (b.dataset.event) showEvent(events.items[+b.dataset.event], true);
    else if (b.dataset.district) showDistrict(districts.find((d) => d.code === b.dataset.district)!);
    else if (b.dataset.doh) showDoh(dohLive()[+b.dataset.doh], true);
    else if (b.dataset.top) { const [x, y] = b.dataset.top.split(',').map(Number); map.flyTo({ center: [x, y], zoom: 11, pitch: 0, duration: 1500 }); }
    else if (b.dataset.prov) showProvince(upstream!.provinces!.rows[+b.dataset.prov]);
    $('sidebar').classList.remove('open');
  });

  const search = $<HTMLInputElement>('search');
  search.addEventListener('change', () => {
    const q = search.value.trim().replace(/^เขต/, '').toLowerCase();
    const d = districts.find((x) => x.th === q || x.en.toLowerCase() === q) ?? districts.find((x) => x.th.includes(q) || x.en.toLowerCase().includes(q));
    if (q && d) { showDistrict(d); search.value = ''; search.blur(); }
  });

  $('langTH').addEventListener('click', () => { lang = 'th'; applyLang(); });
  $('langEN').addEventListener('click', () => { lang = 'en'; applyLang(); });
}

function applyLang() {
  const L = t();
  document.documentElement.lang = lang;
  $('langTH').classList.toggle('active', lang === 'th');
  $('langEN').classList.toggle('active', lang === 'en');
  document.querySelectorAll<HTMLElement>('[data-i]').forEach((n) => (n.textContent = L[n.dataset.i as keyof typeof L] as string));
  $<HTMLInputElement>('search').placeholder = L.search;
  $('linksList').innerHTML = L.links.map(([n, u, d]) => `<li><a href="${esc(u)}" target="_blank" rel="noopener">${esc(n)} ↗</a><small>${esc(d)}</small></li>`).join('');
  $('hotlineList').innerHTML = L.hotlines.map(([n, who]) => `<li><span>${esc(who)}</span><a href="tel:${n.replace(/-/g, '')}">${n}</a></li>`).join('');
  $('trafficBtn').title = L.trafficTip;
  $('nationLbl').title = L.nationTip;
  document.querySelector('.layers summary')!.innerHTML = `${esc(L.layers)} <small>— ${esc(L.layersHint)}</small>`;
  $('trafficIdx').title = L.trafficTipIdx;
  for (const id of ['homeBtn', 'rotL', 'rotR', 'spinBtn'] as const) {
    document.getElementById(id)?.setAttribute('aria-label', L[id]);
    document.getElementById(id)?.setAttribute('title', L[id]);
  }
  $('playBtn').textContent = timer ? L.pause : L.play;
  $('districtList').innerHTML = districts.map((d) => `<option value="${esc(dName(d))}">`).join('');
  popup.remove();
  render();
}

// The page is a fixed full-screen layout: a pinch that lands on a panel (not the map) would zoom the whole
// page and leave it panned/cut off with scrollbars. Pinch-zoom the map only. (Cmd/Ctrl +/- page zoom still works.)
window.addEventListener('wheel', (e) => { if (e.ctrlKey) e.preventDefault(); }, { passive: false }); // trackpad pinch (Chrome/Edge/Firefox)
for (const ev of ['gesturestart', 'gesturechange']) document.addEventListener(ev, (e) => e.preventDefault()); // Safari pinch


// Hotlines + rain forecast work without the map (wired at startup, not on map load) — they matter most when things break.
function wireDialogs() {
  // Native <dialog>; backdrop click or ✕ closes.
  for (const dlg of document.querySelectorAll<HTMLDialogElement>('dialog.dlg')) {
    dlg.addEventListener('click', (e) => {
      if (e.target === dlg || (e.target as HTMLElement).closest('[data-close]')) dlg.close();
    });
  }
  $('hotlineBtn').addEventListener('click', () => $<HTMLDialogElement>('hotlineDlg').showModal());
  $('summaryMore').addEventListener('click', () => { summaryOpen = !summaryOpen; render(); });
  $('linksBtn').addEventListener('click', () => $<HTMLDialogElement>('linksDlg').showModal());
  $('shareSite').addEventListener('click', (e) => shareLink(location.origin + location.pathname, e.currentTarget as HTMLElement));
  // Popup HTML is replaced often, so listen on the map container.
  map.getContainer().addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest<HTMLElement>('[data-share-district]');
    const d = b && districts.find((x) => x.code === b.dataset.shareDistrict);
    if (d) shareLink(districtUrl(d), b);
  });
  const nearDlg = $<HTMLDialogElement>('nearDlg'), nearMsg = $('nearMsg');
  $('nearBtn').addEventListener('click', () => { nearMsg.textContent = ''; $<HTMLInputElement>('nearInput').placeholder = t().nearPh; nearDlg.showModal(); });
  const goNear = (p: { lng: number; lat: number }) => { nearDlg.close(); showNear(p); };
  $('nearGps').addEventListener('click', () => {
    if (!navigator.geolocation) { nearMsg.textContent = t().nearGpsFail; return; }
    nearMsg.textContent = t().nearWait;
    navigator.geolocation.getCurrentPosition((pos) => goNear({ lng: pos.coords.longitude, lat: pos.coords.latitude }),
      () => (nearMsg.textContent = t().nearGpsFail), { enableHighAccuracy: true, timeout: 15_000 });
  });
  $('nearForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const p = parseLatLng($<HTMLInputElement>('nearInput').value);
    if (p) goNear(p); else nearMsg.textContent = t().nearBad;
  });
  // Windy's official embed widget, centred on Bangkok; loaded only when opened.
  const windy = (overlay: string) => {
    const q = new URLSearchParams({
      lat: '13.75', lon: '100.55', detailLat: '13.75', detailLon: '100.55', zoom: '8', level: 'surface', overlay, product: 'ecmwf',
      menu: '', message: 'true', marker: '', calendar: 'now', pressure: '', type: 'map', location: 'coordinates', detail: '',
      metricWind: 'km/h', metricTemp: '°C', radarRange: '-1',
    });
    $<HTMLIFrameElement>('windyFrame').src = `https://embed.windy.com/embed2.html?${q}`;
    document.querySelectorAll<HTMLElement>('[data-overlay]').forEach((b) => b.classList.toggle('on', b.dataset.overlay === overlay));
  };
  $('rainBtn').addEventListener('click', () => {
    if (!$<HTMLIFrameElement>('windyFrame').src) windy('rain');
    $<HTMLDialogElement>('rainDlg').showModal();
  });
  document.querySelectorAll<HTMLElement>('[data-overlay]').forEach((b) => b.addEventListener('click', () => windy(b.dataset.overlay!)));
}

wireDialogs();
// Fill static UI text right away; the map/data can take several seconds.
applyLang();
