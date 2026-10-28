// 기기 화면 미리보기 렌더러 (설정 페이지용). 원본: firmware/tools/web/preview.js → tools/gen_launcher.py 가 launcher/settings-*.html 에 넣는다.
// 기기는 SPI MISO 가 없어 화면을 캡처할 수 없다. 대신 /api/state 의 실제 종목·가격·등락률·시각으로 각 레이아웃을 240x240 캔버스에 그린다.
// 글꼴은 기기와 같은 비트맵 폰트를 쓴다: fonts/tft.json (TFT_eSPI Font1/2/4/7 + FreeSansBold 12/18/24, tools/gen_webfonts.py) 와
// fonts/ko24.bin · ko14.bin (기기 LittleFS 와 같은 파일). 폰트를 받기 전에는 브라우저 폰트로 비슷하게 그리고, 받으면 PREVIEW.onReady 로 다시 그린다.
// 사용: PREVIEW.draw(canvas, layoutId, state)  — state 는 /api/state JSON. canvas 크기는 자유(240 기준으로 scale).
window.PREVIEW=(()=>{
if(!CanvasRenderingContext2D.prototype.roundRect)CanvasRenderingContext2D.prototype.roundRect=function(x,y,w,h){this.rect(x,y,w,h);};
const C={bg:"#000",title:"#F0D420",accent:"#F09410",dim:"#686868",frame:"#386868",text:"#B8BCB8",white:"#fff",box:"#E8D830",boxTxt:"#202020",
  tag:"#28282C",bar:"#202020",amber:"#F8D800",amberDim:"#907C00",ring:"#383C38",rule:"#404040"};
const KR={up:"#F05858",down:"#48ACF8"},GL={up:"#28FC30",down:"#F03430"};
const MON=["JAN","FEB","MAR","APR","MAY","JUN","JUL","AUG","SEP","OCT","NOV","DEC"],WD=["SUN","MON","TUE","WED","THU","FRI","SAT"];

// ---- 기기 비트맵 폰트 ----
// 키: f1(GLCD 6x8) f2(16px) f4(26px) f7(7세그 48px) f7t(f7, 숫자 30·콜론 10 조인 간격 = 펌웨어 drawBigTime) b12/b18/b24(FreeSansBold) ko24/ko14(한글)
const BF={};            // key → {h, asc, g:{ch:{w,hh,adv,xo,yo,bits:Uint8Array}}}
const FALLBACK={f1:'500 9px -apple-system,sans-serif',f2:'600 13px -apple-system,"Apple SD Gothic Neo",sans-serif',f4:'700 22px -apple-system,sans-serif',
  f7:'700 46px "Menlo","Consolas","Courier New",monospace',f7t:'700 42px "Menlo","Consolas","Courier New",monospace',b12:'700 16px -apple-system,sans-serif',
  b18:'700 24px -apple-system,sans-serif',b24:'700 32px -apple-system,sans-serif',ko24:'700 20px -apple-system,"Apple SD Gothic Neo",sans-serif',ko14:'700 12px -apple-system,"Apple SD Gothic Neo",sans-serif'};
const readyCbs=[];let fontsReady=false;
function b64(s){const bin=atob(s),a=new Uint8Array(bin.length);for(let i=0;i<bin.length;i++)a[i]=bin.charCodeAt(i);return a;}
function parseKo(buf,key){const d=new DataView(buf),u=new Uint8Array(buf);if(u[0]!==67||u[1]!==84||u[2]!==75||u[3]!==70)return;   // "CTKF"
  const cell=u[5],bmpW=u[6],gb=u[7],count=d.getUint16(8,true),idx=16,bmp=16+count*4,g={};
  for(let i=0;i<count;i++){const cp=d.getUint16(idx+i*4,true),adv=u[idx+i*4+2];g[String.fromCharCode(cp)]={w:bmpW,hh:cell,adv,xo:0,yo:0,bits:u.subarray(bmp+i*gb,bmp+(i+1)*gb)};}
  BF[key]={h:cell,asc:0,g};}
(async()=>{
  try{const j=await (await fetch("fonts/tft.json?v=b9",{cache:"force-cache"})   /* ?v: 글꼴을 더하면 바꾼다 (force-cache 가 옛 파일을 계속 쓴다) */).json();
    for(const k in j){const f=j[k],g={};for(const ch in f.g){const q=f.g[ch];g[ch]={w:q.w,hh:q.hh,adv:q.adv,xo:q.xo,yo:q.yo,bits:q.b?b64(q.b):new Uint8Array(0)};}BF[k]={h:f.h,asc:f.asc||0,g};}
    BF.f7t=BF.f7;}catch(e){}
  try{const [a,b]=await Promise.all([fetch("fonts/ko24.bin",{cache:"force-cache"}).then(r=>r.arrayBuffer()),fetch("fonts/ko14.bin",{cache:"force-cache"}).then(r=>r.arrayBuffer())]);parseKo(a,"ko24");parseKo(b,"ko14");}catch(e){}
  fontsReady=!!BF.f2;readyCbs.forEach(cb=>{try{cb();}catch(e){}});
})();
const pathCache=new Map();
function glyphPath(font,key,q){const ck=key+"\u0001"+font;let p=pathCache.get(ck);if(p)return p;p=new Path2D();const bpr=(q.w+7)>>3;
  for(let r=0;r<q.hh;r++){let run=-1;for(let c=0;c<=q.w;c++){const on=c<q.w&&(q.bits[r*bpr+(c>>3)]>>(7-(c&7)))&1;if(on&&run<0)run=c;else if(!on&&run>=0){p.rect(run,r,c-run,1);run=-1;}}}
  pathCache.set(ck,p);return p;}
const isAscii=t=>/^[\x00-\x7F]*$/.test(t);
function pick(font,t){if(isAscii(t))return font;return (font==="f1"||font==="f2"||font==="f4"||font==="ko14")?"ko14":"ko24";}   // 한글은 기기처럼 한글 폰트로
function adv(font,ch,q){if(font==="f7t")return ch===":"?10:30;return q.adv;}
function tw(t,font){font=pick(font,t);const f=BF[font];if(!f)return null;let w=0;for(const ch of t){const q=f.g[ch]||f.g["?"];if(q)w+=adv(font,ch,q);else w+=f.h>>1;}return w;}
// 기기 TL datum: 비트맵 폰트는 py 가 셀 위, GFX 는 py+asc 가 기준선, 글리프 top = py+asc+yo
function text(x,t,px,py,font,color,align){t=String(t==null?"":t);const fk=pick(font,t),f=BF[fk];
  if(!f){x.font=FALLBACK[fk]||FALLBACK.f2;x.fillStyle=color;x.textAlign=align||"left";x.textBaseline="top";x.fillText(t,px,py);return;}
  const w=tw(t,fk);let cx=align==="center"?px-w/2:align==="right"?px-w:px;cx=Math.round(cx);x.fillStyle=color;
  for(const ch of t){const q=f.g[ch]||f.g["?"];if(!q){cx+=f.h>>1;continue;}
    if(q.bits.length){x.save();x.translate(cx+q.xo,py+f.asc+q.yo);x.fill(glyphPath(fk,ch,q));x.restore();}cx+=adv(fk,ch,q);}}
function measure(x,t,font){const w=tw(t,font);if(w!=null)return w;x.font=FALLBACK[pick(font,t)]||FALLBACK.f2;return x.measureText(String(t)).width;}
function fitEll(x,t,font,maxW){t=String(t);if(measure(x,t,font)<=maxW)return t;while(t.length>1&&measure(x,t+"…",font)>maxW)t=t.slice(0,-1);return t+"…";}

function money(sl,variant){const p=sl.price;if(!(p>0))return "-";
  if(variant==="coin"){const q=sl.currency||"USDT";   // 펌웨어 market_coin.cpp decimalsFor/formatIn 과 같게 (2.10.0): 원화·BTC 는 숫자만, USDT 는 $
    const d=q==="BTC"?(p>=1?4:8):p>=1000?0:q==="KRW"&&p>=100?1:p>=1?2:p>=0.01?4:8;
    return (q==="USDT"?"$":"")+p.toLocaleString("en-US",{minimumFractionDigits:d,maximumFractionDigits:d});}
  const cur=sl.currency||"KRW";return cur==="KRW"||p>=10000?Math.round(p).toLocaleString():p.toFixed(2);}
function compact(sl,variant){const p=sl.price;if(!(p>=10000))return money(sl,variant);const pre=variant==="coin"&&(sl.currency||"USDT")==="USDT"?"$":"";
  return pre+(p>=1e9?(p/1e9).toFixed(2)+"B":p>=1e6?(p/1e6).toFixed(2)+"M":p>=1e5?Math.round(p/1e3)+"K":(p/1e3).toFixed(1)+"K");}
// 전일 대비 (펌웨어 marketSlotDiff: 원화이거나 1만 이상이면 정수, 아니면 소수 둘째 자리). 코인은 없음
function diffText(sl,variant){if(variant==="coin"||sl.diff==null)return "";const d=Number(sl.diff),dec=(sl.currency||"KRW")==="KRW"||sl.price>=10000?0:2;
  return (d>=0?"+":"-")+Math.abs(d).toLocaleString("en-US",{minimumFractionDigits:dec,maximumFractionDigits:dec});}
function pct(sl){return sl.ok?(sl.change>=0?"+":"")+Number(sl.change).toFixed(2)+"%":"";}
// 봉 데이터는 API 에 없어 코드에서 만든 의사 난수로 흔들리는 선을 그린다 (모양만)
// 코드 해시로 흔들리는 선 + 끝이 등락 방향(up)으로 가게 기울인다. 32비트 곱은 Math.imul, 상위 비트는 >>> (부호 있는 >> 와 일반 곱셈은 늘 하락 선이 됐다)
function fakeSeries(code,up,n){let h=0;for(const c of code)h=(Math.imul(h,31)+c.charCodeAt(0))>>>0;const a=[];let v=50;
  for(let i=0;i<n;i++){h=(Math.imul(h,1103515245)+12345)>>>0;v+=(h>>>16)%11-5;a.push(v);}
  const d=a[n-1]-a[0],t=(up?1:-1)*(Math.abs(d)+n/2);return a.map((y,i)=>y+(t-d)*i/(n-1));}

// 코인 한글 이름: "BTC=비트코인;ETH=이더리움" 에서 base 를 찾는다 (기기 cnames 와 같은 형식)
function coinName(cn,base){const m=new RegExp("(?:^|;)"+base+"=([^;]*)").exec(cn||"");return m?m[1]:"";}
// 상태 정규화: 슬롯 라벨(해외/코인 티커, 국내 주식은 한글명), 색, 시각
function norm(s){
  const s0=(s.slots||[])[0],krCoin=!s0||/:KRW-/i.test(s0.code||"")||s0.quote==="KRW";   // 코인 기본 색: 첫 종목이 원화면 한국식 (펌웨어 krDefault, 2.10.0)
  const kr=(s.colors||(s.variant==="kstock"||krCoin?"kr":"global"))==="kr",tone=kr?KR:GL;
  const coin=s.variant!=="kstock";
  const slots=(s.slots||[]).slice(0,5).map(sl=>{const dom=/^[0-9][0-9A-Z]{5}$/.test(sl.code);
    // 코인 (2.10.0): 코드 "UPBIT:KRW-BTC". 상태에 base/quote/ex/name 이 오고, 아직 없으면(방금 추가) 코드에서 푼다. 이름 옵션(cname)이 켜져 있으면 한글 이름
    const m=coin?/^(?:([A-Z]+):)?([A-Z]+)-([A-Z0-9]+)$/.exec(String(sl.code||"").toUpperCase()):null;
    const base=sl.base||(m?m[3]:sl.code),quote=sl.quote||(m?m[2]:"USDT"),cnm=coin&&s.cname?(sl.name||coinName(s.cnames,base)):"";
    return {code:sl.code,label:s.variant==="kstock"?(dom?(sl.stockName||sl.code):(sl.symbolCode||sl.code)):(cnm||base),
      name:s.variant==="kstock"?(sl.stockName||sl.code):base+quote,ok:!!sl.ok,price:sl.price,currency:coin?(sl.currency||quote):sl.currency,change:sl.change||0,
      up:(sl.change||0)>=0,color:sl.ok?((sl.change||0)>=0?tone.up:tone.down):C.dim,exchange:sl.exchange||"",market:sl.market||"",diff:sl.diff,
      spark:typeof sl.spark==="string"?(sl.spark.match(/\d\d/g)||[]).map(Number):null,
      tick:s.variant==="kstock"?(sl.symbolCode||sl.code):base,full:s.variant==="kstock"?(sl.stockName||sl.symbolCode||sl.code):(cnm||base+"/"+quote),
      ex:s.variant==="kstock"?(sl.exchange||""):(sl.ex||(m&&m[1])||"BINANCE"),dayOpen:sl.dayOpen||"",dayHigh:sl.dayHigh||"",dayLow:sl.dayLow||"",diffText:diffText(sl,s.variant)};});
  const sh0=s.show||{};let t=(s.time||"").slice(0,5);const synced=!!s.timeSynced;let d=new Date();
  const hms=(s.time||"").split(":").map(Number);
  const secs=(s.time||"").slice(6,8)||"--";let ampm="";
  if(sh0.h12&&synced){const [hh,mm]=t.split(":").map(Number);ampm=hh<12?"AM":"PM";t=((hh%12)||12)+":"+String(mm).padStart(2,"0");}
  if(sh0.seconds)t+=":"+secs;
  if(s.date){const m=/(\d+)-(\d+)-(\d+)/.exec(s.date);if(m)d=new Date(+m[1],+m[2]-1,+m[3]);}
  const sh=Object.assign({price:true,change:true,spark:true,date:true,symbols:true,seconds:false,h12:false,id:true},s.show||{});
  return {chart:s.chart||{},indices:s.indices||[],id:s.id||"",hms,v:s.variant||"kstock",slots,active:Math.min(s.active||0,Math.max(0,slots.length-1)),time:synced?t:"--:--",synced,d,show:sh,ampm,secs:synced?secs:"--",
    date:synced?(window.fmtDate?fmtDate(s.dateFmt||0,d):MON[d.getMonth()]+" "+d.getDate()+"  "+WD[d.getDay()]):"waiting for time",tone,showChart:s.showChart!==false,candleLabel:s.candleLabel||(coin?String(s.cint||"1d").replace(/^(\d+)([hd])$/,(m,a,b)=>a+b.toUpperCase()):"1D")};   // 코인은 기기 marketCandleLabel 처럼 cint 로 ("4H", "15m")
}
// 종가 선: 2.6.25 부터 기기가 slots[].spark(0~99 두 자리씩, 기기가 그리는 봉 종가)를 보낸다 → 기기와 같은 모양. 옛 펌웨어는 코드 해시 의사 난수 선
function seriesOf(sl,n){return sl&&sl.spark?sl.spark:fakeSeries(sl?sl.code:"x",!!(sl&&sl.up),n);}
function spark(x,px,py,w,h,series,color){
  if(series.length<2){x.fillStyle=C.dim;for(let sx=px;sx<px+w;sx+=4)x.fillRect(sx,py+(h>>1),1,1);return;}   // 봉이 아직 없다: 기기 drawSparkline 처럼 가운데 점선
  x.strokeStyle=color;x.lineWidth=1.5;x.beginPath();const lo=Math.min(...series),hi=Math.max(...series),r=(hi-lo)||1;
  series.forEach((v,i)=>{const sx=px+i*(w-1)/(series.length-1),sy=py+h-1-(v-lo)/r*(h-1);i?x.lineTo(sx,sy):x.moveTo(sx,sy);});x.stroke();}
// 큰 시각: [AM/PM 작게(왼쪽, 아래선 맞춤)] [HH:MM 또는 HH:MM:SS]. 펌웨어처럼 7세그 간격을 조여 HH:MM:SS 200px. compact(ORBIT)+초 는 작은 폰트
// compact(ORBIT)+초: 펌웨어 seg7Draw 와 같은 작은 7세그 (20x34, 획 4, 숫자 23·콜론 9)
const S7={w:20,h:34,t:4,adv:23,colon:9,map:[0x3F,0x06,0x5B,0x4F,0x66,0x6D,0x7D,0x07,0x7F,0x6F]};
function seg7W(s){let w=0;for(const c of String(s))w+=c===":"?S7.colon:S7.adv;return w;}
function seg7(x,s,px,py,color){const {w,h,t}=S7,L=(h-3*t)/2;x.fillStyle=color;
  for(const c of String(s)){if(c===":"){const cx=px+Math.floor((S7.colon-t)/2);x.fillRect(cx,py+t+L/2-t/2,t,t);x.fillRect(cx,py+2*t+L+L/2-t/2,t,t);px+=S7.colon;continue;}
    const m=c>="0"&&c<="9"?S7.map[+c]:0,R=(a,b,c2,d)=>x.fillRect(px+1+a,py+b,c2,d);
    if(m&1)R(t+1,0,w-2*t-2,t);if(m&2)R(w-t,t+1,t,L-2);if(m&4)R(w-t,2*t+L+1,t,L-2);if(m&8)R(t+1,h-t,w-2*t-2,t);if(m&16)R(0,2*t+L+1,t,L-2);if(m&32)R(0,t+1,t,L-2);if(m&64)R(t+1,t+L,w-2*t-2,t);px+=S7.adv;}}
function bigTime(x,S,cy,color,compact){const sec=S.show.seconds,small=sec&&compact,apAbove=compact&&S.show.h12;   // 펌웨어 drawBigTime 과 같은 배치
  const wS=small?seg7W(S.time):measure(x,S.time,"f7t"),apW=S.show.h12&&!apAbove?28:0,xc=Math.round(120-(apW+wS)/2),ty=small?cy+7:cy;
  if(S.show.h12){if(apAbove)text(x,S.ampm,120,ty-18,"f2",color,"center");   // compact(ORBIT): 고리를 덮지 않게 시각 위 가운데 (펌웨어 apAbove)
    else text(x,S.ampm,xc,small?ty+34-16:cy+28,"f2",color);}   // 숫자 아래선에 맞춘 Font2 (16px)
  if(small)seg7(x,S.time,xc+apW,ty,color);else text(x,S.time,xc+apW,ty,"f7t",color,"left");}
function bigDate(x,S,cy,color){if(S.show.date)text(x,S.date,120,cy,"f2",color,"center");}
// 좁은 칸용 두 줄 날짜 [날짜, 요일]: 다섯 형식 모두 마지막 공백 앞/뒤 (펌웨어 dateTwoLines). 날짜 토글이 꺼져 있으면 ["",""]
function dateTwo(S){if(!S.show.date||!S.synced)return ["",""];const d=S.date.trim(),i=d.lastIndexOf(" ");return i<0?[d,""]:[d.slice(0,i).trim(),d.slice(i+1).trim()];}
function label(x,sl,px,py,h,maxW,color,S){text(x,fitEll(x,sl.label,"f2",maxW),px,py+(h-14)/2,"f2",color);}
// ---- v2.7.0 주식 레이아웃 조각 (펌웨어 layout_stock.cpp 와 같은 규칙) ----
// 굵은 GFX 폰트를 max(24/18/12/9)부터 줄여 maxW 에 맞춘다. 다 넘치면 f2, 그래도 넘치면 f1 (펌웨어 fitBold)
function fitBold(x,t,maxW,max){const ks=["b24","b18","b12","b9"],s=ks.indexOf("b"+max);for(const k of ks.slice(s<0?3:s))if(measure(x,t,k)<=maxW)return k;return measure(x,t,"f2")<=maxW?"f2":"f1";}
// 펌웨어 ML/MR datum 의 세로 위치 → TL: GFX 는 글리프 위(asc)의 반, 비트맵 폰트는 높이의 반
function midY(f,cy){const b=BF[f];if(b&&b.asc)return cy-Math.floor(b.asc/2);const h=b?b.h:({f1:8,f2:16,b9:13,b12:17,b18:25,b24:35})[f]||16;return cy-Math.floor(h/2);}
function tri(x,cx,cy,up,c){x.fillStyle=c;x.beginPath();if(up){x.moveTo(cx-4,cy+3);x.lineTo(cx+4,cy+3);x.lineTo(cx,cy-4);}else{x.moveTo(cx-4,cy-3);x.lineTo(cx+4,cy-3);x.lineTo(cx,cy+4);}x.fill();}
// 종목 라벨 (marketDrawSlotLabel): 영문 티커는 Font2(16px), 한글 이름은 14px, 높이 h 셀의 세로 가운데
function slabel(x,sl,px,py,h,maxW,color){const t=fitEll(x,sl.label,"f2",maxW);text(x,t,px,py+Math.floor((h-(isAscii(t)?16:14))/2),"f2",color);}
// 종목 이름 한 줄 (marketDrawSlotFullName): 주식 한글 이름 14px, 코인 "BTC/USDT"
function fullName(x,sl,px,py,maxW,color,S){if(S.v==="coin")text(x,fitEll(x,sl.full,"f2",maxW),px,py,"f2",color);else{const t=fitEll(x,sl.full,"ko14",maxW);text(x,t,px,isAscii(t)?py:py+1,"f2",color);}}
// 머리 한 줄: 주식 "삼성전자 005930" (한글 14px + 코드 Font1 흐리게), 코인 "BTC/USDT" (펌웨어 drawHeadline, 2.8.0)
function headline(x,sl,px,py,maxW,color,S){if(S.v==="coin"||sl.full===sl.tick){fullName(x,sl,px,py,maxW,color,S);return;}
  const cw=measure(x,sl.tick,"f1"),nm=fitEll(x,sl.full,"ko14",maxW-cw-6);text(x,nm,px,py+1,"f2",color);const nx=px+measure(x,nm,"ko14")+6;if(nx+cw<=px+maxW)text(x,sl.tick,nx,py+6,"f1",C.dim);}
// 목록·칸의 종목 이름: 주식은 해외도 한글 이름 14px, 코인은 심볼 (펌웨어 drawSlotName, 2.8.0)
function nlabel(x,sl,px,py,h,maxW,color,S){if(S.v==="coin"){slabel(x,sl,px,py,h,maxW,color);return;}text(x,fitEll(x,sl.full,"ko14",maxW),px,py+Math.floor((h-14)/2),"f2",color);}
const hex2=c=>[1,3,5].map(i=>parseInt(c.slice(i,i+2),16));
function blend(a,b,t){const A=hex2(a),B=hex2(b);return "#"+A.map((v,i)=>Math.round((v*(255-t)+B[i]*t)/255).toString(16).padStart(2,"0")).join("");}   // 펌웨어 blend565 (t 0..255)
const num=s=>Number(String(s||"").replace(/[^0-9.\-]/g,""));
function strokeRR(x,px,py,w,h,r,c){x.strokeStyle=c;x.lineWidth=1;x.beginPath();x.roundRect(px+.5,py+.5,w-1,h-1,r);x.stroke();}
function fillRR(x,px,py,w,h,r,c){x.fillStyle=c;x.beginPath();x.roundRect(px,py,w,h,r);x.fill();}
function tileRect(i,n){if(i===0)return [4,10,232,80];const k=n-1,j=i-1,row=Math.floor(j/2),inRow=Math.min(2,k-row*2);return [4+(j%2)*118,96+row*74,inRow===2?114:232,69];}
function heatRect(i,n){if(n<=1)return [4,10,232,226];if(i<2)return [i?146:4,10,i?90:138,n===2?226:118];const k=n-2,j=i-2;
  if(k===1)return [4,132,232,104];if(k===2)return [4+j*118,132,114,104];return [[4,82,162][j],132,[74,76,74][j],104];}
function dot(x,cx,cy,r,color){x.fillStyle=color;x.beginPath();x.arc(cx,cy,r,0,Math.PI*2);x.fill();}
// 코인 로고 이미지 캐시: 처음엔 없고(글자 동그라미), 받아지면 다음 그리기(상태 폴링 몇 초)부터 보인다
const LOGOS={};
function coinLogo(b){if(!b)return null;let e=LOGOS[b];if(!e){const im=new Image();e=LOGOS[b]={im,ok:false};im.onload=()=>{e.ok=true;};
  im.onerror=()=>{if(!e.alt){e.alt=1;im.src="https://cdn.jsdelivr.net/npm/cryptocurrency-icons@0.18.1/128/color/"+b.toLowerCase()+".png";}};im.src="https://static.upbit.com/logos/"+b+".png";}
  return e.ok?e.im:null;}
function title(x,S){const sl=S.slots[S.active];if(!sl)return;
  if(S.v==="kstock"){text(x,fitEll(x,sl.name,"ko24",S.show.id?190:228),6,4,"ko24",C.title);text(x,(sl.code)+"  "+sl.exchange,6,40,"f2",C.dim);}
  else{const lg=coinLogo(sl.tick);if(lg){x.save();x.beginPath();x.arc(26,24,20,0,Math.PI*2);x.clip();x.fillStyle="#000";x.fillRect(6,4,40,40);x.drawImage(lg,6,4,40,40);x.restore();}   // 코인 로고 (기기와 같은 업비트 로고, 2.10.2)
    else{dot(x,26,24,19,C.accent);text(x,sl.tick.slice(0,3),26,18,"f2",C.bg,"center");}   // 로고를 못 받으면 기기처럼 글자 동그라미. 코인: 펌웨어 marketDrawTitle 과 같게 — 이름(한글 옵션) 또는 "BTC/KRW", 아래 작게 거래소
    const maxW=S.show.id?142:182,ko=!isAscii(sl.full);if(ko)text(x,fitEll(x,sl.full,"ko24",maxW),52,4,"ko24",C.title);else text(x,sl.full,52,6,fitBold(x,sl.full,maxW,12),C.title);
    text(x,sl.ex+(ko?"  "+sl.tick+"/"+(sl.currency||""):""),52,34,"f1",C.dim);}}
// 종목 한 행 (primitives drawSlotRow 근사): flags {spark,name,colorPrice,stack,rule}
function row(x,S,sl,px,py,w,h,f){if(!sl)return;if(f.rule){x.fillStyle=C.bar;x.fillRect(px+2,py+h-1,w-4,1);}
  const priceC=f.colorPrice?sl.color:(sl.ok?C.white:C.dim),p=S.show.price?(sl.ok?money(sl,S.v):"-"):"",c=S.show.change?pct(sl):"";
  if(f.stack){text(x,c,px+w-4,py+4,"f2",sl.color,"right");const cw=measure(x,c,"f2");if(S.show.price){let pp=sl.ok?money(sl,S.v):"-";if(measure(x,pp,"f2")>w-8)pp=compact(sl,S.v);text(x,pp,px+w-4,py+h/2+3,"f2",priceC,"right");}   /* 펌웨어 fitPrice(w-8): 들어가면 전체 숫자, 모자랄 때만 225K 식 */
    text(x,fitEll(x,sl.label,"f2",w-cw-16),px+4,py+4,"f2",C.text);return;}
  const two=h>=38;text(x,p,px+w-4,two?py+4:py+(h-14)/2,"f2",priceC,"right");let used=measure(x,p,"f2");
  if(two)text(x,c,px+w-4,py+22,"f2",sl.color,"right");else{text(x,c,px+w-4-used-8,py+(h-14)/2,"f2",sl.color,"right");used+=8+measure(x,c,"f2");}
  let right=px+w-4-used-6;
  if(f.spark&&S.show.spark&&right-56>px+44){spark(x,right-50,py+(h-22)/2,50,22,seriesOf(sl,24),sl.color);right-=56;}
  if(f.name)text(x,fitEll(x,sl.name,"ko24",right-px-4),px+4,py+(h-20)/2,"ko24",C.white);else label(x,sl,px+4,py,h,right-px-4,C.text,S);}
function columns(x,S,py,h){const n=S.slots.length;if(!n)return;const cw=240/n;S.slots.forEach((sl,i)=>{const px=i*cw;
  text(x,fitEll(x,sl.label,"f2",cw-4),px+2,py+1,"f2",C.text);const f=cw>=56?"f2":"f1";
  if(S.show.price){let p=sl.ok?money(sl,S.v):"-";if(measure(x,p,f)>cw-4)p=compact(sl,S.v);text(x,p,px+2,py+18,f,sl.color);if(h>=46&&S.show.change)text(x,pct(sl),px+2,py+(cw>=56?36:28),"f1",sl.color);}
  else if(S.show.change)text(x,pct(sl),px+2,py+18,f,sl.color);});}   // 가격 숨김: 등락률이 가격 자리로 (펌웨어 drawSlotColumn 과 동일)

const L={
 S01(x,S){const sl=S.slots[S.active];title(x,S);if(!sl)return;const col=sl.color;
  if(S.show.price){const p=sl.ok?money(sl,S.v):"loading...";text(x,p,6,56,fitBold(x,p,228,24),sl.ok?C.white:C.dim);}   // 펌웨어처럼 228px 에 맞춰 글꼴을 줄인다 (원화 9자리)
  if(S.show.change){const sfx=S.v==="coin"?(sl.ex==="BINANCE"||sl.ex==="COINONE"?"24h":""):(sl.diff!=null?(sl.diff>=0?"+":"")+Number(sl.diff).toLocaleString():"");   // 코인 「24h」는 바이낸스·코인원만 (marketChangeSuffix)
    text(x,pct(sl),6,103,"f2",col);if(sfx)text(x,sfx,6+measure(x,pct(sl),"f2")+12,103,"f2",C.dim);
    text(x,S.candleLabel,234,103,"f2",C.dim,"right");}
  if(S.show.spark){text(x,"high",6,128,"f1",C.dim);text(x,"low",6,214,"f1",C.dim);spark(x,6,138,228,74,seriesOf(sl,36),col);}   // 기간 탭(1D 1W..)은 2.8.0 에서 뺐다
  if(S.slots.length>1)text(x,(S.active+1)+"/"+S.slots.length,234,214,"f1",C.dim,"right");},
 S02(x,S){text(x,"WATCHLIST",6,6,"f2",C.title);text(x,S.slots.length+" symbols",96,6,"f2",C.dim);text(x,S.time,234,11,"f2",C.dim,"right");
  x.fillStyle=C.frame;x.fillRect(4,27,232,1);S.slots.forEach((sl,i)=>row(x,S,sl,0,30+i*42,240,42,{spark:1,name:1,rule:1}));},
 // S03 CHART: 머리 / 큰 가격 · 등락 / O H L C / 캔들 + 가격 눈금 / 거래량 / 시간 축 (봉·눈금 글자는 기기가 /api/state chart 로 보낸 그대로)
 S03(x,S){const sl=S.slots[S.active];if(!sl)return;const ok=sl.ok,tone=sl.color,ch=S.chart||{};
  text(x,sl.ex,234,16,"f1",C.dim,"right");headline(x,sl,6,10,228-measure(x,sl.ex,"f1")-8,C.white,S);
  const p=ok&&S.show.change?pct(sl):"",d=ok&&S.show.change?sl.diffText:"",rw=Math.max(measure(x,p,"f2"),measure(x,d,"f2"));
  if(S.show.price){const pr=ok?money(sl,S.v):"loading...",f=ok?fitBold(x,pr,228-rw-10,24):"f2";text(x,pr,6,midY(f,48),f,ok?C.white:C.dim);}
  text(x,p,234,d?32:40,"f2",tone,"right");text(x,d,234,50,"f2",tone,"right");
  if(ok&&sl.dayHigh){const ks=["O","H","L","C"],vs=[sl.dayOpen,sl.dayHigh,sl.dayLow,money(sl,S.v)];let w=0;ks.forEach((k,i)=>w+=measure(x,k,"f1")+3+measure(x,vs[i],"f1")+8);
    let px=6;for(let i=0;i<(w>236?3:4);i++){text(x,ks[i],px,72,"f1",C.dim);px+=measure(x,ks[i],"f1")+3;text(x,vs[i],px,72,"f1",C.text);px+=measure(x,vs[i],"f1")+8;}}
  const k=ch.k||"",n=Math.floor(k.length/8),PY=88,PH=93;
  if(!n){if(ok)text(x,"no candles yet",96,PY+44,"f1",C.dim,"center");}
  else{const q=(i,j)=>+k.substr(i*8+j*2,2),yOf=v=>PY+PH-1-Math.floor(v/99*(PH-1)),x0=6+(36-n)*5;
    for(let g=0;g<4;g++){const y=yOf(99*(3-g)/3);x.fillStyle="#303430";for(let px=6;px<186;px+=3)x.fillRect(px,y,1,1);text(x,(ch.axis||[])[g]||"",190,y-4,"f1",C.dim);}
    for(let i=0;i<n;i++){const o=q(i,0),h=q(i,1),l=q(i,2),c=q(i,3),col=c>=o?S.tone.up:S.tone.down,px=x0+i*5;x.fillStyle=col;
      x.fillRect(px+1,yOf(h),1,yOf(l)-yOf(h)+1);const top=yOf(Math.max(o,c)),bot=yOf(Math.min(o,c));x.fillRect(px,top,3,Math.max(1,bot-top+1));
      const v=+String(ch.v||"").substr(i*2,2)||0,vh=Math.max(1,Math.floor(v/99*26));x.fillRect(px,186+26-vh,3,vh);}
    if(ch.vol){text(x,"VOL",190,186,"f1",C.dim);text(x,ch.vol,190,196,"f1",C.dim);}
    (ch.ticks||[]).forEach(([i,t])=>text(x,t,x0+i*5+1,218,"f1",C.dim,"center"));}
},
 // S04 TILES: 첫 종목 큰 카드 + 나머지 작은 카드 (테두리 = 등락색)
 S04(x,S){const n=Math.min(S.slots.length,5);S.slots.slice(0,n).forEach((sl,i)=>{const [px,py,w,h]=tileRect(i,n),ok=sl.ok,tone=sl.color;
   strokeRR(x,px,py,w,h,6,tone);strokeRR(x,px+1,py+1,w-2,h-2,5,tone);if(ok)tri(x,px+w-12,py+12,sl.change>=0,tone);
   const pr=S.show.price?(ok?money(sl,S.v):"-"):"",p=ok&&S.show.change?pct(sl):"";
   if(i===0){headline(x,sl,px+8,py+6,w-32,C.white,S);const pw=measure(x,p,"b12");text(x,p,px+w-8,midY("b12",py+38),"b12",tone,"right");
     const f=fitBold(x,pr,w-24-pw,24);text(x,pr,px+8,midY(f,py+38),f,ok?C.white:C.dim);if(S.show.spark)spark(x,px+8,py+56,w-16,18,seriesOf(sl,36),tone);return;}
   nlabel(x,sl,px+6,py+4,16,w-28,C.text,S);const f=fitBold(x,pr,w-12,12);text(x,pr,px+6,py+24,f,ok?C.white:C.dim);text(x,p,px+6,py+46,"f2",tone);
   if(S.show.spark)spark(x,px+w-52,py+42,44,20,seriesOf(sl,36),tone);});},
 // S05 HEAT: 등락색 칸 (|등락률| 이 클수록 진하게)
 S05(x,S){const n=Math.min(S.slots.length,5);S.slots.slice(0,n).forEach((sl,i)=>{const [px,py,w,h]=heatRect(i,n),ok=sl.ok,tone=sl.color,big=w>=120;
   const t=ok?Math.floor(Math.min(217,77+Math.abs(sl.change)*28)):60,bg=blend("#000000",tone,t),soft=blend(tone,"#ffffff",170);fillRR(x,px,py,w,h,4,bg);
   nlabel(x,sl,px+6,py+6,16,w-12,C.white,S);const pr=S.show.price?(ok?money(sl,S.v):"-"):"",tall=big&&h>=150,p=ok&&S.show.change?pct(sl):"";
   if(big&&!tall&&p&&w<200){const f=fitBold(x,pr,w-12,24);text(x,pr,px+6,py+30,f,C.white);text(x,p,px+6,py+66,"b12",C.white);}   // 위 왼쪽 칸(138x118): 등락률 12px 을 가격 아래
   else if(big&&!tall&&p){const pw=measure(x,p,"b12"),f=fitBold(x,pr,w-12-pw-8,24),fh={b24:35,b18:25,b12:17,b9:13,f2:16,f1:8};text(x,pr,px+6,py+30,f,C.white);text(x,p,px+w-6,py+30+(fh[f]||16)-fh.b12,"b12",C.white,"right");}   // 낮은 큰 칸: 가격 윗선 y+30, 등락률은 같은 줄 오른쪽에 가격 아랫선 맞춤 (기기 2.10.3 과 같게)
   else{const f=fitBold(x,pr,w-12,big?24:12);text(x,pr,px+6,py+(big?30:28),f,C.white);if(p){const f2=fitBold(x,p,w-12,big?18:9);text(x,p,px+6,py+(big?72:50),f2,C.white);}}
   const sh=big?26:22;if(S.show.spark&&h>=90)spark(x,px+6,py+h-sh-6,w-12,sh,seriesOf(sl,36),soft);});},
 // S06 SPLIT: 왼쪽 활성 종목 + 오른쪽 나머지 목록
 S06(x,S){const a=S.active,sl=S.slots[a];x.fillStyle=C.bar;x.fillRect(159,8,1,230);text(x,S.time,234,10,"f2",C.dim,"right");if(!sl)return;const ok=sl.ok,tone=sl.color;
  if(S.v!=="coin"&&sl.full!==sl.tick){text(x,fitEll(x,sl.full,"ko24",146),6,6,"ko24",C.white);text(x,sl.tick,6,34,"f2",C.dim);}   // 한글 이름 크게, 코드 작게 (2.8.0)
  else{const cf=fitBold(x,sl.tick,146,12);text(x,sl.tick,6,8,cf,C.white);fullName(x,sl,6,32,146,C.dim,S);}
  if(S.show.price){const pr=ok?money(sl,S.v):"loading...",f=ok?fitBold(x,pr,146,24):"f2";text(x,pr,6,midY(f,74),f,ok?C.white:C.dim);}
  if(ok&&S.show.change){const p=pct(sl);text(x,p,6,98,"f2",tone);text(x,sl.diffText,6+measure(x,p,"f2")+8,98,"f2",tone);}
  if(S.show.spark)spark(x,6,122,146,66,seriesOf(sl,36),tone);
  const lo=num(sl.dayLow),hi=num(sl.dayHigh);if(ok&&hi>lo){const pos=Math.max(6,Math.min(151,6+Math.floor((sl.price-lo)/(hi-lo)*145)));
    x.fillStyle=C.bar;x.fillRect(6,200,146,4);x.fillStyle=tone;x.fillRect(6,200,pos-6+1,4);x.fillStyle=C.text;x.beginPath();x.moveTo(pos-4,193);x.lineTo(pos+4,193);x.lineTo(pos,198);x.fill();
    text(x,sl.dayLow,6,208,"f2",C.dim);text(x,sl.dayHigh,152,208,"f2",C.dim,"right");}
  S.slots.filter((_,i)=>i!==a).slice(0,4).forEach((o,j)=>{const y=30+j*52,ok2=o.ok;if(j<3){x.fillStyle=C.bar;x.fillRect(164,y+51,70,1);}
    nlabel(x,o,164,y+2,16,58,C.text,S);if(ok2)tri(x,230,y+10,o.change>=0,o.color);
    if(S.show.price){let pr=ok2?money(o,S.v):"-";if(measure(x,pr,"f2")>72)pr=compact(o,S.v);text(x,pr,164,y+18,"f2",ok2?C.white:C.dim);}
    if(ok2&&S.show.change)text(x,pct(o),164,y+(S.show.price?34:18),"f2",o.color);});},
 // S07 TAPE: 지수 3칸 + 전체 종목 시세판 (등락 삼각형만, 강조 없음). 2.7.0 전 펌웨어는 indices 가 없어 이름만
 S07(x,S){(S.indices.length?S.indices:(S.v==="coin"?["MCAP","BTC.D","F&G"]:["KOSPI","NASDAQ","S&P 500"]).map(label=>({label,ok:false}))).slice(0,3).forEach((m,i)=>{const px=i*80+6,tone=m.change>=0?S.tone.up:S.tone.down;
    if(i){x.fillStyle=C.bar;x.fillRect(i*80,12,1,42);}text(x,m.label,px,10,"f2",C.dim);text(x,m.ok?m.price:"-",px,26,"f2",m.ok?C.white:C.dim);
    if(m.ok)text(x,m.sub?m.sub:(m.change>=0?"+":"")+Number(m.change).toFixed(2)+"%",px,42,"f2",m.sub&&!m.change?C.dim:tone);});   // sub: 코인 공포·탐욕 단계 글자 (2.10.4, 기기와 같게)
  x.fillStyle=C.frame;x.fillRect(4,58,232,1);
  S.slots.slice(0,5).forEach((sl,i)=>{const y=62+i*35,cy=y+17,ok=sl.ok,tone=sl.color;
    if(ok)tri(x,11,cy,sl.change>=0,tone);
    nlabel(x,sl,22,y,35,72,C.text,S);
    if(ok&&S.show.change)text(x,pct(sl),231,midY("f2",cy),"f2",tone,"right");
    if(S.show.price){const pr=ok?money(sl,S.v):"-",f=fitBold(x,pr,70,9);text(x,pr,170,midY(f,cy),f,ok?C.white:C.dim,"right");}});},
 C01(x,S){x.strokeStyle=C.ring;x.lineWidth=1;x.beginPath();x.arc(120,101,84,0,Math.PI*2);x.stroke();bigTime(x,S,84,C.white,true);bigDate(x,S,138,C.dim);if(!S.show.symbols)return;
  // 점은 |등락률| 에 비례해 시계 방향으로 돈다 (10% 이상 = 한 바퀴 30초). 펌웨어와 같은 법칙, 시간 기반이라 다시 그릴 때마다 조금씩 움직인다
  const n=S.slots.length,t=Date.now()/1000;S.slots.forEach((sl,i)=>{const w=sl.ok?Math.min(Math.abs(sl.change),10)/10*12:0;const a=(-90+360*i/n+w*t%360)*Math.PI/180;dot(x,120+84*Math.cos(a),101+84*Math.sin(a),6,sl.color);});columns(x,S,192,48);},
 C02(x,S){const cx=120,cy=104,R=86;for(let i=0;i<12;i++){const a=i*30*Math.PI/180,inn=i%3?R-7:R-12;x.strokeStyle=i%3?C.dim:C.text;x.lineWidth=1;x.beginPath();
    x.moveTo(cx+inn*Math.cos(a),cy+inn*Math.sin(a));x.lineTo(cx+R*Math.cos(a),cy+R*Math.sin(a));x.stroke();}
  // HANDS: 시침·분침·초침 색 = 1·2·3번째 종목 등락색 (초침은 초 표시 때만). 나머지 종목(최대 3개)은 서브다이얼: 바늘 각도 = 등락률(±5% → ±135°), 1개면 6시, 2개면 9시·3시, 3개면 9시·3시·6시. 펌웨어와 같은 규칙
  const hc=(i,fb)=>(!S.show.symbols||!S.slots[i])?fb:S.slots[i].color;const ray=(px,py,deg,len,w,col)=>{const a=(deg-90)*Math.PI/180;x.strokeStyle=col;x.lineWidth=w;x.lineCap="round";x.beginPath();x.moveTo(px,py);x.lineTo(px+len*Math.cos(a),py+len*Math.sin(a));x.stroke();};
  const hands=S.show.seconds?3:2,nd=S.show.symbols?Math.min(Math.max(S.slots.length-hands,0),3):0;
  for(let i=0;i<nd;i++){const sl=S.slots[hands+i],cd=nd===1?180:(i===0?270:i===1?90:180),a=(cd-90)*Math.PI/180,dx=cx+48*Math.cos(a),dy=cy+48*Math.sin(a);
    x.strokeStyle="#404040";x.lineWidth=1;x.beginPath();x.arc(dx,dy,17,0,Math.PI*2);x.stroke();x.fillStyle=C.dim;x.fillRect(dx,dy-16,1,3);
    const deg=sl.ok?Math.max(-5,Math.min(5,sl.change))/5*135:0;ray(dx,dy,deg,12,1.5,sl.color);dot(x,dx,dy,2,sl.color);}
  if(S.synced){const [h,m,sec]=S.hms;if(S.show.seconds)ray(cx,cy,(sec||0)*6,70,1.5,hc(2,C.text));ray(cx,cy,(h%12)*30+m*0.5,44,3.5,hc(0,C.title));ray(cx,cy,m*6,66,2.5,hc(1,C.text));}else text(x,"--:--",cx,cy+12,"f2",C.dim,"center");
  dot(x,cx,cy,4,C.text);const sl=S.slots[S.active];if(sl&&S.show.symbols){text(x,sl.label,4,218,"f2",C.title);const c=S.show.change?pct(sl):"";text(x,c,236,218,"f2",sl.color,"right");
    if(S.show.price)text(x,sl.ok?money(sl,S.v):"-",236-measure(x,c,"f2")-10,218,"f2",sl.color,"right");}},
 C03(x,S){bigTime(x,S,8,C.white);bigDate(x,S,62,C.dim);x.fillStyle=C.rule;x.fillRect(0,86,240,1);x.fillStyle=C.bar;x.fillRect(0,87,240,1);if(!S.show.symbols)return;
  S.slots.forEach((sl,i)=>row(x,S,sl,0,92+i*29,240,29,{colorPrice:1,rule:1}));},
 C04(x,S){const parts=S.synced?S.time.split(":").map(p=>p.padStart(2,"0")):["--","--","--"],sec=S.show.seconds,hy=sec?20:30,my=sec?68:86,dy=sec?170:146;   // 시는 펌웨어 drawBigDigits("%02d") 처럼 두 자리
  if(S.show.h12)text(x,S.ampm,12,hy-16,"f2",C.dim);text(x,parts[0],10,hy,"f7",C.white);text(x,parts[1],10,my,"f7",C.white);if(sec)text(x,parts[2]||"--",10,116,"f7",C.white);
  {const [l1,l2]=dateTwo(S);const f1=measure(x,l1,"f2")>72?"f1":"f2";text(x,l1,10,f1==="f1"?dy+4:dy,f1,C.dim);text(x,l2,10,dy+18,"f2",C.dim);}   // 날짜 형식(dateFmt) 두 줄, 폭이 넘치면 작은 글자
  if(!S.show.symbols)return;x.fillStyle=C.frame;x.fillRect(86,10,1,220);S.slots.forEach((sl,i)=>row(x,S,sl,92,10+i*44,148,44,{colorPrice:1,stack:1,rule:1}));},
 C05(x,S){bigTime(x,S,14,C.white);bigDate(x,S,68,C.dim);if(!S.show.symbols)return;x.fillStyle=C.rule;x.fillRect(12,122,216,1);text(x,"<",8,160,"f2",C.dim);text(x,">",232,160,"f2",C.dim,"right");
  const sl=S.slots[S.active];if(sl){text(x,fitEll(x,sl.name,"ko24",192),24,138,"ko24",C.title);if(S.show.price)text(x,sl.ok?money(sl,S.v):"-",24,172,"b12",sl.color);if(S.show.change)text(x,pct(sl),216,176,"f2",sl.color,"right");}
  const n=S.slots.length;for(let i=0;i<n;i++)dot(x,120-(n-1)*7+i*14,218,3,i===S.active?C.title:C.frame);},
 C06(x,S){const [cl1,cl2]=dateTwo(S);text(x,cl2,10,12,"f2",C.dim);text(x,cl1,10,/[가-힣]/.test(cl1)?30:34,/[가-힣]/.test(cl1)?"ko24":"b12",C.white);   // 머리도 날짜 형식을 따른다
  "MTWTFSS".split("").forEach((c,i)=>text(x,c,130+i*15+7,10,"f1",C.dim,"center"));
  if(S.synced){const y=S.d.getFullYear(),mo=S.d.getMonth(),today=S.d.getDate(),start=(new Date(y,mo,1).getDay()+6)%7,n=new Date(y,mo+1,0).getDate();
    for(let d=1;d<=n;d++){const idx=start+d-1,c=idx%7,r=Math.floor(idx/7),px=130+c*15+3,py=26+r*15;
      if(d===today){x.fillStyle=C.title;x.fillRect(px-1,py-1,11,11);}else{x.fillStyle=d<today?"#606060":"#282828";x.fillRect(px,py,9,9);}}}
  bigTime(x,S,118,C.white);if(S.show.symbols)columns(x,S,190,50);},
 C07(x,S){const g=x.createLinearGradient(0,88,0,142);g.addColorStop(0,"#000");g.addColorStop(.5,"#102848");g.addColorStop(.63,"#B07830");g.addColorStop(.64,"#F0D420");g.addColorStop(.66,"#786820");g.addColorStop(1,"#000");
  x.fillStyle=g;x.fillRect(0,88,240,55);bigTime(x,S,14,C.white);bigDate(x,S,68,C.dim);if(!S.show.symbols)return;x.fillStyle=C.bar;x.fillRect(8,191,224,1);
  const n=S.slots.length,cw=240/n;S.slots.forEach((sl,i)=>{const h=sl.ok?Math.min(44,Math.max(6,6+Math.abs(sl.change)*10)):4;x.fillStyle=sl.color;x.fillRect(i*cw+cw/2-2,190-h,5,h);});columns(x,S,196,44);},
 C08(x,S){bigTime(x,S,10,C.amber);bigDate(x,S,64,C.amberDim);if(!S.show.symbols)return;x.fillStyle=C.rule;x.fillRect(0,92,240,1);if(S.slots.length>3)x.fillRect(120,98,1,128);
  S.slots.forEach((sl,i)=>{const col=i<3?0:1,r=i<3?i:i-3;row(x,S,sl,col?122:4,98+r*44,114,44,{colorPrice:1,stack:1});});},
};
function draw(canvas,layoutId,state){const px=canvas.width;const x=canvas.getContext("2d");x.setTransform(1,0,0,1,0,0);x.fillStyle=C.bg;x.fillRect(0,0,px,canvas.height);
  x.scale(px/240,canvas.height/240);const S=norm(state||{});try{(L[layoutId]||L.S01)(x,S);}catch(e){text(x,"preview error",120,110,"f2",C.dim,"center");}
  if(S.show.id&&S.id)text(x,S.id,238,1,"f1",C.dim,"right");}  // 오른쪽 위 기기 ID 배지 (펌웨어 Font1 6x8)
return {draw,ids:Object.keys(L),onReady(cb){if(fontsReady)cb();else readyCbs.push(cb);},get fontsReady(){return fontsReady;}};
})();
