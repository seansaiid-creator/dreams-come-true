import { readFileSync } from 'node:fs'; import { createSign } from 'node:crypto'; import { homedir } from 'node:os';
const P='528679246';
const key=JSON.parse(readFileSync(`${homedir()}/.config/dreams-ga4/sa-key.json`,'utf8'));
const b64=o=>Buffer.from(JSON.stringify(o)).toString('base64url'); const now=Math.floor(Date.now()/1000);
const h=b64({alg:'RS256',typ:'JWT'}), c=b64({iss:key.client_email,scope:'https://www.googleapis.com/auth/analytics.readonly',aud:'https://oauth2.googleapis.com/token',iat:now,exp:now+3600});
const sg=createSign('RSA-SHA256'); sg.update(`${h}.${c}`);
const tok=await (await fetch('https://oauth2.googleapis.com/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:`grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${h}.${c}.${sg.sign(key.private_key,'base64url')}`})).json();
const H={Authorization:`Bearer ${tok.access_token}`,'Content-Type':'application/json'};
const run=b=>fetch(`https://analyticsdata.googleapis.com/v1beta/properties/${P}:runReport`,{method:'POST',headers:H,body:JSON.stringify(b)}).then(r=>r.json());

const d=await run({dateRanges:[{startDate:'34daysAgo',endDate:'today'}],
  dimensions:[{name:'date'}],
  metrics:[{name:'activeUsers'},{name:'newUsers'},{name:'sessions'},{name:'screenPageViews'}],
  orderBys:[{dimension:{dimensionName:'date'}}]});
if(d.error){console.log('오류',d.error.message);process.exit(1);}
const rows=(d.rows||[]).map(r=>({d:r.dimensionValues[0].value, u:+r.metricValues[0].value, n:+r.metricValues[1].value, s:+r.metricValues[2].value, p:+r.metricValues[3].value}));
const max=Math.max(...rows.map(r=>r.u));
console.log('일자        사용자  신규  세션  PV   그래프(사용자)');
for(const r of rows){
  const dt=`${r.d.slice(4,6)}-${r.d.slice(6)}`;
  const dow=['일','월','화','수','목','금','토'][new Date(`${r.d.slice(0,4)}-${r.d.slice(4,6)}-${r.d.slice(6)}`).getDay()];
  const bar='█'.repeat(Math.round(r.u/max*28));
  const mark = r.d>='20260902' ? ' ←도메인전환' : '';
  console.log(`${dt}(${dow})  ${String(r.u).padStart(4)} ${String(r.n).padStart(5)} ${String(r.s).padStart(5)} ${String(r.p).padStart(4)}  ${bar}${mark}`);
}
const last7=rows.slice(-8,-1), prev7=rows.slice(-15,-8);
const avg=a=>({u:(a.reduce((x,y)=>x+y.u,0)/a.length).toFixed(1),n:(a.reduce((x,y)=>x+y.n,0)/a.length).toFixed(1),s:(a.reduce((x,y)=>x+y.s,0)/a.length).toFixed(1)});
console.log('\n■ 최근 7일 평균 vs 그 전 7일 (오늘 제외)');
console.log('   최근:', JSON.stringify(avg(last7)), ' 이전:', JSON.stringify(avg(prev7)));
