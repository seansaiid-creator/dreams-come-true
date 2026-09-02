# 보안 검토 (2026-09-02)

> 이 파일은 그날의 **검토 원본**이다. 조치 결과는 아래 "처리 현황"을 보고,
> 이후 변경은 `WORKLOG.md`에 기록한다.

## 처리 현황 (2026-09-02 당일 전부 반영·배포 완료)

| 심각도 | 항목 | 조치 | 커밋 |
|---|---|---|---|
| 높음 | 사용자 자유 텍스트(꿈 내용)가 GA4로 전송 — 방침 위반 | 원문 전송 제거, 길이 구간만 전송. 검색어는 안전 필터 적용 후 유지 | `62621ec` |
| 높음 | 꿈사주 출시로 방침·약관 공백(생년월일 localStorage 미고지) | 방침 4곳 정정, 약관 제2조·면책 반영, [저장된 정보 지우기] 구현 | `62621ec` |
| 높음 | Gmail 앱 비밀번호가 가변 태그 서드파티 액션에 전달 | 커밋 SHA 고정 + `permissions: {}` | `3a9d829` |
| 중간 | 보안 헤더 전무 | nosniff·Referrer-Policy·X-Frame-Options·Permissions-Policy·HSTS 5종 추가 | `62621ec` |
| 중간 | AdSense 로더가 광고 유닛 0개인데 로드 | 승인 전까지 제거 | `62621ec` |
| 중간 | Android intent:// 인텐트 인젝션 | 프래그먼트 제거 후 인텐트 URL 구성 | `3a9d829` |
| 중간 | `kw` 파라미터 콘텐츠 스푸핑 | 꿈 이름에 쓰이는 문자만 허용 | `3a9d829` |
| 중간 | 발행 파이프라인 무이스케이프 | **미조치** — 입력이 사람 검수를 거친 자체 큐라 위험 낮음. 외부 기여를 받게 되면 반드시 처리 | — |
| 중간 | 카카오 JS 키 도메인 제한 | 확인 완료 — suksuki.com 등록됨(09-02) | — |

## 문제 없음으로 확인된 것
- **XSS 성립 경로 없음** — `kw`/`cat`/`s`/`dream` 전부 검증·`.value`·`textContent`·`esc()` 통과. 라이브 페이로드 실측 확인
- **오픈 리다이렉트 없음** — 리다이렉트 59개의 destination 전부 하드코딩
- **생년월일 서버 전송 없음** — 사이트 전체에 `fetch`/`XHR`/`sendBeacon`/픽셀 0건, GA4 이벤트 전수 확인. 방침의 "서버 미저장" 주장이 코드로 뒷받침됨
- **레포에 비밀값 없음** — git 히스토리 전수 확인. GA4 키는 `~/.config/dreams-ga4/`(레포 밖, 권한 600)

## CSP 미도입 사유
인라인 스크립트·인라인 스타일이 전 페이지에 다수 있어 지금 CSP를 걸면 사이트가 깨진다.
11ty 이관 시 인라인을 정리하면서 함께 검토한다.

---

# 원본 검토 보고서

# suksuki.com 보안 검토 보고서

- 검토일: 2026-09-02 · 브랜치 `w1-12` (a359cec)
- 범위: 정적 HTML 사이트 전량 코드 정독 (외부 스캔·공격 시도 없음, 코드 수정 없음)
- 검토 대상: `index.html`, `guide.html`, `saju.html`+`saju-*.js`, `dream-*.html` 142편, `vercel.json`, `scripts/*`, `.github/workflows/*`

## 요약

| 등급 | 건수 |
|---|---|
| 치명 | 0 |
| 높음 | 2 |
| 중간 | 6 |
| 정보 | 7 |

**핵심 판정**
- **XSS: 현재 실제로 성립하는 경로 없음.** URL 파라미터(`kw`/`cat`/`s`/`dream`)는 전부 `.value` 대입 · 화이트리스트 · 정규식 검증을 거치고, `saju-ui.js`의 `esc()`는 사용자 유래 값이 지나는 모든 출력 경로에 적용돼 있음. 다만 **미래에 XSS로 바뀔 수 있는 구조적 통로 2개**(발행 파이프라인, `build-dreams-db.py`의 엔티티 언이스케이프)가 있어 [중간]으로 기록.
- **오픈 리다이렉트: 없음.** 57개 리다이렉트 destination은 전부 하드코딩. 유일한 동적 규칙(`/:path*`)도 목적지 호스트가 `suksuki.com`으로 고정.
- **생년월일 서버 전송: 없음(코드로 확인).** 사이트 전체에 `fetch`/`XMLHttpRequest`/`sendBeacon`/동적 `Image` 픽셀이 **0건**. 외부로 나가는 네트워크 요청은 GA4·AdSense·Kakao SDK·Google Fonts 로더뿐이며, GA4 이벤트 파라미터를 전수 확인한 결과 생년월일(`y`/`m`/`d`/`lunarSrc`)은 **단 한 곳에도 실려 있지 않음**.
- **반면 "꿈 내용"은 GA4로 나감** — 개인정보처리방침의 문구와 실제 코드가 어긋남. 이번 검토의 가장 실질적인 지적 사항.

