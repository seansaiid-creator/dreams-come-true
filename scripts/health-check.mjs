// 주간 자동 헬스체크 — 이상 시 exit 1 → GitHub Actions 실패 메일이 운영자에게 발송됨
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';

const today = new Date(Date.now()+9*3600e3).toISOString().slice(0,10);
const files = new Set(readdirSync('.').filter(f=>f.endsWith('.html')));
const problems = [], warns = [];

// 1. 내부 링크 무결성
let broken = 0;
for (const f of files) {
  const s = readFileSync(f,'utf8');
  for (const m of s.matchAll(/href="([a-z0-9\-]+\.html)"/g))
    if (!files.has(m[1])) { broken++; problems.push(`깨진 링크: ${f} → ${m[1]}`); }
}

// 2. sitemap ↔ 파일 정합
const sm = readFileSync('sitemap.xml','utf8');
const locs = [...sm.matchAll(/<loc>[^<]*?\/([a-z0-9\-_.]+\.html)<\/loc>/g)].map(m=>m[1]);
for (const l of locs) if (!files.has(l)) problems.push(`sitemap 유령 URL: ${l}`);
const listed = new Set(locs);
for (const f of files) if (!listed.has(f) && !['404.html','index.html'].includes(f) && f.startsWith('dream-'))
  warns.push(`sitemap 미등재: ${f}`);

// 3. 발행 큐 잔량
const queue = JSON.parse(readFileSync('content-queue/queue.json','utf8'));
const ready = queue.filter(e=>e.approved===true && !e.published).length;
const draft = queue.filter(e=>e.approved===false).length;
if (ready===0 && draft===0) warns.push('발행 큐 완전 소진 — 초안 생산 필요');
else if (ready<=2) warns.push(`검수 완료 큐 잔량 ${ready}건 (초안 ${draft}건 검수 대기)`);

// 3-b. AdFit 재삽입 감시 (OPERATIONS.md §4 확정: 제거 상태 유지)
let adfit = 0;
for (const f of files) if (/<ins[^>]*kakao_ad_area/.test(readFileSync(f,'utf8'))) adfit++;
if (adfit) problems.push(`AdFit 광고가 ${adfit}개 파일에 재삽입됨 — 제거 정책 위반`);

// 3-c. 구 도메인 잔존 감시
let olddom = 0;
for (const f of files) if (readFileSync(f,'utf8').includes('dreams-come-true-ten.vercel.app')) olddom++;
if (olddom) problems.push(`구 도메인 참조가 ${olddom}개 파일에 잔존`);

// 3-d. 자기 자신을 가리키는 링크 감시 (UIUX 8-3, docs/UIUX_REVIEW.md)
//      클릭해도 같은 페이지가 열려 고장으로 인식되고 회유 슬롯이 낭비된다
let selfl = 0;
// 대상은 꿈 상세 페이지의 회유 링크. 전 사이트 공통 네비/푸터의 현재 페이지 참조는 정상이므로 제외
for (const f of [...files].filter(x => x.startsWith('dream-'))) {
  const body = readFileSync(f,'utf8');
  const esc = f.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
  const all = body.match(new RegExp(`<a[^>]*href="${esc}"[^>]*>`,'g')) || [];
  const n = all.filter(a => !/class="[^"]*\bnav-(link|logo)\b/.test(a)).length;
  if (n) { selfl += n; warns.push(`자기 자신을 가리키는 링크: ${f} (${n}건)`); }
}
if (selfl) problems.push(`자기링크 ${selfl}건 — 발행기 또는 템플릿에서 자기 slug를 제외해야 함`);

// 3-e. 푸터 대비 회귀 감시 (UIUX 8-1) — 개인정보처리방침 링크는 AdSense 심사 확인 항목
let lowc = 0;
for (const f of files) {
  const body = readFileSync(f,'utf8');
  for (const m of body.matchAll(/footer\s*(a\s*)?\{[^}]*\}/g))
    if (/color\s*:\s*rgba\(255,\s*255,\s*255,\s*0?\.(0\d|1\d|2\d|3[0-4])\)/.test(m[0])) { lowc++; break; }
}
if (lowc) problems.push(`푸터 대비가 WCAG AA(4.5:1) 미만인 파일 ${lowc}개 — 정책 링크 판독 불가`);

// 4. 오늘의 꿈 신선도 (배포 후 유효)
const idx = readFileSync('index.html','utf8');
const dm = idx.match(/<!--TODAY_DATE-->([^<]*)</);
if (dm) {
  const m = dm[1].match(/(\d+)년 (\d+)월 (\d+)일/);
  if (m) {
    const rotated = new Date(Date.UTC(+m[1], +m[2]-1, +m[3]));
    const staleDays = Math.floor((new Date(today) - rotated)/86400e3);
    if (staleDays > 2) problems.push(`오늘의 꿈 ${staleDays}일째 미회전 — cron 점검 필요`);
  }
}

const report = `# 서비스 상태 (자동 생성)
갱신: ${today}
- HTML 페이지: ${files.size}개 / sitemap 등재: ${locs.length}개
- 깨진 내부 링크: ${broken}건
- 발행 큐: 검수완료 ${ready}건 / 초안 ${draft}건
${problems.length?'\n## ⛔ 문제\n'+problems.map(p=>'- '+p).join('\n'):''}
${warns.length?'\n## ⚠️ 주의\n'+warns.map(w=>'- '+w).join('\n'):'\n문제 없음 ✅'}
`;
writeFileSync('STATUS.md', report);
console.log(report);
if (problems.length) process.exit(1);
