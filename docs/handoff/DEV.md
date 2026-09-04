# 개발창 핸드오프 — 꿈해몽 행운 (suksuki.com)

> 작성 2026-09-04. 이 창은 **코드·배포·계측 구현·스크립트·워크플로**만 맡는다.
> 콘텐츠 문안은 컨텐츠창, 수치 해석·마케팅 판단은 데이터창이 한다. 이 창은 그 둘의 **결정을 구현**한다.

## 0. 먼저 읽을 것 (순서대로)
1. `OPERATIONS.md` **§0 대원칙** — 검색·실측으로 확인한 뒤 말한다 · 추측 금지 · 객관적 판단만, 희망적 표현 금지
2. `docs/DECISIONS.md` — 이미 버린 안(다시 제안 금지) · 확정 규칙
3. `docs/WORKLOG.md` — 터진 문제의 증상→원인→처리→교훈
4. 이 파일

## 1. 현재 상태 한 줄
정적 HTML 150개(꿈 상세 143), Vercel, 도메인 `suksuki.com`(9/2 전환, 구 `dreams-come-true-ten.vercel.app`은 308). **9/2 전환 후 네이버 재색인 공백으로 사용자 -59%(9/3 확정치)** — 회복은 데이터창이 추적. AdSense 신청은 9/6 GSC 색인 점검 후.

## 2. 절대 규칙 (개발창)
- **배포 전 운영자 컨펌** (`OPERATIONS.md` §5). 문서만 바꾸는 커밋은 예외
- **`git add -A` 금지 — 경로를 명시해 add.** 과거 이걸로 제거한 광고가 되살아난 사고 있음. 커밋 전 `git diff --stat`으로 파일 수 확인
- `STATUS.md`는 health-check가 자동 생성 — **커밋하지 않는다**
- **계측 코드는 배포 후 실브라우저에서 발화까지 확인**한다. grep으로 코드 존재 확인 ≠ 동작. hidden 탭 조건 포함(rAF는 hidden에서 멈춤 → setTimeout 사용)
- 지면 재설계(회유 동선·사주 위치)는 **AdSense 승인 후** 한 묶음으로. 지금 개별 수정 금지. 스티키/플로팅 금지
- 신규 발행 페이지는 `scripts/page-template.html`을 상속 → 전 페이지 공통 변경은 **템플릿도 반드시** 함께

## 3. 코드 지도
| 영역 | 파일 |
|---|---|
| 꿈 상세 | `dream-*.html` 143 (구조: hero → 본문 11섹션 → mid-related → 회유 섹션 → saju-cta → 비슷한 꿈 → 공유 → footer) |
| 홈/정적 | `index.html`, `guide.html`, `saju.html`, `about.html`, `privacy.html`, `terms.html`, `404.html` |
| 사주 | `saju/saju-core.js`(만세력) · `saju/lunar-core.js` · `saju/saju-content.js`(문안 데이터) · `saju/saju-reading.js`(조립) · `saju-ui.js`(렌더) · `saju-dreams.js`(선택기 인덱스) · **번들 `saju-bundle.js`** (`scripts/build-saju-bundle.js`로 생성, 직접 편집 금지) |
| CTA 착지 DB | `dreams-db.js` (`scripts/build-dreams-db.py`) · `kw-cat-map.csv`(slug,kw,cat) |
| 발행 | `content-queue/queue.json`(approved 게이트) · `scripts/publish-queue.mjs` · `scripts/page-template.html` |
| 검증 | `scripts/verify-publish.mjs` · `scripts/health-check.mjs`(AdFit/구도메인/자기링크/푸터대비 회귀 가드) |
| 계측 | 각 dream 페이지 하단 IIFE `/* GA4 click instrumentation (D0) */` — click 이벤트 + **`scroll_25/50/75`**(9/4, setTimeout 스로틀). 측정ID `G-MCNS7P3XVT` 단일 |
| 워크플로 | `.github/workflows/` daily-today-rotation(04:30) · publish-new-dreams(월수금 04:10) · weekly-health(월 09:00) · weekly-email-report(월 09:30) |
| 설정 | `vercel.json`(59 리다이렉트 + 보안 헤더 5종) · `robots.txt` · `sitemap.xml` |

## 4. 명령어
```bash
node scripts/verify-publish.mjs      # 발행 무결성 (143/143)
node scripts/health-check.mjs        # 회귀 가드 (STATUS.md 갱신 — 커밋 X)
node saju/verify.js                  # 만세력·음력 319건
node scripts/build-saju-bundle.js    # saju-content/reading 수정 후 필수
python3 scripts/build-dreams-db.py   # 신규 페이지 후
python3 scripts/measure-draft.py docs/drafts/saju-content-v2-draft.md --write   # 문안 실측
```

## 5. 대기 작업 (우선순위 순)
1. **꿈사주 문안 반영** — 컨텐츠창 검수 완료 신호 오면: `saju/saju-content.js`의 RELATION 5×(text,tip) + DREAM_BRIDGE 8×5 교체 → 번들 빌드 → `verify.js` → 컨펌 → 배포. 계산 로직(`relationOf`, `saju-core`) 절대 수정 금지
2. **인라인 꿈사주 모듈** — AdSense 승인 후. 설계(9/4 합의):
   - 위치: "이 꿈을 꿨다면" 섹션 직후(본문 약 51%). 확정은 데이터창의 `scroll_50÷page_view` 7일 데이터 후
   - 입력 전: 오늘의 일진은 전원 공통 → `todayPillarIndex`로 생년월일 없이 "오늘은 ○○한 날" + 카테고리 문장 표시
   - 입력: 생년월일 3탭(시간 선택), 결과는 **그 자리에서** 펼침(페이지 이동 없음)
   - 재방문: `localStorage dct_birth_v1` 있으면 자동 펼침
   - hero 배지 아래 앵커 한 줄 "이 꿈을 꾼 오늘, 당신의 흐름까지 →"
   - 이벤트: `saju_inline_view` / `saju_inline_input` / `saju_inline_result`
   - 번들 지연 로드 검토(142페이지 무게)
3. **UIUX 미이행 묶음**(승인 후, `docs/UIUX_REVIEW.md`): 4a hero 결론+목차 · 4b 관련꿈 중복 해소 · 4c memimo 강등(81%, 92일 2클릭) · 5 오늘의 꿈 위젯 · 8-2 터치타깃 44px
4. `index.html`에도 `scroll_*` 적용(선택, 블록이 dream과 다름)
5. **하지 말 것**: 타로·이름궁합 이식(우선순위 아님), 유료화·카카오톡 백엔드(일 500명 전 보류), CSP(11ty 이관 시)

## 6. 최근 교훈 (반복 금지)
- `git add -A` → 광고 141파일 부활 사고
- rAF 스로틀 → hidden 탭에서 고정, 계측 0건. setTimeout으로 교체
- 정규식 일괄 치환은 **블록 해시 동일 확인 → assert count==1 → diff 삭제 0 확인** 후 커밋
- 태그 균형·자기링크·푸터 대비는 health-check가 잡는다. 새 회귀 가드는 **주입 테스트로 잡히는지 확인**

## 7. 새 창 첫 메시지 (붙여넣기)
```
개발창이다. docs/handoff/DEV.md를 읽고 시작해. OPERATIONS.md §0 대원칙 준수.
지금 할 일은 [여기에 지시]. 배포 전에 컨펌 받아.
```