---

## [높음]

### H-1. 개인정보처리방침이 사실과 다름 — 이용자가 입력한 꿈 내용이 GA4(구글 서버)로 전송됨

**위치**
- `index.html:1848` — `gtag('event','haemong_start',{query:dreamText.slice(0,50)})`, 같은 줄 `lucky_view`도 동일
- `index.html:1402` — `gtag('event','dream_search',{query:q.slice(0,50)})`
- `index.html:2238` — `gtag('event','cta_landing',{kw:kw,cat:cat,legacy:...})`
- 상충하는 문구: `privacy.html:137` — *"이용자가 입력한 꿈 내용은 … 서버에 저장되지 않습니다"*, `privacy.html:170` — *"브라우저를 닫으면 즉시 삭제됩니다"*

**무엇이 문제인가**
해몽 입력창·검색창은 **자유 서술 텍스트**를 받는다. 그 앞 50자가 `query` 파라미터로 GA4에 전송되어 구글 서버에 최소 2개월~14개월(GA4 보존 설정) 저장된다. 방침 §1은 이를 "서버에 저장되지 않는다"고 단언한다. §1의 "검색어" 항목(`privacy.html:139`)이 일부만 걸치지만, "꿈 내용 = 미저장"이라는 명시적 문장과 정면으로 충돌한다.

**실제로 어떤 일이 가능한가**
- 이용자는 꿈 설명에 실명·질병·직장·가족관계를 자연스럽게 적는다(예: *"돌아가신 아버지가 나와서 수술 얘기를 하는 꿈"*, *"김○○ 팀장이 나오는 꿈"*). 이 문자열이 그대로 GA4 이벤트 파라미터로 나간다.
- 이는 **Google Analytics 이용약관이 금지하는 PII 전송**에 해당할 수 있다. 적발 시 GA4 속성 정지 → AdSense 계정 심사에도 부정적. (AdSense 승인이 현재 유일한 수익 경로임을 감안하면 사업 리스크이기도 하다.)
- 국내법상으로도 방침에 없는 항목을 제3자(Google)에 넘기는 형태가 되어 개인정보 보호법 §17·§39-12 이슈가 된다.
- 참고로 **사주 쪽 문구는 사실**이다. `saju-ui.js:158`의 `saju_submit`은 `{unknownHour, cal}`만 보내고 생년월일을 보내지 않는다. 즉 "서버 미저장"이라는 차별점 주장은 사주에는 유효하고 꿈 입력에는 무효인 상태다.

**수정 방안 (택1, 위에서부터 권장)**

① 자유 텍스트 전송을 끊고 통계만 남긴다 — 분석 가치를 거의 잃지 않는다.
```js
// index.html:1848
if (window.gtag) {
  gtag('event','haemong_start',{ matched: !!(window._reading && window._reading.keyword), len: dreamText.length });
  gtag('event','lucky_view',   { matched: !!(window._reading && window._reading.keyword) });
}
// index.html:1402 — 원문 대신 매칭된 정규 키워드만
window.__dsT=setTimeout(function(){
  if(window.gtag) gtag('event','dream_search',{ matched_slug: (results[0]&&results[0].url)||'', result_count: results.length });
},800);
```
② ①이 어렵다면, 최소한 `privacy.html:137`을 사실에 맞게 고친다.
> "입력하신 꿈 내용은 저희 서버에 저장하지 않습니다. 다만 서비스 개선 통계를 위해 입력 텍스트의 앞 50자가 Google Analytics로 전송되어 Google의 서버에 보관됩니다(보존기간 N개월). 개인을 식별할 수 있는 내용은 입력하지 말아 주세요."
③ `cta_landing`의 `kw`는 CTA가 만든 정규 키워드이므로 그대로 둬도 무방하나, 사용자가 URL을 직접 조작한 경우도 섞이므로 `_slug` 화이트리스트 통과분만 보내는 편이 안전하다.

**추가**: `dct_birth_v1` localStorage 저장이 `privacy.html` 어디에도 없다. §1에 "이용자 기기(localStorage)에만 저장되며 서버로 전송되지 않는 정보: 생년월일·태어난 시간" 항목을 신설할 것. 이건 오히려 **차별점 ④를 문서로 증명하는 문구**가 된다.

---

### H-2. GitHub Actions — Gmail 앱 비밀번호가 가변 태그 서드파티 액션에 그대로 넘어감

**위치** `.github/workflows/weekly-email-report.yml:36-42`
```yaml
- name: Send email
  uses: dawidd6/action-send-mail@v3        # ← 가변 태그
  with:
    password: ${{ secrets.MAIL_APP_PASSWORD }}
```

**무엇이 문제인가**
`@v3`는 브랜치/태그 참조라 리포지터리 소유자(또는 그 계정을 탈취한 자)가 언제든 가리키는 커밋을 바꿀 수 있다. 그 순간부터 워크플로는 **매주 월요일 자동으로** 새 코드를 받아 실행하며, 그 코드에 `MAIL_APP_PASSWORD`를 인자로 건넨다. GA4 서비스 계정 키(`GA4_SA_KEY_B64`)도 같은 잡의 `/tmp/sa-key.json`에 평문으로 놓여 있어 함께 읽힌다.

