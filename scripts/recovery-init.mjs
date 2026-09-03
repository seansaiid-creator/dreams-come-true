// 회복 추적 초기화 — 도메인 전환(2026-09-02) 이전 30일 실측으로 기준선과 추적 대상을 만든다.
// 사용: node scripts/recovery-init.mjs
// 산출물: scripts/recovery-baseline.json, scripts/recovery-targets.json, scripts/recovery-top50.txt
// 의존성 0. GA4 키는 레포 밖(~/.config/dreams-ga4/sa-key.json).

import { readFileSync, writeFileSync } from 'node:fs';
import { createSign } from 'node:crypto';
import { homedir } from 'node:os';

const PROPERTY = '528679246';
const BASE_START = '2026-08-03';   // 도메인 전환 직전 30일
const BASE_END   = '2026-09-01';

const key = JSON.parse(readFileSync(process.env.GA4_KEY || `${homedir()}/.config/dreams-ga4/sa-key.json`, 'utf8'));
const b64 = o => Buffer.from(JSON.stringify(o)).toString('base64url');
const now = Math.floor(Date.now() / 1000);
const jh = b64({ alg: 'RS256', typ: 'JWT' });
const jc = b64({
  iss: key.client_email,
  scope: 'https://www.googleapis.com/auth/analytics.readonly',
  aud: 'https://oauth2.googleapis.com/token',
  iat: now, exp: now + 3600,
});
const s = createSign('RSA-SHA256'); s.update(`${jh}.${jc}`);
const tok = await (await fetch('https://oauth2.googleapis.com/token', {
  method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jh}.${jc}.${s.sign(key.private_key, 'base64url')}`,
})).json();
if (!tok.access_token) { console.error('토큰 발급 실패:', JSON.stringify(tok)); process.exit(1); }
const H = { Authorization: `Bearer ${tok.access_token}`, 'Content-Type': 'application/json' };
const run = b => fetch(`https://analyticsdata.googleapis.com/v1beta/properties/${PROPERTY}:runReport`,
  { method: 'POST', headers: H, body: JSON.stringify(b) }).then(r => r.json());

// ── 1. 기준선: 전환 전 30일 일평균 ──
const d = await run({
  dateRanges: [{ startDate: BASE_START, endDate: BASE_END }],
  dimensions: [{ name: 'date' }],
  metrics: [{ name: 'activeUsers' }, { name: 'newUsers' }, { name: 'sessions' }],
});
const days = (d.rows || []).map(r => ({
  u: +r.metricValues[0].value, n: +r.metricValues[1].value, s: +r.metricValues[2].value,
}));
const mean = k => +(days.reduce((a, b) => a + b[k], 0) / days.length).toFixed(1);
const baseline = {
  period: `${BASE_START} ~ ${BASE_END}`,
  days: days.length,
  avgUsers: mean('u'), avgNewUsers: mean('n'), avgSessions: mean('s'),
  minUsers: Math.min(...days.map(x => x.u)), maxUsers: Math.max(...days.map(x => x.u)),
  note: '도메인 전환(2026-09-02) 직전 30일 실측. 7일 평균이 avgUsers를 회복하면 추적 종료.',
};
writeFileSync('scripts/recovery-baseline.json', JSON.stringify(baseline, null, 1));

// ── 2. 상위 랜딩 페이지 50 ──
const lp = await run({
  dateRanges: [{ startDate: BASE_START, endDate: BASE_END }],
  dimensions: [{ name: 'landingPage' }],
  metrics: [{ name: 'sessions' }, { name: 'activeUsers' }],
  orderBys: [{ metric: { metricName: 'sessions' }, desc: true }],
  limit: 300,
});
const pages = (lp.rows || [])
  .map(r => ({ path: r.dimensionValues[0].value, sessions: +r.metricValues[0].value, users: +r.metricValues[1].value }))
  .filter(x => x.path.startsWith('/') && x.path.endsWith('.html'));
const top = pages.slice(0, 50);

// ── 3. 추적 검색어: 각 페이지의 <h1>에서 추출 (제목 기반 추정치) ──
const targets = [];
for (const p of top) {
  const file = '.' + p.path;
  let kw = null;
  try {
    const html = readFileSync(file, 'utf8');
    const m = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/);
    if (m) kw = m[1].replace(/<[^>]+>/g, '').split('해몽')[0].replace(/\s+/g, ' ').trim();
  } catch { /* 파일 없음 */ }
  targets.push({ path: p.path, sessions: p.sessions, kw: kw || p.path.replace(/^\/dream-|\.html$/g, '') });
}
writeFileSync('scripts/recovery-targets.json', JSON.stringify(targets, null, 1));
writeFileSync('scripts/recovery-top50.txt', top.map(x => `https://suksuki.com${x.path}`).join('\n') + '\n');

// ── 출력 ──
console.log(`■ 기준선 (${baseline.period}, ${baseline.days}일)`);
console.log(`   일평균 사용자 ${baseline.avgUsers} · 신규 ${baseline.avgNewUsers} · 세션 ${baseline.avgSessions}`);
console.log(`   일 사용자 범위 ${baseline.minUsers} ~ ${baseline.maxUsers}`);
console.log(`\n■ 랜딩 페이지 ${pages.length}종 / 상위 50 세션합 ${top.reduce((a, b) => a + b.sessions, 0)} (전체 ${pages.reduce((a, b) => a + b.sessions, 0)})\n`);
console.log('순위  세션  사용자  URL');
top.forEach((x, i) => console.log(`${String(i + 1).padStart(3)}  ${String(x.sessions).padStart(4)}  ${String(x.users).padStart(5)}   https://suksuki.com${x.path}`));
console.log('\n생성: scripts/recovery-baseline.json, scripts/recovery-targets.json, scripts/recovery-top50.txt');
