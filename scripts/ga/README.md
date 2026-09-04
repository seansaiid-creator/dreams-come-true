# GA4 조회 스크립트 (데이터창용)
의존성 0. 키는 `~/.config/dreams-ga4/sa-key.json`(레포 밖). 속성 528679246.
- `ga-rt.mjs` 실시간(처리지연 없음) — 급락 의심 시 1순위
- `ga-today.mjs` 오늘/어제/1주전 시간대별 사용자
- `ga-src2.mjs` 오전 0~12시 유입원 비교
- `ga-trend.mjs` 35일 일별 추이 + 7일 평균
- `ga-fri2.mjs` 같은 요일 0~7시 비교
- `ga-dims.mjs` 맞춤 측정기준 등록 상태 + 인구통계
- `ga-tz.mjs` 시간대 검증(테스트 히트 버킷·시간대별 피크)
- `ga-admin.mjs` Admin API 속성/스트림 설정 — GCP에서 analyticsadmin API 활성화 필요(9/4 기준 비활성)
원칙: 당일 데이터로 판단 금지(docs/DECISIONS.md).
