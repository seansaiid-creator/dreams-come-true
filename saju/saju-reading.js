/* ═══════════════════════════════════════════════════════════════
   saju-reading.js — 계산(core) + 문안(content) → 사용자가 읽는 결과
   차별점 ①: dreamSlug가 있으면 꿈 맥락과 결합한 '오늘의 처방'을 만든다.
   ═══════════════════════════════════════════════════════════════ */
const core = require('./saju-core.js');
const C = require('./saju-content.js');

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

  return {
    saju: s,
    me: {
      title: `${ilgan.image} 같은 사람`,
      body: ilgan.text,
      strength: ilgan.strength,
      care: ilgan.care,
      hanja: `${s.ilgan.hanja}(${ilganName}) · ${s.ilgan.ohaeng}/${s.ilgan.eumyang}`, // 접어두기용
    },
    today: {
      label: rel.label,
      body: rel.text,
      tip: rel.tip,
      pillar: core.gzName(tIdx),
      relation: relKey,
    },
    ohaeng: {
      counts: s.ohaeng,
      strongest: { name: max[0], text: C.OHAENG_TRAIT[max[0]].many },
      missing: zeros.map(z => ({ name: z, text: C.OHAENG_TRAIT[z].none })),
    },
    bridge,
    warnings: s.warnings,
  };
}

module.exports = { buildReading, todayPillarIndex };
