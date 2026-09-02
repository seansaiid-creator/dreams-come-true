// 발행 후 무결성 검증 — 실패하면 워크플로가 멈춰 잘못된 상태가 배포되지 않는다.
import { readFileSync, readdirSync, existsSync } from 'node:fs';

const pages = readdirSync('.').filter(f => /^dream-.*\.html$/.test(f));
const db = JSON.parse(
  readFileSync('dreams-db.js', 'utf8').replace(/^[\s\S]*?window\.DREAM_DETAILS=/, '').replace(/;\s*$/, '')
);
const map = new Set(
  readFileSync('kw-cat-map.csv', 'utf8').split('\n').slice(1).filter(Boolean).map(l => l.split(',')[0])
);

const problems = [];
for (const f of pages) {
  const slug = f.slice(6, -5);
  const html = readFileSync(f, 'utf8');
  if (!map.has(slug)) problems.push(`kw-cat-map.csv 미등재: ${slug}`);
  if (!db[slug]) problems.push(`dreams-db.js 미등재: ${slug}`);
  else {
    if (!db[slug].t || db[slug].t.length < 40) problems.push(`해몽 본문이 비었거나 너무 짧음: ${slug}`);
    if (!db[slug].l) problems.push(`길흉 등급 누락: ${slug}`);
  }
  if (html.includes('index.html?kw=') && !/index\.html\?kw=[^"]*&s=[a-z0-9-]+/.test(html))
    problems.push(`CTA에 슬러그(&s=) 누락: ${slug}`);
  if (/<ins[^>]*kakao_ad_area/.test(html)) problems.push(`AdFit 재삽입: ${slug}`);
  if (html.includes('dreams-come-true-ten.vercel.app')) problems.push(`구 도메인 잔존: ${slug}`);
}
if (!existsSync('dreams-db.js')) problems.push('dreams-db.js 없음');

if (problems.length) {
  console.error('::error::발행 검증 실패\n' + problems.slice(0, 20).map(p => ' - ' + p).join('\n'));
  process.exit(1);
}
console.log(`발행 검증 통과 — 페이지 ${pages.length}개, DB ${Object.keys(db).length}개 항목`);
