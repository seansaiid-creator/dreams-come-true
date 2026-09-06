#!/usr/bin/env python3
"""배포된 사이트가 의도대로 나갔는지 실제 HTTP로 확인한다.

로컬 파일이 아니라 suksuki.com이 돌려주는 것을 본다. 빌드·캐시·CDN 단계에서
어긋날 수 있으므로 배포 후에는 이 스크립트로 확인한다.

사용: python3 scripts/verify-deploy.py [페이지수]
"""
import sys, re, glob, random, urllib.request, time

BASE = 'https://suksuki.com/'

# (설명, 정규식, 있어야 하는가)
CHECKS = [
    ('금색 글로우 제거',        r'text-shadow:0 0 30px',                False),
    ('페이지 전체 발광 제거',    r'radial-gradient\(ellipse',            False),
    ('nav 오타 없음',           r'\.nav-link:active',                   False),
    ('새 본문색 적용',          r'--text:\s*#EDE9F7',                   True),
    ('CTA 그라데이션 보존',      r'\.service-btn\{[^}]*linear-gradient',  True),
    ('꿈사주 버튼 보존',        r'\.saju-cta-b\{[^}]*linear-gradient',   True),
    ('스크롤 계측 살아있음',     r"ev\('scroll_'\+k",                    True),
]


def fetch(url, tries=3):
    for i in range(tries):
        try:
            req = urllib.request.Request(url, headers={'User-Agent': 'deploy-verify'})
            return urllib.request.urlopen(req, timeout=25).read().decode('utf-8', 'replace')
        except Exception as e:
            if i == tries - 1:
                raise
            time.sleep(2)


def main():
    n = int(sys.argv[1]) if len(sys.argv) > 1 else 8
    random.seed()
    pages = random.sample(sorted(glob.glob('dream-*.html')), n)
    fails, rows = 0, []

    for p in pages:
        html = fetch(BASE + p + f'?cb={int(time.time())}')
        bad = []
        for label, pat, want in CHECKS:
            found = bool(re.search(pat, html, re.S))
            # 그라데이션 보존 검사는 해당 선택자가 없는 변종에서는 건너뛴다
            if want and label.endswith('보존') and not re.search(
                    pat.split(r'\{')[0] + r'\s*\{', html):
                continue
            if found != want:
                bad.append(label)
        rows.append((p, len(html), bad))
        if bad:
            fails += 1

    for p, size, bad in rows:
        mark = '✅' if not bad else '🔴'
        print(f"  {mark} {p:34} {size:>7,}B  {'· '.join(bad) if bad else ''}")
    print(f"\n{len(pages)}개 중 통과 {len(pages)-fails} / 실패 {fails}")
    sys.exit(1 if fails else 0)


if __name__ == '__main__':
    main()
