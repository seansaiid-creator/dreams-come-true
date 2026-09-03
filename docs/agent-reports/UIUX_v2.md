# 꿈해몽 행운 — UI/UX 2차 진단 (v2)

- 진단일: 2026-09-02
- 대상: **실제 배포본 https://suksuki.com** (모바일 375×812 에뮬레이션, 스크린샷 + DOM 실측)
- 코드 기준: 로컬 `main` @ `25b14c8` (읽기만 함, 수정 없음)
- 1차 진단에서 이미 반영된 항목(CTA 퍼널·깨진링크·오복붙·og:image·user-scalable·오늘의꿈 위젯 신설·guide 139편)은 재지적하지 않음
- 제안 8건. 모두 OPERATIONS.md 제약(비용 0원 / 정적 HTML / 1인 운영 / 배포는 운영자 컨펌) 안에서 실행 가능

---

## 요약 (한 장)

| # | 우선 | 문제 | 움직일 GA4 지표 |
|---|---|---|---|
| 1 | **P0** | AdFit 제거가 되돌려져 라이브에 광고 4개가 살아있음 | LCP, AdSense 심사 |
| 2 | **P0** | canonical/og:url 145개 전량이 구도메인 vercel.app | GSC 색인, 네이버 유입 |
| 3 | **P0** | CTA 착지 결과의 63%가 "카테고리 일반 문구" | `fallback_used`, haemong→lucky_view |
| 4 | P1 | 회유 블록이 전부 페이지 72~97% 구간에 몰림 + 관련꿈 블록 중복 | 세션당 페이지 1.26→ |
| 5 | P1 | 오늘의 꿈 위젯이 홈에만 있어 트래픽 95%에 미도달 | 세션당 페이지, 재방문 |
| 6 | P1 | 재방문 장치 전무 (localStorage 사용 0개 파일) | 재방문율 0.2%→ |
| 7 | P1 | 가짜 카카오톡 버튼 + 클립보드 무음 실패 (네이버 인앱 97%) | `share_click` |
| 8 | P2 | 접근성·성능 잔여 7종 (푸터 대비 1.49:1, 터치타깃, 자기링크 30개 등) | 이탈률, LCP |

---

# P0

## 1. AdFit 제거 커밋이 되돌려졌고, 광고가 라이브에 그대로 살아있다

### 문제
운영자 인식("현재 사이트에 광고 0개")과 배포 현실이 다르다. **suksuki.com에는 지금 이 순간 AdFit 광고가 페이지당 3~5개 렌더링되고 있다.**

### 근거 (실측)
브라우저에서 `https://suksuki.com/dream-bag-lost.html` 직접 확인:

```
document.querySelectorAll('ins.kakao_ad_area').length  →  4
script[src] → t1.kakaocdn.net/kas/static/ba.min.js  ×4 (동일 스크립트 4회 로드)
```
- 첫 뷰포트 스크린샷에 `Daum에서 라이브로 만나는 2026 SKA` 배너가 **hero(이모지+H1) 바로 위, y=65~145** 에 표시됨
- 홈(`index.html`)은 광고 5개 — y=66 / 638 / 751 / 1455 / 2120. 첫 화면에 배너 1개 + CTA 바로 아래 250px짜리 1개
- 구세대 `dream-snake.html`도 4개

Git 이력 추적:

| 커밋 | dream-bag-lost.html 내 `kakao_ad_area` 수 |
|---|---|
| `c816d09` (main) | 4 |
| `9691525` (w1-12) | 0 |
| `f906b92` "W1-12 배포: … + AdFit 제거" (머지) | **0 ← 정상** |
| `8f14be6` | 0 |
| **`25b14c8` "docs: AdFit 제거 확정 근거 기록"** | **4 ← 되돌아옴** |

`git show 25b14c8 --stat` 결과: `OPERATIONS.md | 3 ++` 와 함께 **dream-*.html 141개 파일에 각 40~43줄이 "삽입(+)"** 되어 있다. 즉 문서 커밋 이름을 달고 광고 마크업이 전량 복구됐다. 이 커밋이 `origin/main` = 라이브다.

현재 상태: 전체 147개 HTML 중 **141개에 AdFit 잔존**. 광고 없는 파일은 `404 / about / privacy / terms / report / dream-washing-machine-overflow` 6개뿐.

### 왜 P0인가
- OPERATIONS.md §4 「AdFit 전면 제거 확정(2026-09-02) … 되돌리지 않는다」 정면 위반
- OPERATIONS.md §5 「광고 단위 추가·제거 = 컨펌 필수」 위반
- 제거의 원래 이유(미충전 빈 광고 박스 → AdSense "저가치 콘텐츠" 재판정 리스크)가 그대로 살아있음. **AdSense 심사 신청 전에 반드시 정리돼야 함**
- 성능: 동일 스크립트 4회 + `serv.ds.kakao.com/sdk/banner` 4회 + `safeframe.html` iframe 4개. 상세 페이지 첫 뷰포트에 80px 광고가 hero보다 위 → LCP 요소가 그만큼 밀림

