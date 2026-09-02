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
