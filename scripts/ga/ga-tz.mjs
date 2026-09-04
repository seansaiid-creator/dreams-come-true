import { readFileSync } from 'node:fs'; import { createSign } from 'node:crypto'; import { homedir } from 'node:os';
const P='528679246';
const key=JSON.parse(readFileSync(`${homedir()}/.config/dreams-ga4/sa-key.json`,'utf8'));
const b64=o=>Buffer.from(JSON.stringify(o)).toString('base64url'); const now=Math.floor(Date.now()/1000);
const h=b64({alg:'RS256',typ:'JWT'}), c=b64({iss:key.client_email,scope:'https://www.googleapis.com/auth/analytics.readonly',aud:'https://oauth2.googleapis.com/token',iat:now,exp:now+3600});
const sg=createSign('RSA-SHA256'); sg.update(`${h}.${c}`);
const tok=await (await fetch('https://oauth2.googleapis.com/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:`grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${h}.${c}.${sg.sign(key.private_key,'base64url')}`})).json();
const H={Authorization:`Bearer ${tok.access_token}`,'Content-Type':'application/json'};
const run=b=>fetch(`https://analyticsdata.googleapis.com/v1beta/properties/${P}:runReport`,{method:'POST',headers:H,body:JSON.stringify(b)}).then(r=>r.json());
// 내가 오늘 만든 테스트 히트(?t=scrolltest*)가 어느 'hour' 버킷에 찍혔는지 → 속성 시간대 검증
const r=await run({dateRanges:[{startDate:'today',endDate:'today'}],dimensions:[{name:'dateHourMinute'},{name:'pagePathPlusQueryString'}],
  dimensionFilter:{filter:{fieldName:'pagePathPlusQueryString',stringFilter:{matchType:'CONTAINS',value:'scrolltest'}}},
  metrics:[{name:'eventCount'}],limit:20});
console.log('■ 테스트 히트(?t=scrolltest*)의 dateHourMinute:', r.error?r.error.message:'');
for(const row of r.rows||[]) console.log('   ', row.dimensionValues[0].value, row.dimensionValues[1].value, '→', row.metricValues[0].value);
if(!r.rows) console.log('   (아직 처리 전 — 표준 리포트 지연)');
// 보조: 최근 7일 시간대별 사용자 분포 (KST 출근시간 07~09 피크면 Asia/Seoul과 일치)
const d=await run({dateRanges:[{startDate:'7daysAgo',endDate:'yesterday'}],dimensions:[{name:'hour'}],metrics:[{name:'activeUsers'}],orderBys:[{dimension:{dimensionName:'hour'}}]});
const m={}; for(const row of d.rows||[]) m[+row.dimensionValues[0].value]=+row.metricValues[0].value;
let line=''; for(let i=0;i<24;i++) line+=String(m[i]||0).padStart(3);
console.log('■ 최근 7일 시간대별 사용자 합계:'); console.log('   '+line); console.log('   '+[...Array(24).keys()].map(i=>String(i).padStart(3)).join(''));
const top=Object.entries(m).sort((a,b)=>b[1]-a[1]).slice(0,3).map(([k,v])=>`${k}시(${v})`); console.log('   피크:', top.join(', '));
