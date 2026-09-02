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

module.exports = {
  CHEONGAN, JIJI, GAN_HANJA, JI_HANJA, GAN_OHAENG, GAN_EUMYANG, JI_OHAENG, JI_ANIMAL,
  toJDN, toJD, fromJDN, normalizeToKST, standardOffsetMinutes, isDST,
};

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

module.exports.sunLongitude = sunLongitude;
module.exports.deltaT = deltaT;
module.exports.solarTermTime = solarTermTime;
module.exports.JEOL = JEOL;

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

module.exports.calcSaju = calcSaju;
module.exports.dayPillarIndex = dayPillarIndex;
module.exports.gzName = gzName;
