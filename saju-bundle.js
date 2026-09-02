/* saju-bundle.js — 자동 생성물. 수정하지 마세요.
   원본: saju/{saju-core.js,lunar-core.js,saju-content.js,saju-reading.js} / 생성: node scripts/build-saju-bundle.js
   계산은 전부 이 브라우저 안에서 이뤄지며 생년월일은 서버로 전송되지 않습니다. */
(function(global){
'use strict';
var __M = {};

/* ── saju-core.js ── */
__M['saju-core'] = (function(){
var __EXPORTS = {};
/* ═══════════════════════════════════════════════════════════════
   saju-core.js — 만세력 계산 코어 (의존성 0, 브라우저/Node 공용)
   생년월일시 → 사주팔자(연·월·일·시주) + 오행 분포

   설계 원칙
   - 전량 클라이언트 계산. 생년월일이 서버로 전송되지 않는다.
   - 정확도 함정 3가지를 명시적으로 처리한다:
     (1) 절기 경계 — 연주는 입춘, 월주는 12절(節) 기준으로 바뀐다 (음력 1/1 아님)
     (2) 한국 표준시 이력 — 1954~1961 UTC+8:30, 서머타임 시행 구간
     (3) 야자시 — 23:00~23:59를 익일로 볼지 정책 파라미터화
   ═══════════════════════════════════════════════════════════════ */

const CHEONGAN = ['갑','을','병','정','무','기','경','신','임','계'];
const JIJI     = ['자','축','인','묘','진','사','오','미','신','유','술','해'];
const GAN_HANJA = ['甲','乙','丙','丁','戊','己','庚','辛','壬','癸'];
const JI_HANJA  = ['子','丑','寅','卯','辰','巳','午','未','申','酉','戌','亥'];
// 천간 오행/음양
const GAN_OHAENG = ['목','목','화','화','토','토','금','금','수','수'];
const GAN_EUMYANG = ['양','음','양','음','양','음','양','음','양','음'];
const JI_OHAENG  = ['수','토','목','목','토','화','화','토','금','금','토','수'];
const JI_ANIMAL  = ['쥐','소','호랑이','토끼','용','뱀','말','양','원숭이','닭','개','돼지'];

/* ── 시간 유틸 ───────────────────────────────────────────── */

// 그레고리력 → 율리우스적일(JDN). 정오 기준 정수.
function toJDN(y, m, d) {
  const a = Math.floor((14 - m) / 12);
  const y2 = y + 4800 - a;
  const m2 = m + 12 * a - 3;
  return d + Math.floor((153 * m2 + 2) / 5) + 365 * y2
       + Math.floor(y2 / 4) - Math.floor(y2 / 100) + Math.floor(y2 / 400) - 32045;
}

// 소수 율리우스일(UT 기준). h/mi는 UT 시각.
function toJD(y, m, d, h = 0, mi = 0) {
  return toJDN(y, m, d) - 0.5 + (h + mi / 60) / 24;
}

/* ── (2) 한국 표준시 이력 보정 ────────────────────────────
   출생 시각(현지 벽시계 시각)을 '진태양시 계산용 KST(UTC+9)'로 환산한다.
   - 1908-04-01 ~ 1911-12-31 : UTC+8:30
   - 1912-01-01 ~ 1954-03-20 : UTC+9
   - 1954-03-21 ~ 1961-08-09 : UTC+8:30
   - 1961-08-10 ~           : UTC+9
   서머타임(DST) 시행 구간에는 시계가 1시간 앞당겨져 있었으므로 1시간을 빼야 한다.
   ─────────────────────────────────────────────────────── */
const DST_PERIODS = [ // [시작 YYYYMMDD, 끝 YYYYMMDD] — 해당 구간의 벽시계는 +1h 상태
  [19480601, 19480912], [19490403, 19490910], [19500401, 19500910],
  [19510506, 19510908], [19550505, 19550908], [19560520, 19560929],
  [19570505, 19570921], [19580504, 19580920], [19590503, 19590919],
  [19600501, 19600917], [19870510, 19871011], [19880508, 19881009],
];

function standardOffsetMinutes(ymd) {
  if (ymd >= 19080401 && ymd <= 19111231) return 510; // +8:30
  if (ymd >= 19540321 && ymd <= 19610809) return 510; // +8:30
  return 540;                                          // +9:00
}

function isDST(ymd) {
  return DST_PERIODS.some(([s, e]) => ymd >= s && ymd <= e);
}

/**
 * 벽시계 시각 → KST(UTC+9) 기준 시각으로 정규화.
 * @returns {{y,m,d,h,mi, notes:string[]}}
 */
function normalizeToKST(y, m, d, h, mi) {
  const ymd = y * 10000 + m * 100 + d;
  const notes = [];
  let adjust = 0; // 분 단위로 더할 값

  if (isDST(ymd)) { adjust -= 60; notes.push('서머타임 시행 구간 → 1시간 보정'); }
  const off = standardOffsetMinutes(ymd);
  if (off !== 540) { adjust += (540 - off); notes.push('당시 표준시 UTC+8:30 → KST 환산(+30분)'); }

  let total = h * 60 + mi + adjust;
  let dayShift = 0;
  while (total < 0) { total += 1440; dayShift -= 1; }
  while (total >= 1440) { total -= 1440; dayShift += 1; }

  let jdn = toJDN(y, m, d) + dayShift;
  const g = fromJDN(jdn);
  return { y: g.y, m: g.m, d: g.d, h: Math.floor(total / 60), mi: total % 60, notes };
}

function fromJDN(jdn) {
  let a = jdn + 32044, b = Math.floor((4 * a + 3) / 146097);
  let c = a - Math.floor(146097 * b / 4);
  let dd = Math.floor((4 * c + 3) / 1461);
  let e = c - Math.floor(1461 * dd / 4);
  let mm = Math.floor((5 * e + 2) / 153);
  return {
    d: e - Math.floor((153 * mm + 2) / 5) + 1,
    m: mm + 3 - 12 * Math.floor(mm / 10),
    y: 100 * b + dd - 4800 + Math.floor(mm / 10),
  };
}

__EXPORTS = Object.assign(__EXPORTS||{}, {
  CHEONGAN, JIJI, GAN_HANJA, JI_HANJA, GAN_OHAENG, GAN_EUMYANG, JI_OHAENG, JI_ANIMAL,
  toJDN, toJD, fromJDN, normalizeToKST, standardOffsetMinutes, isDST,
});

/* ── (1) 절기 계산 ─────────────────────────────────────────
   태양 황경이 15°의 배수가 되는 순간이 24절기.
   연주는 입춘(황경 315°), 월주는 12개의 '절'(節) 기준으로 바뀐다.
   태양 황경은 약 0.01° 정확도로 계산 → 절기 시각 오차 약 ±15분 수준.
   경계 15분 이내 출생은 결과에 경고를 붙인다.
   ─────────────────────────────────────────────────────── */

const RAD = Math.PI / 180;

// 지구 기준 태양의 겉보기 황경(도). jd = 소수 율리우스일(TT 근사)
function sunLongitude(jd) {
  const T = (jd - 2451545.0) / 36525;
  // 평균 황경 · 평균 근점이각
  let L0 = 280.46646 + 36000.76983 * T + 0.0003032 * T * T;
  const M = 357.52911 + 35999.05029 * T - 0.0001537 * T * T;
  const Mr = M * RAD;
  // 중심차
  const C = (1.914602 - 0.004817 * T - 0.000014 * T * T) * Math.sin(Mr)
          + (0.019993 - 0.000101 * T) * Math.sin(2 * Mr)
          + 0.000289 * Math.sin(3 * Mr);
  let trueLong = L0 + C;
  // 장동·광행차 보정
  const omega = 125.04 - 1934.136 * T;
  const apparent = trueLong - 0.00569 - 0.00478 * Math.sin(omega * RAD);
  return ((apparent % 360) + 360) % 360;
}

// 지구 자전 지연(TT - UT), 초 단위. 근사식.
function deltaT(y) {
  if (y >= 2005 && y < 2050) { const t = y - 2000; return 62.92 + 0.32217 * t + 0.005589 * t * t; }
  if (y >= 1986 && y < 2005) { const t = y - 2000; return 63.86 + 0.3345 * t - 0.060374 * t * t + 0.0017275 * t * t * t; }
  if (y >= 1961 && y < 1986) { const t = (y - 1975) / 1; return 45.45 + 1.067 * t - t * t / 260 - t * t * t / 718; }
  if (y >= 1941 && y < 1961) { const t = y - 1950; return 29.07 + 0.407 * t - t * t / 233 + t * t * t / 2547; }
  if (y >= 1920 && y < 1941) { const t = y - 1920; return 21.20 + 0.84493 * t - 0.076100 * t * t + 0.0020936 * t * t * t; }
  if (y >= 1900 && y < 1920) { const t = y - 1900; return -2.79 + 1.494119 * t - 0.0598939 * t * t + 0.0061966 * t * t * t - 0.000197 * t * t * t * t; }
  const u = (y - 1820) / 100; return -20 + 32 * u * u;
}

/**
 * 지정 연도에 태양 황경이 targetDeg가 되는 순간을 KST로 반환.
 * 황경으로 대략 날짜를 추정한 뒤 그 부근만 탐색하므로 인접 연도로 새지 않는다.
 * @returns {{y,m,d,h,mi,jdKST}}
 */
function solarTermTime(year, targetDeg) {
  const norm = (a) => ((a % 360) + 360) % 360;
  // 춘분(황경 0°)이 대략 연중 79일째. 황경 1°당 약 1.0146일.
  const approxDoy = 79 + norm(targetDeg) * 365.2422 / 360;
  let center = toJD(year, 1, 1) + (approxDoy % 365.2422);
  const dtDays = deltaT(year) / 86400;
  const diff = (jd) => {
    let x = norm(sunLongitude(jd + dtDays) - targetDeg);
    return x > 180 ? x - 360 : x;   // -180..180
  };
  // 추정 지점 ±6일에서 부호 변화 구간 탐색
  let a = null, b = null, prev = center - 6, prevV = diff(prev);
  for (let k = -6 + 0.25; k <= 6; k += 0.25) {
    const jd = center + k, v = diff(jd);
    if (prevV < 0 && v >= 0) { a = prev; b = jd; break; }
    prev = jd; prevV = v;
  }
  if (a === null) return null;
  for (let i = 0; i < 60; i++) {
    const mid = (a + b) / 2;
    if (diff(mid) < 0) a = mid; else b = mid;
  }
  const jdKST = (a + b) / 2 + 9 / 24;      // UT → KST
  const jdn = Math.floor(jdKST + 0.5);
  const mins = Math.round((jdKST + 0.5 - jdn) * 1440);
  const g = fromJDN(jdn + Math.floor(mins / 1440));
  const mm = ((mins % 1440) + 1440) % 1440;
  return { y: g.y, m: g.m, d: g.d, h: Math.floor(mm / 60), mi: mm % 60, jdKST };
}

// 12절(節) — 월주 경계. [절기명, 태양황경, 해당 월지 index]
const JEOL = [
  ['입춘', 315, 2], ['경칩', 345, 3], ['청명',  15, 4], ['입하',  45, 5],
  ['망종',  75, 6], ['소서', 105, 7], ['입추', 135, 8], ['백로', 165, 9],
  ['한로', 195, 10], ['입동', 225, 11], ['대설', 255, 0], ['소한', 285, 1],
];

__EXPORTS.sunLongitude = sunLongitude;
__EXPORTS.deltaT = deltaT;
__EXPORTS.solarTermTime = solarTermTime;
__EXPORTS.JEOL = JEOL;

/* ── 사주팔자 산출 ─────────────────────────────────────────
   일주 기준점: (JDN - 11) mod 60 = 60갑자 index (갑자=0)
   교차 검증 — 1900-01-01=갑술(10), 2000-01-01=무오(54), 60일 주기 순환 일치.
   ※ 출시 전 한국천문연구원 만세력과 100케이스 대조 필요(정확도 게이트).
   ─────────────────────────────────────────────────────── */

const gzName = (i) => CHEONGAN[i % 10] + JIJI[i % 12];
const gzHanja = (i) => GAN_HANJA[i % 10] + JI_HANJA[i % 12];

/** 그레고리 날짜 → 일주 60갑자 index */
function dayPillarIndex(y, m, d) {
  return (((toJDN(y, m, d) - 11) % 60) + 60) % 60;
}

/**
 * 사주팔자 계산.
 * @param {object} input {y,m,d,h,mi, unknownHour:boolean, lateNightPolicy:'yaja'|'joja'}
 *   - 시각은 '출생지 벽시계 시각'을 넣는다. 표준시·서머타임 보정은 내부에서 처리.
 *   - unknownHour=true 면 시주를 계산하지 않는다.
 *   - lateNightPolicy: 'yaja'(기본) = 23:00~23:59를 익일 자시로 / 'joja' = 당일 유지
 */
function calcSaju(input) {
  const { y, m, d } = input;
  const unknownHour = !!input.unknownHour;
  const h = unknownHour ? 12 : (input.h | 0);
  const mi = unknownHour ? 0 : (input.mi | 0);
  const policy = input.lateNightPolicy || 'yaja';
  const warnings = [];

  // (2) 표준시·서머타임 보정
  const k = normalizeToKST(y, m, d, h, mi);
  k.notes.forEach(n => warnings.push(n));

  // 야자시: 23시 이후는 다음 날로 넘겨 일주를 계산
  let dy = k.y, dm = k.m, dd = k.d;
  if (!unknownHour && policy === 'yaja' && k.h === 23) {
    const g = fromJDN(toJDN(k.y, k.m, k.d) + 1);
    dy = g.y; dm = g.m; dd = g.d;
    warnings.push('23시 이후 출생 — 야자시 기준으로 다음 날 일주를 적용했습니다');
  }

  // (1) 연주 — 입춘 기준
  const ipchunThis = solarTermTime(k.y, 315);
  const bornJD = toJD(k.y, k.m, k.d, k.h, k.mi) + 9 / 24 * 0; // KST 시각 그대로 비교
  const cmp = (a, b) => (a.y - b.y) || (a.m - b.m) || (a.d - b.d) || (a.h - b.h) || (a.mi - b.mi);
  const beforeIpchun = cmp({ y: k.y, m: k.m, d: k.d, h: k.h, mi: k.mi }, ipchunThis) < 0;
  const sajuYear = beforeIpchun ? k.y - 1 : k.y;
  // 서기 4년 = 갑자년 → (year - 4) mod 60
  const yearIdx = (((sajuYear - 4) % 60) + 60) % 60;

  // 절기 경계 근접 경고 (±30분)
  const minsDiff = Math.abs((toJD(k.y, k.m, k.d, k.h, k.mi) - toJD(ipchunThis.y, ipchunThis.m, ipchunThis.d, ipchunThis.h, ipchunThis.mi)) * 1440);
  if (minsDiff <= 30) warnings.push('입춘 경계 30분 이내 출생 — 연주가 달라질 수 있으니 전문가 확인을 권합니다');

  // (1) 월주 — 12절 기준. 생일이 속한 절기 구간을 찾는다.
  let monthBranch = null, jeolName = null;
  const cands = [];
  for (const [name, deg, branchIdx] of JEOL) {
    for (const yy of [k.y - 1, k.y]) {
      const t = solarTermTime(yy, deg);
      if (t) cands.push({ name, branchIdx, t });
    }
  }
  cands.sort((a, b) => cmp(a.t, b.t));
  for (const c of cands) {
    if (cmp({ y: k.y, m: k.m, d: k.d, h: k.h, mi: k.mi }, c.t) >= 0) { monthBranch = c.branchIdx; jeolName = c.name; }
  }
  // 월간(월두법): 갑기년→병인월 시작
  const monthOrder = (monthBranch - 2 + 12) % 12;            // 인월=0
  const monthStem = ((yearIdx % 10) % 5 * 2 + 2 + monthOrder) % 10;
  const monthIdx60 = (() => { // 천간/지지로부터 60갑자 index 역산
    for (let i = 0; i < 60; i++) if (i % 10 === monthStem && i % 12 === monthBranch) return i;
  })();

  // 일주
  const dayIdx = dayPillarIndex(dy, dm, dd);

  // 시주 — 시두법: 갑기일→갑자시
  let hourIdx60 = null, hourBranch = null;
  if (!unknownHour) {
    hourBranch = Math.floor(((k.h + 1) % 24) / 2);            // 23~01=자(0)
    const hourStem = ((dayIdx % 10) % 5 * 2 + hourBranch) % 10;
    for (let i = 0; i < 60; i++) if (i % 10 === hourStem && i % 12 === hourBranch) { hourIdx60 = i; break; }
  }

  const pillars = {
    year:  { idx: yearIdx,  name: gzName(yearIdx),  hanja: gzHanja(yearIdx) },
    month: { idx: monthIdx60, name: gzName(monthIdx60), hanja: gzHanja(monthIdx60), jeol: jeolName },
    day:   { idx: dayIdx,   name: gzName(dayIdx),   hanja: gzHanja(dayIdx) },
    hour:  hourIdx60 === null ? null : { idx: hourIdx60, name: gzName(hourIdx60), hanja: gzHanja(hourIdx60) },
  };

  // 오행 분포
  const ohaeng = { 목: 0, 화: 0, 토: 0, 금: 0, 수: 0 };
  for (const p of [pillars.year, pillars.month, pillars.day, pillars.hour]) {
    if (!p) continue;
    ohaeng[GAN_OHAENG[p.idx % 10]]++;
    ohaeng[JI_OHAENG[p.idx % 12]]++;
  }

  const dayStem = pillars.day.idx % 10;
  return {
    pillars, ohaeng, warnings,
    ilgan: { idx: dayStem, name: CHEONGAN[dayStem], hanja: GAN_HANJA[dayStem],
             ohaeng: GAN_OHAENG[dayStem], eumyang: GAN_EUMYANG[dayStem] },
    ttiAnimal: JI_ANIMAL[yearIdx % 12],
    sajuYear, normalizedKST: k, unknownHour,
  };
}

__EXPORTS.calcSaju = calcSaju;
__EXPORTS.dayPillarIndex = dayPillarIndex;
__EXPORTS.gzName = gzName;

return __EXPORTS;
})();

/* ── lunar-core.js ── */
__M['lunar-core'] = (function(){
var __EXPORTS = {};
/* ═══════════════════════════════════════════════════════════════
   lunar-core.js — 한국 음력 ↔ 양력 변환 (의존성 0, 브라우저 계산)
   생년월일이 외부로 전송되지 않도록 서버·API를 쓰지 않는다.

   규칙 (한국 음력 = 시헌력 체계)
   - 달의 1일 = 삭(new moon)이 드는 날 (KST 자정 기준)
   - 11월 = 동지(황경 270°)가 드는 달
   - 두 동지월 사이에 13개월이 있으면 윤달 발생.
     중기(中氣, 황경 30°의 배수)가 없는 첫 달을 윤달로 한다.
   ═══════════════════════════════════════════════════════════════ */
var core = __M['saju-core'];
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

__EXPORTS = Object.assign(__EXPORTS||{}, { lunarToSolar, solarToLunar, buildLunarYear, newMoonJD });

return __EXPORTS;
})();

/* ── saju-content.js ── */
__M['saju-content'] = (function(){
var __EXPORTS = {};
/* ═══════════════════════════════════════════════════════════════
   saju-content.js — 사주 해석 문안 (용어 없는 일상어 원칙)
   차별점 ②: 화면에 한자·전문용어를 쓰지 않는다. 접어두기 안에만 병기.
   차별점 ①: 꿈 카테고리 × 오늘의 흐름 = 오늘의 처방 (DREAM_BRIDGE)
   ═══════════════════════════════════════════════════════════════ */

/* 일간 10종 — 평생 바뀌지 않는 '나의 기질' */
const ILGAN = {
  갑: { image: '곧게 자라는 큰 나무', hanja: '甲',
    text: '위로 곧게 자라는 나무 같은 사람입니다. 방향이 정해지면 흔들림 없이 밀고 나가고, 주변에서도 자연스럽게 기준점 역할을 맡게 됩니다.',
    strength: '한번 시작한 일을 끝까지 끌고 가는 뚝심',
    care: '한 방향만 보다가 옆에서 열린 길을 놓칠 수 있습니다. 가끔은 고개를 돌려보세요.' },
  을: { image: '유연하게 감아 오르는 덩굴', hanja: '乙',
    text: '벽을 만나면 부딪히기보다 타고 넘어가는 사람입니다. 상황에 맞게 모양을 바꾸는 유연함이 있고, 사람들 사이에서 잘 스며듭니다.',
    strength: '어떤 환경에서도 살아남는 적응력과 관계 감각',
    care: '남에게 맞추다 내 방향을 잃기 쉽습니다. 내가 원하는 것을 먼저 말해보세요.' },
  병: { image: '한낮의 태양', hanja: '丙',
    text: '밝고 숨김이 없는 사람입니다. 있는 그대로 드러내는 편이라 주변을 환하게 만들고, 사람들이 모여드는 자리가 생깁니다.',
    strength: '분위기를 바꾸는 에너지와 솔직함',
    care: '너무 환하면 그늘도 진해집니다. 쉬어 가는 시간을 일부러 만드세요.' },
  정: { image: '어둠을 밝히는 등불', hanja: '丁',
    text: '조용히, 그러나 오래 비추는 사람입니다. 큰 소리를 내지 않아도 필요한 자리에 정확히 온기를 전합니다.',
    strength: '섬세한 배려와 오래 가는 집중력',
    care: '혼자 다 감당하려다 소진되기 쉽습니다. 도움을 청하는 것도 능력입니다.' },
  무: { image: '넓고 단단한 땅', hanja: '戊',
    text: '쉽게 흔들리지 않는 사람입니다. 주변에서 기대고 싶어 하는 안정감이 있고, 위기에서 오히려 침착해집니다.',
    strength: '믿을 수 있다는 신뢰와 버티는 힘',
    care: '한번 정하면 잘 바꾸지 않아 기회를 늦게 잡을 수 있습니다.' },
  기: { image: '무언가를 길러내는 밭흙', hanja: '己',
    text: '품고 키우는 사람입니다. 눈에 띄지 않게 챙기고 정리하는 능력이 있어, 곁에 있으면 편안하다는 말을 자주 듣습니다.',
    strength: '남을 성장시키는 돌봄과 꼼꼼한 정리력',
    care: '남 챙기다 내 몫을 놓칩니다. 나를 위한 시간표도 한 칸 비워두세요.' },
  경: { image: '다듬어지지 않은 강한 쇠', hanja: '庚',
    text: '맺고 끊는 것이 분명한 사람입니다. 애매한 상태를 견디지 못하고, 결정을 내려야 할 때 앞에 서게 됩니다.',
    strength: '결단력과 원칙을 지키는 힘',
    care: '단호함이 상대에게는 차갑게 느껴질 수 있습니다. 한 박자 늦춰 말해보세요.' },
  신: { image: '잘 벼려진 보석과 칼날', hanja: '辛',
    text: '예민하고 정확한 사람입니다. 남들이 지나치는 작은 차이를 알아보고, 완성도에 대한 기준이 높습니다.',
    strength: '디테일을 잡아내는 감각과 세련된 취향',
    care: '기준이 높아 스스로를 자주 깎습니다. 80점에서 멈추는 연습이 필요합니다.' },
  임: { image: '넓게 흐르는 큰 물', hanja: '壬',
    text: '생각의 폭이 넓은 사람입니다. 한곳에 머물기보다 흘러가며 여러 가능성을 담고, 상황을 크게 보는 눈이 있습니다.',
    strength: '넓은 시야와 상황을 읽는 직관',
    care: '흐르다 보면 고이지 않습니다. 하나를 끝까지 마무리하는 경험이 힘이 됩니다.' },
  계: { image: '조용히 스며드는 이슬과 시냇물', hanja: '癸',
    text: '조용하지만 깊은 사람입니다. 티 내지 않고 스며들어 어느새 자리를 잡고, 감정의 결을 잘 읽어냅니다.',
    strength: '공감 능력과 오래 관찰해서 얻는 통찰',
    care: '속을 잘 안 보여 오해받을 수 있습니다. 조금 더 표현해도 괜찮습니다.' },
};

/* 오늘의 흐름 5종 — 내 일간과 오늘 일진(천간)의 오행 관계. 매일 바뀐다. */
const OHAENG_ORDER = ['목', '화', '토', '금', '수'];   // 상생 순환
const RELATION = {
  동료: { label: '힘이 모이는 날',
    text: '오늘은 나와 같은 결의 기운이 들어옵니다. 혼자 힘으로 밀어붙이기 좋고, 비슷한 사람과 함께하면 더 잘 풀립니다.',
    tip: '미뤄둔 일을 시작하기 좋은 날입니다. 다만 고집이 세지기 쉬우니 반대 의견도 한 번은 들어보세요.' },
  표현: { label: '드러내기 좋은 날',
    text: '안에 있던 것이 밖으로 나오는 흐름입니다. 말하고, 쓰고, 보여주는 일이 평소보다 잘 됩니다.',
    tip: '하고 싶었던 말이나 제안이 있다면 오늘 꺼내보세요. 대신 말이 앞서기 쉬우니 한 번 더 다듬으면 좋습니다.' },
  성과: { label: '거두기 좋은 날',
    text: '내가 다뤄야 할 것들이 손에 잡히는 흐름입니다. 실질적인 결과나 금전과 관련된 일에 집중하기 좋습니다.',
    tip: '숫자를 확인하고 정리하기 좋은 날입니다. 욕심을 조금만 줄이면 더 깔끔하게 마무리됩니다.' },
  압박: { label: '조이는 힘이 드는 날',
    text: '외부의 규칙이나 기대가 나를 누르는 흐름입니다. 부담스럽지만, 나를 다듬어주는 시기이기도 합니다.',
    tip: '새 일을 벌이기보다 지금 있는 것을 지키고 점검하세요. 무리한 약속은 미루는 편이 좋습니다.' },
  도움: { label: '기대도 되는 날',
    text: '나를 채워주는 기운이 들어옵니다. 배우고, 받고, 쉬어가는 일이 잘 맞는 흐름입니다.',
    tip: '혼자 해결하려 하지 말고 물어보세요. 오늘 받은 도움이 다음 일의 재료가 됩니다.' },
};

/** 일간 오행과 오늘 천간 오행의 관계를 5종으로 판정 */
function relationOf(myOhaeng, todayOhaeng) {
  const i = OHAENG_ORDER.indexOf(myOhaeng), j = OHAENG_ORDER.indexOf(todayOhaeng);
  if (i === j) return '동료';
  if ((i + 1) % 5 === j) return '표현';   // 내가 생하는 것
  if ((i + 2) % 5 === j) return '성과';   // 내가 극하는 것
  if ((i + 3) % 5 === j) return '압박';   // 나를 극하는 것
  return '도움';                          // 나를 생하는 것
}

__EXPORTS = Object.assign(__EXPORTS||{}, { ILGAN, RELATION, OHAENG_ORDER, relationOf });

/* ═══ 차별점 ① — 꿈 × 오늘의 흐름 = 오늘의 처방 ═══
   경쟁 사주 서비스는 사용자가 왜 왔는지 모른다. 우리는 어떤 꿈을 검색해 들어왔는지 안다.
   [꿈 카테고리 8] × [오늘의 흐름 5] = 40가지 처방.
   각 문안은 "그 꿈이 남긴 감정"을 "오늘의 흐름"으로 어떻게 다룰지 알려준다. */

const DREAM_MOOD = {   // 카테고리별 '그 꿈이 남긴 마음' 한 줄
  animal:  '기운과 재물의 신호를 받은',
  nature:  '감정의 흐름이 크게 움직인',
  money:   '돈과 확인에 대한 마음이 커진',
  people:  '누군가와의 관계가 마음에 걸린',
  loss:    '소중한 것을 놓칠까 봐 불안했던',
  blocked: '뜻대로 되지 않아 답답했던',
  body:    '몸과 마음의 신호를 받은',
  change:  '변화를 앞두고 마음이 움직인',
};

const DREAM_BRIDGE = {
  animal: {
    동료: '오늘은 그 기운을 스스로 밀고 나갈 힘이 함께 옵니다. 미뤄뒀던 일을 시작해보세요.',
    표현: '받은 기운을 밖으로 꺼내기 좋은 날입니다. 먼저 제안하거나 연락해보세요.',
    성과: '기운이 실제 결과로 옮겨가기 좋은 흐름입니다. 숫자와 조건을 확인하며 진행하세요.',
    압박: '좋은 신호였지만 오늘은 조이는 힘이 듭니다. 크게 벌이기보다 지금 있는 것을 지키세요.',
    도움: '거기에 주변의 도움까지 더해지는 날입니다. 혼자 하지 말고 함께 하세요.',
  },
  nature: {
    동료: '오늘은 그 감정을 밀고 나갈 힘도 함께 옵니다. 하고 싶었던 쪽으로 한 걸음 가보세요.',
    표현: '마음에 고인 것을 흘려보내기 좋은 날입니다. 쓰거나 말해보세요.',
    성과: '감정을 정리하면 실질적인 결과가 따라오는 흐름입니다. 미뤄둔 정리부터 하세요.',
    압박: '흔들린 마음에 외부 압박까지 겹칩니다. 오늘은 결정을 내일로 미뤄도 괜찮습니다.',
    도움: '기대설 곳이 생기는 날입니다. 편한 사람에게 이야기해보세요.',
  },
  money: {
    동료: '오늘은 스스로 챙기고 정리하기 좋은 날입니다. 미뤄둔 확인부터 해보세요.',
    표현: '금전 관련 이야기를 꺼내기 좋은 흐름입니다. 미뤄둔 요청이나 협의를 해보세요.',
    성과: '꿈과 오늘의 흐름이 정확히 맞물립니다. 입출금·정산·계약 조건을 확인하기에 최적입니다.',
    압박: '부담이 겹치는 날입니다. 새 지출과 투자는 오늘 결정하지 마세요.',
    도움: '혼자 끙끙대던 문제에 조언이 들어오는 날입니다. 물어보는 편이 빠릅니다.',
  },
  people: {
    동료: '오늘은 내 입장을 지키며 말하기 좋은 날입니다. 미루지 말고 정리해보세요.',
    표현: '먼저 연락하기에 가장 좋은 흐름입니다. 미뤄둔 그 말, 오늘 꺼내보세요.',
    성과: '관계를 실질적으로 정리하기 좋은 날입니다. 애매한 사이에 선을 그어도 좋습니다.',
    압박: '부담까지 더해지는 날입니다. 오늘은 거리를 두고 판단을 미루세요.',
    도움: '그 사이를 도와줄 누군가가 나타날 수 있는 흐름입니다. 주변에 이야기해보세요.',
  },
  loss: {
    동료: '오늘은 스스로 점검할 힘이 있는 날입니다. 꿈이 알려준 그 불안, 하나씩 확인해보세요.',
    표현: '찾으려면 물어봐야 합니다. 오늘은 연락하고 확인하기 좋은 날입니다.',
    성과: '정리하고 되찾기 좋은 흐름입니다. 중요한 물건·일정·결제 내역부터 확인해보세요.',
    압박: '압박까지 겹치는 날입니다. 새로 벌이지 말고 지금 있는 것만 지키세요.',
    도움: '혼자 찾지 마세요. 오늘은 주변에 물어보면 답이 나오는 흐름입니다.',
  },
  blocked: {
    동료: '오늘은 밀고 나갈 힘이 있습니다. 막혔던 그 지점을 한 번 더 두드려보세요.',
    표현: '막힌 것은 대개 소통에서 풀립니다. 오늘은 말이 통하는 날이니 먼저 물어보세요.',
    성과: '답답했던 일이 실질적으로 진척되기 좋은 흐름입니다. 절차와 조건부터 확인하세요.',
    압박: '막힌 느낌이 오늘도 이어질 수 있습니다. 억지로 뚫기보다 잠시 멈추는 것이 빠른 길입니다.',
    도움: '길을 알려줄 사람이 나타나는 날입니다. 혼자 붙잡고 있지 말고 도움을 청하세요.',
  },
  body: {
    동료: '오늘은 스스로를 돌볼 힘이 있는 날입니다. 미뤄둔 관리부터 시작해보세요.',
    표현: '참아온 것을 꺼내기 좋은 날입니다. 불편함을 말하는 것도 회복의 시작입니다.',
    성과: '미뤄둔 검진이나 관리 계획을 실제로 실행하기 좋은 흐름입니다.',
    압박: '피로한 차에 부담이 겹칩니다. 오늘만큼은 일정을 줄이고 쉬어가세요.',
    도움: '기대고 쉬어가기 가장 좋은 흐름입니다. 회복에 시간을 쓰는 것이 오늘의 최선입니다.',
  },
  change: {
    동료: '오늘은 스스로 결정하고 시작하기 좋은 날입니다. 마음먹은 쪽으로 한 걸음 가보세요.',
    표현: '변화의 뜻을 주변에 알리기 좋은 흐름입니다. 계획을 말로 꺼내보세요.',
    성과: '변화를 구체적인 조건으로 바꾸기 좋은 날입니다. 비용과 일정부터 계산해보세요.',
    압박: '제동이 걸리는 흐름입니다. 서두르지 말고 준비를 한 겹 더 쌓으세요.',
    도움: '새 출발에 도와줄 사람이 붙는 날입니다. 혼자 결정하지 말고 상의해보세요.',
  },
};

/* 오행 분포 해석 — 많은 것/없는 것 */
const OHAENG_TRAIT = {
  목: { many: '자라고 뻗어나가려는 힘이 강합니다. 새로운 시도를 즐깁니다.', none: '한 방향으로 밀고 나가는 추진력이 아쉬울 때가 있습니다.' },
  화: { many: '표현하고 드러내는 기운이 강합니다. 사람들 앞에서 빛납니다.', none: '속마음을 드러내는 일이 조금 어색할 수 있습니다.' },
  토: { many: '중심을 잡고 버티는 힘이 강합니다. 주변이 기대는 사람입니다.', none: '흔들릴 때 붙잡아줄 기준을 스스로 만들면 좋습니다.' },
  금: { many: '맺고 끊는 결단력이 강합니다. 원칙이 분명합니다.', none: '결정을 미루다 기회를 놓치지 않도록 마감을 정해두세요.' },
  수: { many: '생각이 깊고 흐름을 읽는 힘이 강합니다.', none: '한 발 물러서서 전체를 보는 시간이 도움이 됩니다.' },
};

__EXPORTS.DREAM_MOOD = DREAM_MOOD;
__EXPORTS.DREAM_BRIDGE = DREAM_BRIDGE;
__EXPORTS.OHAENG_TRAIT = OHAENG_TRAIT;

/* 오행을 화면에 쓸 일상어로 — "목/화/토/금/수" 같은 용어를 노출하지 않는다 */
const OHAENG_WORD = { 목: '나무', 화: '불', 토: '흙', 금: '쇠', 수: '물' };

__EXPORTS.OHAENG_WORD = OHAENG_WORD;

return __EXPORTS;
})();

/* ── saju-reading.js ── */
__M['saju-reading'] = (function(){
var __EXPORTS = {};
/* ═══════════════════════════════════════════════════════════════
   saju-reading.js — 계산(core) + 문안(content) → 사용자가 읽는 결과
   차별점 ①: dreamSlug가 있으면 꿈 맥락과 결합한 '오늘의 처방'을 만든다.
   ═══════════════════════════════════════════════════════════════ */
var core = __M['saju-core'];
var C = __M['saju-content'];

/** 오늘(KST)의 일진 60갑자 index */
function todayPillarIndex(now) {
  const d = now || new Date();
  const kst = new Date(d.getTime() + (9 * 60 + d.getTimezoneOffset()) * 60000);
  return core.dayPillarIndex(kst.getFullYear(), kst.getMonth() + 1, kst.getDate());
}

/**
 * 사주 리딩 조립
 * @param {object} birth  {y,m,d,h,mi,unknownHour}
 * @param {object} opt    {dreamCat, dreamKw, now}
 */
function buildReading(birth, opt = {}) {
  const s = core.calcSaju(birth);
  const ilganName = s.ilgan.name;
  const ilgan = C.ILGAN[ilganName];

  // 오늘의 흐름 — 내 일간 오행 vs 오늘 일진 천간 오행
  const tIdx = todayPillarIndex(opt.now);
  const todayStem = tIdx % 10;
  const todayOhaeng = core.GAN_OHAENG[todayStem];
  const relKey = C.relationOf(s.ilgan.ohaeng, todayOhaeng);
  const rel = C.RELATION[relKey];

  // 오행 분포 — 가장 많은 것 / 없는 것
  const entries = Object.entries(s.ohaeng);
  const max = entries.reduce((a, b) => (b[1] > a[1] ? b : a));
  const zeros = entries.filter(([, v]) => v === 0).map(([k]) => k);

  // 차별점 ① — 꿈 맥락 결합
  let bridge = null;
  if (opt.dreamCat && C.DREAM_BRIDGE[opt.dreamCat]) {
    bridge = {
      mood: C.DREAM_MOOD[opt.dreamCat],
      advice: C.DREAM_BRIDGE[opt.dreamCat][relKey],
      dreamKw: opt.dreamKw || null,
    };
  }

  const W = C.OHAENG_WORD;
  return {
    saju: s,
    /* ── 화면에 보이는 것: 전문용어 없음 ── */
    me: {
      title: `${ilgan.image} 같은 사람`,
      body: ilgan.text,
      strength: ilgan.strength,
      care: ilgan.care,
    },
    today: {
      label: rel.label,
      body: rel.text,
      tip: rel.tip,
    },
    ohaeng: {
      counts: Object.fromEntries(entries.map(([k, v]) => [W[k], v])),   // 나무/불/흙/쇠/물
      strongest: { name: W[max[0]], text: C.OHAENG_TRAIT[max[0]].many },
      missing: zeros.map(z => ({ name: W[z], text: C.OHAENG_TRAIT[z].none })),
    },
    bridge,
    warnings: s.warnings,
    /* ── 접어두기 안에만 표시(궁금한 사람용) ── */
    details: {
      note: '아래는 사주 용어입니다. 몰라도 결과를 보는 데 지장은 없습니다.',
      palja: [s.pillars.year, s.pillars.month, s.pillars.day, s.pillars.hour]
        .filter(Boolean).map(p => `${p.hanja}(${p.name})`).join(' '),
      ilganTerm: `일간 ${s.ilgan.hanja}${s.ilgan.name} · ${W[s.ilgan.ohaeng]}(${s.ilgan.ohaeng})의 ${s.ilgan.eumyang}`,
      todayPillar: `오늘의 일진 ${core.gzName(tIdx)}`,
      ttiAnimal: `${s.ttiAnimal}띠`,
    },
  };
}

__EXPORTS = Object.assign(__EXPORTS||{}, { buildReading, todayPillarIndex });

return __EXPORTS;
})();

global.Saju = {
  buildReading: __M['saju-reading'].buildReading,
  todayPillarIndex: __M['saju-reading'].todayPillarIndex,
  calcSaju: __M['saju-core'].calcSaju,
  lunarToSolar: __M['lunar-core'].lunarToSolar,
  solarToLunar: __M['lunar-core'].solarToLunar,
};
})(window);
