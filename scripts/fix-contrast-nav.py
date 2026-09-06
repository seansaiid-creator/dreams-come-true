#!/usr/bin/env python3
"""기존 문제 2건을 고친다. 레이아웃은 건드리지 않는다.

① nav 오타 — 22개 파일이 `.nav-link:active`(누르고 있는 동안만)로 잘못 써서
   현재 페이지 탭이 강조되지 않는다. 의도는 `.nav-link.active`다.
   선택자 이름만 바꾸므로 레이아웃 영향 0.

② memimo 배너 대비 미달 — 흰 카드 위 글자·버튼이 WCAG AA에 못 미친다.
   AdSense 접근성 항목에 걸릴 수 있다. 색을 **색상(hue)은 유지한 채 최소한만 어둡게** 해서
   기준을 넘긴다. 원래 인상에서 가장 덜 벗어나는 방법이다.

두 수정 모두 길이가 같은 문자열로 치환한다 → 파일 바이트 수가 변하지 않는다.
그래서 "의도한 곳 말고는 아무것도 안 바뀌었다"를 바이트로 증명할 수 있다.

사용: python3 scripts/fix-contrast-nav.py [--apply]
"""
import re, sys, glob

WHITE = '#FFFFFF'


def lum(h):
    h = h.lstrip('#')
    c = [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    c = [v / 12.92 if v <= .03928 else ((v + .055) / 1.055) ** 2.4 for v in c]
    return .2126 * c[0] + .7152 * c[1] + .0722 * c[2]


def ratio(a, b):
    l1, l2 = lum(a), lum(b)
    return (max(l1, l2) + .05) / (min(l1, l2) + .05)


def darken_until(hexc, other, need):
    """색상은 유지한 채 최소한만 어둡게 해서 대비 기준을 넘긴다."""
    r, g, b = [int(hexc.lstrip('#')[i:i + 2], 16) for i in (0, 2, 4)]
    for step in range(0, 101):
        k = 1 - step / 100
        cand = '#%02X%02X%02X' % (round(r * k), round(g * k), round(b * k))
        if ratio(cand, other) >= need:
            return cand, ratio(cand, other)
    return hexc, ratio(hexc, other)


# (설명, 옛 문자열, 대비 상대색, 필요 비율, 색만 추출하는 위치)
TARGETS = [
    ('memimo 캡션 (11px)',      'color:#9CA3AF',      WHITE, 4.5),
    ('memimo 버튼 배경 (흰 글자)', 'background:#6366F1', WHITE, 4.5),
]


def main():
    apply_ = '--apply' in sys.argv
    files = sorted(glob.glob('dream-*.html'))

    # ── 치환표를 먼저 계산해 보여준다
    subs = []
    print("② memimo 대비 — 색상 유지, 최소 보정")
    for label, old, other, need in TARGETS:
        oldhex = '#' + old.split('#')[1]
        new, r = darken_until(oldhex, other, need)
        before = ratio(oldhex, other)
        prop = old.split(':')[0]
        subs.append((f'{prop}:{oldhex}', f'{prop}:{new}'))
        print(f"   {label:26} {oldhex} → {new}   대비 {before:.2f} → {r:.2f} (기준 {need})")

    print("\n① nav 오타")
    typo = [f for f in files if '.nav-link:active' in open(f, encoding='utf-8').read()]
    print(f"   .nav-link:active → .nav-link.active   대상 {len(typo)}개 파일")

    changed, problems = 0, []
    LAYOUT = ('padding', 'margin', 'font-size', 'display', 'border-width', 'border-radius',
              'line-height', 'width', 'height', 'gap', 'position', 'font-weight')

    for f in files:
        src = open(f, encoding='utf-8').read()
        out = src.replace('.nav-link:active', '.nav-link.active')
        for old, new in subs:
            out = out.replace(old, new)
        if out == src:
            continue
        changed += 1

        # 검증 ①: 길이 동일 — 같은 길이로만 치환했으므로 다른 게 섞이면 어긋난다
        if len(out) != len(src):
            problems.append(f'{f}: 길이 변동 {len(src)}→{len(out)}')
        # 검증 ②: 레이아웃 속성 개수 동일
        for p in LAYOUT:
            if len(re.findall(rf'\b{p}\s*:', src)) != len(re.findall(rf'\b{p}\s*:', out)):
                problems.append(f'{f}: {p} 개수 변동')
        # 검증 ③: 태그 이름 순서 동일 — DOM 구조가 그대로인지 (속성값은 무시)
        names = lambda s: re.findall(r'<(/?[a-zA-Z][\w-]*)', s)
        if names(src) != names(out):
            problems.append(f'{f}: 태그 구조 변동')
        # 검증 ④: 눈에 보이는 글자 동일 (style/script 안은 화면에 안 보이므로 제외)
        visible = lambda s: re.sub(r'<[^>]*>', '', re.sub(
            r'<(style|script)[^>]*>.*?</\1>', '', s, flags=re.S))
        if visible(src) != visible(out):
            problems.append(f'{f}: 본문 텍스트 변동')

        if apply_ and not problems:
            open(f, 'w', encoding='utf-8').write(out)

    print(f"\n대상 {changed}개 파일")
    if problems:
        print(f"\n🔴 검증 실패 {len(problems)}개 — 쓰지 않았다:")
        for p in problems[:10]:
            print('   ' + p)
        sys.exit(1)
    print("✅ 파일 길이 동일 · 레이아웃 속성 동일 · 태그 구조 동일 · 본문 텍스트 동일")
    print("적용됨" if apply_ else "미적용 (--apply 필요)")


if __name__ == '__main__':
    main()