### 개선안
1. `25b14c8`의 **HTML 변경분만** 되돌린다 (OPERATIONS.md의 3줄 추가는 유지):
   ```
   git revert --no-commit 25b14c8
   git checkout 25b14c8 -- OPERATIONS.md
   git commit -m "revert: 25b14c8에서 되살아난 AdFit 마크업 재제거 (OPERATIONS 문서는 유지)"
   ```
2. 재발 방지: 이미 있는 `.github/workflows/weekly-health.yml`에 한 줄 가드 추가 제안
   ```yaml
   - run: |
       n=$(grep -l 'kakao_ad_area' *.html | wc -l)
       [ "$n" -eq 0 ] || { echo "AdFit 잔존 ${n}개"; exit 1; }
   ```
3. 광고 자리는 **비워둔다**(아래 P1-4의 회유 블록 재배치로 채움). 첫 뷰포트에 다시 무언가를 넣지 않는 것이 심사에 유리

### 기대효과
LCP 단축(요청 12건 제거), AdSense 심사 통과 확률. 광고 수익 손실은 0원(누적 300원 미만, §4에 근거 기록됨).

> ⚠️ 배포(push)는 OPERATIONS.md §5에 따라 **운영자 컨펌 필수**. 본 진단은 제안까지만.

---

## 2. canonical / og:url 145개 전량이 구도메인을 가리킨다

### 문제
라이브 도메인은 `suksuki.com`인데, 모든 페이지가 검색엔진에 "이 페이지의 정본은 `dreams-come-true-ten.vercel.app`" 이라고 선언하고 있다.

### 근거
```
canonical → dreams-come-true-ten.vercel.app : 145 파일
canonical → suksuki.com                     :   0 파일
og:url    → vercel.app                      : 142 파일
```
1위 트래픽 페이지도 예외 아님 — `dream-parked-car-lost.html:125`
```html
<link rel="canonical" href="https://dreams-come-true-ten.vercel.app/dream-parked-car-lost.html">
```

### 왜 P0인가
유입의 97%가 네이버 모바일이고 95%가 상세 페이지 직접 착지인데, 그 착지 URL 전부가 "나는 정본이 아니다"라고 말하고 있다. 색인 신호가 두 도메인으로 쪼개진다. 로드맵 W2-0(URL 전환)의 일부지만, **도메인은 이미 라이브이므로 지연될수록 손해만 누적**된다.

### 개선안
1. 145개 파일 일괄 치환 (1인 운영 부담 없음):
   ```
   sed -i '' 's#https://dreams-come-true-ten.vercel.app#https://suksuki.com#g' *.html sitemap.xml
   ```
2. `vercel.json`에 vercel.app → suksuki.com 301 (이미 W2-0 계획에 있음)
3. GSC/네이버 서치어드바이저에 suksuki.com 재등록 + sitemap 재제출

### 기대효과
GSC 색인 페이지 수, 네이버 노출. 이건 UI/UX 범위 밖이지만 지금 발견됐고 비용이 sed 한 줄이라 P0로 올림.

---

## 3. CTA를 눌러 착지한 결과의 63%가 "그 꿈"의 해몽이 아니다

### 문제
퍼널은 고쳐졌다(`cta_landing` 발생 확인). 그런데 **착지해서 받는 해몽 문구가 방금 읽은 그 꿈이 아니라 카테고리 공통 보일러플레이트**인 경우가 대다수다.

### 근거
`index.html:1759` `analyzeDream()` 매칭 순서 — ① `dreamDB[base]` 직접 → ② `keywordMap` 부분일치 → ③ `CAT_FALLBACK[_cat]`.

상세 페이지들이 실제로 쓰는 CTA 링크의 `kw` 138종을 전부 이 로직에 통과시킨 결과:

| 경로 | 건수 | 비율 |
|---|---|---|
| dreamDB 직접 매칭 | 18 | 13% |
| keywordMap 매칭 | 33 | 24% |
| **CAT_FALLBACK (카테고리 일반 문구)** | **87** | **63%** |

(dreamDB 엔트리 46개 / keywordMap 162개 / CTA 키워드 138개)

실측 사례 — 1위 트래픽 페이지 `dream-bag-lost.html` (46뷰)
- 상세 본문: "가방 = 내가 짊어진 책임·역할·기회. 놓칠까 봐 느끼는 **불안**"
- CTA 클릭 후 착지(`?kw=가방을 잃어버리는 꿈&cat=loss`) 결과:
  > 제목: **가방을 잃어버리는 꿈** / ⭐⭐⭐ 중길몽
  > 본문: "**무언가를** 잃어버리는 꿈은 실제 분실보다는 소중한 것을 놓칠까 봐…"