**실제로 어떤 공격이 가능한가**
1. `dawidd6/action-send-mail` 저장소가 침해되거나 `v3` 태그가 악성 커밋으로 이동한다(2024~2025년 `tj-actions/changed-files` 등 실제 다수 사례).
2. 다음 월요일 09:30 KST, 이 워크플로가 자동 실행되며 악성 코드가 `seansaiid@gmail.com`의 **앱 비밀번호**를 외부로 전송한다.
3. 앱 비밀번호는 2단계 인증을 우회해 SMTP/IMAP 전체 접근을 준다 → 운영자 **개인 Gmail 전체 열람·발송**. 여기서 다른 서비스 비밀번호 재설정 메일까지 가로챌 수 있어 피해가 도미노로 번진다.
4. 같은 실행에서 GA4 서비스 계정 키도 함께 유출된다(영향은 GA4 데이터 읽기로 제한적).

**수정 방안**
```yaml
# ① 커밋 SHA로 고정 (태그가 바뀌어도 실행 코드는 고정된다)
uses: dawidd6/action-send-mail@2785c72a1b0eb1c4b1bbd6f26d63c0b0b9a1e9ba  # v3.12.0
```
```yaml
# ② 잡 권한을 최소화 — 이 잡은 쓰기가 전혀 필요 없다
jobs:
  report:
    runs-on: ubuntu-latest
    permissions:
      contents: read
```
③ 중기적으로는 앱 비밀번호 대신 Gmail API OAuth 또는 전용 발신 계정(운영자 개인 메일과 분리)을 쓰는 편이 낫다. 비용 0원 유지 가능.
④ 저장소 Settings → Actions → *Allow actions* 를 "Allow select actions"로 좁히고, `Require approval for all outside collaborators`를 유지할 것.

---

## [중간]

### M-1. `openExternalBrowser()` — 안드로이드 인텐트 리다이렉션 (URL 프래그먼트가 그대로 intent:// 로 들어감)

**위치** `index.html:949-954`
```js
function openExternalBrowser(){
  var url=location.href, ua=navigator.userAgent||'';
  if(/Android/i.test(ua)){
    var intentUrl='intent://'+url.replace(/https?:\/\//,'')+'#Intent;scheme=https;package=com.android.chrome;action=android.intent.action.VIEW;end';
    location.href=intentUrl;
```

**무엇이 문제인가**
`location.href`는 **프래그먼트(`#…`)를 그대로 포함**한다. 안드로이드 `Intent.parseUri()`는 문자열에서 **처음 나오는 `#Intent;` 부터 `end` 까지**를 인텐트 명세로 해석하므로, 공격자가 URL 프래그먼트에 `#Intent;…;end`를 심으면 코드가 뒤에 붙이는 정상 명세보다 **공격자 것이 먼저 파싱된다.**

**실제로 어떤 공격이 가능한가**
1. 공격자가 카카오톡으로 링크를 유포: `https://suksuki.com/#Intent;scheme=https;package=<임의앱>;S.browser_fallback_url=https%3A%2F%2Fphish.example%2Flogin;end`
2. 피해자가 **카카오톡 인앱브라우저(안드로이드)** 에서 연다 → UA에 `KAKAOTALK`이 있어 상단 배너가 뜬다(`index.html:945-948`).
3. 피해자가 "브라우저로 열기"를 누른다 → `intentUrl`의 앞부분이 공격자 명세가 되어, 크롬이 아니라 **공격자가 지정한 앱의 exported 액티비티**가 실행되거나 `S.browser_fallback_url`의 임의 사이트로 이동한다.
4. 결과: 신뢰하는 도메인(suksuki.com)에서 출발한 것처럼 보이는 피싱 페이지 이동, 또는 설치된 타 앱의 딥링크 강제 호출(전형적인 Android Intent Redirection).

전제 조건(안드로이드 + 카톡 인앱 + 버튼 클릭)이 붙어 [치명]은 아니지만, **이 사이트 트래픽의 94%가 모바일이고 유입의 상당수가 카카오톡 공유**라는 점에서 현실성이 낮지 않다.

**수정 방안** — 프래그먼트·쿼리를 떼고 자기 오리진만 조립한다.
```js
function openExternalBrowser(){
  var ua=navigator.userAgent||'';
  var url=location.origin+location.pathname;      // 해시·쿼리 제거 (해시가 인텐트 명세를 오염시킴)
  if(/Android/i.test(ua)){
    var intentUrl='intent://'+url.replace(/^https?:\/\//,'')
      +'#Intent;scheme=https;package=com.android.chrome;action=android.intent.action.VIEW;end';
    location.href=intentUrl;
    setTimeout(function(){location.href=url;},1500);
  } else { /* 기존 복사 분기 */ }
}
```
(쿼리 `?kw=`를 유지하고 싶다면 `location.search`를 붙이되 `encodeURI()`로 감싸고 `#`·`;`를 제거할 것.)

---

### M-2. `kw` 파라미터의 자유 텍스트가 화면 제목과 카카오 공유문구에 그대로 반영됨 (콘텐츠 스푸핑)

