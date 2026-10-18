"""data.js -> script.json for the data-video-studio tts.py (English or Thai).
usage: python video/make_script.py video/studio/data.js video/out/script.json <skill scripts dir> [en|th]
`say` spells numbers out for the voice, `show` keeps digits for the subtitles. Every number comes from data.js;
the sentences branch on the data (e.g. "none is over its bank") so a quiet day reads as a quiet day."""
import json, sys
DATA, OUT, SK = sys.argv[1:4]
LANG = sys.argv[4] if len(sys.argv) > 4 else 'en'
sys.path.insert(0, SK)
from numwords import en_int, en_ord, th_int

D = json.loads(open(DATA, encoding='utf-8').read()[len('window.DATA='):-1])
R, CN, RV, DM, PV, HW = D['road'], D['canal'], D['river'], D['dams'], D['provinces'], D['highways']
MONTHS = ['', 'January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
y, m, d = (int(x) for x in D['sources']['road']['at'][:10].split('-'))
hh, mm = (int(x) for x in D['sources']['road']['at'][11:16].split(':'))
cap = lambda s: s[:1].upper() + s[1:]
cm = lambda metres: round(abs(metres) * 100)
and_list = lambda xs: xs[0] if len(xs) == 1 else ', '.join(xs[:-1]) + ' and ' + xs[-1]
short = lambda p: 'Ayutthaya' if p == 'Phra Nakhon Si Ayutthaya' else p


def lines(N, disp):
    n = lambda v: N(v)
    ampm = 'in the morning' if hh < 12 else 'in the afternoon' if hh < 18 else 'in the evening'
    clock = f'{hh:02d}:{mm:02d}' if disp else (f'{n(hh % 12 or 12)} {n(mm)} {ampm}' if mm else f'{n(hh % 12 or 12)} o\'clock {ampm}')
    # s2 — streets
    top = R['top'][0] if R['top'] else None
    s2 = [('h', 'First, the streets of Bangkok.')]
    if R['flooded'] == 0:
        s2 += [('n', f'None of the {n(R["sensors"])} road sensors shows water.')]
    else:
        s2 += [('n', f'{"Just one" if R["flooded"] == 1 else cap(n(R["flooded"]))} of {n(R["sensors"])} road sensors {"shows" if R["flooded"] == 1 else "show"} water.'),
               ('top', f'The deepest is {n(round(top["cm"]))} {"cm" if disp else "centimetres"}, in {top["district"]}.')]
    s2 += [('sev', 'None is at twenty centimetres or more.' if R['severe'] == 0 and not disp else 'None is at 20 cm or more.' if R['severe'] == 0
            else f'{cap(n(R["severe"]))} {"is" if R["severe"] == 1 else "are"} at {n(20)} {"cm" if disp else "centimetres"} or more.')]
    # s3 — canals
    near = [c for c in CN['top'] if -0.3 < c['margin'] < 0]
    s3 = [('h', 'The canals.'),
          ('over', 'No canal gauge is over its bank.' if CN['over'] == 0 else f'{cap(n(CN["over"]))} canal {"gauge is" if CN["over"] == 1 else "gauges are"} over the bank.')]
    if near:
        s3 += [('near', f'{cap(n(len(near)))} {"is" if len(near) == 1 else "are"} within {n(30)} {"cm" if disp else "centimetres"} of it, in {and_list([c["district"] for c in near if c["district"]])}.')]
    # s4 — Chao Phraya
    over = [g for g in RV['gauges'] if g['margin'] is not None and g['margin'] >= 0]
    worst = max(over, key=lambda g: g['margin']) if over else None
    unit = 'cm' if disp else 'centimetres'
    s4 = [('h', 'The Chao Phraya river.'),
          ('over', f'{cap(n(len(over)))} of {n(len(RV["gauges"]))} gauges are over their banks.' if over else f'All {n(len(RV["gauges"]))} gauges are below their banks.')]
    if worst:
        s4 += [('worst', f'The highest is at {worst["en"]}, {short(worst["prov"])}: {n(cm(worst["margin"]))} {unit} over.')]
    if RV['samsen'] is not None:
        s4 += [('bkk', f'In Bangkok, Samsen has {n(cm(RV["samsen"]))} {unit} to spare.' if RV['samsen'] < 0 else f'In Bangkok, Samsen is {n(cm(RV["samsen"]))} {unit} over its bank.')]
    # s5 — dams
    full = [x for x in DM if x['pct'] >= 100]
    pct = (lambda v: f'{round(v)}%') if disp else (lambda v: f'{n(round(v))} percent')
    s5 = [('h', 'Upstream, the four big dams.'),
          ('top', f'{and_list([x["en"] for x in full])} {"is" if len(full) == 1 else "are"} full.' if full else f'The fullest is {DM[0]["en"]}, at {pct(DM[0]["pct"])}.'),
          ('rest', f'The others are between {pct(min(x["pct"] for x in DM))} and {pct(max(x["pct"] for x in DM if x["pct"] < 100))}.')]
    if RV['c13'] is not None:
        s5 += [('c13', f'The Chao Phraya Dam is releasing {n(round(RV["c13"]))} {"m³/s" if disp else "cubic metres a second"}.')]
    # s6 — provinces
    t1 = PV['top'][0]
    s6 = [('h', 'Across the country,'),
          ('n', f'{n(PV["over"])} river gauges are over their banks, in {n(PV["count"])} provinces.'),
          ('top', f'{short(t1["en"])} has the most: {n(t1["over"])}.')]
    # s7 — highways
    tops = [h for h in HW['top'] if h['n'] == HW['top'][0]['n']] if HW['top'] else []
    s7 = [('h', 'Highways.'),
          ('n', f'The Department of Highways reports {n(HW["total"])} flooded sections.'),
          ('x', f'{cap(n(HW["impassable"]))} are impassable for small cars.' if HW['impassable'] else 'All are still passable.'),
          ('top', f'Most are in {and_list([short(h["en"]) for h in tops])}.')] if HW['fresh'] and HW['total'] else \
         [('h', 'Highways.'), ('n', 'No current highway reports.')]
    return {
        's1': [('title', 'Bangkok Flood Watch.'), ('date', f'{d} {MONTHS[m][:3]} {y} · {clock}' if disp else f'{MONTHS[m]} {en_ord(d)}, {n(y)}, at {clock}.')],
        's2': s2, 's3': s3, 's4': s4, 's5': s5, 's6': s6, 's7': s7,
        's8': [('end', 'The live map updates every ten minutes, at bangkokflood.netlify.app.' if disp else 'The live map updates every ten minutes, at bangkok flood dot netlify dot app.')],
    }


SAY = {'Ayutthaya': 'Ayuttaya', 'Ban Pom': 'Bahn Pom', 'Bang Pa-in': 'Bahng Pa-in', 'Samsen': 'Sahm-sen', 'Sai Mai': 'Sai My',
       'Lat Krabang': 'Laht Kra-bahng', 'Suan Luang': 'Soo-an Loo-ang', 'Pa Sak Jorasit': 'Pah Sahk Chola-sit', 'Sirikit': 'Siri-kit',
       'Bhumibol': 'Poo-mee-pon', 'Kheaw Noi': 'Kwae Noy', 'Prachin Buri': 'Pra-chin Boo-ree', 'Pathum Thani': 'Pa-toom Ta-nee',
       'Chao Phraya': 'Chow Pra-ya', 'Nonthaburi': 'Non-ta-boo-ree', 'Nuanchawee': 'Noo-an-cha-wee'}
TH_MONTHS = ['', 'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน', 'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม']
short_th = lambda p: 'อยุธยา' if p == 'พระนครศรีอยุธยา' else p
th_list = lambda xs: xs[0] if len(xs) == 1 else ' '.join(xs[:-1]) + ' และ' + xs[-1]


def thai(N, disp):
    unit = 'ซม.' if disp else 'เซนติเมตร'
    pct = (lambda v: f'{round(v)}%') if disp else (lambda v: f'{N(round(v))} เปอร์เซ็นต์')
    clock = f'{hh:02d}.{mm:02d} น.' if disp else f'{N(hh)} นาฬิกา' + (f' {N(mm)} นาที' if mm else '')
    top = R['top'][0] if R['top'] else None
    s2 = [('h', 'เริ่มที่ถนนในกรุงเทพฯ')]
    s2 += [('n', f'เซนเซอร์ถนน {N(R["sensors"])} จุด ' + ('ไม่พบน้ำท่วมขัง' if R['flooded'] == 0 else f'พบน้ำท่วมขัง {N(R["flooded"])} จุด'))]
    if top:
        s2 += [('top', f'ลึกสุด {N(round(top["cm"]))} {unit} ที่เขต{top["districtTh"]}')]
    s2 += [('sev', f'ยังไม่มีจุดที่ลึกถึง {N(20)} {unit}' if R['severe'] == 0 else f'ลึกตั้งแต่ {N(20)} {unit} ขึ้นไป {N(R["severe"])} จุด')]
    near = [c for c in CN['top'] if -0.3 < c['margin'] < 0]
    s3 = [('h', 'ต่อด้วยคลอง'), ('over', 'ยังไม่มีจุดวัดในคลองที่น้ำล้นตลิ่ง' if CN['over'] == 0 else f'น้ำล้นตลิ่งแล้ว {N(CN["over"])} จุด')]
    if near:
        s3 += [('near', f'อีก {N(len(near))} จุด ห่างตลิ่งไม่ถึง {N(30)} {unit} ที่' + th_list([c['districtTh'] or c['th'] for c in near]))]
    over = [g for g in RV['gauges'] if g['margin'] is not None and g['margin'] >= 0]
    worst = max(over, key=lambda g: g['margin']) if over else None
    s4 = [('h', 'แม่น้ำเจ้าพระยา'),
          ('over', f'สถานีวัดน้ำ {N(len(over))} จาก {N(len(RV["gauges"]))} แห่ง น้ำล้นตลิ่ง' if over else f'ทั้ง {N(len(RV["gauges"]))} สถานี ยังต่ำกว่าตลิ่ง')]
    if worst:
        s4 += [('worst', f'สูงสุดที่{worst["th"]} {worst["provTh"]} เกินตลิ่ง {N(cm(worst["margin"]))} {unit}')]
    if RV['samsen'] is not None:
        s4 += [('bkk', f'ส่วนที่สามเสน กรุงเทพฯ ยังต่ำกว่าตลิ่ง {N(cm(RV["samsen"]))} {unit}' if RV['samsen'] < 0 else f'ส่วนที่สามเสน กรุงเทพฯ น้ำเกินตลิ่ง {N(cm(RV["samsen"]))} {unit}')]
    full = [x for x in DM if x['pct'] >= 100]
    s5 = [('h', 'เขื่อนใหญ่ทางเหนือ สี่แห่ง'),
          ('top', f'เขื่อน{th_list([x["th"] for x in full])} น้ำเต็มความจุแล้ว' if full else f'มากสุดคือเขื่อน{DM[0]["th"]} {pct(DM[0]["pct"])}'),
          ('rest', f'เขื่อนอื่นอยู่ที่ {pct(min(x["pct"] for x in DM))} ถึง {pct(max(x["pct"] for x in DM if x["pct"] < 100))}')]
    if RV['c13'] is not None:
        s5 += [('c13', f'เขื่อนเจ้าพระยา ระบายน้ำ {N(round(RV["c13"]))} ' + ('ลบ.ม./วินาที' if disp else 'ลูกบาศก์เมตรต่อวินาที'))]
    t1 = PV['top'][0]
    s6 = [('h', 'ภาพรวมทั้งประเทศ'), ('n', f'สถานีวัดน้ำล้นตลิ่ง {N(PV["over"])} แห่ง ใน {N(PV["count"])} จังหวัด'),
          ('top', f'มากสุดคือ{short_th(t1["th"])} {N(t1["over"])} แห่ง')]
    tops = [h for h in HW['top'] if h['n'] == HW['top'][0]['n']] if HW['top'] else []
    s7 = [('h', 'ทางหลวง'), ('n', f'กรมทางหลวงรายงานน้ำท่วม {N(HW["total"])} ช่วง'),
          ('x', f'รถเล็กผ่านไม่ได้ {N(HW["impassable"])} ช่วง' if HW['impassable'] else 'ทุกช่วงยังผ่านได้'),
          ('top', 'ส่วนใหญ่อยู่ที่' + th_list([short_th(h['th']) for h in tops]))] if HW['fresh'] and HW['total'] else [('h', 'ทางหลวง'), ('n', 'ยังไม่มีรายงานล่าสุด')]
    return {
        's1': [('title', 'สถานการณ์น้ำท่วม กรุงเทพฯ'), ('date', f'ข้อมูลวันที่ {N(d)} {TH_MONTHS[m]} {N(y + 543) if not disp else y + 543} เวลา {clock}')],
        's2': s2, 's3': s3, 's4': s4, 's5': s5, 's6': s6, 's7': s7,
        's8': [('end', 'ดูแผนที่สด อัปเดตทุก 10 นาที ที่ bangkokflood.netlify.app' if disp else 'ดูแผนที่สด อัปเดตทุกสิบนาที ได้ที่ แบงค็อกฟลัด ดอท เน็ตลิฟาย ดอท แอป')],
    }


SAY_TH = {'กรุงเทพฯ': 'กรุงเทพ', 'ป่าสักชลสิทธิ์': 'ป่าสักชนละสิด', 'สิริกิติ์': 'สิริกิด', 'แควน้อยบำรุงแดน': 'แควน้อยบำรุงแดน'}
fmt = lambda v: f'{int(v):,}'
if LANG == 'th':
    say, show, SAYMAP, SPEED = thai(th_int, False), thai(fmt, True), SAY_TH, 1.12
else:
    say, show, SAYMAP, SPEED = lines(en_int, False), lines(fmt, True), SAY, 1.0
out = {'lang': LANG, 'speed': SPEED, 'voice': 1, 'say_map': SAYMAP,
       'scenes': {k: [{'cue': c, 'say': p, 'show': q} for (c, p), (_, q) in zip(v, show[k])] for k, v in say.items()}}
json.dump(out, open(OUT, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
for k, v in out['scenes'].items():
    for x in v: print(k, x['cue'], '|', x['show'])
