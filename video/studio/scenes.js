// Bangkok Flood Watch 3D — data video (Thai / English via lang.js). Built only from kit.js components; colours come from palette.css.
// One series slot for the whole video: every bar = --series-1. Status colours only for state, always icon + label.
const {D,L,C,put,seg,eo,fmt,el,header,src,statTile,barList,status,TH}=K;
const cm=m=>Math.round(Math.abs(m)*100);
// Every time shown in Bangkok time: ISO strings with Z are shifted +7 h; ThaiWater/BMA strings already are local.
// Thai shows Buddhist-era years.
const at=s=>{if(!s)return '';let x=String(s);if(/Z$/.test(x))x=new Date(Date.parse(x)+7*3600e3).toISOString();x=x.replace('T',' ');
  const y=TH?+x.slice(0,4)+543:x.slice(0,4);return `${x.slice(8,10)}/${x.slice(5,7)}/${y} ${x.slice(11,16)}`.trim();};
const flagStyle='class="status" style="font-size:30px;font-weight:400;margin-left:12px"';
const short=p=>p==='Phra Nakhon Si Ayutthaya'?'Ayutthaya':p==='พระนครศรีอยุธยา'?'อยุธยา':p;
const prov=p=>short(TH?p.th:p.en);

// s1 — title (no data)
K.scene('s1',(s,on)=>{const t0=D.sources.road.at;
  const k=el(s,L('สรุปสถานการณ์น้ำ','LIVE FLOOD BRIEF'),'left:72px;top:520px','kick');
  const a=el(s,L('น้ำท่วม','Bangkok'),'left:72px;top:600px','h1'), b=el(s,L('กรุงเทพฯ','Flood Watch'),'left:72px;top:790px','h1');
  const c=el(s,`<span class="chip">${K.date(t0)} · ${t0.slice(11,16)}${L(' น.','')}</span>`,'left:72px;top:1020px');
  const tg=el(s,L(['ถนน','คลอง','แม่น้ำ','เขื่อน','ทั่วประเทศ','ทางหลวง'],['Streets','Canals','River','Dams','Provinces','Highways']).map(x=>`<span class="txt" style="border:1px solid var(--grid);border-radius:999px;padding:6px 26px;margin:0 12px 14px 0;display:inline-block">${x}</span>`).join(''),'left:72px;top:1180px;width:936px');
  on((t,a0,b0)=>{put(k,t,a0+0.1,b0);put(a,t,a0+0.25,b0,90);put(b,t,a0+0.55,b0,90);put(c,t,C('s1','date'),b0,40);put(tg,t,C('s1','date')+0.6,b0,30);});
});

// s2 — Bangkok streets: two headline counts -> KPI stat tiles; the deepest point as a card
K.scene('s2',(s,on)=>{const R=D.road,T=R.top[0];
  const [k,h]=header(s,L('01 · ถนน','01 · STREETS'),L('น้ำท่วมถนนในกรุงเทพฯ','Road flooding in Bangkok'));
  const n=statTile(s,{label:L('เซนเซอร์ถนนที่พบน้ำ','Road sensors showing water'),value:R.flooded,unit:L(`จาก ${fmt(R.sensors)} จุด`,`of ${fmt(R.sensors)}`),top:480});
  const deep=T?el(s,`<div class="lbl">${L(`ลึกสุด ${Math.round(T.cm)} ซม. · เขต${T.districtTh||''}`,`Deepest: ${Math.round(T.cm)} cm · ${T.district||''}`)}</div><div class="txt sub">${T.th}</div>`,'left:72px;top:820px;width:936px','card'):null;
  const sev=statTile(s,{label:L('ลึกตั้งแต่ 20 ซม.','At 20 cm or more'),value:R.severe,unit:L('จุด','sensors'),top:1060,big:false});
  const sr=src(s,L(`ที่มา: เซนเซอร์ถนน สำนักการระบายน้ำ กทม. · ${at(D.sources.road.at)} · ไม่นับเซนเซอร์ที่ค่าค้าง`,`Source: ${D.sources.road.name} · ${at(D.sources.road.at)} · stuck sensors left out`),1420);
  on((t,a,b)=>{put(k,t,a,b);put(h,t,a,b);put(n.el,t,C('s2','n')-0.3,b,80);n.count(eo(seg(t,C('s2','n')+0.3,C('s2','n')+1.6)));
    if(deep)put(deep,t,C('s2','top')-0.3,b,60);put(sev.el,t,C('s2','sev')-0.3,b,60);sev.count(1);put(sr,t,C('s2','sev')+0.4,b,30);});
});

