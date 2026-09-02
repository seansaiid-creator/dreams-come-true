/* ═══════════════════════════════════════════════════════════════
   lunar-core.js — 한국 음력 ↔ 양력 변환 (의존성 0, 브라우저 계산)
   생년월일이 외부로 전송되지 않도록 서버·API를 쓰지 않는다.

   규칙 (한국 음력 = 시헌력 체계)
   - 달의 1일 = 삭(new moon)이 드는 날 (KST 자정 기준)
   - 11월 = 동지(황경 270°)가 드는 달
   - 두 동지월 사이에 13개월이 있으면 윤달 발생.
     중기(中氣, 황경 30°의 배수)가 없는 첫 달을 윤달로 한다.
   ═══════════════════════════════════════════════════════════════ */
const core = require('./saju-core.js');
const RAD = Math.PI / 180;

/* ── 삭(New Moon) 계산 — Meeus Astronomical Algorithms ch.49 ── */
function newMoonJD(k) {
  const T = k / 1236.85;
  const T2 = T * T, T3 = T2 * T, T4 = T3 * T;
  let jde = 2451550.09766 + 29.530588861 * k
    + 0.00015437 * T2 - 0.000000150 * T3 + 0.00000000073 * T4;
  const E = 1 - 0.002516 * T - 0.0000074 * T2;
  const M  = (2.5534 + 29.10535670 * k - 0.0000014 * T2 - 0.00000011 * T3) * RAD;      // 태양 평균근점이각
  const M1 = (201.5643 + 385.81693528 * k + 0.0107582 * T2 + 0.00001238 * T3 - 0.000000058 * T4) * RAD; // 달
  const F  = (160.7108 + 390.67050284 * k - 0.0016118 * T2 - 0.00000227 * T3 + 0.000000011 * T4) * RAD;
  const O  = (124.7746 - 1.56375588 * k + 0.0020672 * T2 + 0.00000215 * T3) * RAD;
  jde += -0.40720 * Math.sin(M1)
    + 0.17241 * E * Math.sin(M)
    + 0.01608 * Math.sin(2 * M1)
    + 0.01039 * Math.sin(2 * F)
    + 0.00739 * E * Math.sin(M1 - M)
    - 0.00514 * E * Math.sin(M1 + M)
    + 0.00208 * E * E * Math.sin(2 * M)
    - 0.00111 * Math.sin(M1 - 2 * F)
    - 0.00057 * Math.sin(M1 + 2 * F)
    + 0.00056 * E * Math.sin(2 * M1 + M)
    - 0.00042 * Math.sin(3 * M1)
    + 0.00042 * E * Math.sin(M + 2 * F)
    + 0.00038 * E * Math.sin(M - 2 * F)
    - 0.00024 * E * Math.sin(2 * M1 - M)
    - 0.00017 * Math.sin(O)
    - 0.00007 * Math.sin(M1 + 2 * M)
    + 0.00004 * Math.sin(2 * M1 - 2 * F)
    + 0.00004 * Math.sin(3 * M)
    + 0.00003 * Math.sin(M1 + M - 2 * F)
    + 0.00003 * Math.sin(2 * M1 + 2 * F)
    - 0.00003 * Math.sin(M1 + M + 2 * F)
    + 0.00003 * Math.sin(M1 - M + 2 * F)
    - 0.00002 * Math.sin(M1 - M - 2 * F)
    - 0.00002 * Math.sin(3 * M1 + M)
    + 0.00002 * Math.sin(4 * M1);
  // 추가 보정항
  const A = [
    [299.77 + 0.107408 * k - 0.009173 * T2, 0.000325],
    [251.88 + 0.016321 * k, 0.000165], [251.83 + 26.651886 * k, 0.000164],
    [349.42 + 36.412478 * k, 0.000126], [84.66 + 18.206239 * k, 0.000110],
    [141.74 + 53.303771 * k, 0.000062], [207.14 + 2.453732 * k, 0.000060],
    [154.84 + 7.306860 * k, 0.000056], [34.52 + 27.261239 * k, 0.000047],
    [207.19 + 0.121824 * k, 0.000042], [291.34 + 1.844379 * k, 0.000040],
    [161.72 + 24.198154 * k, 0.000037], [239.56 + 25.513099 * k, 0.000035],
    [331.55 + 3.592518 * k, 0.000023],
  ];
  for (const [deg, amp] of A) jde += amp * Math.sin(deg * RAD);
  return jde;   // TT 기준
}