**위치**
- `index.html:2227-2237` → `analyzeDream()` 폴백 `index.html:1756` (`keyword:String(text).slice(0,40)`) → 출력 `index.html:1862` (`haemongKeyword.textContent`)
- `saju-ui.js:23-28` `dreamContext()` → 렌더 `saju-ui.js:177` (esc 적용) / 공유문구 `saju-ui.js:234-236` (**esc 미적용, HTML이 아니므로 XSS는 아님**)

**무엇이 문제인가**
`kw`는 화이트리스트가 아니라 **길이 제한(40자)만** 걸려 있다. `cat`·`s`·`dream`은 제대로 화이트리스트를 통과하지만 `kw`만 자유 문자열이다. 출력은 `textContent`와 `esc()`를 거치므로 **스크립트 실행은 불가능**하다. 남는 것은 텍스트 주입이다.

**실제로 어떤 공격이 가능한가**
- `https://suksuki.com/?kw=당첨금+수령+문의+010-0000-0000&cat=money` → 정품 도메인 `suksuki.com` 화면의 해몽 결과 제목 자리에 공격자 문구가 **길몽 등급·조언과 함께** 출력된다. 운세 맥락이라 이용자의 경계심이 낮고, HTTPS + 익숙한 도메인이라 신뢰도가 실린다.
- `https://suksuki.com/saju.html?cat=money&kw=<문구>` → "어젯밤 **<문구>**을 꾸셨네요" 로 렌더되고, 이용자가 카카오 공유 버튼을 누르면 **공격자 문구가 그대로 담긴 메시지**가 지인에게 퍼진다(`saju-ui.js:235`). 즉 정상 이용자를 통해 스팸이 확산된다.
- 링크·스크립트는 넣을 수 없으므로 피해는 텍스트 사기 문구 수준으로 제한된다.

**수정 방안** — `kw`도 `cat`·`s`처럼 **알려진 값만** 받는다.
```js
// index.html:2227 부근
var kw=(p.get('kw')||'').trim();
// 사이트가 아는 키워드가 아니면 슬러그/카테고리에서 역산, 그래도 없으면 폐기
var known = Object.keys(SLUG_MAP).some(function(s){ return SLUG_MAP[s].k===kw; });
if(!known) kw = (SLUG_MAP[slug] && SLUG_MAP[slug].k) || '';
if(!kw) return;
```
```js
// saju-ui.js:25 부근 — DREAM_INDEX에 실존하는 꿈 이름만 허용
var kw=(p.get('kw')||'').trim().slice(0,40);
var IDX=window.DREAM_INDEX||[];
if(kw && !IDX.some(function(x){return x.k===kw;})) kw='';
```

---

### M-3. 보안 헤더 전무 — 특히 프레이밍 차단이 없어 **광고 무효 트래픽**에 노출

**위치** `vercel.json` — `redirects` 키만 존재, `headers` 없음.

**무엇이 문제인가**
로그인·세션이 없는 정적 사이트라 전통적 클릭재킹(권한 있는 버튼 강제 클릭)의 피해는 없다. **그러나 AdSense 승인을 앞둔 사이트에서 프레이밍은 다른 의미를 갖는다.**

**실제로 어떤 공격이 가능한가**
- 제3자가 자기 트래픽 어뷰징 사이트에서 `<iframe src="https://suksuki.com/dream-snake.html">`로 이 페이지를 숨겨 띄운다 → 페이지 안의 AdSense 광고가 **당신의 pub ID로** 노출·클릭된다.
- 구글은 이를 무효 트래픽(Invalid Traffic)으로 판정하고, 책임은 **광고 게재자(= 운영자)** 에게 묻는다. 결과는 수익 차감 또는 **AdSense 계정 정지**. 과거 "저가치 콘텐츠" 반려 이력이 있는 상태에서 이 리스크는 결코 작지 않다.
- 그 외: `nosniff` 부재로 `dreams-db.js`·`saju-*.js`가 잘못된 MIME으로 서빙될 때 브라우저가 타입을 추측하는 경로가 남는다(Vercel은 정적 확장자 MIME을 정확히 붙이므로 실제 위험은 낮음, 방어심층 차원).

**수정 방안** — `vercel.json` 최상위에 `headers` 추가. **정적 사이트에 실제로 값을 하는 4개만** 권고한다.
```json
{
  "headers": [
    {
      "source": "/(.*)",
      "headers": [
        { "key": "Content-Security-Policy", "value": "frame-ancestors 'self'" },
        { "key": "X-Content-Type-Options",  "value": "nosniff" },
        { "key": "Referrer-Policy",         "value": "strict-origin-when-cross-origin" },
        { "key": "Permissions-Policy",      "value": "geolocation=(), microphone=(), camera=(), payment=(), interest-cohort=()" }
      ]
    }
  ],
  "redirects": [ … 기존 그대로 … ]
}
```

