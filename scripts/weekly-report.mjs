// 주간 비교 리포트 생성기 — GA4에서 이번 주(최근 7일) vs 지난주(그 전 7일)를 뽑아
// report.html(이메일 본문)을 만든다. 의존성 0. 키: env GA4_KEY 경로 또는 기본 경로.
import { readFileSync, writeFileSync } from 'node:fs';
import { createSign } from 'node:crypto';
import { homedir } from 'node:os';

const PROPERTY = '528679246';
const KEY_PATH = process.env.GA4_KEY || `${homedir()}/.config/dreams-ga4/sa-key.json`;
const key = JSON.parse(readFileSync(KEY_PATH, 'utf8'));

const b64 = o => Buffer.from(JSON.stringify(o)).toString('base64url');
const now = Math.floor(Date.now()/1000);
const claim = b64({ iss:key.client_email, scope:'https://www.googleapis.com/auth/analytics.readonly',
  aud:'https://oauth2.googleapis.com/token', iat:now, exp:now+3600 });
const hdr = b64({alg:'RS256',typ:'JWT'});
const signer = createSign('RSA-SHA256'); signer.update(`${hdr}.${claim}`);
const jwt = `${hdr}.${claim}.${signer.sign(key.private_key,'base64url')}`;
const tok = await (await fetch('https://oauth2.googleapis.com/token',{method:'POST',
  headers:{'Content-Type':'application/x-www-form-urlencoded'},
  body:`grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`})).json();
if(!tok.access_token){ console.error('토큰 실패:',JSON.stringify(tok)); process.exit(1); }

async function run(body){
  const r = await (await fetch(`https://analyticsdata.googleapis.com/v1beta/properties/${PROPERTY}:runReport`,{
    method:'POST', headers:{Authorization:`Bearer ${tok.access_token}`,'Content-Type':'application/json'},
    body:JSON.stringify(body)})).json();
  if(r.error){ throw new Error(r.error.message); }
  return r;
}
const CUR={startDate:'7daysAgo',endDate:'yesterday'}, PREV={startDate:'14daysAgo',endDate:'8daysAgo'};

async function totals(range){
  const r = await run({dateRanges:[range],metrics:[{name:'activeUsers'},{name:'sessions'},{name:'screenPageViews'},{name:'engagementRate'},{name:'averageSessionDuration'}]});
  const v = r.rows?.[0]?.metricValues.map(m=>Number(m.value)) || [0,0,0,0,0];
  return {users:v[0],sessions:v[1],views:v[2],engage:v[3],dur:v[4],ppages:v[1]?v[2]/v[1]:0};
}
async function dimTop(range,dim,metric,limit=10,filter){
  try{
  const r = await run({dateRanges:[range],dimensions:[{name:dim}],metrics:[{name:metric}],
    orderBys:[{metric:{metricName:metric},desc:true}],limit,...(filter?{dimensionFilter:filter}:{})});
  return (r.rows||[]).map(row=>[row.dimensionValues[0].value,Number(row.metricValues[0].value)]);
  }catch(e){ console.warn(`${dim} 수집 건너뜀: ${e.message.slice(0,60)}`); return []; }
}
const [cur,prev] = await Promise.all([totals(CUR),totals(PREV)]);
const [srcCur,srcPrev] = await Promise.all([dimTop(CUR,'sessionSourceMedium','sessions',6),dimTop(PREV,'sessionSourceMedium','sessions',50)]);
const [pgCur,pgPrev] = await Promise.all([dimTop(CUR,'pagePath','screenPageViews',10),dimTop(PREV,'pagePath','screenPageViews',250)]);
const [evCur,evPrev] = await Promise.all([dimTop(CUR,'eventName','eventCount',30),dimTop(PREV,'eventName','eventCount',50)]);
const fails = await dimTop(CUR,'customEvent:query','eventCount',10,
  {andGroup:{expressions:[
    {filter:{fieldName:'eventName',stringFilter:{value:'dream_search'}}},
    {filter:{fieldName:'customEvent:result_count',stringFilter:{value:'0'}}}]}}).catch(()=>[]);

