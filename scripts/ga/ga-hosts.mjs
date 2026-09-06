#!/usr/bin/env node
/**
 * 태그가 실제로 발화한 호스트(도메인)를 뽑는다.
 *
 * 계기: 2026-09-06 GA4 태그 진단이 "구성을 위해 감지된 추가 도메인"을 경고했다.
 * 어떤 도메인인지 추측하지 않고 hostName 차원으로 직접 확인한다.
 *
 * 도메인 구성(교차 도메인 측정)은 "이 도메인들은 같은 사이트다"를 태그에 알려주는 설정이다.
 * 등록되지 않은 도메인 사이를 이동하면 세션이 끊기고 유입원이 (not set)/자기참조로 남는다.
 *
 * 사용: node scripts/ga/ga-hosts.mjs [--days=30]
 */
import { readFileSync } from 'node:fs';
import { createSign } from 'node:crypto';
import { homedir } from 'node:os';

const PROPERTY = '528679246';
const DAYS = +(process.argv.find(a => a.startsWith('--days='))?.split('=')[1] || 30);

const key = JSON.parse(readFileSync(process.env.GA4_KEY || `${homedir()}/.config/dreams-ga4/sa-key.json`, 'utf8'));
const b64 = o => Buffer.from(JSON.stringify(o)).toString('base64url');
const now = Math.floor(Date.now() / 1000);
const jh = b64({ alg: 'RS256', typ: 'JWT' });
const jc = b64({ iss: key.client_email, scope: 'https://www.googleapis.com/auth/analytics.readonly',
                 aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600 });
const sg = createSign('RSA-SHA256'); sg.update(`${jh}.${jc}`);
const tok = await (await fetch('https://oauth2.googleapis.com/token', {
  method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jh}.${jc}.${sg.sign(key.private_key, 'base64url')}`
})).json();
const H = { Authorization: `Bearer ${tok.access_token}`, 'Content-Type': 'application/json' };
const run = b => fetch(`https://analyticsdata.googleapis.com/v1beta/properties/${PROPERTY}:runReport`,
  { method: 'POST', headers: H, body: JSON.stringify(b) }).then(r => r.json());

const pad = (s, n) => String(s).padEnd(n);

// ── 1. 호스트별 총량
const a = await run({
  dateRanges: [{ startDate: `${DAYS}daysAgo`, endDate: 'today' }],
  dimensions: [{ name: 'hostName' }],
  metrics: [{ name: 'screenPageViews' }, { name: 'sessions' }, { name: 'activeUsers' }],
  limit: 50,
});
const rows = (a.rows || []).map(r => ({
  host: r.dimensionValues[0].value || '(not set)',
  pv: +r.metricValues[0].value, s: +r.metricValues[1].value, u: +r.metricValues[2].value,
})).sort((x, y) => y.pv - x.pv);
const totPv = rows.reduce((t, r) => t + r.pv, 0) || 1;

console.log(`■ 태그가 발화한 호스트 (최근 ${DAYS}일)`);
console.log(`  ${pad('호스트', 40)} ${pad('조회', 8)} ${pad('세션', 7)} ${pad('사용자', 7)} 비중`);
for (const r of rows) {
  console.log(`  ${pad(r.host, 40)} ${pad(r.pv, 8)} ${pad(r.s, 7)} ${pad(r.u, 7)} ${(r.pv / totPv * 100).toFixed(1)}%`);
}
console.log(`  ${'─'.repeat(74)}\n  호스트 ${rows.length}개 · 총 조회 ${totPv}`);

// ── 2. 최근 7일 날짜×호스트 — 아직도 살아있는지 본다
const b = await run({
  dateRanges: [{ startDate: '7daysAgo', endDate: 'today' }],
  dimensions: [{ name: 'date' }, { name: 'hostName' }],
  metrics: [{ name: 'screenPageViews' }],
  limit: 300,
});
const grid = {}, hosts = new Set();
for (const r of b.rows || []) {
  const d = r.dimensionValues[0].value, h = r.dimensionValues[1].value || '(not set)';
  hosts.add(h); (grid[d] ||= {})[h] = +r.metricValues[0].value;
}
const hs = [...hosts];
console.log(`\n■ 최근 7일 날짜별 (아직 발화 중인 도메인 확인)`);
console.log(`  ${pad('일자', 12)}${hs.map(h => pad(h.slice(0, 26), 28)).join('')}`);
for (const d of Object.keys(grid).sort()) {
  console.log(`  ${pad(d, 12)}${hs.map(h => pad(grid[d][h] ?? 0, 28)).join('')}`);
}

// ── 3. 자기참조·미상 유입원 — 도메인 구성 누락의 대표 증상
const c = await run({
  dateRanges: [{ startDate: '14daysAgo', endDate: 'today' }],
  dimensions: [{ name: 'sessionSource' }],
  metrics: [{ name: 'sessions' }],
  limit: 30,
});
console.log(`\n■ 유입원 (최근 14일) — 자기 도메인이 유입원으로 잡히면 도메인 구성 누락 신호`);
for (const r of (c.rows || []).slice(0, 12)) {
  const src = r.dimensionValues[0].value;
  const flag = /suksuki|vercel/.test(src) ? '  ← 자기참조' : (src === '(not set)' ? '  ← 유실' : '');
  console.log(`  ${pad(src, 40)} ${pad(r.metricValues[0].value, 7)}${flag}`);
}