// s3 — canals vs their banks: a count -> stat tile; the gauges close to the bank -> status list (state = near bank)
K.scene('s3',(s,on)=>{const N=D.canal,near=N.top.filter(c=>c.margin<0&&c.margin>-0.3);
  const [k,h]=header(s,L('02 · คลอง','02 · CANALS'),L('ระดับน้ำคลองเทียบตลิ่ง','Canal water vs the bank'));
  const o=statTile(s,{label:L('จุดวัดในคลองที่น้ำล้นตลิ่ง','Canal gauges over the bank'),value:N.over,unit:L(`จาก ${N.gauges} จุดที่มีระดับตลิ่ง`,`of ${N.gauges} with a bank level`),top:480});
  const list=el(s,near.map(c=>`<div class="row"><span>${status('warning',TH?(c.districtTh?'เขต'+c.districtTh:c.th):(c.district||c.en))}</span><span class="num">${L(`ต่ำกว่าตลิ่ง ${cm(c.margin)} ซม.`,`${cm(c.margin)} cm below`)}</span></div>`).join(''),'left:72px;top:880px;width:936px');
  const cap=el(s,L('ห่างตลิ่งไม่ถึง 30 ซม.','Within 30 cm of the bank'),'left:72px;top:812px','txt');
  const sr=src(s,L(`ที่มา: จุดวัดน้ำ กทม. / สสน. ผ่าน ThaiWater · ${at(D.sources.canal.at)} · ตลิ่ง = ระดับตลิ่งของแต่ละสถานี`,`Source: ${D.sources.canal.name} · ${at(D.sources.canal.at)} · bank = each gauge's bank level`),1300);
  on((t,a,b)=>{put(k,t,a,b);put(h,t,a,b);put(o.el,t,C('s3','over')-0.3,b,80);o.count(1);
    if(near.length){put(cap,t,C('s3','near')-0.3,b,40);put(list,t,C('s3','near'),b,40);}else{cap.style.opacity=0;list.style.opacity=0;}
    put(sr,t,(near.length?C('s3','near'):C('s3','over'))+0.5,b,30);});
});

