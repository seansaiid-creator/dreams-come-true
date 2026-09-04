// 네이버 재색인 회복 추적기 — 도메인 전환(2026-09-02) 후 검색 노출·유입 회복 여부를 매일 실측한다.
// 사용: node scripts/naver-recovery-check.mjs
// 의존성 0. GA4 키는 레포 밖(~/.config/dreams-ga4/sa-key.json).
//
// 원칙(OPERATIONS.md §0): 추측하지 않는다. 실측값만 출력하고, 확인 못 한 항목은 "확인불가"로 적는다.

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { createSign } from 'node:crypto';
import { homedir } from 'node:os';

const PROPERTY = '528679246';
const KEY_PATH = process.env.GA4_KEY || `${homedir()}/.config/dreams-ga4/sa-key.json`;
const STATE = 'content-queue/recovery-log.json';

// ── 기준선: 도메인 전환 직전 30일(2026-08-03 ~ 09-01) 실측치. scripts/recovery-baseline.json이 있으면 그걸 쓴다.
const BASE_FILE = 'scripts/recovery-baseline.json';
const baseline = existsSync(BASE_FILE) ? JSON.parse(readFileSync(BASE_FILE, 'utf8')) : null;

// ── GA4 토큰 ──
const key = JSON.parse(readFileSync(KEY_PATH, 'utf8'));
const b64 = o => Buffer.from(JSON.stringify(o)).toString('base64url');
const now = Math.floor(Date.now() / 1000);
const jh = b64({ alg: 'RS256', typ: 'JWT' });
const jc = b64({
  iss: key.client_email,
  scope: 'https://www.googleapis.com/auth/analytics.readonly',
  aud: 'https://oauth2.googleapis.com/token',
  iat: now, exp: now + 3600,
});
const signer = createSign('RSA-SHA256'); signer.update(`${jh}.${jc}`);
const jwt = `${jh}.${jc}.${signer.sign(key.private_key, 'base64url')}`;
const tok = await (await fetch('https://oauth2.googleapis.com/token', {
  method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`,
})).json();
if (!tok.access_token) { console.error('토큰 발급 실패:', JSON.stringify(tok)); process.exit(1); }
const H = { Authorization: `Bearer ${tok.access_token}`, 'Content-Type': 'application/json' };
const run = b => fetch(`https://analyticsdata.googleapis.com/v1beta/properties/${PROPERTY}:runReport`,
  { method: 'POST', headers: H, body: JSON.stringify(b) }).then(r => r.json());

// ── 1. 일별 사용자 (완성 데이터만 판단: 오늘·어제는 처리 지연 가능 → 표기만 하고 판정에서 제외) ──
const daily = await run({
  dateRanges: [{ startDate: '35daysAgo', endDate: 'today' }],
  dimensions: [{ name: 'date' }],
  metrics: [{ name: 'activeUsers' }, { name: 'newUsers' }, { name: 'sessions' }],
  orderBys: [{ dimension: { dimensionName: 'date' } }],
});
const rows = (daily.rows || []).map(r => ({
  d: r.dimensionValues[0].value,
  u: +r.metricValues[0].value, n: +r.metricValues[1].value, s: +r.metricValues[2].value,
}));
const fmt = d => `${d.slice(4, 6)}-${d.slice(6)}`;
const kstToday = new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10).replace(/-/g, '');

// 판정 대상 = 오늘을 뺀 완성 데이터. GA4 처리 지연은 통상 당일 몇 시간 내이므로
// 다음날 오전 시점에는 어제까지는 완성됐다고 본다(시간대별 대조로 확인됨).
const settled = rows.filter(r => r.d < kstToday);
const last7 = settled.slice(-7);
const avg = a => a.length ? +(a.reduce((x, y) => x + y.u, 0) / a.length).toFixed(1) : null;
const avgN = a => a.length ? +(a.reduce((x, y) => x + y.n, 0) / a.length).toFixed(1) : null;

// ── 2. 네이버 검색 노출 — 상위 페이지의 대표 검색어로 실제 조회 ──
// 검색어는 페이지 제목에서 추출한 추정치다. 실제 사용자 질의는 서치어드바이저 「콘텐츠 노출/클릭」에만 있다.
const TARGETS = JSON.parse(readFileSync('scripts/recovery-targets.json', 'utf8'));
const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1';
const vis = [];
for (const t of TARGETS) {
  let hitNew = null, hitOld = null, err = null;
  try {
    const res = await fetch(`https://m.search.naver.com/search.naver?query=${encodeURIComponent(t.kw)}`,
      { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(15000) });
    const html = await res.text();
    hitNew = (html.match(/suksuki\.com/g) || []).length;
    hitOld = (html.match(/dreams-come-true-ten\.vercel\.app/g) || []).length;
  } catch (e) { err = String(e.message || e).slice(0, 60); }
  vis.push({ ...t, hitNew, hitOld, err });
  await new Promise(r => setTimeout(r, 1200)); // 과도한 요청 방지
}
const shown = vis.filter(v => v.hitNew > 0).length;
const onlyOld = vis.filter(v => v.hitNew === 0 && v.hitOld > 0).length;
const gone = vis.filter(v => v.hitNew === 0 && v.hitOld === 0 && !v.err).length;
const failed = vis.filter(v => v.err).length;
const lostSessions = vis.filter(v => v.hitNew === 0 && !v.err).reduce((a, b) => a + (b.sessions || 0), 0);
const totSessions = vis.reduce((a, b) => a + (b.sessions || 0), 0);

// ── 출력 ──
const L = [];
L.push(`# 네이버 회복 추적 — ${new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 16).replace('T', ' ')} KST`);
L.push('');
L.push('## 1. 유입 (완성 데이터 기준 — 오늘만 GA4 처리 지연으로 판정 제외)');
if (baseline) {
  L.push(`- 기준선(전환 전 30일 평균): 사용자 **${baseline.avgUsers}** · 신규 **${baseline.avgNewUsers}** · 세션 **${baseline.avgSessions}**`);
}
L.push(`- 최근 7일(완성) 평균: 사용자 **${avg(last7)}** · 신규 **${avgN(last7)}**`);
// 전환일(2026-09-02) 이후 날짜만으로 판정한다. 전환 전 날짜가 섞이면 감소가 가려진다.
const MIGRATION = '20260902';
const post = settled.filter(r => r.d >= MIGRATION);
if (baseline && avg(last7) != null) {
  const pct = ((avg(last7) / baseline.avgUsers - 1) * 100).toFixed(0);
  const mixed = last7.some(r => r.d < MIGRATION);
  L.push(`- 기준선 대비 7일평균: **${pct}%**${mixed ? '  ⚠️ 전환 전 날짜가 섞여 있어 판정 불가' : ''}`);
}
if (post.length) {
  const pAvg = avg(post), pPct = baseline ? ((pAvg / baseline.avgUsers - 1) * 100).toFixed(0) : null;
  L.push(`- **전환 후 완성 데이터 ${post.length}일 평균: 사용자 ${pAvg}** ${pPct != null ? `(기준선 대비 **${pPct}%**)` : ''}`);
  L.push(`  ${baseline && pAvg >= baseline.avgUsers ? '→ **회복**' : '→ 미회복'}`);
} else {
  L.push('- 전환 후 완성 데이터가 아직 없다 (GA4 처리 지연). **판정 불가.**');
}
L.push('');
L.push('| 일자 | 사용자 | 신규 | 세션 | 비고 |');
L.push('|---|---|---|---|---|');
for (const r of rows.slice(-10)) {
  const note = r.d >= kstToday ? '처리중(판정제외)' : (r.d === '20260902' ? '도메인 전환' : '');
  L.push(`| ${fmt(r.d)} | ${r.u} | ${r.n} | ${r.s} | ${note} |`);
}
L.push('');
L.push(`## 2. 네이버 검색 노출 (m.search.naver.com 실측)`);
L.push(`- 신 도메인 노출 **${shown}/${vis.length}** · 구 도메인만 ${onlyOld} · 양쪽 미노출 **${gone}** · 조회실패 ${failed}`);
L.push(`- 미노출 페이지의 전환 전 세션 합계: **${lostSessions}** / 추적대상 ${totSessions}`);
L.push('');
L.push('| 검색어 | 전환전 세션 | suksuki | 구도메인 | 상태 |');
L.push('|---|---|---|---|---|');
for (const v of vis) {
  const st = v.err ? `조회실패(${v.err})` : v.hitNew > 0 ? '✅ 노출' : v.hitOld > 0 ? '⚠️ 구도메인만' : '❌ 미노출';
  L.push(`| ${v.kw} | ${v.sessions ?? '-'} | ${v.hitNew ?? '-'} | ${v.hitOld ?? '-'} | ${st} |`);
}
L.push('');
L.push('> 검색어는 페이지 제목에서 추출한 **추정치**다. 실제 사용자 질의는 네이버 서치어드바이저');
L.push('> 「리포트 → 콘텐츠 노출/클릭」에만 있으며, 이 스크립트로는 확인할 수 없다.');

const out = L.join('\n');
console.log(out);

// ── 이력 저장 (추세 비교용) ──
const log = existsSync(STATE) ? JSON.parse(readFileSync(STATE, 'utf8')) : [];
log.push({
  ts: new Date().toISOString(),
  avgUsers7: avg(last7), avgNew7: avgN(last7),
  naverShown: shown, naverGone: gone, naverOnlyOld: onlyOld, lostSessions,
});
writeFileSync(STATE, JSON.stringify(log, null, 1));
