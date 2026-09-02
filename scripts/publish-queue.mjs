// 신규 해몽 발행기 — 검수 완료(approved:true) 큐 항목을 1건 발행 (주 3회 cron)
// 사람 검수 없는 글은 절대 발행되지 않는다 (approved 필드가 게이트).
import { readFileSync, writeFileSync, existsSync } from 'node:fs';

const SITE = JSON.parse(readFileSync('scripts/site-config.json','utf8')).site;
const CATS = ['animal','nature','money','people','loss','blocked','body','change'];
const queue = JSON.parse(readFileSync('content-queue/queue.json','utf8'));
const pool  = JSON.parse(readFileSync('scripts/today-pool.json','utf8'));
const meta  = Object.fromEntries(pool.map(p=>[p.slug,p]));

const entry = queue.find(e => e.approved === true && !e.published);
const remaining = queue.filter(e => e.approved === true && !e.published).length;
if (!entry) { console.log('발행 대기 항목 없음 — 큐를 충전하세요 (검수 완료분 0건)'); process.exit(0); }

// ── 유효성 게이트 ──
const err = m => { console.error('발행 중단:', m); process.exit(1); };
if (!/^[a-z0-9\-]{3,60}$/.test(entry.slug)) err('slug 형식 오류: '+entry.slug);
if (existsSync(`dream-${entry.slug}.html`)) err('이미 존재하는 페이지: '+entry.slug);
if (!CATS.includes(entry.cat)) err('cat 오류: '+entry.cat);
for (const k of ['kw','title','description','h1','hero_sub','hero_badge','emoji']) if (!entry[k]) err('필드 누락: '+k);
if (!Array.isArray(entry.sections) || entry.sections.length < 5) err('sections 5개 미만 (thin content 방지)');
const bodyLen = entry.sections.reduce((a,s)=>a+(s.html||'').length,0);
if (bodyLen < 4000) err(`본문 ${bodyLen}자 — 4,000자 미만 (thin content 방지)`);
for (const r of entry.related||[]) if (!meta[r]) err('related에 미존재 슬러그: '+r);

// ── 렌더 ──
let t = readFileSync('scripts/page-template.html','utf8');
const sectionsHtml = entry.sections.map(s=>`<div class="section"><h2>${s.h2}</h2>${s.html}</div>`).join('\n');
const relatedHtml = (entry.related||[]).slice(0,5).map(r=>{
  const m=meta[r];
  return `<a href="dream-${r}.html" class="eng-related-item"><div class="eng-related-row"><span class="eng-related-name">${m.emoji} ${m.kw}</span><span class="eng-related-arrow">→</span></div></a>`;
}).join('\n      ');
const rep = { SITE, SLUG:entry.slug, KW:entry.kw, KW_ENC:encodeURIComponent(entry.kw), CAT:entry.cat,
  EMOJI:entry.emoji, TITLE:entry.title, DESCRIPTION:entry.description, H1:entry.h1,
  HERO_SUB:entry.hero_sub, HERO_BADGE:entry.hero_badge, SECTIONS:sectionsHtml, RELATED:relatedHtml };
t = t.replace(/\{\{([A-Z0-9_]+)\}\}/g, (_,k)=> k in rep ? rep[k] : '');
writeFileSync(`dream-${entry.slug}.html`, t);

// ── sitemap 등재 ──
const today = new Date(Date.now()+9*3600e3).toISOString().slice(0,10);
let sm = readFileSync('sitemap.xml','utf8');
sm = sm.replace('</urlset>', `  <url>\n    <loc>${SITE}/dream-${entry.slug}.html</loc>\n    <lastmod>${today}</lastmod>\n    <changefreq>monthly</changefreq>\n    <priority>0.7</priority>\n  </url>\n</urlset>`);
writeFileSync('sitemap.xml', sm);

// ── kw-cat 지정표 등재 (dreams-db 생성기가 참조) ──
const csvLine = `${entry.slug},${entry.kw.includes(',')?'"'+entry.kw+'"':entry.kw},${entry.cat}\n`;
writeFileSync('kw-cat-map.csv', readFileSync('kw-cat-map.csv','utf8').replace(/\n?$/, '\n') + csvLine);

// ── 오늘의 꿈 풀 등재 ──
pool.push({slug:entry.slug, kw:entry.kw, cat:entry.cat, emoji:entry.emoji});
writeFileSync('scripts/today-pool.json', JSON.stringify(pool,null,1));

// ── guide 가나다 등재 ──
const CHO=['ㄱ','ㄲ','ㄴ','ㄷ','ㄸ','ㄹ','ㅁ','ㅂ','ㅃ','ㅅ','ㅆ','ㅇ','ㅈ','ㅉ','ㅊ','ㅋ','ㅌ','ㅍ','ㅎ'];
const BASE={'ㄲ':'ㄱ','ㄸ':'ㄷ','ㅃ':'ㅂ','ㅆ':'ㅅ','ㅉ':'ㅈ'};
const o = entry.kw.charCodeAt(0)-0xAC00;
let cho = o>=0 ? CHO[Math.floor(o/588)] : 'ㅎ';
cho = BASE[cho]||cho;
let g = readFileSync('guide.html','utf8');
const item = `<a href="dream-${entry.slug}.html" class="dict-item dream-item"><span class="di">${entry.emoji}</span><span class="dn">${entry.kw}</span><span class="da">›</span></a>`;
const marker = `<div class="cho-header">${cho}</div>`;
if (g.includes(marker)) g = g.replace(marker, marker+'\n        '+item);
else console.warn('guide에 초성 섹션 없음:', cho, '- 수동 등재 필요');
g = g.replace(/(\d+)가지 꿈해몽/g, (_,n)=>`${+n+1}가지 꿈해몽`).replace(/전체 (\d+)개/, (_,n)=>`전체 ${+n+1}개`);
writeFileSync('guide.html', g);

// ── 큐 상태 갱신 ──
entry.published = true; entry.publishedAt = today;
writeFileSync('content-queue/queue.json', JSON.stringify(queue,null,1));

console.log(`발행 완료: dream-${entry.slug}.html (${bodyLen}자, 섹션 ${entry.sections.length}개)`);
if (remaining-1 <= 3) console.warn(`::warning:: 검수 완료 큐 잔량 ${remaining-1}건 — 충전 필요`);
