#!/usr/bin/env python3
"""색·효과만 교체한다. 레이아웃도, 측정 중인 요소도 건드리지 않는다.

── 왜 이렇게 좁은가 (2026-09-06 운영자 지시)
   "adsense승인, 이용자 진입, 리텐션 등 데이터에 영향을 줄 수 있는 것은 진행하지 마."

   두 겹으로 막는다.
   ① 레이아웃 불변 — 색·배경·그림자 값만 바꾼다. 페이지 높이가 안 변하므로
      dream 143페이지의 scroll_25/50/75 기준선이 오염되지 않는다. (실측 8048px → 8048px)
   ② 측정 요소 불변 — 클릭 이벤트가 붙은 요소는 색이 바뀌면 클릭률이 흔들린다.
      해당 선택자를 제외하고, 제외됐는지 바이트로 검증한다.

── 제외 대상 (dream 페이지 JS의 이벤트 매처에서 그대로 옮김)
   cta_lucky_click  .service-btn/.eng-cta-btn · related_click .related-links a/.eng-related-item
   saju_entry_click .saju-cta-b · share_click .eng-share-btn · memimo_click 인라인(<style> 밖)
   회유 링크(미추적이나 pages/session에 영향): .mid-related · .eng-card
   → 이 요소들의 재색은 3단계(회유 동선 재배치)에서 함께 한다.

── 왜 문자열 치환이 아니라 규칙 파싱인가 (09-06)
   dream 143페이지의 <style>은 19가지 변종이다. 차이는 구조가 아니라 **공백과 값**이었다
   (`--gold: #C9A84C` vs `--gold:#C9A84C`, h2가 17px인 파일과 18px인 파일).
   문자열 매칭으로 돌렸더니 71개 파일에서 핵심 규칙이 하나도 안 먹었다.
   그래서 선택자·속성 단위로 다룬다.

금지: padding·margin·border-width·font-size·display·radius — 높이를 바꾼다.
사용: python3 scripts/restyle-colors.py <파일...> [--apply]
"""
import re, sys, collections

# 측정 중이라 손대지 않는 선택자 (접두사로 판정)
FROZEN_PREFIX = (
    '.service-btn', '.eng-cta', '.eng-related', '.eng-share', '.eng-card',
    '.saju-cta', '.mid-related', '.related-links',
)
KEEP_GOLD = ('.nav-logo',)          # 로고의 금색은 남긴다 (규격서도 허용)

GOLD_TEXT = re.compile(r'^\s*(var\(--gold(?:-light|-dark)?\)|#C9A84C|#F0D080|#C9A084|#8B6914)\s*$', re.I)
GOLD_RGBA = re.compile(r'rgba\(\s*201\s*,\s*168\s*,\s*76\s*,\s*([\d.]+)\s*\)', re.I)
PURPLE_WASH = re.compile(r'radial-gradient\([^;]*rgba\(\s*107\s*,\s*63\s*,\s*160[^;]*', re.I | re.S)
GOLD_GLOW = re.compile(r'rgba\(\s*201\s*,\s*168\s*,\s*76', re.I)

LAYOUT_PROPS = ('padding', 'margin', 'font-size', 'display', 'border-width', 'border-radius',
                'line-height', 'width', 'height', 'gap', 'position', 'inset')

# :root에서 값만 바꿀 변수. 단 제외 선택자가 그 변수를 참조하면 건너뛴다.
VAR_NEW = {'--text': '#EDE9F7', '--text-muted': '#8F87A8',
           '--card': '#120E1E', '--border': '#2A2142'}

RULE = re.compile(r'([^{}]*)\{([^{}]*)\}', re.S)


def selector_of(prelude):
    """@media 등 중첩 prelude에서 실제 선택자만 꺼낸다."""
    return prelude.split('{')[-1].strip()


def frozen(sel):
    parts = [p.strip() for p in sel.split(',')]
    return any(p.startswith(FROZEN_PREFIX) for p in parts)


def transform_decl(sel, prop, val):
    """선언 하나를 바꾼다. None을 돌려주면 그 선언을 지운다."""
    p, v = prop.strip().lower(), val.strip()

    # 제목의 발광 — 선언째로 제거 (페인트 단계라 레이아웃 무관)
    if p == 'text-shadow' and GOLD_GLOW.search(v):
        return None

    # 페이지 전체에 깔린 보라·금 워시
    if p in ('background', 'background-image') and PURPLE_WASH.search(v):
        return 'none'

    # 금색 글자 → 본문색 (로고는 예외)
    if p == 'color' and GOLD_TEXT.match(v) and not any(
            s.strip().startswith(KEEP_GOLD) for s in sel.split(',')):
        return 'var(--text)'

    # 금빛 면 → 중립 (배경)
    if p.startswith('background') and GOLD_RGBA.search(v) and 'gradient' not in v.lower():
        return GOLD_RGBA.sub(lambda m: f'rgba(255,255,255,{min(float(m.group(1)) * 0.4, 0.06):.2f})', v)

    # 금빛 경계선 → 중립 (border-width는 건드리지 않고 색만)
    if p.startswith('border') and GOLD_RGBA.search(v):
        return GOLD_RGBA.sub('rgba(255,255,255,0.10)', v)

    return val


