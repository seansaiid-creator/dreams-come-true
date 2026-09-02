# 신규 꿈풀이 검수 큐

## 운영 흐름 (무검수 게시 금지 원칙)
1. **주제 선정**: GA4 `dream_search` 이벤트에서 `result_count=0` 검색어를 월 1회 추출 → 수요 있는 주제만
2. **초안 생성**: `DRAFT_PROMPT.md`의 프롬프트로 Claude/Gemini에게 초안 생성 (JSON 형식 그대로 출력됨)
3. **검수**: 운영자가 내용을 직접 읽고 수정 → 통과 시 `"approved": true`로 변경
4. **자동 발행**: GitHub Actions가 월·수·금 KST 04:10에 approved 항목을 1건씩 발행
   (페이지 생성 + sitemap + guide 사전 + 오늘의 꿈 풀 등재까지 자동)

## 품질 게이트 (발행기가 강제)
- 섹션 5개 이상, 본문 합계 4,000자 이상 (thin content 방지)
- slug 중복·형식, cat 8종 화이트리스트, related 실존 여부 검사
- `approved: true`가 아닌 항목은 절대 발행되지 않음

## 항목 형식
```json
{
  "slug": "washing-machine-overflow",
  "kw": "세탁기 물이 넘치는 꿈",
  "cat": "blocked",
  "emoji": "🫧",
  "title": "세탁기 물이 넘치는 꿈 해몽 총정리 (+감정, 정리, 재물 의미)",
  "description": "세탁기 물이 넘치는 꿈의 의미를 상황별로 풀이합니다. ...",
  "h1": "세탁기 물이 넘치는 꿈 해몽",
  "hero_sub": "한 줄 요약 문장",
  "hero_badge": "감정 · 정리 · 점검 해석",
  "sections": [
    { "h2": "세탁기 물이 넘치는 꿈의 기본 의미", "html": "<p>...</p><p>...</p>" },
    { "h2": "상황별 해석", "html": "<h3>1. ...</h3><p>...</p>" },
    { "h2": "재물운 관점에서 보는 해석", "html": "<p>...</p>" },
    { "h2": "심리학적 해석", "html": "<p>...</p>" },
    { "h2": "이 꿈을 꿨다면", "html": "<p>...</p>" }
  ],
  "related": ["water", "drowning", "fridge-food-spoiled"],
  "approved": false
}
```