제목만 사용자 키워드로 바뀌고 본문은 `cat=loss` 공통 문단이다. `cat=blocked` 하나에 51개 키워드가, `money`에 25개, `loss`에 21개가 몰려 있다. 즉 51개 페이지가 **완전히 동일한 해몽 문단**으로 착지한다.

이 상태는 이미 계측되고 있다 — `index.html:1768`
```js
if(window.gtag) gtag('event','fallback_used',{cat:window._cat});
```
→ **GA4에서 오늘 바로 확인 가능.** `fallback_used` / `haemong_start` 비율이 실제 폴백률이다.

부수 확인: 행운번호 쪽 `dreamNumberMap`에는 `'가방분실':[5,12,21,30,39,44]` 처럼 **개별 키가 이미 존재**한다. 번호는 꿈별로 다른데 해몽 문구만 카테고리 공통인 비대칭.

### 왜 치명적인가
사용자는 8,000px짜리 매우 구체적인 글을 144초 읽고 "이 꿈의 행운번호 받기"를 눌렀다. 그런데 돌아온 건 방금 읽은 것보다 얕은 일반론이다. **한 번 겪으면 다시 누를 이유가 없다** — 재방문율 0.2%와 세션당 1.26의 유력한 원인(가설, 단 폴백률 63%는 실측).

### 개선안 (공수 대비 효과 최대)
1. **GA4에서 `fallback_used` 실측**부터. `cat` 별 분포를 보면 어디부터 메울지 나옴
2. 상위 트래픽 20개 페이지의 키워드만 우선 등록. `dreamNumberMap` 키를 재사용하면 작명 고민 없음:
   ```js
   // dreamDB에 추가 (index.html:1434 블록)
   가방분실: {
     keyword:'가방을 잃어버리는 꿈', luck:'⭐⭐ 주의몽', luckScore:2,
     text:'가방을 잃어버리는 꿈은 내가 맡은 책임·역할·기회를 놓칠까 봐 느끼는 불안과, 삶의 우선순위를 다시 점검하라는 신호입니다.',
     advice:'<strong>오늘의 조언:</strong> 오늘 하루만 일정·문서·결제 내역을 한 번 정리해보세요.'
   },
   // keywordMap에 추가 (index.html:1708 블록)
   '가방을잃':'가방분실','가방분실':'가방분실','가방':'가방분실',
   ```
   본문 3~4줄은 각 상세 페이지 `hero p`에 이미 존재 → **복사만 하면 됨. 페이지당 1~2분.**
3. 신규 발행 파이프라인(`content-queue`)에 "dreamDB 엔트리 동반 생성"을 체크리스트로 추가해 재발 방지
4. 폴백이 불가피할 땐 정직하게: 카테고리 문구 위에 `"이 꿈의 개별 풀이는 준비 중이에요. 아래 상세 해몽을 확인해보세요 →"` + 원래 상세 페이지 링크

### 기대효과
`cta_lucky_click → lucky_view` 도달률(OPERATIONS.md KPI 목표 80%+), `fallback_used` 감소, 재방문율. OPERATIONS.md §4의 "2~4주 후 5% 미만이면 인라인 위젯으로 강등" 판정을 **공정한 조건에서** 하려면 이걸 먼저 고쳐야 한다. 지금 강등 판정을 내리면 기능이 아니라 콘텐츠 공백을 벌하는 셈.

---

# P1

## 4. 회유 동선이 전부 페이지 하단에 몰려 있고, 관련 꿈 블록이 중복이다

### 문제
상세 페이지 `dream-bag-lost.html`의 전체 높이는 **8,072px**. 본문 11개 섹션이 y=508~5,837을 차지하고, **그 구간 안에 내부 링크가 단 하나도 없다.** 모든 회유 장치가 72%~97% 지점에 몰려 있다.

### 근거 (DOM 좌표 실측)

| y | 높이 | 블록 | 페이지 내 위치 |
|---|---|---|---|
| 65 | 80 | **AdFit 광고** | 0.8% (hero보다 위) |
| 165 | 343 | hero (이모지+H1+한줄요약+badge) | 2% |
| 508–5,837 | 5,329 | 본문 섹션 11개 — **내부 링크 0** | 6~72% |
| 5,851 | 50 | `service-btn` 행운번호 CTA ① | 72% |
| 5,900 | 335 | 「함께 보면 좋은 꿈해몽」 (plain 링크 5개) | 73% |
| 6,249 | 126 | 면책 문구 | 77% |
| **6,401** | **304** | **memimo 제휴 (순백 카드)** | 79% |
| 6,731 | 130 | AdFit 광고 | 83% |
| 6,885 | 167 | `eng-cta-box` 행운번호 CTA ② | 85% |
| **7,081** | **410** | **「이 꿈과 비슷한 꿈」 리치 카드 3개** | **88%** |
| 7,514 | 80 | AdFit 광고 | 93% |
| 7,618 | 98 | 공유 | 94% |
| 7,740 | 80 | AdFit 광고 | 96% |
| 7,844 | 148 | footer | 97% |

