// 오늘의 꿈 회전 — 매일 KST 04:30 GitHub Actions가 실행 (의존성 0)
// index.html의 TODAY 마커 블록을 날짜 시드로 고른 꿈 3개로 교체하고
// sitemap.xml의 홈 lastmod를 갱신한다. 변경이 있으면 워크플로가 커밋→Vercel 자동 배포.
import { readFileSync, writeFileSync } from 'node:fs';

const kst = new Date(Date.now() + 9 * 3600e3);
const today = kst.toISOString().slice(0, 10);           // YYYY-MM-DD (KST)
const label = `${kst.getUTCFullYear()}년 ${kst.getUTCMonth() + 1}월 ${kst.getUTCDate()}일`;

const pool = JSON.parse(readFileSync('scripts/today-pool.json', 'utf8'));

// 날짜 시드 결정적 셔플 (mulberry32)
let seed = [...today].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7);
const rand = () => {
  seed = (seed + 0x6D2B79F5) >>> 0;
  let t = seed;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const picks = [];
const used = new Set();
while (picks.length < 3) {
  const i = Math.floor(rand() * pool.length);
  if (!used.has(i)) { used.add(i); picks.push(pool[i]); }
}

const CATLABEL = { animal: '동물', nature: '자연', money: '재물', people: '관계', loss: '분실', blocked: '막힘', body: '건강', change: '변화' };
const cards = picks.map(p => `    <a href="dream-${p.slug}.html" class="random-card">
      <span style="font-size:26px;">${p.emoji}</span>
      <span style="color:var(--gold-light);font-size:13px;font-weight:600;">${p.kw}</span>
      <span style="color:var(--text-muted);font-size:11px;">${CATLABEL[p.cat] || ''} 운의 신호 · 오늘의 풀이</span>
    </a>`).join('\n');

let html = readFileSync('index.html', 'utf8');
html = html.replace(/<!--TODAY_DATE-->[\s\S]*?<!--\/TODAY_DATE-->/, `<!--TODAY_DATE-->${label}<!--/TODAY_DATE-->`);
html = html.replace(/<!--TODAY_DREAMS_START-->[\s\S]*?<!--TODAY_DREAMS_END-->/, `<!--TODAY_DREAMS_START-->\n${cards}\n    <!--TODAY_DREAMS_END-->`);
writeFileSync('index.html', html);

// sitemap 홈 lastmod 갱신
let sm = readFileSync('sitemap.xml', 'utf8');
sm = sm.replace(/(<loc>https:\/\/[^<]*?\/<\/loc>\s*<lastmod>)[^<]+(<\/lastmod>)/, `$1${today}$2`);
writeFileSync('sitemap.xml', sm);

console.log(`rotated ${today}:`, picks.map(p => p.slug).join(', '));
