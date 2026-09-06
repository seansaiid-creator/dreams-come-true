#!/usr/bin/env python3
"""색·효과만 교체한다. 레이아웃도, 측정 중인 요소도 건드리지 않는다.

── 왜 이렇게 좁은가 (2026-09-06 운영자 지시)
   "adsense승인, 이용자 진입, 리텐션 등 데이터에 영향을 줄 수 있는 것은 진행하지 마."

   그래서 두 겹으로 막는다.
   ① 레이아웃 불변 — 색·배경·그림자 값만 바꾼다. 페이지 높이가 안 변하므로
      dream 143페이지의 scroll_25/50/75 기준선이 오염되지 않는다. (실측: 8048px → 8048px)
   ② 측정 요소 불변 — 클릭 이벤트가 붙은 요소는 색이 바뀌면 클릭률이 흔들린다.
      해당 선택자를 전부 제외하고, 제외됐는지 바이트로 검증한다.

── 제외 대상 (dream 페이지 JS의 이벤트 매처에서 그대로 옮김)
   cta_lucky_click   .service-btn / .eng-cta-btn
   related_click     .related-links a / .eng-related-item
   saju_entry_click  .saju-cta-b
   share_click       .eng-share-btn
   memimo_click      인라인 style — <style> 밖이라 자동 제외
   회유 링크(미추적이지만 pages/session에 영향): .mid-related / .eng-card

   → 이 요소들의 재색은 3단계(회유 동선 재배치)에서 함께 한다.

── 이번 회차에 바꾸는 것
   페이지 전체 발광(radial-gradient wash), 제목의 금색+글로우, 섹션 h2 금색,
   배지 금 틴트, 활성 탭 금색, 카드 면·경계선, 바탕·본문 글자색.
   = "점집·복권"으로 읽히게 만드는 부분. 버튼과 링크는 그대로 둔다.

금지: padding·margin·border-width·font-size·display·radius — 높이를 바꾼다.
사용: python3 scripts/restyle-colors.py <파일...> [--apply]
"""
import re, sys, collections

# 제외 선택자 — 이 규칙 본문은 한 글자도 바뀌면 안 된다
FROZEN = [
    '.service-btn', '.eng-cta-btn', '.eng-cta-box', '.eng-cta-title', '.eng-cta-desc',
    '.related-links a', '.eng-related-item', '.eng-related-name', '.eng-related-arrow',
    '.eng-related-meta', '.eng-share', '.eng-share-btn', '.eng-share-title',
    '.saju-cta', '.saju-cta-t', '.saju-cta-d', '.saju-cta-b', '.saju-cta-n',
    '.mid-related', '.mid-related-t', '.mid-related a', '.eng-card',
]

# (옛 문자열, 새 문자열). 위 선택자의 본문에 등장하지 않는 것만 골랐다.
RULES = [
    # ── 바탕·글자 (버튼/링크는 자기 색을 하드코딩하고 있어 영향 없음)
    ("--deep:#0D0A1A",  "--deep:#0A0812"),
    ("--text:#F0EAD6",  "--text:#EDE9F7"),
    ("--text-muted:#A09080", "--text-muted:#8F87A8"),
    # --card는 .section, --border는 .nav/.section 만 참조한다 (제외 요소는 자체 값 사용)
    ("--card:rgba(255,255,255,0.04)",  "--card:#120E1E"),
    ("--border:rgba(201,168,76,0.15)", "--border:#2A2142"),
    ("background:rgba(13,10,26,0.92)", "background:rgba(10,8,18,0.92)"),   # .nav

    # ── 페이지 전체에 깔린 보라·금 발광 — "점집" 인상의 최대 원인
    ("background:radial-gradient(ellipse at 20% 20%, rgba(107,63,160,0.15) 0%, transparent 50%),"
     "radial-gradient(ellipse at 80% 80%, rgba(201,168,76,0.08) 0%, transparent 50%);",
     "background:none;"),

    # ── 제목의 금색 + 글로우
    ("color:var(--gold);line-height:1.4;margin-bottom:12px;text-shadow:0 0 30px rgba(201,168,76,0.4);",
     "color:var(--text);line-height:1.4;margin-bottom:12px;"),                      # .hero h1
    ("font-size:18px;color:var(--gold-light);", "font-size:18px;color:var(--text);"),  # .section h2
    ("color: #C9A84C;", "color: var(--text);"),                                      # .eng-h3

    # ── 배지·활성 탭의 금 틴트
    (".nav-link.active{color:var(--gold);background:rgba(201,168,76,0.1);}",
     ".nav-link.active{color:var(--text);background:rgba(255,255,255,0.06);}"),
    ("background:rgba(201,168,76,0.15);border:1px solid rgba(201,168,76,0.3);",
     "background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.10);"),  # .hero-badge 면
    ("font-size:13px;color:var(--gold-light);margin-top:16px;",
     "font-size:13px;color:var(--text-muted);margin-top:16px;"),                     # .hero-badge 글자

    # ── 빈 광고 자리 표시 상자 (클릭 없음)
    ("background: rgba(201,168,76,0.05);",        "background: rgba(255,255,255,0.03);"),
    ("border: 1px dashed rgba(201,168,76,0.25);", "border: 1px dashed rgba(255,255,255,0.12);"),
]