**일부러 권고하지 않는 것 (과잉 방지)**
- **전면 CSP(`script-src` 등): 권고하지 않음.** 142개 페이지 전부가 인라인 `<script>`와 인라인 `onclick`을 쓰고, AdSense는 실행 중 임의 도메인으로 스크립트를 확장한다. `'unsafe-inline'`을 넣은 CSP는 보안 이득이 거의 없으면서 광고 깨짐 위험만 만든다. 11ty 이관(W2-1) 때 인라인을 정리한 뒤 재검토할 사안이다.
- **HSTS: 불필요.** Vercel이 커스텀 도메인에 기본 적용한다.
- **X-Frame-Options: 불필요.** 위 `frame-ancestors`가 상위 호환이며 최신 브라우저는 CSP를 우선한다.
- **X-XSS-Protection: 불필요.** 모든 최신 브라우저에서 제거된 헤더다.

---

### M-4. 발행 파이프라인이 `queue.json`을 "데이터"가 아니라 "코드"로 취급 — 미래의 XSS 통로

**위치**
- `scripts/publish-queue.mjs:31-40` — `s.h2`, `s.html`, `entry.title`, `entry.description`, `entry.kw` 를 **무이스케이프**로 템플릿에 치환
- `scripts/page-template.html:134-135, 143-144` — `<title>{{TITLE}}</title>`, `<meta ... content="{{DESCRIPTION}}">`
- 2차 경로: `scripts/build-dreams-db.py:16` — `txt=lambda x: re.sub(...H.unescape(re.sub(r'<[^>]+>',' ',x))...)` → `index.html:1865` `haemongAdvice.innerHTML = r.advice`

**무엇이 문제인가**
1. `{{DESCRIPTION}}`은 큰따옴표 속성값 안에 들어간다. 초안에 `"` 하나만 있어도 속성을 탈출한다. `{{TITLE}}`은 `</title>`로 탈출된다. 슬러그(`publish-queue.mjs:17`)와 카테고리(`:19`)는 검증하지만 **본문·제목·설명은 검증이 전혀 없다**(길이 체크만 있음).
2. `build-dreams-db.py`의 `txt()`는 태그를 지운 **뒤에 `H.unescape()`로 엔티티를 되살린다.** 페이지 본문에 `&lt;img src=x onerror=...&gt;` 가 있으면 `dreams-db.js`에는 **진짜 태그 문자열**로 저장되고, 그것이 `index.html:1865`의 `innerHTML`로 들어간다.
3. **현재 상태는 깨끗하다.** `dreams-db.js`·`saju-dreams.js` 전체에 `<` 문자가 0개임을 확인했다. 지금 터진 문제가 아니라 **구조가 남긴 문**이다.

**실제로 어떤 공격이 가능한가**
초안은 LLM이 작성해 `content-queue/queue.json`에 쌓이고, `approved:true`만 되면 **월·수·금 04:10에 무인으로 배포**된다. 초안 생성 과정에 외부 텍스트(경쟁 사이트 참고, 검색 결과 등)가 섞이는 순간, 프롬프트 인젝션이나 단순 실수로 들어간 마크업이 그대로 라이브 페이지가 된다. 사람 검수는 "글이 말이 되는가"를 보지 "`description`에 따옴표가 있는가"를 보지 않는다. 그 페이지에서 실행되는 스크립트는 방문자의 `dct_birth_v1`(생년월일)을 읽어 외부로 보낼 수 있고, AdSense 계정 정지 사유가 된다.

**수정 방안**
```js
// scripts/publish-queue.mjs — 속성/텍스트 바인딩 필드는 이스케이프
const esc = s => String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;')
                          .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
const rep = { SITE, SLUG:entry.slug,
  KW:esc(entry.kw), KW_ENC:encodeURIComponent(entry.kw), CAT:entry.cat,
  EMOJI:esc(entry.emoji), TITLE:esc(entry.title), DESCRIPTION:esc(entry.description),
  H1:esc(entry.h1), HERO_SUB:esc(entry.hero_sub), HERO_BADGE:esc(entry.hero_badge),
  SECTIONS:sectionsHtml, RELATED:relatedHtml };   // SECTIONS만 의도적 HTML
```
```js
// 본문 HTML은 허용 태그 화이트리스트로 게이트 (발행 중단시키는 편이 안전)
const BAD = /<\s*(script|iframe|object|embed|link|style|meta|svg|form)\b|\son[a-z]+\s*=|javascript:/i;
for (const s of entry.sections) if (BAD.test(s.html||'') || BAD.test(s.h2||'')) err('본문에 허용되지 않은 태그/속성: '+entry.slug);
```
```python
# scripts/build-dreams-db.py:16 — 언이스케이프 후 남은 꺾쇠는 다시 무해화
txt=lambda x: re.sub(r'\s+',' ',H.unescape(re.sub(r'<[^>]+>',' ',x))).strip().replace('<','＜').replace('>','＞')
```
```js
// index.html:1863,1865 — innerHTML을 쓸 이유가 없다. 고정 라벨 + textContent로 분리
document.getElementById('haemongLuck').textContent = r.luck;      // '⭐⭐⭐ 중길몽' — 태그 불필요
var adv = document.getElementById('haemongAdvice');
adv.textContent = '';
var b=document.createElement('strong'); b.textContent='오늘의 조언: ';
adv.appendChild(b);
adv.appendChild(document.createTextNode(String(r.advice).replace(/<[^>]*>/g,'')));
```
(위 마지막 항목은 `dreamDB`/`CAT_FALLBACK`의 `advice`가 `<strong>…</strong>` 접두어를 품고 있으므로, 데이터에서 접두어를 떼고 코드가 붙이는 형태로 함께 정리해야 한다. `verify-publish.mjs`에 "본문에 `<script`/`on*=` 없음" 검사를 추가하면 자동 방어선이 하나 더 생긴다.)

