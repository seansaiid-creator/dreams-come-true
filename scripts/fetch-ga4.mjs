// GA4 Data API 수집기 — 의존성 0, 서비스 계정 키는 레포 밖(~/.config/dreams-ga4/)에만 둔다.
// 사용: node scripts/fetch-ga4.mjs [일수=7]
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createSign } from 'node:crypto';
import { homedir } from 'node:os';

const PROPERTY = '528679246'; // GA4 속성 ID (URL의 p 뒤 숫자)
const KEY_PATH = process.env.GA4_KEY || `${homedir()}/.config/dreams-ga4/sa-key.json`;
const DAYS = parseInt(process.argv[2] || '7', 10);

let key;
try { key = JSON.parse(readFileSync(KEY_PATH, 'utf8')); }
catch { console.error(`서비스 계정 키가 없습니다: ${KEY_PATH}\nGCP에서 JSON 키를 받아 위 경로에 저장하세요.`); process.exit(1); }

// ── 서비스 계정 JWT → 액세스 토큰 ──
const b64 = o => Buffer.from(JSON.stringify(o)).toString('base64url');
const now = Math.floor(Date.now() / 1000);
const jwtHeader = b64({ alg: 'RS256', typ: 'JWT' });
const jwtClaim = b64({
  iss: key.client_email,
  scope: 'https://www.googleapis.com/auth/analytics.readonly',
  aud: 'https://oauth2.googleapis.com/token',
  iat: now, exp: now + 3600,
});
const signer = createSign('RSA-SHA256');
signer.update(`${jwtHeader}.${jwtClaim}`);
const jwt = `${jwtHeader}.${jwtClaim}.${signer.sign(key.private_key, 'base64url')}`;

const tokRes = await fetch('https://oauth2.googleapis.com/token', {
  method: 'POST',
  headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`,
});
const tok = await tokRes.json();
if (!tok.access_token) { console.error('토큰 발급 실패:', JSON.stringify(tok)); process.exit(1); }

// ── 리포트 요청 ──
async function report(name, body) {
  const r = await fetch(`https://analyticsdata.googleapis.com/v1beta/properties/${PROPERTY}:runReport`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${tok.access_token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ dateRanges: [{ startDate: `${DAYS}daysAgo`, endDate: 'today' }], limit: 250, ...body }),
  });
  const j = await r.json();
  if (j.error) { console.error(name, '실패:', j.error.message); return null; }
  const dims = (j.dimensionHeaders||[]).map(h=>h.name);
  const mets = (j.metricHeaders||[]).map(h=>h.name);
  const rows = (j.rows||[]).map(row => Object.fromEntries([
    ...row.dimensionValues.map((v,i)=>[dims[i],v.value]),
    ...row.metricValues.map((v,i)=>[mets[i],Number(v.value)]),
  ]));
  console.log(`${name}: ${rows.length}행`);
  return rows;
}

const out = {
  fetchedAt: new Date(Date.now()+9*3600e3).toISOString().slice(0,16)+' KST',
  rangeDays: DAYS,
  daily: await report('일별 사용자', { dimensions:[{name:'date'}], metrics:[{name:'activeUsers'},{name:'sessions'}], orderBys:[{dimension:{dimensionName:'date'}}] }),
  sources: await report('유입 소스', { dimensions:[{name:'sessionSourceMedium'}], metrics:[{name:'sessions'},{name:'engagementRate'}], orderBys:[{metric:{metricName:'sessions'},desc:true}] }),
  pages: await report('페이지', { dimensions:[{name:'pagePath'}], metrics:[{name:'screenPageViews'},{name:'activeUsers'},{name:'userEngagementDuration'}], orderBys:[{metric:{metricName:'screenPageViews'},desc:true}] }),
  events: await report('이벤트', { dimensions:[{name:'eventName'}], metrics:[{name:'eventCount'},{name:'totalUsers'}], orderBys:[{metric:{metricName:'eventCount'},desc:true}] }),
  searches: await report('검색어(dream_search)', { dimensions:[{name:'customEvent:query'},{name:'customEvent:result_count'}], metrics:[{name:'eventCount'}], dimensionFilter:{filter:{fieldName:'eventName',stringFilter:{value:'dream_search'}}}, orderBys:[{metric:{metricName:'eventCount'},desc:true}] }),
};
mkdirSync('ga4', { recursive: true });
writeFileSync('ga4/auto-report.json', JSON.stringify(out, null, 1));
console.log('저장: ga4/auto-report.json (git 미추적 폴더)');