def restyle(src):
    stats = collections.Counter()
    style_blocks = list(re.finditer(r'(<style[^>]*>)(.*?)(</style>)', src, re.S))
    if not style_blocks:
        return src, stats

    # 제외 선택자가 참조하는 변수는 값도 바꾸지 않는다
    referenced = set()
    for b in style_blocks:
        for m in RULE.finditer(b.group(2)):
            if frozen(selector_of(m.group(1))):
                referenced.update(re.findall(r'var\((--[\w-]+)\)', m.group(2)))

    out, last = [], 0
    for b in style_blocks:
        css, pieces, pos = b.group(2), [], 0
        for m in RULE.finditer(css):
            sel, body = selector_of(m.group(1)), m.group(2)
            pieces.append(css[pos:m.start(2)])
            if frozen(sel):
                pieces.append(body)
                stats['제외된 규칙'] += 1
            else:
                decls, new = body.split(';'), []
                for d in decls:
                    if ':' not in d:
                        new.append(d); continue
                    prop, val = d.split(':', 1)
                    if sel == ':root' or sel.endswith(':root'):
                        key = prop.strip()
                        if key in VAR_NEW and key not in referenced:
                            if val.strip() != VAR_NEW[key]:
                                stats[f'변수 {key}'] += 1
                            new.append(f'{prop}:{VAR_NEW[key]}')
                            continue
                        new.append(d); continue
                    r = transform_decl(sel, prop, val)
                    if r is None:
                        stats['글로우 제거'] += 1
                        continue                      # 선언 삭제
                    if r != val:
                        stats[f'{prop.strip()} 교체'] += 1
                        new.append(f'{prop}:{r}')
                    else:
                        new.append(d)
                pieces.append(';'.join(new))
            pos = m.end(2)
        pieces.append(css[pos:])
        out.append(src[last:b.start(2)] + ''.join(pieces))
        last = b.end(2)
    out.append(src[last:])
    return ''.join(out), stats


def rule_bodies(css, prefix):
    return [m.group(2) for m in RULE.finditer(css)
            if any(p.strip().startswith(prefix) for p in selector_of(m.group(1)).split(','))]


def main():
    paths = [a for a in sys.argv[1:] if not a.startswith('--')]
    apply_, verbose = '--apply' in sys.argv, '--verbose' in sys.argv
    total, problems, per_file = collections.Counter(), [], {}
    STYLE = re.compile(r'<style[^>]*>.*?</style>', re.S)

    for path in paths:
        src = open(path, encoding='utf-8').read()
        out, stats = restyle(src)
        total.update(stats)
        per_file[path] = sum(v for k, v in stats.items() if k != '제외된 규칙')
        bad = []

        # ① <style> 밖 바이트 동일 — 본문·DOM·JS 무변경
        if STYLE.sub('', src) != STYLE.sub('', out):
            bad.append('<style> 밖이 변경됨')
        # ② 레이아웃 속성 개수 동일 — 높이 불변
        for prop in LAYOUT_PROPS:
            if len(re.findall(rf'\b{prop}\s*:', src)) != len(re.findall(rf'\b{prop}\s*:', out)):
                bad.append(f'{prop} 개수 변동')
        # ③ 측정 요소의 규칙 본문 동일 — 클릭률 불변
        a, b2 = '\n'.join(STYLE.findall(src)), '\n'.join(STYLE.findall(out))
        for pre in FROZEN_PREFIX:
            if rule_bodies(a, pre) != rule_bodies(b2, pre):
                bad.append(f'제외 선택자 {pre} 변경됨')

        if bad:
            problems.append(f"{path}: " + ' / '.join(bad))
        elif apply_:
            open(path, 'w', encoding='utf-8').write(out)

    print(f"대상 {len(paths)}개 파일 · 변경 {sum(v for k, v in total.items() if k != '제외된 규칙')}건")
    for k, v in sorted(total.items(), key=lambda x: -x[1]):
        print(f"   {k:22} {v}")
    zero = [p for p, n in per_file.items() if n == 0]
    if zero:
        print(f"\n⚠️ 변경 0건인 파일 {len(zero)}개: {[z[:30] for z in zero[:5]]}")
    if verbose:
        dist = collections.Counter(per_file.values())
        print("\n파일당 변경 건수 분포: " + ', '.join(f"{n}건×{c}" for n, c in sorted(dist.items())))
    if problems:
        print(f"\n🔴 검증 실패 {len(problems)}개 — 해당 파일은 쓰지 않았다:")
        for p in problems[:10]:
            print(f"   {p}")
        sys.exit(1)
    print("\n✅ <style> 밖 동일 · 레이아웃 속성 동일 · 측정 요소 불변")
    print("적용됨" if apply_ else "미적용 (--apply 필요)")


if __name__ == '__main__':
    main()