// s4 — Chao Phraya: gauges over the bank, compared by how far over -> bar list (one series), status flag on label;
// Bangkok's reference gauge as a stat tile
K.scene('s4',(s,on)=>{const V=D.river,over=V.gauges.filter(g=>g.margin!=null&&g.margin>=0).sort((a,b)=>b.margin-a.margin);
  const [k,h]=header(s,L('03 · เจ้าพระยา','03 · CHAO PHRAYA'),L(`ล้นตลิ่ง ${over.length} จาก ${V.gauges.length} สถานี`,`${over.length} of ${V.gauges.length} gauges over the bank`));
  const bl=barList(s,{items:over.map(g=>({label:TH?`${g.th} · ${g.provTh}`:`${g.en} · ${short(g.prov)}`,value:cm(g.margin)})),top:500,barW:620,unit:L('ซม. เกินตลิ่ง','cm over'),
    flag:()=>status('critical',L('ล้นตลิ่ง','over bank')).replace('class="status"',flagStyle)});
  const ss=statTile(s,{label:L('สามเสน กรุงเทพฯ — ยังห่างตลิ่ง','Samsen, Bangkok — room to the bank'),value:V.samsen!=null?cm(V.samsen):0,unit:L('ซม.','cm'),top:520+112*over.length+60,big:false});
  const sr=src(s,L(`ที่มา: สถานีวัดน้ำ กรมชลประทาน / สสน. ผ่าน ThaiWater · ${at(D.sources.river.at)} · 16 สถานีหลัก นครสวรรค์ → กรุงเทพฯ`,`Source: ${D.sources.river.name} · ${at(D.sources.river.at)} · 16 main-stem gauges, Nakhon Sawan → Bangkok`),1420);
  on((t,a,b)=>{put(k,t,a,b);put(h,t,a,b);put(bl.el,t,C('s4','over'),b,60);over.forEach((_,i)=>bl.grow(i,eo(seg(t,C('s4','worst')+i*0.25,C('s4','worst')+1.2+i*0.25))));
    if(V.samsen!=null&&V.samsen<0){put(ss.el,t,C('s4','bkk')-0.3,b,60);ss.count(eo(seg(t,C('s4','bkk')+0.3,C('s4','bkk')+1.6)));}else ss.el.style.opacity=0;
    put(sr,t,C('s4','bkk')+0.4,b,30);});
});

// s5 — dams: each dam vs its capacity -> bar list with a 100% reference line, status flag when full; outflow -> stat tile
K.scene('s5',(s,on)=>{const M=D.dams;
  const [k,h]=header(s,L('04 · ต้นน้ำ','04 · UPSTREAM'),L('เขื่อนในลุ่มเจ้าพระยา','Chao Phraya basin dams'));
  const bl=barList(s,{items:M.map(x=>({label:TH?'เขื่อน'+x.th:x.en,value:x.pct})),top:480,max:110,refLine:100,barW:640,valueFmt:v=>v.toFixed(0)+'%',
    flag:x=>x.value>=100?status('warning',L('เต็มความจุ','full')).replace('class="status"',flagStyle):''});
  const c=statTile(s,{label:L('เขื่อนเจ้าพระยา ระบายน้ำ','Chao Phraya Dam release'),value:D.river.c13||0,unit:L('ลบ.ม./วินาที','m³/s'),top:1000,big:false});
  const sr=src(s,L(`ที่มา: รายงานเขื่อน กรมชลประทาน ผ่าน ThaiWater · ${at(D.sources.dams.at)} · อัตราระบายที่สถานี C.13 ${at(D.sources.river.at)}`,`Source: ${D.sources.dams.name} · ${at(D.sources.dams.at)} · release at gauge C.13, ${at(D.sources.river.at)}`),1340);
  on((t,a,b)=>{put(k,t,a,b);put(h,t,a,b);put(bl.el,t,C('s5','top')-0.3,b,60);M.forEach((_,i)=>bl.grow(i,eo(seg(t,C('s5','top')+i*0.2,C('s5','top')+1.2+i*0.2))));
    if(D.river.c13){put(c.el,t,C('s5','c13')-0.3,b,60);c.count(eo(seg(t,C('s5','c13')+0.3,C('s5','c13')+1.8)));}else c.el.style.opacity=0;
    put(sr,t,(D.river.c13?C('s5','c13'):C('s5','rest'))+0.5,b,30);});
});

