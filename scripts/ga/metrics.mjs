#!/usr/bin/env node
/* metrics.mjs — 꿈해몽 행운 지표 단일 진실원(single source of truth)
 *
 * 왜 만들었나 (2026-09-04):
 *   같은 날 데이터 오류가 3건 났고 전부 같은 유형이었다 —
 *   "그 지표가 존재하지 않던 기간"을 분모에 넣었다.
 *     · saju_entry_click "30일간 0건"  → 실제 계측 시작 09-03 (2일치)
 *     · 90% 스크롤 "13%"               → 계측 이전 8월 수치를 인용
 *     · 9/3 사용자 "20명"              → 처리 미완 시점 값을 확정치로 씀
 *   조심해서 막을 문제가 아니라 계산 방식의 결함이므로 도구로 막는다.
 *
 * 이 스크립트가 보장하는 것
 *   1) 계측 시작일: 각 커스텀 이벤트가 코드에 들어간 날을 git에서 찾는다(권위 있는 값).
 *      그 이전 날짜는 분모에서 자동 제외한다.
 *   2) 확정 여부: 매 실행의 값을 history에 쌓고, 직전 실행과 값이 같아야 '확정'으로 본다.
 *      GA4 처리 지연을 가정하지 않고 관측으로 판정한다.
 *   3) 표본 경고: 분모가 작으면 비율을 신뢰하지 말라고 표시한다.
 *   4) 산출물 1개: docs/metrics/latest.md — 모든 창은 이 파일의 수치만 인용한다.
 *
 * 사용: node scripts/ga/metrics.mjs [--days 60]
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { createSign } from 'node:crypto';
import { homedir } from 'node:os';

const PROPERTY = '528679246';
const DAYS = +(process.argv.find(a => a.startsWith('--days='))?.split('=')[1] || 60);
const DIR = 'docs/metrics';
const HIST = `${DIR}/history.json`;
const OUT = `${DIR}/latest.md`;
const MIN_DENOM = 300;   // 분모가 이보다 작으면 비율 신뢰 불가로 표시
const MIN_EVENTS = 30;   // 분자가 이보다 작으면 같이 경고

// 검증 오염일 — 배포 확인을 위해 내가(운영자·에이전트) 직접 페이지를 열어
// 실제 사용자 데이터에 조회수·이벤트가 섞인 날. 비율의 분모·분자에서 통째로 뺀다.
// 넣기 전에 반드시 근거를 적는다. 추측으로 날짜를 빼면 그것도 데이터 조작이다.
const QA_DATES = new Map([
  ['20260906', '리디자인 1단계 배포 검증 — 상세 페이지 약 13회 직접 열람, scroll_25/50/75 3건 강제 발화'],
]);

// ── GA4 토큰 ──
const key = JSON.parse(readFileSync(process.env.GA4_KEY || `${homedir()}/.config/dreams-ga4/sa-key.json`, 'utf8'));
const b64 = o => Buffer.from(JSON.stringify(o)).toString('base64url');
const now = Math.floor(Date.now() / 1000);
const jh = b64({ alg: 'RS256', typ: 'JWT' });
const jc = b64({ iss: key.client_email, scope: 'https://www.googleapis.com/auth/analytics.readonly',
                 aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600 });
const sg = createSign('RSA-SHA256'); sg.update(`${jh}.${jc}`);
const tok = await (await fetch('https://oauth2.googleapis.com/token', {
  method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jh}.${jc}.${sg.sign(key.private_key, 'base64url')}`,
})).json();
if (!tok.access_token) { console.error('토큰 실패:', JSON.stringify(tok)); process.exit(1); }
const H = { Authorization: `Bearer ${tok.access_token}`, 'Content-Type': 'application/json' };
const run = b => fetch(`https://analyticsdata.googleapis.com/v1beta/properties/${PROPERTY}:runReport`,
  { method: 'POST', headers: H, body: JSON.stringify(b) }).then(r => r.json());

const kst = new Date(Date.now() + 9 * 3600e3);
const today = kst.toISOString().slice(0, 10).replace(/-/g, '');
const fmt = d => `${d.slice(0,4)}-${d.slice(4,6)}-${d.slice(6)}`;

// ── 1. 이벤트별 계측 시작일: git에서 코드가 들어간 날 (권위) ──
function deployDate(ev) {
  try {
    const out = execSync(
      `git log --reverse --format=%ad --date=format:%Y%m%d -S"${ev}" -- '*.html' 'saju*.js' 'scripts/page-template.html' 2>/dev/null | head -1`,
      { encoding: 'utf8', shell: '/bin/bash' }).trim();
    return /^\d{8}$/.test(out) ? out : null;
  } catch { return null; }
}

// ── 2. 일별 × 이벤트 수집 ──
const ev = await run({
  dateRanges: [{ startDate: `${DAYS}daysAgo`, endDate: 'today' }],
  dimensions: [{ name: 'date' }, { name: 'eventName' }],
  metrics: [{ name: 'eventCount' }], limit: 5000,
});
if (ev.error) { console.error('GA4 오류:', ev.error.message); process.exit(1); }
const byDate = {}, firstSeen = {};
for (const r of ev.rows || []) {
  const d = r.dimensionValues[0].value, e = r.dimensionValues[1].value, n = +r.metricValues[0].value;
  (byDate[d] ??= {})[e] = n;
  if (!firstSeen[e] || d < firstSeen[e]) firstSeen[e] = d;
}

// ── 3. 일별 사용자/세션 ──
const ua = await run({
  dateRanges: [{ startDate: `${DAYS}daysAgo`, endDate: 'today' }],
  dimensions: [{ name: 'date' }],
  metrics: [{ name: 'activeUsers' }, { name: 'newUsers' }, { name: 'sessions' }, { name: 'screenPageViews' }],
});
const daily = {};
for (const r of ua.rows || []) daily[r.dimensionValues[0].value] = {
  users: +r.metricValues[0].value, newUsers: +r.metricValues[1].value,
  sessions: +r.metricValues[2].value, pv: +r.metricValues[3].value,
};

// ── 4. 확정 판정: 직전 실행과 값이 같은 날짜만 확정 ──
if (!existsSync(DIR)) mkdirSync(DIR, { recursive: true });
const hist = existsSync(HIST) ? JSON.parse(readFileSync(HIST, 'utf8')) : { runs: [] };
const prev = hist.runs.at(-1)?.daily || {};
// 판정 근거는 두 가지. 관측(스냅샷 비교)이 우선이고, 없으면 나이 기준 잠정 판정.
// 나이 기준값 3일은 관측 근거가 있다 — 9/3 사용자가 9/4 저녁에 20→22로 변했다(1일 이상 지연).
const AGE_SETTLE = 3;
const ymd = d => new Date(+d.slice(0,4), +d.slice(4,6)-1, +d.slice(6));
const ageDays = d => Math.round((ymd(today) - ymd(d)) / 86400e3);
const settled = {}, basis = {}, unsettled = [];
for (const d of Object.keys(daily)) {
  if (d >= today) { settled[d] = false; basis[d] = 'today'; unsettled.push([d, '오늘 — 수집 중']); continue; }
  const p = prev[d];
  if (p) {
    const same = p.users === daily[d].users && p.pv === daily[d].pv && p.sessions === daily[d].sessions;
    settled[d] = same; basis[d] = 'observed';
    if (!same) unsettled.push([d, `직전 실행과 다름 (사용자 ${p.users}→${daily[d].users}) — 관측`]);
  } else if (ageDays(d) >= AGE_SETTLE) {
    settled[d] = true; basis[d] = 'age';           // 잠정: 관측으로 확인된 값 아님
  } else {
    settled[d] = false; basis[d] = 'age';
    unsettled.push([d, `${ageDays(d)}일 전 — 지연 구간(3일 미만), 스냅샷 미보유`]);
  }
}
const nAge = Object.values(basis).filter(b => b === 'age').length;
const nObs = Object.values(basis).filter(b => b === 'observed').length;
hist.runs.push({ ts: new Date().toISOString(), daily });
hist.runs = hist.runs.slice(-30);
writeFileSync(HIST, JSON.stringify(hist, null, 1));

const settledDates = Object.keys(daily).filter(d => settled[d] && !QA_DATES.has(d)).sort();
const lastSettled = settledDates.at(-1) || null;
const qaHit = [...QA_DATES.keys()].filter(d => daily[d]).sort();

// ── 5. 이벤트별 유효 창에서만 비율 계산 ──
const AUTO = new Set(['page_view','session_start','first_visit','user_engagement','scroll','view_search_results','click']);
const rows = [];
for (const e of Object.keys(firstSeen).sort()) {
  const dep = AUTO.has(e) ? null : deployDate(e);
  const start = dep && dep > firstSeen[e] ? dep : firstSeen[e];   // 둘 중 늦은 쪽이 안전
  const win = settledDates.filter(d => d >= start);
  if (!win.length) { rows.push({ e, start, days: 0, n: 0, denom: 0, note: '확정 데이터 없음' }); continue; }
  const n = win.reduce((a, d) => a + (byDate[d]?.[e] || 0), 0);
  const denom = win.reduce((a, d) => a + (byDate[d]?.page_view || 0), 0);
  rows.push({ e, start, days: win.length, n, denom, from: win[0], to: win.at(-1),
              rate: denom ? n / denom * 100 : null,
              weak: denom < MIN_DENOM || n < MIN_EVENTS });
}

// ── 6. 출력 ──
const L = [];
L.push('# 지표 단일 진실원 (자동 생성 — 손으로 고치지 말 것)');
L.push('');
L.push(`> 생성: ${kst.toISOString().slice(0,16).replace('T',' ')} KST · \`node scripts/ga/metrics.mjs\``);
L.push('> **모든 창은 이 파일의 수치만 인용한다.** 직접 계산한 값을 문서에 적지 않는다.');
L.push('> 비율은 **각 지표의 계측 시작일 이후 · 확정된 날짜만**으로 계산된다(분모 오염 방지).');
L.push('');
L.push(`**확정 구간**: ${settledDates.length ? `${fmt(settledDates[0])} ~ ${fmt(lastSettled)} (${settledDates.length}일)` : '없음 — 스냅샷을 2회 이상 쌓아야 판정 가능'}`);
L.push('');
L.push(`**판정 근거**: 관측(스냅샷 비교) ${nObs}일 · 잠정(3일 경과, 스냅샷 미보유) ${nAge}일`);
if (nObs === 0) L.push('> ⚠️ 첫 실행이라 관측 기반 판정이 없다. 내일 한 번 더 돌리면 관측으로 바뀐다.');
L.push('');
if (qaHit.length) {
  L.push('**검증 오염으로 제외한 날**');
  for (const d of qaHit) L.push(`- ${fmt(d)} — ${QA_DATES.get(d)}`);
  L.push('');
}
if (unsettled.length) {
  L.push('**미확정(판정에 쓰지 말 것)**');
  for (const [d, why] of unsettled.sort().slice(-8)) L.push(`- ${fmt(d)} — ${why}`);
  if (unsettled.length > 8) L.push(`- … 외 ${unsettled.length - 8}일`);
  L.push('');
}
L.push('## 일별 (확정만)');
L.push('| 일자 | 사용자 | 신규 | 세션 | 조회 |');
L.push('|---|---|---|---|---|');
for (const d of settledDates.slice(-10)) {
  const x = daily[d];
  L.push(`| ${fmt(d)} | ${x.users} | ${x.newUsers} | ${x.sessions} | ${x.pv} |`);
}
L.push('');
L.push('## 이벤트 — 계측 시작일과 유효 표본');
L.push('| 이벤트 | 계측 시작 | 확정일수 | 건수 | 분모(조회) | 비율 | 신뢰 |');
L.push('|---|---|---|---|---|---|---|');
for (const r of rows.sort((a, b) => (b.n - a.n))) {
  const rate = r.rate == null ? '—' : `${r.rate.toFixed(2)}%`;
  const trust = r.days === 0 ? '❌ 데이터 없음' : r.weak ? `⚠️ 표본 부족 (분모 ${r.denom}, 건수 ${r.n})` : '✅';
  L.push(`| \`${r.e}\` | ${r.start ? fmt(r.start) : '?'} | ${r.days} | ${r.n} | ${r.denom} | ${rate} | ${trust} |`);
}
L.push('');
L.push('## 이 파일을 읽는 법');
L.push(`- **⚠️ 표시가 있으면 비율을 인용하지 않는다.** 분모 ${MIN_DENOM} 또는 건수 ${MIN_EVENTS} 미만이면 잡음이다`);
L.push('- **계측 시작일 이전 기간을 분모에 넣지 않는다.** 이 표가 이미 잘라냈다');
L.push('- 미확정 날짜는 며칠 뒤 값이 바뀐다. 실제로 9/3 사용자는 20 → 22로 변했다');
L.push('- 급락이 의심되면 `node scripts/ga/ga-rt.mjs`(실시간, 처리 지연 없음)부터 본다');
writeFileSync(OUT, L.join('\n') + '\n');

console.log(L.join('\n'));
console.error(`\n[저장] ${OUT} · ${HIST} (실행 ${hist.runs.length}회 누적)`);
