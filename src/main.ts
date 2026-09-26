import * as maplibregl from 'maplibre-gl';
// MapLibre v6 finds its worker next to its own file, which breaks once bundled; ship it as a separate asset instead.
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
import 'maplibre-gl/dist/maplibre-gl.css';
import './style.css';
import districtsUrl from '../data/bkk_districts.geojson?url';
import simData from '../data/bkk_data.json';
import {
  fetchCanals, fetchRain, fetchReports, fetchRoadFlood, loadHistory, roadVia, bkkMs, fetchCameras, longdoCameraUrl,
  fetchEvents, fetchTrafficIndex, fetchUpstream, type FloodEvent, type UpstreamView,
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
    rotL: 'หมุนซ้าย 45°', rotR: 'หมุนขวา 45°', spinBtn: 'หมุนรอบ 360° (กดอีกครั้งเพื่อหยุด)',
    sideTitle: 'สถานการณ์น้ำท่วมตอนนี้', sideTitleAt: (t: string) => `สถานการณ์ ณ ${t}`,
    liveBtn: '● สด', traffic: '🚗 Google Maps', trafficTip: 'เปิด Google Maps พร้อมชั้นจราจรแบบสด ตรงตำแหน่งที่แผนที่แสดงอยู่', histLbl: 'ดูย้อนหลัง', histBanner: (t: string) => `กำลังดูข้อมูลย้อนหลัง ณ ${t} — กด "● สด" เพื่อกลับมาดูปัจจุบัน`,
    histNoRoad: 'ไม่มีข้อมูลเซนเซอร์ กทม. ในช่วงเวลานี้', histFail: 'โหลดข้อมูลย้อนหลังไม่ได้ (ใช้ได้เฉพาะบนเว็บที่ deploy แล้ว)',
    histRange: 'ย้อนหลังได้ 7 วัน · ข้อมูลฝนมีเฉพาะช่วงที่ระบบเริ่มเก็บ', histReport: 'แจ้งน้ำท่วม (ข้อมูลย้อนหลังไม่เก็บข้อความ/รูปภาพ)', via: 'ผ่าน สสน.', histSrc: 'ย้อนหลัง', refresh: '↻ อัปเดต', simMode: 'โหมดจำลอง (ข้อมูลสมมติ)',
    play: '▶ จำลองฝนตก', pause: '⏸ หยุด', layers: '🗂 ชั้นข้อมูล', layersHint: 'เลือกสิ่งที่แสดงบนแผนที่',
    l0: 'ปกติ', l1: 'เฝ้าระวัง', l2: 'เสี่ยงสูง', l3: 'ท่วมหนัก',
    lyRoad: 'เซนเซอร์น้ำท่วมถนน (กทม.)', lyCanal: 'ระดับน้ำคลอง/แม่น้ำ', lyRain: 'ฝน 24 ชม.', lyReports: 'ประชาชนแจ้งน้ำท่วม (Traffy)',
    lyDistrict: 'สีระดับความเสี่ยงรายเขต', lyBuild: 'อาคาร 3D', lySat: 'ภาพดาวเทียม', lyTerrain: 'ภูมิประเทศ (Terrain)',
    terrainNote: 'Terrain ความละเอียด ~30 ม. — พื้นที่ กทม. ราบมาก (ส่วนใหญ่ 0–2 ม. รทก.) จึงไม่เหมาะเป็นข้อมูลความสูงหลักสำหรับประเมินน้ำท่วม',
    alerts: '⚠ แจ้งเตือน: จุดท่วมหนัก', districts: 'เขตที่ได้รับผลกระทบ', canals: 'ระดับน้ำคลอง/แม่น้ำ (สสน.)',
    unavailable: 'ไม่พร้อมใช้งาน', needSensor: 'ต้องใช้ข้อมูลเซนเซอร์ กทม.',
    staleBanner: 'ข้อมูลไม่พร้อมใช้งานตอนนี้ (เชื่อมต่อไม่ได้ และข้อมูลสำรองเก่าเกิน 6 ชม. จึงไม่แสดง):',
    summaryNoRoad: (rain: string, reports: number) => `ไม่มีข้อมูลเซนเซอร์น้ำท่วมถนนของ กทม. จึงบอกไม่ได้ว่าถนนไหนท่วม`
      + (rain ? ` · ฝนสะสมสูงสุด ${rain}` : '') + ` · ประชาชนแจ้งน้ำท่วมผ่าน Traffy <b>${reports} เรื่อง</b> ใน 24 ชม.`,
    upTitle: '🏞️ น้ำเหนือ (ลุ่มเจ้าพระยา)', upC13: 'เขื่อนเจ้าพระยา (C.13) ระบาย', upUnit: 'ลบ.ม./วิ',
    upDam: (pct: number, inflow: number, release: number) => `ความจุ ${pct.toFixed(0)}% · ไหลเข้า ${inflow.toFixed(1)} · ระบาย ${release.toFixed(1)} ล้าน ลบ.ม./วัน`,
    upNote: 'ข้อมูลกรมชลประทาน ผ่านคลังข้อมูลน้ำแห่งชาติ · น้ำจากเขื่อนเหล่านี้ไหลลงเจ้าพระยาผ่าน กทม.', upNone: 'ยังไม่มีข้อมูลเขื่อน',
    linksBtn: '🔗 ลิงก์', linksTitle: '🔗 ลิงก์ติดตามสถานการณ์',
    links: [['Google Flood Hub', 'https://sites.research.google/floods/l/13.75/100.55/9', 'พยากรณ์ระดับน้ำในแม่น้ำ ล่วงหน้า 7 วัน'],
      ['ThaiWater (สสน.)', 'https://www.thaiwater.net', 'ระดับน้ำ ฝน เรดาร์ และรายงานสถานการณ์น้ำทั่วประเทศ'],
      ['iTIC Live', 'https://live.iticfoundation.org/', 'ถนนน้ำท่วม เหตุการณ์ และกล้อง CCTV ทั่วกรุงเทพฯ'],
      ['เว็บระดับน้ำท่วมถนน กทม.', 'https://weather.bangkok.go.th/flood/', 'สำนักการระบายน้ำ (เปิดได้จากในประเทศไทย)'],
      ['Traffy Fondue', 'https://share.traffy.in.th/teamchadchart', 'แจ้งเหตุและติดตามเรื่องร้องเรียนกับ กทม.'],
      ['กรมอุตุนิยมวิทยา', 'https://www.tmd.go.th', 'พยากรณ์อากาศและประกาศเตือนภัย']] as [string, string, string][],
    hotlineBtn: '📞 สายด่วน', rainBtn: '🌧️ พยากรณ์ฝน', hotlineTitle: '📞 สายด่วนขอความช่วยเหลือ',
    hotlineNote: 'บนมือถือ กดที่เบอร์เพื่อโทรได้ทันที', rainTitle2: '🌧️ พยากรณ์ฝน กทม. และปริมณฑล',
    rainTabFc: 'พยากรณ์ฝน', rainTabRadar: 'เรดาร์', rainTabAccu: 'ฝนสะสม', rainNote: 'ข้อมูลจาก Windy (โมเดล ECMWF) — ใช้แถบเวลาด้านล่างเพื่อดูล่วงหน้า',
    hotlines: [['1784', 'ปภ. แจ้งเหตุสาธารณภัย'], ['1669', 'เจ็บป่วยฉุกเฉิน'], ['191', 'เหตุด่วนเหตุร้าย'], ['199', 'ดับเพลิง / กู้ภัย'],
      ['1555', 'กรุงเทพมหานคร'], ['1460', 'กรมชลประทาน'], ['1182', 'กรมอุตุนิยมวิทยา'], ['1586', 'กรมทางหลวง (เส้นทางน้ำท่วม)'], ['1146', 'กรมทางหลวงชนบท']],
    lyEvents: 'เหตุการณ์น้ำท่วม (iTIC/Longdo)', eventsList: 'เหตุการณ์น้ำท่วม (iTIC/Longdo)', eventsEmpty: 'ไม่มีเหตุการณ์น้ำท่วมที่ยังไม่คลี่คลาย',
    impassable: '🚫 ถนนที่รถเล็กไม่ควรผ่าน', impassableTag: 'รถเล็กไม่ควรผ่าน', evBy: 'ลงข้อมูลโดย', evWhen: 'ช่วงเวลา', evOpen: 'ดูบน iTIC Live',
    byLabel: { doh: 'เจ้าหน้าที่กรมทางหลวง', itic: 'เจ้าหน้าที่ iTIC', public: 'ผู้ใช้แอป iTIC' } as Record<string, string>, events: 'เหตุการณ์',
    srcEvents: 'เหตุการณ์: iTIC / Longdo Event', srcTitle: 'แหล่งข้อมูล',
    srcCams: 'กล้อง: <a href="https://traffic.longdo.com/cameralist" target="_blank" rel="noopener">Longdo Traffic</a> / มูลนิธิ iTIC / กรมทางหลวง',
    srcDistricts: 'ขอบเขตเขต: <a href="https://github.com/chingchai/OpenGISData-Thailand" target="_blank" rel="noopener">OpenGISData-Thailand</a> (chingchai)', trafficIdx: '🚦 จราจร', trafficTipIdx: 'ดัชนีการจราจร กทม. 0–10 จาก Longdo Traffic (ยิ่งสูงยิ่งติด)',
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
    rotL: 'Rotate left 45°', rotR: 'Rotate right 45°', spinBtn: 'Orbit 360° (press again to stop)',
    sideTitle: 'Flood situation now', sideTitleAt: (t: string) => `Situation at ${t}`,
    liveBtn: '● Live', traffic: '🚗 Google Maps', trafficTip: 'Open Google Maps with the live traffic layer at the current map view', histLbl: 'History', histBanner: (t: string) => `Viewing history at ${t} — press "● Live" to return to now`,
    histNoRoad: 'No BMA sensor data for this time', histFail: 'Could not load history (works on the deployed site only)',
    histRange: 'Up to 7 days back · rain only from when recording started', histReport: 'Flood report (history keeps no text/photos)', via: 'via HII', histSrc: 'history', refresh: '↻ Refresh', simMode: 'Simulation mode (hypothetical)',
    play: '▶ Simulate rain', pause: '⏸ Pause', layers: '🗂 Layers', layersHint: 'choose what the map shows',
    l0: 'Normal', l1: 'Watch', l2: 'High risk', l3: 'Severe',
    lyRoad: 'Road flood sensors (BMA)', lyCanal: 'Canal/river levels', lyRain: '24h rainfall', lyReports: 'Citizen flood reports (Traffy)',
    lyDistrict: 'District risk colours', lyBuild: '3D buildings', lySat: 'Satellite', lyTerrain: 'Terrain',
    terrainNote: 'Terrain is ~30 m resolution and Bangkok is very flat (mostly 0–2 m MSL), so it is not suitable as the primary elevation source for flood assessment.',
    alerts: '⚠ Alerts: severe flooding', districts: 'Affected districts', canals: 'Canal/river levels (HII)',
    unavailable: 'unavailable', needSensor: 'needs BMA sensor data',
    staleBanner: 'Unavailable right now (unreachable, and the saved snapshot is over 6 h old so it is hidden):',
    summaryNoRoad: (rain: string, reports: number) => `No BMA road-flood sensor data, so flooded roads cannot be shown`
      + (rain ? ` · max rainfall ${rain}` : '') + ` · <b>${reports}</b> citizen flood reports on Traffy in 24h`,
    upTitle: '🏞️ Upstream (Chao Phraya basin)', upC13: 'Chao Phraya Dam (C.13) outflow', upUnit: 'm³/s',
    upDam: (pct: number, inflow: number, release: number) => `${pct.toFixed(0)}% full · in ${inflow.toFixed(1)} · out ${release.toFixed(1)} million m³/day`,
    upNote: 'Royal Irrigation Dept. data via ThaiWater · these dams drain down the Chao Phraya through Bangkok', upNone: 'No dam data yet',
    linksBtn: '🔗 Links', linksTitle: '🔗 Follow the situation',
    links: [['Google Flood Hub', 'https://sites.research.google/floods/l/13.75/100.55/9', '7-day river flood forecasts'],
      ['ThaiWater (HII)', 'https://www.thaiwater.net', 'Water levels, rain, radar and national reports'],
      ['iTIC Live', 'https://live.iticfoundation.org/', 'Flooded roads, incidents and CCTV across Bangkok'],
      ['BMA road-flood sensors', 'https://weather.bangkok.go.th/flood/', 'Drainage & Sewerage Dept. (reachable from Thailand)'],
      ['Traffy Fondue', 'https://share.traffy.in.th/teamchadchart', 'Report and track issues with the BMA'],
      ['Thai Meteorological Dept.', 'https://www.tmd.go.th', 'Forecasts and weather warnings']] as [string, string, string][],
    hotlineBtn: '📞 Hotlines', rainBtn: '🌧️ Rain forecast', hotlineTitle: '📞 Emergency hotlines (Thailand)',
    hotlineNote: 'On a phone, tap a number to call.', rainTitle2: '🌧️ Rain forecast — Bangkok & vicinity',
    rainTabFc: 'Forecast', rainTabRadar: 'Radar', rainTabAccu: 'Accumulated', rainNote: 'Data from Windy (ECMWF model) — use the timeline to look ahead.',
    hotlines: [['1784', 'Disaster Prevention (DDPM)'], ['1669', 'Medical emergency'], ['191', 'Police emergency'], ['199', 'Fire / rescue'],
      ['1555', 'Bangkok Metropolitan Administration'], ['1460', 'Royal Irrigation Dept.'], ['1182', 'Thai Meteorological Dept.'], ['1586', 'Dept. of Highways (flooded routes)'], ['1146', 'Dept. of Rural Roads']],
    lyEvents: 'Flood incidents (iTIC/Longdo)', eventsList: 'Flood incidents (iTIC/Longdo)', eventsEmpty: 'No active flood incidents',
    impassable: '🚫 Roads impassable for small cars', impassableTag: 'impassable for small cars', evBy: 'Posted by', evWhen: 'Period', evOpen: 'View on iTIC Live',
    byLabel: { doh: 'DOH staff', itic: 'iTIC staff', public: 'iTIC app user' } as Record<string, string>, events: 'incidents',
    srcEvents: 'Incidents: iTIC / Longdo Event', srcTitle: 'Data sources',
    srcCams: 'Cameras: <a href="https://traffic.longdo.com/cameralist" target="_blank" rel="noopener">Longdo Traffic</a> / iTIC Foundation / DOH',
    srcDistricts: 'District boundaries: <a href="https://github.com/chingchai/OpenGISData-Thailand" target="_blank" rel="noopener">OpenGISData-Thailand</a> (chingchai)', trafficIdx: '🚦 Traffic', trafficTipIdx: 'Bangkok traffic index 0–10 from Longdo Traffic (higher = worse)',
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
const secOpen = (id: string) => openSecs.has(id);
let loaded = false; // false until the first fetch finishes — avoids showing a fake "all clear"
let cameras: Camera[] = [];
let simOn = false;
let simCm = 60;

// ---------------- map ----------------
maplibregl.setWorkerUrl(workerUrl);
const map = new maplibregl.Map({
  container: 'map',
  // Detailed light basemap (roads coloured by class, POIs, transit, land use) — closest to Google Maps.
  style: 'https://tiles.openfreemap.org/styles/liberty',
  center: [100.56, 13.77],
  zoom: 10.6,
  pitch: 45,
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
    btn('rotL', '⟲', () => { setSpin(false); map.easeTo({ bearing: map.getBearing() - 45, duration: 600 }); });
    btn('rotR', '⟳', () => { setSpin(false); map.easeTo({ bearing: map.getBearing() + 45, duration: 600 }); });
    btn('spinBtn', '360°', () => setSpin(!spinning));
    return el;
  },
  onRemove() {},
}, 'bottom-right');
const popup = new maplibregl.Popup({ maxWidth: '300px', focusAfterOpen: false });

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
      'circle-radius': 8, 'circle-color': '#0b1322', 'circle-stroke-width': 4,
      'circle-stroke-color': ['match', ['get', 'situation'], 5, SITUATION_COLORS[5], 4, SITUATION_COLORS[4], 3, SITUATION_COLORS[3], SITUATION_COLORS[1]],
    },
  });
  map.addImage('cam-icon', cameraIcon(), { pixelRatio: 1.4 });
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
  const clickable = ['road', 'events', 'canal', 'cameras', 'reports', 'rain', 'district-fill'];
  map.on('click', (e) => {
    // A few pixels of slack so small markers are easy to hit (especially by finger).
    const box: [maplibregl.PointLike, maplibregl.PointLike] = [[e.point.x - 6, e.point.y - 6], [e.point.x + 6, e.point.y + 6]];
    const f = map.queryRenderedFeatures(box, { layers: clickable.filter((l) => map.getLayoutProperty(l, 'visibility') !== 'none') })[0];
    if (!f) return;
    const i = f.properties.i as number;
    if (f.layer.id === 'road') showRoad(road.items[i]);
    else if (f.layer.id === 'canal') showCanal(canals.items[i]);
    else if (f.layer.id === 'reports') showReport(reports.items[i]);
    else if (f.layer.id === 'rain') showRain(rain.items[i]);
    else if (f.layer.id === 'cameras') showCamera(cameras[i]);
    else if (f.layer.id === 'events') showEvent(events.items[i]);
    else showDistrict(districts.find((d) => d.code === f.id)!, e.lngLat);
  });
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
  // Camera list is static-ish and optional: load once, never block the page on it.
  fetchCameras().then((c) => {
    cameras = c;
    setData('cameras', fc(cameras, (x) => [x.lng, x.lat], () => ({})));
  }).catch((e) => console.warn('camera list unavailable', e));
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
  fetchUpstream().then((v) => { upstream = v; render(); });
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
  for (const r of road.items) findDistrict(r.lng, r.lat)?.road.push(r);
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

  setData('road', fc(road.items, (r) => [r.lng, r.lat], (r) => ({ cm: r.cm, level: r.level })));
  setData('canal', fc(canals.items, (c) => [c.lng, c.lat], (c) => ({ situation: c.situation })));
  setData('rain', fc(rain.items, (r) => [r.lng, r.lat], (r) => ({ mm: r.mm })));
  setData('reports', fc(reports.items, (r) => [r.lng, r.lat], () => ({})));
  setData('events', fc(events.items, (e) => [e.lng, e.lat], (e) => ({ x: e.impassable })));
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

  const flooded = road.items.filter((r) => r.cm > 0).sort((a, b) => b.cm - a.cm);
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
  $('summary').innerHTML = noRoad ? L.summaryNoRoad(rainTxt, reports.items.length) : L.summary({
    pts: flooded.length,
    districts: new Set(flooded.map((r) => findDistrict(r.lng, r.lat)?.code)).size,
    heavy: heavy.length,
    worst: worst ? `<b>${esc(name(worst))}</b>${worstD ? ` (${esc(dName(worstD))})` : ''} <b>${worst.cm} cm</b>` : '',
    rain: rainTxt,
    reports: reports.items.length,
    events: events.items.length,
    impassable: events.items.filter((e) => e.impassable).length,
  });
  const tIdx = $('trafficIdx');
  tIdx.hidden = trafficIdx == null;
  if (trafficIdx != null) {
    tIdx.textContent = `${L.trafficIdx} ${trafficIdx.toFixed(1)}/10`;
    tIdx.style.color = trafficIdx >= 7 ? LEVEL_COLORS[3] : trafficIdx >= 4 ? LEVEL_COLORS[2] : LEVEL_COLORS[0];
  }

  const overBank = canals.items.filter((c) => c.bank != null && c.wl >= c.bank);
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

  html += section('canals', `${L.canals} (${canals.items.length})`,
    [...canals.items].sort((a, b) => b.situation - a.situation).map((c) => `<button class="item" style="--c:${SITUATION_COLORS[c.situation]}" data-canal="${canals.items.indexOf(c)}">
      <div class="t"><span>${esc(name(c))}</span><span>${c.wl.toFixed(2)} m</span></div>
      <div class="s">${L.situation[c.situation] ?? ''}${c.bank != null ? ` · ${L.toBank} ${(c.bank - c.wl).toFixed(2)} m` : ''} · ${hhmm(c.updated)}</div></button>`).join(''));

  if (historyAt == null && upstream && (upstream.dams.length || upstream.c13)) {
    const damColor = (p: number) => (p >= 100 ? LEVEL_COLORS[3] : p >= 80 ? LEVEL_COLORS[2] : LEVEL_COLORS[0]);
    const c13 = upstream.c13 ? `<div class="item" style="--c:var(--accent)"><div class="t"><span>${L.upC13}</span><span>${upstream.c13.discharge.toLocaleString()} ${L.upUnit}</span></div>
      <div class="s">${esc(upstream.c13.time)}</div></div>` : '';
    const dams = upstream.dams.map((d) => `<div class="item" style="--c:${damColor(d.pct)}"><div class="t"><span>${esc(lang === 'th' ? d.th : d.en || d.th)}</span><span>${d.pct.toFixed(0)}%</span></div>
      <div class="s">${L.upDam(d.pct, d.inflow, d.release)} · ${esc(d.date)}</div></div>`).join('');
    html += section('upstream', upstream.c13 ? `${L.upTitle} · ${upstream.c13.discharge.toLocaleString()} ${L.upUnit}` : L.upTitle,
      c13 + (dams || `<div class="empty">${L.upNone}</div>`) + `<div class="empty" style="margin:4px 0 8px">${L.upNote}</div>`);
  }

  // Last, as asked: roads staff reported as impassable for small cars.
  if (impassable.length) html += section('impassable', `${L.impassable} (${impassable.length})`, impassable.map((e) => eventItem(e, 'alert')).join(''));
  $('sideBody').innerHTML = html;

  // Source status (live vs snapshot) — snapshot data must always be labelled.
  const srcs: [string, Result<unknown>][] = [[L.srcRoad, road], [L.srcCanal, canals], [L.srcRain, rain], [L.srcTraffy, reports], [L.srcEvents, events]];
  const srcUrl = new Map<string, string>([
    [L.srcRoad, 'https://weather.bangkok.go.th/flood/'], [L.srcCanal, 'https://www.thaiwater.net'], [L.srcRain, 'https://www.thaiwater.net'],
    [L.srcTraffy, 'https://share.traffy.in.th/teamchadchart'], [L.srcEvents, 'https://live.iticfoundation.org/'],
  ]);
  const link = (n: string) => `<a href="${srcUrl.get(n)}" target="_blank" rel="noopener">${esc(n)}</a>`;
  const asOf = (r: Result<unknown>) => {
    if (!r.asOf) return L.snapshot;
    const mins = Math.max(0, Math.round((Date.now() - Date.parse(r.asOf)) / 60_000));
    return L.asOf(bkkTime(r.asOf), L.agoFmt(Math.floor(mins / 60), mins % 60));
  };
  const status = (r: Result<unknown>) => r.stale ? L.unavailable : historyAt != null ? L.histSrc : r.snapshot ? asOf(r) : r === road && roadVia ? `${L.live} (${L.via})` : L.live;
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
function cameraIcon() {
  const c = document.createElement('canvas');
  c.width = c.height = 28;
  const g = c.getContext('2d')!;
  g.fillStyle = '#0b1322'; g.strokeStyle = '#e8ecf4'; g.lineWidth = 2;
  g.beginPath(); g.roundRect(2, 7, 20, 15, 3); g.fill(); g.stroke();
  g.beginPath(); g.moveTo(22, 12); g.lineTo(27, 9); g.lineTo(27, 20); g.lineTo(22, 17); g.closePath(); g.fillStyle = '#e8ecf4'; g.fill();
  g.beginPath(); g.arc(12, 14.5, 4, 0, Math.PI * 2); g.fillStyle = '#38bdf8'; g.fill();
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
  popup.setLngLat(lngLat).setHTML(`<div class="pop">${html}</div>`).addTo(map);
}
function showRoad(r: RoadFlood, fly = false) {
  const L = t(), d = findDistrict(r.lng, r.lat);
  open([r.lng, r.lat], `<b>${esc(name(r))}</b>` +
    row(L.status, `<span style="color:${LEVEL_COLORS[r.level]}">${lvlName(r.level)}</span>`) +
    (d ? row(L.districtLbl, esc(dName(d))) : '') +
    row(L.waterNow, `${r.cm} cm`) + (r.maxCm != null ? row(L.max, `${r.maxCm} cm`) : '') + (r.start ? row(L.since, hhmm(r.start)) : '') + row(L.updated, hhmm(r.updated)) +
    `<div class="r"><a href="${esc(r.url)}" target="_blank" rel="noopener">${L.detail} ↗</a></div>` + nearCameraRow(r), fly);
}
function showCanal(c: Canal, fly = false) {
  const L = t();
  open([c.lng, c.lat], `<b>${esc(name(c))}</b>` +
    row(L.status, `<span style="color:${SITUATION_COLORS[c.situation]}">${L.situation[c.situation] ?? '-'}</span>`) +
    row(L.waterNow, `${c.wl.toFixed(2)} ${L.msl}`) +
    (c.bank != null ? row(L.bank, `${c.bank.toFixed(2)} ${L.msl}`) + row(L.toBank, `${(c.bank - c.wl).toFixed(2)} m`) : '') +
    row(L.agency, esc(c.agency)) + row(L.updated, hhmm(c.updated)), fly);
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
function showDistrict(d: District, at?: maplibregl.LngLat) {
  const L = t();
  const lvl = simOn ? d.simLevel : d.level;
  const status = lvl < 0 ? L.noSensor : `<span style="color:${LEVEL_COLORS[lvl]}">${lvlName(lvl)}</span>`;
  if (!at) map.fitBounds([[d.bbox[0], d.bbox[1]], [d.bbox[2], d.bbox[3]]], { padding: 60, duration: 1200 });
  const margin = d.elev - simCm;
  open(at ?? [(d.bbox[0] + d.bbox[2]) / 2, (d.bbox[1] + d.bbox[3]) / 2], `<b>${L.district}${esc(dName(d))}</b>` +
    row(L.status, status) + row(L.area, `${d.area.toFixed(1)} km²`) +
    row(L.maxRoad, `${maxCm(d)} cm`) + row(L.pts, String(d.road.filter((r) => r.cm > 0).length)) + row(`${L.reports} (24h)`, String(d.reports)) +
    (d.rainMax ? row(L.rainMax, `${d.rainMax.mm} mm`) : '') +
    row(L.elevSim, `${d.elev} cm`) + (simOn ? row(L.marginSim, `${margin > 0 ? '+' : ''}${Math.round(margin)} cm`) : ''));
}

// ---------------- controls ----------------
function wireControls() {
  const toggle = (id: string, fn: (on: boolean) => void) => {
    const el = $<HTMLInputElement>(id);
    el.addEventListener('change', () => fn(el.checked));
  };
  const setVis = (layers: string[], on: boolean) => layers.forEach((l) => map.setLayoutProperty(l, 'visibility', on ? 'visible' : 'none'));
  toggle('lyRoad', (on) => setVis(['road', 'road-label'], on));
  toggle('lyCanal', (on) => setVis(['canal'], on));
  toggle('lyRain', (on) => setVis(['rain'], on));
  toggle('lyReports', (on) => setVis(['reports'], on));
  toggle('lyCams', (on) => setVis(['cameras'], on));
  toggle('lyEvents', (on) => setVis(['events'], on));
  toggle('lyDistrict', (on) => setVis(['district-fill'], on));
  toggle('lyBuild', (on) => setVis(['buildings-3d'], on));
  toggle('lySat', (on) => setVis(['satellite'], on));
  toggle('lyTerrain', (on) => {
    map.setTerrain(on ? { source: 'terrain', exaggeration: 1.5 } : null);
    $('terrainNote').hidden = !on;
  });

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
  $('hotlineList').innerHTML = L.hotlines.map(([n, who]) => `<li><span>${esc(who)}</span><a href="tel:${n}">${n}</a></li>`).join('');
  $('trafficBtn').title = L.trafficTip;
  document.querySelector('.layers summary')!.innerHTML = `${esc(L.layers)} <small>— ${esc(L.layersHint)}</small>`;
  $('trafficIdx').title = L.trafficTipIdx;
  for (const id of ['rotL', 'rotR', 'spinBtn'] as const) {
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
  $('linksBtn').addEventListener('click', () => $<HTMLDialogElement>('linksDlg').showModal());
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