STYLE = re.compile(r'<style[^>]*>.*?</style>', re.S)
LAYOUT_PROPS = ('padding', 'margin', 'font-size', 'display', 'border-width', 'border-radius',
                'line-height', 'width', 'height', 'gap', 'position')


def rule_bodies(css, selector):
    """해당 선택자로 시작하는 규칙 본문들을 모은다."""
    out = []
    for m in re.finditer(r'([^{}]+)\{([^}]*)\}', css):
        sels = [s.strip() for s in m.group(1).split(',')]
        if selector in sels:
            out.append(m.group(2))
    return out


def restyle(src):
    hits = collections.Counter()

    def fix(m):
        css = m.group(0)
        for old, new in RULES:
            n = css.count(old)
            if n:
                hits[old] += n
                css = css.replace(old, new)
        return css

    return STYLE.sub(fix, src), hits


def main():
    paths = [a for a in sys.argv[1:] if not a.startswith('--')]
    apply_ = '--apply' in sys.argv
    total, problems = collections.Counter(), []

    for path in paths:
        src = open(path, encoding='utf-8').read()
        out, hits = restyle(src)
        total.update(hits)

        # ① <style> 밖 바이트 동일 — 본문·DOM·JS 무변경
        if STYLE.sub('', src) != STYLE.sub('', out):
            problems.append(f"{path}: <style> 밖이 변경됨")

        # ② 레이아웃 속성 개수 동일 — 높이 불변
        for prop in LAYOUT_PROPS:
            if len(re.findall(rf'\b{prop}\s*:', src)) != len(re.findall(rf'\b{prop}\s*:', out)):
                problems.append(f"{path}: {prop} 개수 변동")

        # ③ 측정 중인 요소의 규칙 본문 동일 — 클릭률 불변
        a = '\n'.join(STYLE.findall(src))
        b = '\n'.join(STYLE.findall(out))
        for sel in FROZEN:
            if rule_bodies(a, sel) != rule_bodies(b, sel):
                problems.append(f"{path}: 제외 선택자 {sel} 가 변경됨")

        if apply_ and not problems:
            open(path, 'w', encoding='utf-8').write(out)

    print(f"대상 {len(paths)}개 파일 · 치환 {sum(total.values())}건 / 규칙 {len(RULES)}개")
    miss = [o for o, _ in RULES if not total[o]]
    if miss:
        print(f"\n⚠️ 미적용 규칙 {len(miss)}개 (스타일 변종일 수 있음):")
        for o in miss:
            print(f"   {o[:74]}")
    if problems:
        print("\n🔴 검증 실패 — 쓰지 않았다:")
        for p in problems:
            print(f"   {p}")
        sys.exit(1)
    print("\n✅ <style> 밖 동일 · 레이아웃 속성 동일 · 측정 요소 " + str(len(FROZEN)) + "개 동일")
    print("적용됨" if apply_ else "미적용 (--apply 필요)")


if __name__ == '__main__':
    main()