문제점 4가지:
- **관련 꿈이 두 번 나온다.** y=5,900 plain 링크(👛지갑/🧾영수증/🔑열쇠/📱휴대폰/💵돈꿈)와 y=7,081 리치 카드(👛지갑없는꿈/💵돈세는꿈/💵돈꿈해몽). **「돈꿈 해몽」은 양쪽에 중복**
- **가장 잘 만든 컴포넌트가 가장 안 보이는 곳에 있다.** 리치 카드는 이모지+제목+태그+`⭐⭐⭐⭐ 길몽`/`⭐⭐ 주의몽`+`→` 로 클릭 유인이 다 갖춰졌는데 88% 지점
- **행운번호 CTA가 두 번**(5,851 / 6,885) 나오는데 사이에 광고와 제휴 배너가 끼어 있다
- **memimo가 페이지에서 가장 시선을 끄는 요소.** 다크 테마 전체에서 **유일한 순백(#FFF) 카드**, 304px, 파란 「앱 받기」 버튼. 야간 모바일에서 밝기 충격이 크다. 그런데 92일간 클릭 2회 = 사실상 0. 140개 페이지에 존재. **가장 값비싼 시각적 자산을 가장 성과 없는 것에 쓰고 있다**

또한 **8,000px 문서에 목차가 없다** — `grep 'href="#'` → index/bag-lost/snake 모두 **0**.

### 개선안

**(a) hero 직하에 "결론 + 목차" 삽입** — 검색 착지자가 3초 안에 답을 얻고, 원하는 섹션으로 점프
```html
<div class="quick">
  <div class="quick-verdict">⭐⭐ 주의몽 · 책임 과부하 신호</div>
  <p class="quick-sum">가방 = 내가 짊어진 책임과 기회. 잃는 꿈은 그걸 놓칠까 봐 느끼는 불안입니다.</p>
  <nav class="toc" aria-label="목차">
    <a href="#situ">상황별 해석</a><a href="#money">재물운</a>
    <a href="#love">연애운</a><a href="#work">직장운</a><a href="#todo">이 꿈을 꿨다면</a>
  </nav>
</div>
```
```css
.quick{background:rgba(201,168,76,.07);border:1px solid var(--border);
       border-radius:16px;padding:16px;margin-bottom:14px}
.quick-verdict{font-size:15px;font-weight:700;color:var(--gold-light);margin-bottom:8px}
.quick-sum{font-size:13px;line-height:1.8;opacity:.92;margin-bottom:12px}
.toc{display:flex;flex-wrap:wrap;gap:8px}
.toc a{font-size:12px;color:var(--purple-light);text-decoration:none;
       background:rgba(107,63,160,.16);border-radius:999px;
       padding:10px 14px;min-height:44px;display:flex;align-items:center}
```
> hero의 현재 badge(`책임·재물·기회 관리 해석`)는 **카테고리**지 **판정**이 아니다. 네이버 검색자가 3초 안에 알고 싶은 건 "좋은 꿈이야 나쁜 꿈이야"다. `⭐⭐ 주의몽` 판정은 `CAT_FALLBACK`/`dreamDB`에 이미 있는 값이라 새로 만들 필요 없음.

**(b) 리치 카드 관련꿈을 「상황별 해석」 직후(y≈2,280)로 이동.** 본문 중반에 첫 이탈-회유 지점을 만든다. 하단 plain `related-links` 블록은 **삭제**(중복 해소)

**(c) 하단 순서 정리** — 광고 제거(P0-1) 후:
```
본문 → [리치 관련꿈 · 중반] → 남은 본문 → 행운번호 CTA(1개만) →
[오늘의 꿈 위젯 ← P1-5] → [내가 본 꿈 ← P1-6] → 공유 → 면책 → memimo → footer
```
**(d) memimo**: ① 제거 또는 ② footer 바로 위로 강등 + 다크 스킨(`background:var(--card)`, 로고만 컬러)으로 밝기 충격 제거. 92일 클릭 2회면 제거가 합리적이지만 **제휴 계약 사항이라 운영자 판단**.

### 기대효과
세션당 페이지 1.26 → **1.5+**(OPERATIONS.md KPI 목표). `related_click`, `toc_click`(신규), 스크롤 깊이.

---

## 5. "오늘의 꿈" 위젯이 홈에만 있어 트래픽의 95%에 닿지 않는다

### 문제
어제 신설한 자동 회전 위젯이 **홈에만** 있다. 그런데 방문자의 95%는 상세 페이지에 직접 착지하고 홈에 가지 않는다. → **투자한 기능이 실사용자의 5%에게만 노출된다.**

### 근거
```
grep -c "오늘의 꿈" :  index.html → 2,  dream-bag-lost.html → 0,  dream-snake.html → 0
```
홈에서조차 y=**1,596** / 전체 2,398px = **67% 깊이**.

역설: 구세대 `dream-snake.html`에는 「🎲 오늘 알아볼만한 꿈」(y=3,505)이 **있고**, 신세대 `dream-bag-lost.html`에는 **없다**. 신세대가 기능적으로 후퇴했다.

추가로 홈에는 랜덤 카드 블록이 **두 개** 있다 — 「🌙 오늘의 꿈 풀이」(y1,596) / 「🎲 오늘 알아볼만한 꿈」(y1,872). 사용자 눈엔 같은 것의 반복.

또 「🔥 이번 주 인기 꿈」(y=847)이 `집 리모델링 / 길 잃는 / 비행기 / 이빨 / 돼지`로 하드코딩되어 있는데, 실제 GA4 상위는 `주차한 차(47) / 가방 분실(46) / 집 리모델링(16)`. **"이번 주 인기"라는 라벨이 사실이 아니다.**

### 개선안
1. **상세 페이지 CTA 직후에 오늘의 꿈 3장 삽입** — 날짜를 반드시 노출(재방문 이유가 됨)
   ```html
   <div class="eng-section">
     <div class="eng-sec-title">🌙 오늘의 꿈 풀이 <span class="date">9월 2일</span></div>
     <a class="random-card" href="dream-late.html">⏰ 지각하는 꿈 <em>막힘 운의 신호</em></a>
     ...
   </div>
   ```
   기존 `daily-today-rotation.yml` 워크플로가 이미 매일 index를 갱신하므로, **주입 대상 파일 목록만 확장**하면 됨(추가 비용 0원, 무인 유지).
2. 홈의 두 랜덤 블록을 **하나로 통합**. 자리는 「이번 주 인기 꿈」 위(y≈847)로 올려 첫 스크롤 안에
3. 「이번 주 인기 꿈」 목록을 GA4 실측 상위로 교체(`주차한 차 / 가방 분실 / 집 리모델링 / …`). 주간 `/ops` 사이클에서 갱신하면 1인 운영 부담 없음

### 기대효과
세션당 페이지(오늘의 꿈 카드는 상세→상세 이동), 재방문(날짜 스탬프 = "내일 또 바뀜"의 약속), `today_card_click`.

---

## 6. 재방문 장치가 하나도 없다 — localStorage 사용 파일 0개

### 문제
재방문율 0.2%인데, **재방문의 이유를 만드는 UI가 전무하다.** 정적 + 비로그인이라 서버는 못 쓰지만 localStorage는 허용된다.

### 근거
```
grep -rl "localStorage" *.html  →  결과 없음 (0개 파일)
```
비용 0원 · 정적 HTML 제약 안에서 가장 저평가된 미개척 수단.

### 개선안 (전부 클라이언트, 서버·비용 0)

**(a) 「📖 내가 본 꿈」 서랍** — 상세 페이지 하단 공통 스니펫
```html
<div class="eng-section" id="drawer" hidden>
  <div class="eng-sec-title">📖 내가 본 꿈</div>
  <div class="drawer-list"></div>
</div>
<script>
(function(){
  var K='dct_seen';
  try{
    var m={s:location.pathname.split('/').pop(),
           t:document.querySelector('h1').textContent,
           e:document.querySelector('.hero-emoji').textContent, ts:Date.now()};
    var a=JSON.parse(localStorage.getItem(K)||'[]').filter(function(x){return x.s!==m.s});
    a.unshift(m); a=a.slice(0,6); localStorage.setItem(K,JSON.stringify(a));
    var prev=a.slice(1);
    if(prev.length){
      var d=document.getElementById('drawer');
      d.querySelector('.drawer-list').innerHTML=prev.map(function(x){
        return '<a class="random-card" href="'+x.s+'">'+x.e+' '+x.t+'</a>'}).join('');
      d.hidden=false;
      if(window.gtag) gtag('event','drawer_shown',{n:prev.length});
    }
  }catch(e){}   // 시크릿 모드 / 저장 차단 시 조용히 무시
})();
</script>
```
- 목록이 비면 **아예 안 나온다**(`hidden`) → 첫 방문자에게 빈 박스를 보이지 않음
- 두 번째 페이지부터 자동 등장 = 세션당 페이지에 즉시 기여

**(b) 재방문자 인사 한 줄** — hero 위, 마지막 방문이 1일 이상 전일 때만
```
🌙 어제 본 「지갑 잃어버리는 꿈」 이어보기 →
```

**(c) 오늘의 꿈에 날짜 스탬프**(P1-5와 결합) — "매일 새벽 갱신" 문구가 이미 홈에 있음. 상세 페이지에도 심어 약속을 반복

**(d) 자기 꿈 기록(선택)**: 「이 꿈 저장 🔖」 토글. 저장분은 서랍 상단 고정. 서버 없이 개인화된 느낌을 만드는 가장 싼 방법

> 개인정보: localStorage에 저장되는 건 **자기 기기 안의 페이지 slug/제목**뿐이고 외부 전송이 없다. `privacy.html`에 한 줄만 명시하면 됨.

### 기대효과
재방문율 0.2% → 목표 5%(OPERATIONS.md KPI)로 가는 유일한 무비용 수단. 즉시 효과는 오히려 **세션당 페이지** 쪽(서랍이 상세→상세 링크를 만듦). GA4: `drawer_shown` / `drawer_click` / `returning_visit`.

---

## 7. "카카오톡" 버튼이 카카오톡을 열지 않고, 클립보드는 무음으로 실패할 수 있다

### 문제
유입의 97%가 네이버 모바일 인앱 브라우저인데, 공유 UI가 그 환경에서 가장 취약하다.

### 근거 — `dream-bag-lost.html:245-246`
```html
<button class="eng-share-btn kakao" onclick="if(window.shareKakao){window.shareKakao()}else{navigator.clipboard.writeText(window.location.href).then(()=>alert('링크가 복사됐어요!'))}">💬 카카오톡</button>
<button class="eng-share-btn copy"  onclick="navigator.clipboard.writeText(window.location.href).then(()=>alert('링크가 복사됐어요!'))">🔗 링크 복사</button>
```
1. **`window.shareKakao`는 어디에도 정의돼 있지 않다.** 상세 페이지가 로드하는 외부 스크립트는 GA4와 AdFit `ba.min.js`뿐 — **Kakao SDK 미로드.** 즉 `#FEE500` 카카오 노란색 브랜드 버튼이 실제로는 **링크 복사만** 한다. 옆의 「🔗 링크 복사」와 **동작이 완전히 동일하다.** 브랜드 색으로 기대를 만들고 다른 걸 주는 UI
2. **`.catch()`가 없다.** `navigator.clipboard`는 네이버/카카오 인앱 WKWebView·구형 안드로이드 웹뷰에서 거부되는 경우가 있다. 거부되면 Promise가 reject되고 **alert도 안 뜨고 아무 일도 일어나지 않는다.** 사용자는 버튼이 고장 났다고 느끼고, GA4에는 `share_click`만 남아 성공으로 오집계된다

### 개선안 — 버튼 2개를 1개로 통합하고 `navigator.share` 우선
`navigator.share()`는 네이버/카카오 인앱을 포함한 최신 iOS·Android 웹뷰에서 동작하며 **네이티브 공유 시트에 카카오톡이 실제로 나온다.** SDK도 앱키도 필요 없다(비용 0원).

```html
<div class="eng-share-buttons">
  <button class="eng-share-btn kakao" onclick="dctShare(this)">📤 이 해몽 공유하기</button>
</div>
<script>
function dctShare(btn){
  var url=location.href, title=document.title, done=function(m){
    btn.textContent=m; setTimeout(function(){btn.textContent='📤 이 해몽 공유하기'},1800);
  };
  var ev=function(x){ if(window.gtag) gtag('event','share_click',{page:location.pathname,method:x}); };
  if(navigator.share){
    navigator.share({title:title,url:url}).then(function(){ev('native')})
      .catch(function(){/* 사용자 취소 — 조용히 */});
    return;
  }
  if(navigator.clipboard && navigator.clipboard.writeText){
    navigator.clipboard.writeText(url)
      .then(function(){ev('copy'); done('✅ 링크 복사됨')})
      .catch(function(){ legacy() });
    return;
  }
  legacy();
  function legacy(){                      // 인앱 웹뷰 최종 폴백
    var t=document.createElement('textarea');
    t.value=url; t.setAttribute('readonly','');
    t.style.cssText='position:fixed;top:-9999px';
    document.body.appendChild(t); t.select();
    var ok=false; try{ ok=document.execCommand('copy') }catch(e){}
    document.body.removeChild(t);
    ev(ok?'legacy':'fail'); done(ok?'✅ 링크 복사됨':'주소창의 링크를 길게 눌러 복사해주세요');
  }
}
</script>
```
- `alert()` 대신 **버튼 라벨 인플레이스 변경** — 인앱 브라우저에서 alert은 시스템 다이얼로그로 뜨며 이탈 유발
- `method`에 `native / copy / legacy / fail` 4분기 → **네이버 인앱에서 공유가 실제로 되는지 GA4로 증명 가능**

### 기대효과
`share_click` 절대값과 성공률. 공유는 신규 유입의 유일한 무비용 채널이고, 지금은 그게 계측조차 정확하지 않다.

---

# P2

## 8. 접근성·성능 잔여 (7종, 전부 저비용)

### 8-1. 푸터 대비가 WCAG 기준의 1/3 — 정책 링크가 사실상 안 보인다
공통 CSS(모든 상세 페이지):
```css
footer   { color: rgba(255,255,255,0.15) }   /* 대비 1.49:1 */
footer a { color: rgba(255,255,255,0.25) }   /* 대비 2.15:1 */
```
`#0D0A1A` 배경 기준 계산값. WCAG AA는 4.5:1. 실제로 375px 스크린샷에서 「개인정보처리방침 / 이용약관 / 서비스 소개」가 거의 판독 불가다.
**AdSense 심사에서 개인정보처리방침 링크의 접근 가능성은 실제 확인 항목**이다. 지금은 있어도 안 보이는 상태.
```css
footer   { color: rgba(255,255,255,0.55) }   /* → 5.9:1 */
footer a { color: rgba(255,255,255,0.78) }   /* → 10.6:1 */
```
> 나머지 텍스트 대비는 **매우 좋다** — 본문 12.8:1, h2 12.1:1, nav 6.3:1, 관련링크 4.7:1. **푸터만 고치면 된다.**

### 8-2. 터치 타깃이 전부 최소 기준 미달
DOM 실측 높이: `related-links a` **31px**, `nav-link` **28px**, `nav-logo` **21px**, 푸터 링크 **38px**. iOS 44pt / Android 48dp 미달. 손가락 굵은 사용자·흔들리는 대중교통에서 오터치 → **관련 꿈 클릭이 안 되면 세션당 페이지가 안 오른다.**
```css
.related-links a { padding:14px; min-height:48px; display:flex; align-items:center }
.nav-link        { padding:12px 10px }
.nav-logo        { padding:8px 0; display:inline-block }
```

### 8-3. 자기 자신을 가리키는 링크가 30개 파일에 있다
```
dream-snake.html          → <a href="dream-snake.html">🐍 뱀꿈</a>
dream-parked-car-lost.html → <a href="dream-parked-car-lost.html">🚗 차 시동 안 걸리는 꿈</a>
```
후자는 **라벨까지 틀렸다** — "차 시동 안 걸리는 꿈"을 약속하고 같은 페이지를 다시 연다. 클릭해도 아무 일 없어 보이니 **고장으로 인식**되고, 회유 슬롯 하나가 통째로 낭비된다. 30개 파일(2개는 자기링크 2회).
→ 자기 slug 제외 + 라벨-대상 대조 검증을 `weekly-health.yml`에 추가.

### 8-4. 푸터 저작권 연도가 139개 파일에서 2025
`index.html`만 2026, 상세 페이지 139개는 `© 2025`. 오늘은 2026-09-02. AdSense 심사에서 "관리되지 않는 사이트" 신호.

### 8-5. Google Fonts에 없는 폰트를 요청 중 + preconnect 누락
```html
<link href="…css2?family=Nanum+Myeongjo:…&family=Pretendard:wght@300;400;500;600;700&…">
```
**`Pretendard`는 Google Fonts에 존재하지 않는다.** 구글은 모르는 패밀리를 조용히 무시하므로 `body{font-family:'Pretendard',sans-serif}` 는 **항상 시스템 폰트로 폴백**한다(iOS=Apple SD Gothic Neo, Android=Roboto/Noto). 의도한 타이포가 기기마다 다르게 나온다.
또 `fonts.googleapis.com` preconnect는 있는데 **실제 폰트 파일이 오는 `fonts.gstatic.com` preconnect가 없다**. 그리고 `<head>`와 **본문 중간(line 136)에 스타일시트가 각각 하나씩** — 후자는 렌더 블로킹.
```html
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<!-- 두 요청을 하나로 병합, Pretendard 제거 -->
<link href="…css2?family=Nanum+Myeongjo:wght@700;800&family=Outfit:wght@500&display=swap" rel="stylesheet">
```
```css
body{font-family:-apple-system,BlinkMacSystemFont,'Apple SD Gothic Neo','Pretendard',
     'Malgun Gothic',sans-serif}
```
한글 명조(Nanum Myeongjo)는 서브셋이 많아 무거우므로 **H1/H2/CTA 3곳에만** 유지(현재 그렇게 쓰고 있음 — 유지). LTE 환경 LCP에 유의미.

### 8-6. `100vh` → 네이버 인앱 툴바 접힘 시 레이아웃 점프
`body{min-height:100vh}` (상세/홈 공통). 네이버 인앱 브라우저는 스크롤 시 상·하단 툴바가 접히며 뷰포트 높이가 바뀐다. `min-height:100dvh` 로. (홈은 이미 `dvh`를 일부 사용 중 — 상세만 미적용)

### 8-7. 구세대/신세대 UX 격차 — 통일 기준
| | 구세대 `dream-snake.html` | 신세대 `dream-bag-lost.html` |
|---|---|---|
| hero 한줄요약 `<p>` | **없음** | 있음 |
| hero badge | **없음** | 있음 |
| 오늘 알아볼만한 꿈 | 있음 (y3,505) | **없음** |
| 리치 관련카드 | 있음 | 있음 |
| nav 라벨 | 해몽하기 / 해몽 가이드 / 소개 | 해몽하기 / 해몽가이드 / 소개 |
| 문서 높이 | 4,384px | 8,072px |

- **nav 라벨이 홈과 상세에서 다르다** — 홈: `홈 / 꿈 사전 / 소개`, 상세: `해몽하기 / 해몽 가이드 / 소개`. 같은 목적지(`index.html`)를 다른 이름으로 부른다. **`홈 / 꿈 사전 / 소개` 로 통일** 권장(상세→홈 이동이 "해몽하기"보다 정확)
- **통일 기준은 신세대**. 단 신세대가 잃어버린 「오늘 알아볼만한 꿈」은 되살릴 것(P1-5)
- `dream-snake.html` `<title>`: `뱀꿈 로또번호 | 뱀꿈 로또번호**과** 참고용 행운 번호` — **오타(→와)** + 검색의도 불일치. "뱀꿈"을 검색하는 사람이 원하는 건 해몽이지 로또번호가 아니다. H1은 이미 「뱀꿈 해몽 지혜와 재물의 상징」인데 title만 로또 우선. **뱀 74뷰/92일 부진의 원인 가설**(SEO 영역이라 검증 필요). → `뱀꿈 해몽 총정리 (+재물운, 상황별 의미, 참고 행운번호)` 형태로. 신세대 title 패턴이 이미 그렇게 되어 있고 그쪽이 실제로 이기고 있다

---

# 이미 좋은 것 — 건드리지 말 것

### ✅ 1. 본문 다크 테마 가독성
`--text:#F0EAD6` @ opacity .92 on card = **12.8:1**, h2 `#F0D080` = **12.1:1**, `font-size:13px / line-height:1.9 / margin-bottom:10px`, `max-width:480px`. 야간 모바일에서 5,000px 장문을 144초 읽게 만드는 건 이 조합이다. **폰트 크기를 올리거나 줄간격을 줄이지 말 것.** CSS가 `<style>`로 인라인된 것도 정적 사이트에서 옳은 선택(요청 0건).

### ✅ 2. 신세대 「이 꿈과 비슷한 꿈」 리치 카드
`이모지 + 제목 + 태그 + ⭐길몽/주의몽 + →`. 클릭에 필요한 정보가 전부 있고, 별점 판정이 호기심을 만든다. 사이트에서 가장 잘 만든 컴포넌트다. **디자인은 그대로 두고 위치만 올릴 것**(P1-4b). 하단 plain `related-links`를 이쪽으로 흡수하는 방향이지 반대가 아니다.

### ✅ 3. hero의 한 줄 요약
`hero p` — "가방을 잃어버리는 꿈은 책임, 재물, 기회, 사회적 역할을 놓칠까 봐 느끼는 불안과 삶의 우선순위 점검을 의미하는 꿈입니다." 375px 첫 화면 안에 들어오고, 검색 의도를 즉시 충족한다. **여기에 ⭐판정만 더하면 되고**(P1-4a), 구세대 페이지에 이식할 기준점이다.

---

# 실행 순서 제안

| 순서 | 항목 | 공수 | 컨펌 필요 |
|---|---|---|---|
| 1 | P0-1 AdFit revert + 헬스체크 가드 | 10분 | **예(배포·광고)** |
| 2 | P0-2 canonical/og:url sed 치환 | 5분 | **예(배포)** |
| 3 | P0-3 GA4 `fallback_used` 확인 → 상위 20개 dreamDB 등록 | 40분 | 콘텐츠 승인 |
| 4 | P1-4 hero 판정+목차 / 리치카드 중반 이동 / 중복 제거 | 1~2시간 | 예(배포) |
| 5 | P1-6 「내가 본 꿈」 서랍 | 30분 | 예(배포) |
| 6 | P1-5 오늘의 꿈 상세 페이지 주입(워크플로 확장) | 30분 | 예(배포) |
| 7 | P1-7 공유 버튼 통합 | 20분 | 예(배포) |
| 8 | P2-8 접근성·성능 일괄 | 40분 | 예(배포) |

전부 정적 HTML/CSS/JS 범위, **추가 비용 0원**, 외부 서비스 신규 연동 없음 — OPERATIONS.md §1·§5 준수.

### 근거 수준 표기
- **실측**: P0-1(브라우저 DOM+git), P0-2(grep), P0-3(로직 시뮬레이션 138건), P1-4(DOM 좌표), P1-5(grep), P1-6(grep), P1-7(코드 리딩), P2-8-1(대비 계산), 8-2(DOM 실측), 8-3~8-7(grep/코드)
- **가설**: P0-3이 재방문율 0.2%의 원인이라는 인과 / P2-8-7의 title이 뱀꿈 부진의 원인 / P1-6이 재방문율을 5%로 올린다는 크기 추정