const prevMap = o => Object.fromEntries(o);
const sp=prevMap(srcPrev), pp=prevMap(pgPrev), ep=prevMap(evPrev);
const pct=(c,p)=> p? ((c-p)/p*100).toFixed(0)+'%' : (c?'신규':'0');
const arrow=(c,p)=> c>p?'🔺':c<p?'🔻':'―';
const fmt=n=>n.toLocaleString('ko-KR');
const row3=(label,c,p,f=fmt)=>`<tr><td>${label}</td><td align="right"><b>${f(c)}</b></td><td align="right">${f(p)}</td><td align="right">${arrow(c,p)} ${pct(c,p)}</td></tr>`;

const KEY_EVENTS=['cta_lucky_click','lucky_view','dream_search','related_click','share_click','page_404','memimo_click','fallback_used','cta_landing','saju_open'];
const evRows = KEY_EVENTS.map(e=>{
  const c = evCur.find(x=>x[0]===e)?.[1]||0, p = ep[e]||0;
  return (c||p)? row3(e,c,p):'';
}).join('');

const html = `<div style="font-family:sans-serif;max-width:640px">
<h2>🌙 꿈해몽 행운 — 주간 리포트</h2>
<p style="color:#666">최근 7일 vs 그 전 7일 · 자동 발송</p>
<h3>핵심 지표</h3>
<table border="0" cellpadding="6" style="border-collapse:collapse;width:100%;font-size:14px">
<tr style="background:#f4f0e6"><th align="left">지표</th><th align="right">이번 주</th><th align="right">지난주</th><th align="right">변동</th></tr>
${row3('사용자',cur.users,prev.users)}
${row3('세션',cur.sessions,prev.sessions)}
${row3('페이지뷰',cur.views,prev.views)}
${row3('세션당 페이지',cur.ppages,prev.ppages,n=>n.toFixed(2))}
${row3('참여율',cur.engage*100,prev.engage*100,n=>n.toFixed(1)+'%')}
${row3('평균 세션(초)',cur.dur,prev.dur,n=>n.toFixed(0))}
</table>
<h3>퍼널·이벤트</h3>
<table border="0" cellpadding="6" style="border-collapse:collapse;width:100%;font-size:14px">
<tr style="background:#f4f0e6"><th align="left">이벤트</th><th align="right">이번 주</th><th align="right">지난주</th><th align="right">변동</th></tr>
${evRows||'<tr><td colspan=4>수집된 커스텀 이벤트 없음</td></tr>'}
</table>
<h3>유입 소스 Top</h3>
<table border="0" cellpadding="6" style="border-collapse:collapse;width:100%;font-size:14px">
<tr style="background:#f4f0e6"><th align="left">소스</th><th align="right">이번 주</th><th align="right">지난주</th><th align="right">변동</th></tr>
${srcCur.map(([s,c])=>row3(s,c,sp[s]||0)).join('')}
</table>
<h3>페이지 Top 10</h3>
<table border="0" cellpadding="6" style="border-collapse:collapse;width:100%;font-size:14px">
<tr style="background:#f4f0e6"><th align="left">경로</th><th align="right">이번 주</th><th align="right">지난주</th><th align="right">변동</th></tr>
${pgCur.map(([s,c])=>row3(s,c,pp[s]||0)).join('')}
</table>
${fails.length?`<h3>검색 실패어 (신규 콘텐츠 후보)</h3><ul>${fails.map(([q,c])=>`<li>${q} (${c}회)</li>`).join('')}</ul>`:''}
<p style="color:#999;font-size:12px">상세 분석·제안이 필요하면 Claude Code에서 /ops 를 실행하세요.</p>
</div>`;
writeFileSync('report.html', html);
console.log(`리포트 생성 완료 — 사용자 ${cur.users} (지난주 ${prev.users})`);