---

### M-5. `weekly-email-report.yml` 에 `permissions` 미지정

**위치** `.github/workflows/weekly-email-report.yml:8-11` (잡 정의에 `permissions:` 블록 없음)

**무엇이 문제인가**
`publish-new-dreams.yml`은 `permissions: contents: write`를 명시했지만(적절), 이메일 워크플로는 아무것도 명시하지 않아 저장소 기본값을 상속한다. 기본값이 "read and write"면 **커밋할 이유가 전혀 없는 잡**이 저장소 쓰기 권한의 `GITHUB_TOKEN`을 들고 서드파티 액션(H-2)을 실행하게 된다. H-2가 현실화되면 비밀 유출에 더해 **저장소 코드 변조 → 라이브 사이트에 악성 스크립트 배포**까지 한 번에 가능해진다.

**수정 방안**
```yaml
jobs:
  report:
    runs-on: ubuntu-latest
    permissions:
      contents: read
```
아울러 Settings → Actions → General → *Workflow permissions* 를 "Read repository contents"로 낮추고, 쓰기가 필요한 워크플로에서만 명시적으로 올리는 방식을 권장한다.

---

### M-6. 카카오 JavaScript 키 — 노출 자체는 정상, 그러나 방어선이 도메인 등록 하나뿐

**위치** `index.html:2180`, `saju-ui.js:281`, `dream-*.html` 142개 (`Kakao.init('46d3fff922c9ecbd41f4131001e7647f')`)

**평가: 노출은 설계상 정상이다.** 카카오 JavaScript 키는 브라우저에서 실행되도록 만들어진 공개 식별자로, REST API 키·Admin 키와 성격이 다르다. 숨길 방법도 없고 숨길 필요도 없다. 이 키만으로는 사용자 정보 조회나 메시지 무단 발송이 불가능하다(공유는 사용자의 명시적 클릭과 카카오 UI 확인을 거친다).

**따라서 실제 방어선은 카카오 개발자 콘솔의 "플랫폼 > Web > 사이트 도메인" 등록 하나뿐이다.** 여기가 느슨하면:
- 제3자가 자기 사이트에 이 키로 SDK를 초기화해 **당신의 앱 이름으로** 공유 메시지를 뿌린다. 스팸 신고가 누적되면 카카오가 **앱 자체를 제재**하고, 그 순간 142개 페이지의 카카오 공유가 전부 죽는다.
- 앱 단위 공유 쿼터를 남이 소진시킬 수 있다.

**확인·조치 (코드 수정 아님, 콘솔 작업)**
1. 카카오 개발자 콘솔 → 내 애플리케이션 → 플랫폼 → Web → **사이트 도메인에 `https://suksuki.com` 만 남긴다.**
2. `https://dreams-come-true-ten.vercel.app` 이 아직 등록돼 있으면 **삭제**한다. 해당 도메인은 이미 308 리다이렉트라 SDK가 실행될 일이 없다(`vercel.json:288-309`).
3. 로컬 개발용 `http://localhost:*` 가 등록돼 있으면 함께 정리한다.
4. 카카오 로그인 등 **쓰지 않는 제품은 모두 비활성화**한다. 이 사이트는 `Kakao.Share`만 쓴다.

**함께 평가한 다른 노출 식별자**
- **AdSense pub ID (`ca-pub-2084458267795230`)**: 공개가 정상이며 `ads.txt`로 오히려 공개 선언하는 값이다(`ads.txt` 내용도 pub ID와 일치함을 확인). 위험은 유출이 아니라 **타인이 스팸 사이트에 이 ID를 심어 당신 계정을 오염시키는 것**인데, `ads.txt`가 이미 그 방어 수단이다. 추가 조치 불필요. (다만 M-3의 프레이밍 차단이 같은 위험군을 하나 더 막아준다.)
- **GA4 측정 ID (`G-MCNS7P3XVT`)**: 공개가 정상. 위험은 **제3자의 가짜 이벤트 주입으로 인한 데이터 오염**이다. 이 사이트는 GA4 숫자로 전략을 판정하므로(OPERATIONS.md §2-A) 실질 영향이 있다. 완전 차단은 불가능하니, 특정 이벤트가 설명 불가하게 급증하면 GA4에서 호스트 이름(`page_location`)으로 필터링해 자사 도메인 외 트래픽을 걸러낼 것.

---

## [정보]

