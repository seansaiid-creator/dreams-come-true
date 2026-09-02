/* 만세력 정확도 검증 하네스 — 출시 게이트
   node saju/verify.js
   자체 검증(프로그램적으로 확인 가능한 것) + KASI 대조용 케이스 출력 */
const c = require('./saju-core.js');

let pass = 0, fail = 0;
const eq = (label, got, want) => {
  if (String(got) === String(want)) { pass++; }
  else { fail++; console.log(`  ❌ ${label}: got ${got}, want ${want}`); }
};

console.log('═══ 1. 연주 검증 (60갑자 순환은 산술로 확정 가능) ═══');
// 1984=갑자년 기준으로 ±N년의 연주를 산술 검증
const G=['갑','을','병','정','무','기','경','신','임','계'], J=['자','축','인','묘','진','사','오','미','신','유','술','해'];
for (let y = 1900; y <= 2050; y++) {
  const i = ((y - 4) % 60 + 60) % 60;
  const want = G[i%10] + J[i%12];
  const r = c.calcSaju({ y, m: 6, d: 15, h: 12, mi: 0 });  // 입춘 이후 확실한 날짜
  eq(`연주 ${y}`, r.pillars.year.name, want);
}
console.log(`  → ${pass}건 통과`);

console.log('\n═══ 2. 일주 60일 주기 순환 검증 ═══');
const base = c.dayPillarIndex(2000, 1, 1);
for (const days of [60, 120, 600, 6000]) {
  const g = c.fromJDN(c.toJDN(2000, 1, 1) + days);
  eq(`+${days}일`, c.dayPillarIndex(g.y, g.m, g.d), base);
}

console.log('\n═══ 3. 알려진 일주 앵커 ═══');
eq('1900-01-01', c.gzName(c.dayPillarIndex(1900,1,1)), '갑술');
eq('2000-01-01', c.gzName(c.dayPillarIndex(2000,1,1)), '무오');

console.log('\n═══ 4. 절기 시각 (공표값 대비 ±20분 이내) ═══');
const terms = [
  [2024, 315, '2024-02-04 17:27', '입춘'],
  [2025,   0, '2025-03-20 18:01', '춘분'],
  [2000, 270, '2000-12-21 22:37', '동지'],
  [2026, 315, '2026-02-04 05:02', '입춘'],
];
for (const [y, deg, ref, name] of terms) {
  const t = c.solarTermTime(y, deg);
  const [rd, rt] = ref.split(' ');
  const [ry, rm, rdd] = rd.split('-').map(Number);
  const [rh, rmi] = rt.split(':').map(Number);
  const diff = Math.abs((c.toJD(t.y,t.m,t.d,t.h,t.mi) - c.toJD(ry,rm,rdd,rh,rmi)) * 1440);
  if (diff <= 20) { pass++; console.log(`  ✅ ${y} ${name}: 오차 ${diff.toFixed(0)}분`); }
  else { fail++; console.log(`  ❌ ${y} ${name}: 오차 ${diff.toFixed(0)}분 (허용 20분)`); }
}

console.log('\n═══ 5. 입춘 경계 동작 ═══');
{
  const ip = c.solarTermTime(2000, 315);   // 2000-02-04 경
  const before = c.calcSaju({ y: ip.y, m: ip.m, d: ip.d, h: Math.max(0, ip.h - 2), mi: 0 });
  const after  = c.calcSaju({ y: ip.y, m: ip.m, d: ip.d, h: Math.min(23, ip.h + 2), mi: 0 });
  eq('입춘 직전 연주', before.sajuYear, 1999);
  eq('입춘 직후 연주', after.sajuYear, 2000);
}

console.log('\n═══ 6. 표준시·서머타임 보정 ═══');
eq('1955 UTC+8:30+DST', c.normalizeToKST(1955,6,15,12,0).h + ':' + c.normalizeToKST(1955,6,15,12,0).mi, '11:30');
eq('1987 DST만', c.normalizeToKST(1987,7,15,12,0).h, 11);
eq('2000 보정없음', c.normalizeToKST(2000,6,15,12,0).h, 12);

console.log('\n═══ 7. KASI(한국천문연구원) 공식값 대조 ═══');
/* 2026-09-02 astro.kasi.re.kr /life/solc 에서 직접 조회한 공식 데이터.
   주의: KASI의 '월건(LUNC_WLGN)'은 음력 달의 간지이며, 사주 월주(절기 기준)와 다른 개념이라 대조 대상에서 제외.
   대조 항목 = 율리우스적일 / 연주 / 일주(일간이 여기서 나오므로 가장 중요). */
const KASI = [
  { d: [1990, 3, 5],   jd: 2447956, year: '경오', day: '기사' },
  { d: [2000, 1, 15],  jd: 2451559, year: '기묘', day: '임신' },
  { d: [1955, 6, 15],  jd: 2435274, year: '을미', day: '정미' },
  { d: [1987, 7, 15],  jd: 2446992, year: '정묘', day: '을축' },
  { d: [1988, 8, 20],  jd: 2447394, year: '무진', day: '정미' },
  { d: [2010, 12, 22], jd: 2455553, year: '경인', day: '병오' },
  { d: [1975, 11, 11], jd: 2442728, year: '을묘', day: '신유' },
  { d: [2001, 5, 5],   jd: 2452035, year: '신사', day: '무진' },
];
for (const k of KASI) {
  const [y, m, d] = k.d;
  eq(`${y}-${m}-${d} 율리우스적일`, c.toJDN(y, m, d), k.jd);
  const r = c.calcSaju({ y, m, d, h: 12, mi: 0 });
  eq(`${y}-${m}-${d} 연주`, r.pillars.year.name, k.year);
  eq(`${y}-${m}-${d} 일주`, r.pillars.day.name, k.day);
}
console.log(`  → KASI 대조 ${KASI.length * 3}건 확인`);

console.log(`\n═══ 결과: ${pass}건 통과 / ${fail}건 실패 ═══`);

process.exit(fail ? 1 : 0);