/** 삭 시각을 KST 기준의 '날짜(JDN)'로 — 그 날 자정~자정 사이에 삭이 들면 그 날이 1일 */
function newMoonKstDay(k, year) {
  const jde = newMoonJD(k);
  const jdUT = jde - core.deltaT(year) / 86400;
  const jdKST = jdUT + 9 / 24;
  return Math.floor(jdKST + 0.5);   // JDN
}

/** 태양 황경이 deg에 도달하는 JDN(KST 날짜) */
function termKstDay(year, deg) {
  const t = core.solarTermTime(year, deg);
  return t ? core.toJDN(t.y, t.m, t.d) : null;
}

/* ── 음력 연 구성: 동지월 기준으로 13~14개월을 만들고 윤달 판정 ── */
const _cache = {};
function buildLunarYear(sy) {
  if (_cache[sy]) return _cache[sy];
  // 전년 동지가 드는 달(11월)부터 시작
  const dongjiPrev = termKstDay(sy - 1, 270);
  // 그 동지 직전(또는 당일)의 삭을 찾는다
  let k = Math.round((dongjiPrev - 2451550.09766) / 29.530588861) + 1;
  while (newMoonKstDay(k, sy - 1) > dongjiPrev) k--;
  const months = [];
  for (let i = 0; i < 15; i++) {
    const start = newMoonKstDay(k + i, sy - 1 + Math.floor(i / 12));
    const next = newMoonKstDay(k + i + 1, sy - 1 + Math.floor((i + 1) / 12));
    months.push({ start, len: next - start });
  }
  // 다음 동지월 찾기 → 두 동지월 사이 개월 수로 윤달 여부 결정
  const dongjiNext = termKstDay(sy, 270);
  let idxNext = 0;
  for (let i = 1; i < months.length; i++) {
    if (months[i].start <= dongjiNext) idxNext = i;
  }
  const span = idxNext;                    // 동지월(0) ~ 다음 동지월(idxNext)
  const hasLeap = span === 13;
  // 중기(황경 270,300,330,0,30,...)가 없는 첫 달 = 윤달
  let leapIdx = -1;
  if (hasLeap) {
    for (let i = 1; i < idxNext; i++) {
      const m = months[i];
      let has = false;
      for (let n = 0; n < 12; n++) {
        const deg = (270 + n * 30) % 360;
        for (const yy of [sy - 1, sy]) {
          const t = termKstDay(yy, deg);
          if (t !== null && t >= m.start && t < m.start + m.len) { has = true; break; }
        }
        if (has) break;
      }
      if (!has) { leapIdx = i; break; }
    }
    if (leapIdx < 0) leapIdx = 1;
  }
  // 음력 월·연 부여: months[0]=11월(sy-1년) → 12월 → 1월(sy년) → … → 11월(sy년)
  // 윤달은 '직전 달과 같은 번호'를 물려받는다 (4월 다음 윤달 = 윤4월)
  let num = 11, ly = sy - 1, prevNum = 11, prevYear = sy - 1, out = [];
  for (let i = 0; i <= idxNext; i++) {
    if (i === leapIdx) {
      out.push({ ...months[i], month: prevNum, year: prevYear, leap: true });
      continue;
    }
    out.push({ ...months[i], month: num, year: ly, leap: false });
    prevNum = num; prevYear = ly;
    if (num === 12) { num = 1; ly += 1; } else { num += 1; }
  }
  _cache[sy] = out;
  return out;
}

/** 음력 → 양력. @returns {{y,m,d}} | null */
function lunarToSolar(ly, lm, ld, isLeap) {
  for (const sy of [ly, ly + 1]) {
    for (const mo of buildLunarYear(sy)) {
      if (mo.month === lm && !!mo.leap === !!isLeap) {
        if (mo.year !== ly) continue;
        if (ld < 1 || ld > mo.len) return null;
        return core.fromJDN(mo.start + ld - 1);
      }
    }
  }
  return null;
}

/** 양력 → 음력. @returns {{y,m,d,leap}} | null */
function solarToLunar(sy, sm, sd) {
  const jdn = core.toJDN(sy, sm, sd);
  for (const y of [sy, sy + 1]) {
    for (const mo of buildLunarYear(y)) {
      if (jdn >= mo.start && jdn < mo.start + mo.len) {
        return { y: mo.year, m: mo.month, d: jdn - mo.start + 1, leap: !!mo.leap };
      }
    }
  }
  return null;
}

module.exports = { lunarToSolar, solarToLunar, buildLunarYear, newMoonJD };