### I-1. XSS 점검 결과 — 지시받은 경로별 판정
| 점검 대상 | 판정 | 근거 |
|---|---|---|
| `?kw=` | 안전(단 M-2) | `index.html:2237` `input.value=kw` 대입만 · `index.html:1862` `textContent` |
| `?cat=` | **안전** | `index.html:2231` `CAT_FALLBACK.hasOwnProperty(cat)` 화이트리스트, 불일치 시 `'change'` |
| `?s=` / `?dream=` | **안전** | `index.html:2234` `/^[a-z0-9-]{1,60}$/` · `index.html:2228` `SLUG_MAP` 조회 |
| `handleSearch` | **안전** | `index.html:1386-1398` — 입력은 `filter` 조건으로만 쓰이고, `innerHTML`에 들어가는 값은 정적 `searchIndex` |
| `goSearch` | **안전** | `index.html:1405-1408` — `input.value` 대입 후 `handleSearch` 위임 |
| `shuffleRandom` | **안전** | `index.html:1251-1262` — 소스가 정적 `randomPool` 배열 |
| `guide.html` 사전 검색 | **안전** | `guide.html:341` — 페이지 자신의 정적 DOM을 재출력 |
| dream 페이지 GA4 클릭 스니펫 | **안전** | `page-template.html:194-200` — `location.pathname`(쿼리 미포함) · `getAttribute('href')`(정적 링크) |
| `dreams-db.js` / `saju-dreams.js` → `innerHTML` | 현재 안전(M-4) | 두 파일 전체에 `<` 문자 0개 확인 |
| `saju-ui.js` `esc()` 커버리지 | **누락 없음** | 사용자 유래 값이 지나는 `:171, 177, 178, 179, 184~186, 189~193, 198, 201, 203, 207~209, 275` 전부 적용 |

### I-2. `saju-ui.js:49` — 빌드 생성물이 속성값에 무이스케이프로 들어감
```js
return '<button type="button" class="chip" data-s="' + x.s + '" …>' + x.e + ' ' + esc(x.k) + '</button>';
```
`x.k`는 `esc()`를 거치지만 `x.s`(슬러그)와 `x.e`(이모지)는 아니다. 현재 소스인 `saju-dreams.js`는 `build-dream-index.py` 생성물이고 슬러그는 `[a-z0-9-]`만 담고 있어 실제 위험은 없다. 다만 M-4와 같은 종류의 "생성물을 신뢰하는" 코드이므로 `esc(x.s)`, `esc(x.e)`로 맞춰두는 편이 일관적이다.

### I-3. `DREAM_DETAILS[window._slug]` 프로토타입 속성 조회
`index.html:1741` — `?s=constructor` 는 슬러그 정규식을 통과하고 `window.DREAM_DETAILS['constructor']`는 truthy다. 결과는 `keyword: undefined` 등 깨진 화면일 뿐 스크립트 실행은 없다(전부 `textContent`/정적 문자열). 보안 문제는 아니나 다음처럼 막아두면 깔끔하다.
```js
if (window._slug && window.DREAM_DETAILS &&
    Object.prototype.hasOwnProperty.call(window.DREAM_DETAILS, window._slug)) { … }
```

### I-4. 오픈 리다이렉트 — **없음** (57개 규칙 전수 확인)
`vercel.json:2-287`의 55개 규칙은 destination이 전부 `/dream-*.html` 하드코딩이다. 동적 규칙은 `vercel.json:299-309` 하나뿐인데 `has.host === 'dreams-come-true-ten.vercel.app'` 조건 아래 `https://suksuki.com/:path*`로, **목적지 스킴·호스트가 고정**이라 경로만 옮겨진다. `//evil.com/x` 같은 경로를 넣어도 결과는 `https://suksuki.com//evil.com/x`로 자사 도메인을 벗어나지 못한다.
`location.href`·`window.open`·동적 `<a href>` 도 전수 확인했다 — M-1의 intent URL을 제외하면 모두 상수 문자열(`'https://suksuki.com'`, `'index.html'`, `location.origin + '/saju.html'`)이다.

### I-5. 서드파티 스크립트 로드 방식 — 대체로 양호
| 스크립트 | SRI | 로드 | 평가 |
|---|---|---|---|
| Kakao SDK 2.7.2 | **있음** (`sha384-TiCUE…`, `crossorigin="anonymous"`) — 145개 파일 전부 | 동기 | 우수. 이 규모 사이트에서 보기 드문 수준 |
| GA4 `gtag/js` | 없음 | `async` | **SRI 불가·정상.** 구글이 내용을 수시로 바꾸는 로더라 해시를 걸 수 없다 |
| AdSense `adsbygoogle.js` | 없음 | `async`, `crossorigin` | 위와 동일. `index.html:15`, `guide.html:24` 2곳뿐 |
| Google Fonts | 해당 없음 | `<link rel=stylesheet>` | CSS라 스크립트 실행 없음 |

**침해 시 가능한 일(공급망 리스크 정리)**: GA4나 AdSense 로더가 침해되면 142개 전 페이지에서 임의 JS가 실행되어 `dct_birth_v1`(생년월일) 탈취·해몽 입력 가로채기·전 페이지 리다이렉트가 가능하다. **현실적으로 이를 막을 수단은 없다**(SRI 적용 불가, CSP도 구글 도메인은 허용해야 함). 구글 CDN 침해는 인터넷 전체의 사건이 되는 급이므로 수용 가능한 잔여 위험으로 판단한다. 반대로 Kakao SDK는 SRI가 걸려 있어 CDN이 침해돼도 스크립트가 아예 실행되지 않는다 — 이미 옳게 처리돼 있다.

