# 초안 생성 프롬프트 (Claude/Gemini에 붙여넣기)

아래 형식의 JSON 하나만 출력해줘. 한국 전통 해몽과 현대 심리학적 해석을 함께 다루고,
확정적 미래 예언("~된다")이 아니라 "~의 신호일 수 있습니다" 톤으로.
본문 합계 4,500자 이상, 섹션 구성은 기존 페이지와 동일하게:
기본 의미 / 상황별 해석(h3 6~10개) / 재물운 관점 / 연애·인간관계 / 직장·일상 /
심리학적 해석 / 이 꿈을 꿨다면 — 7개 섹션.

주제: "{여기에 꿈 주제}"
slug(영문 kebab-case), kw(한국어 "... 꿈"), cat(animal|nature|money|people|loss|blocked|body|change),
emoji 1개, title(검색 최적화, "... 꿈 해몽 총정리 (+의미 키워드 3개)"), description(120자 내외),
h1, hero_sub(한 문장), hero_badge("A · B · C 해석"),
sections[{h2, html(<p>,<h3>만 사용)}], related(기존 슬러그 배열 — 모르면 빈 배열), approved는 반드시 false.