// s6 — provinces: compare counts of over-bank gauges -> bar list (one series, top 5)
K.scene('s6',(s,on)=>{const P=D.provinces;
  const [k,h]=header(s,L('05 · ทั่วประเทศ','05 · NATIONWIDE'),L(`ล้นตลิ่ง ${P.over} สถานี`,`${P.over} gauges over the bank`));
  const sub=el(s,L(`ใน ${P.count} จังหวัด · 5 อันดับแรก`,`in ${P.count} provinces · top 5`),'left:72px;top:390px','txt');
  const bl=barList(s,{items:P.top.map(p=>({label:prov(p),value:p.over})),top:500,barW:620,unit:L('สถานี','gauges')});
  const sr=src(s,L(`ที่มา: สถานีโทรมาตร สสน. ผ่าน ThaiWater · ${at(D.sources.provinces.at)}`,`Source: ${D.sources.provinces.name} · ${at(D.sources.provinces.at)}`),1180);
  on((t,a,b)=>{put(k,t,a,b);put(h,t,C('s6','n')-0.3,b);put(sub,t,C('s6','n'),b,30);put(bl.el,t,C('s6','n')+0.3,b,60);
    P.top.forEach((_,i)=>bl.grow(i,eo(seg(t,C('s6','n')+0.6+i*0.15,C('s6','n')+1.8+i*0.15))));put(sr,t,C('s6','top')+0.4,b,30);});
});

// s7 — highways: two headline counts -> stat tiles; where -> bar list (one series)
K.scene('s7',(s,on)=>{const H=D.highways;
  const [k,h]=header(s,L('06 · ทางหลวง','06 · HIGHWAYS'),L('ทางหลวงน้ำท่วม','Flooded highway sections'));
  const n=statTile(s,{label:L('ช่วงที่รายงานว่าน้ำท่วม','Sections reported flooded'),value:H.total,top:470,big:false});
  const x=el(s,`<div class="mid">${H.impassable}</div><div class="txt">${status('critical',L('รถเล็กผ่านไม่ได้','impassable for small cars'))}</div>`,'left:72px;top:740px;width:936px','card');
  const bl=barList(s,{items:H.top.slice(0,4).map(p=>({label:prov(p),value:p.n})),top:1030,barW:620,unit:L('ช่วง','sections')});
  const sr=src(s,L(`ที่มา: กรมทางหลวง (HDMS) · ${at(D.sources.highways.at)}`,`Source: ${D.sources.highways.name} · ${at(D.sources.highways.at)}`),1500);
  on((t,a,b)=>{put(k,t,a,b);put(h,t,a,b);put(n.el,t,C('s7','n')-0.3,b,60);n.count(eo(seg(t,C('s7','n')+0.4,C('s7','n')+1.8)));
    put(x,t,C('s7','x')-0.3,b,60);put(bl.el,t,C('s7','top')-0.3,b,60);H.top.slice(0,4).forEach((_,i)=>bl.grow(i,eo(seg(t,C('s7','top')+i*0.15,C('s7','top')+1.2+i*0.15))));
    put(sr,t,C('s7','top')+0.4,b,30);});
});

// s8 — end card (no data)
K.scene('s8',(s,on)=>{
  const a=el(s,L('แผนที่สด','Live map'),'left:72px;top:640px','kick'), b=el(s,'bangkokflood<br>.netlify.app','left:72px;top:720px;width:936px','h2');
  const c=el(s,L('อัปเดตทุก 10 นาที · ฟรี · ไม่ต้องสมัคร','Updated every 10 minutes · free · no sign-up'),'left:72px;top:960px','txt');
  const d=el(s,L('ข้อมูล: กทม., สสน./ThaiWater, กรมชลประทาน, กรมทางหลวง · ค่าที่แสดงคือค่าที่เซนเซอร์รายงาน เซนเซอร์ที่ไม่เจอน้ำไม่ได้แปลว่าถนนแห้งทั้งเส้น · เวลาทั้งหมดเป็นเวลาประเทศไทย',
    'Data: BMA, HII/ThaiWater, RID, Dept. of Highways. Readings are what each sensor reported; a quiet sensor is not proof a street is dry. All times are Bangkok time.'),'left:72px;top:1120px;width:936px','src');
  on((t,a0,b0)=>{put(a,t,a0+0.1,b0+1);put(b,t,a0+0.3,b0+1,60);put(c,t,a0+0.8,b0+1,40);put(d,t,a0+1.4,b0+1,30);});
});