### I-6. 민감정보 흐름 — 코드로 확인한 사실
- **네트워크 송신 코드 0건**: `fetch(` / `XMLHttpRequest` / `sendBeacon` / `new Image(` 를 `*.js`·`*.html` 전수 검색한 결과 **일치 0건**. 동적 스크립트 삽입은 `index.html:2241-2242`의 `sc.src='dreams-db.js'`(상대 경로 상수) 하나뿐.
- **`<form>` 태그 0건** — GET 폼으로 생년월일이 URL에 실릴 경로 자체가 없다.
- **생년월일 처리 전 구간**: 입력(`saju.html:205-207` `<select>`) → 계산(`saju-bundle.js`, 순수 함수) → 저장(`saju-ui.js:136` `localStorage`) → 표시(`saju-ui.js:275` `esc()`). **어느 지점에서도 외부로 나가지 않는다.**
- **GA4 이벤트 파라미터 전수 확인**: `saju_submit{unknownHour, cal}`, `saju_view{hasDream, flow}`, `saju_open{hasDream}`, `saju_revisit{}`, `saju_dream_picked{slug, cat}`, `share_click{method, page}`, `cta_lucky_click{page}`, `related_click{page, to}`, `memimo_click{dream:document.title}`, `page_404{page}`, `detail_used{slug}`, `fallback_used{cat}`. **생년월일·시간·음력 여부 값이 실린 이벤트는 없다.** → OPERATIONS.md §4-A ④의 "서버 미저장" 주장은 **사주에 한해 사실이며 코드로 뒷받침된다.** (꿈 입력은 H-1 참조.)
- **`dct_birth_v1` 민감도**: 생년월일 + 태어난 시간대는 그 자체로 준식별자다. 다만 저장 위치가 방문자 본인 기기의 localStorage이고 오리진(`suksuki.com`)에 격리되므로, 이 값을 읽으려면 **먼저 이 도메인에서 XSS가 성립해야 한다.** 즉 M-4·M-2를 닫는 것이 곧 이 데이터를 지키는 일이다. 추가로 `saju-ui.js`에 "저장 정보 삭제" 버튼(`localStorage.removeItem(KEY)`)을 두면 방침 §이용자 권리 조항을 코드로 이행하게 되어, 심사·신뢰 양쪽에 도움이 된다.

### I-7. 사소한 항목
- `privacy.html:159-161` — 외부 링크 3개가 `target="_blank"` 에 `rel="noopener"` 없음. 최신 브라우저는 `noopener`를 암묵 적용하므로 실피해 없음. 링크 대상이 구글이라 더더욱. 일관성 차원에서만 추가 권장.
- `.github/workflows/publish-new-dreams.yml:26` — `git add -A`. WORKLOG에 기록된 "AdFit 부활 사고"의 원인과 같은 명령이지만, CI는 매번 깨끗한 checkout에서 시작하므로 발행 스크립트가 만든 파일만 담긴다. `verify-publish.mjs`가 AdFit·구도메인 잔존을 검사하는 이중 방어도 있다. **현 상태 유지로 무방.** 굳이 좁힌다면 변경 대상 파일을 열거하는 방식이 있다.
- `actions/checkout@v4`, `actions/setup-node@v4` — 가변 태그지만 GitHub 공식 액션이라 H-2와 같은 급의 위험은 아니다. 보안 수준을 더 올리고 싶다면 SHA 고정을 함께 적용할 수 있다.
- `robots.txt` / `ads.txt` — 내용 정상. `ads.txt`의 pub ID가 페이지의 `ca-pub-2084458267795230`과 일치함을 확인.
- 저장소에 커밋된 비밀 없음 — `git ls-files` 로 확인한 결과 `ga4/`, `report.html`(GA4 실측 데이터 포함)은 `.gitignore` 처리되어 **추적되지 않고 있으며**, 개인키·`.env` 류도 트리 전체에 없음. 공개 저장소 운영과 부합한다.

---

## 조치 우선순위 (권고)

1. **H-1** — 오늘 처리 가능. `index.html` 3줄 수정 + `privacy.html` 문구 정정. AdSense 심사 전에 끝내는 것이 좋다(심사관이 개인정보처리방침과 실제 계측을 대조하는 사례가 있다).
2. **H-2 / M-5** — 워크플로 2줄+SHA 1개. 다음 월요일 09:30 실행 전에.
3. **M-3** — `vercel.json`에 `headers` 블록 추가. AdSense 신청 전 배포 권장.
4. **M-1, M-2** — 다음 배포 묶음에.
5. **M-4** — 초안 8편 검수·발행 재개 전에. `verify-publish.mjs`에 태그 검사 1줄을 추가하면 이후로는 자동으로 막힌다.
6. **M-6** — 코드 변경 없음. 카카오 콘솔에서 도메인 목록 확인 5분.

> 모든 항목은 **분석·권고**이며 코드는 전혀 수정하지 않았다. 배포는 OPERATIONS.md §5에 따라 운영자 컨펌 후 진행한다.
