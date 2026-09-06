#!/usr/bin/env python3
"""꿈해몽 초안 중복 검사기 — 발행분 143편·초안 상호간의 문장 중복을 실측한다.

원칙(OPERATIONS.md §0): 중복 여부는 사람이 눈으로 판정하지 않는다. 이 스크립트의 실측값만 쓴다.
품질 게이트(docs/handoff/CONTENT.md §2) 중 **중복 항목만** 검사한다.
  A. 문장 완전일치 — 초안 문장이 기존 발행분에 그대로 있는가 (기준: 0건)
  B. 초안 간 중복  — 초안끼리 겹치는 문장 비율 (기준: ≤3%)
  C. 근접 중복     — 문자 5-gram 포함률 최대치 (참고 지표, 기본 경고선 40%)
  D. 문서 내 반복  — 한 글 안에서 같은 문장이 두 번 이상 나오는가 (기준: 0건)
검사하지 않는 것: 마침표 뒤 공백 · related 실재 · 템플릿 토큰 잔존 · 태그 균형

사용:
  python3 scripts/check-duplicates.py                    # 큐의 미발행 대기분 전체
  python3 scripts/check-duplicates.py --slug pet-lost    # 특정 초안만 (반복 지정 가능)
  python3 scripts/check-duplicates.py --baseline         # 발행분 143편끼리 검사(기준선)
  python3 scripts/check-duplicates.py --min-chars 20 --near 40
종료코드: A·B·D 중 위반이 있으면 1
"""
import json, os, re, sys, argparse
from collections import defaultdict, Counter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
QUEUE = os.path.join(ROOT, 'content-queue', 'queue.json')

# div.section 안에서도 본문이 아닌 것 — 전 페이지 공통이라 중복 판정에서 뺀다
DROP_CLASS = re.compile(r'\b(related-links|mid-related|notice|eng-cta|saju-cta|service-btn|nav|footer)\b')


def strip_div(html, start):
    """start 위치의 <div ...> 에 대응하는 </div> 끝 인덱스를 깊이 추적으로 찾는다."""
    depth, i = 0, start
    for m in re.finditer(r'<(/?)div\b', html[start:]):
        depth += -1 if m.group(1) else 1
        if depth == 0:
            return start + m.end() + html[start + m.end():].find('>') + 1
    return len(html)


def sections_of_page(html):
    """발행 HTML에서 div.section 본문만 뽑는다 (nav·CTA·관련링크·고지문 제외)."""
    html = re.sub(r'<!--.*?-->|<script\b.*?</script>|<style\b.*?</style>', ' ', html, flags=re.S)
    out = []
    for m in re.finditer(r'<div\s+class="section"\s*>', html):
        end = strip_div(html, m.start())
        out.append(html[m.end():end])
    return out


def to_text(fragment):
    """HTML 조각 → 순수 텍스트. 공통 블록은 통째로 버린다."""
    f = fragment
    # 클래스로 지목된 요소 제거 (div는 깊이 추적, 나머지는 단순 대응)
    while True:
        hit = None
        for m in re.finditer(r'<div\s+[^>]*class="([^"]*)"', f):
            if DROP_CLASS.search(m.group(1)):
                hit = m
                break
        if not hit:
            break
        f = f[:hit.start()] + f[strip_div(f, hit.start()):]
    f = re.sub(r'<(p|span|a)\s+[^>]*class="[^"]*(notice|service-btn)[^"]*"[^>]*>.*?</\1>', ' ', f, flags=re.S)
    f = re.sub(r'<[^>]+>', ' ', f)
    f = f.replace('&nbsp;', ' ').replace('&amp;', '&').replace('&lt;', '<').replace('&gt;', '>')
    return re.sub(r'\s+', ' ', f).strip()


def sentences(text, min_chars):
    """한국어 문장 분리 후 정규화. min_chars 미만은 버린다(관용구 오탐 방지)."""
    raw = re.split(r'(?<=[.!?])\s+', text)
    out = []
    for s in raw:
        s = re.sub(r'\s+', ' ', s).strip()
        if len(s) >= min_chars:
            out.append(s)
    return out


def grams(text, n=5):
    t = re.sub(r'[^가-힣0-9a-zA-Z]', '', text)
    return {t[i:i + n] for i in range(len(t) - n + 1)}


def load_published():
    """발행된 dream-*.html 143편 → {slug: 본문텍스트}"""
    docs = {}
    for fn in sorted(os.listdir(ROOT)):
        if not (fn.startswith('dream-') and fn.endswith('.html')):
            continue
        html = open(os.path.join(ROOT, fn), encoding='utf-8').read()
        body = ' '.join(to_text(s) for s in sections_of_page(html))
        docs[fn[len('dream-'):-len('.html')]] = body
    return docs


def load_queue(slugs=None, pending_only=True):
    q = json.load(open(QUEUE, encoding='utf-8'))
    docs = {}
    for e in q:
        if slugs and e['slug'] not in slugs:
            continue
        if not slugs and pending_only and (not e.get('approved') or e.get('published')):
            continue
        docs[e['slug']] = ' '.join(to_text(s['html']) for s in e.get('sections', []))
    return docs


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--slug', action='append', default=[])
    ap.add_argument('--baseline', action='store_true', help='발행분끼리 검사')
    ap.add_argument('--min-chars', type=int, default=20)
    ap.add_argument('--near', type=int, default=40, help='근접 중복 경고선(%%)')
    ap.add_argument('--json', help='결과를 JSON으로 저장')
    a = ap.parse_args()

    pub = load_published()
    peers = None
    if a.baseline:
        targets, corpus = pub, {}
        print(f"[기준선] 발행분 {len(pub)}편끼리 검사 (서로를 코퍼스로 삼음)")
    else:
        targets = load_queue(a.slug or None)
        corpus = pub
        # --slug로 일부만 지정해도 B(초안 간 중복)는 **대기 중인 초안 전체**와 비교한다.
        # 선택분끼리만 비교하면 단일 지정 시 항상 0건이 나와 게이트가 무력화된다.
        peers = load_queue(None)
        peers.update(targets)
        if not targets:
            print("검사할 초안이 없다. 큐에 미발행 대기 항목이 없거나 --slug가 안 맞는다.")
            return 0
        print(f"[검사] 초안 {len(targets)}건 vs 발행분 {len(pub)}편 · 초안 간 비교 대상 {len(peers)}건")
    print(f"기준: 문장 {a.min_chars}자 이상 · 근접 경고선 {a.near}% · 5-gram 포함률\n")

    # 코퍼스 문장 색인
    index = defaultdict(set)
    for slug, text in (corpus or targets).items():
        for s in set(sentences(text, a.min_chars)):
            index[s].add(slug)

    tgt_raw = {slug: sentences(t, a.min_chars) for slug, t in targets.items()}
    tgt_sents = {slug: sorted(set(v)) for slug, v in tgt_raw.items()}
    peer_sents = ({slug: set(sentences(t, a.min_chars)) for slug, t in peers.items()}
                  if peers else {k: set(v) for k, v in tgt_sents.items()})
    tgt_grams = {slug: grams(t) for slug, t in targets.items()}
    cor_grams = {slug: grams(t) for slug, t in (corpus or targets).items()}

    result, exact_total, cross_total = [], 0, 0
    for slug in sorted(tgt_sents):
        sents = tgt_sents[slug]
        # D. 같은 문서 안에서 같은 문장이 반복되는가 (템플릿 블록 중복 삽입 탐지)
        repeats = sorted(((n, x) for x, n in Counter(tgt_raw[slug]).items() if n > 1), reverse=True)
        # A. 발행분과 문장 완전일치
        exact = []
        for s in sents:
            hits = sorted(x for x in index.get(s, ()) if x != slug)
            if hits:
                exact.append({'sentence': s, 'pages': hits})
        # B. 다른 초안과 문장 완전일치
        cross = []
        for s in sents:
            hits = sorted(o for o in peer_sents if o != slug and s in peer_sents[o])
            if hits:
                cross.append({'sentence': s, 'drafts': hits})
        # C. 근접 중복 최대치
        g = tgt_grams[slug]
        near = sorted(
            ((len(g & cg) * 100.0 / max(1, len(g)), o) for o, cg in cor_grams.items() if o != slug),
            reverse=True)[:3]

        cross_pct = len(cross) * 100.0 / max(1, len(sents))
        exact_total += len(exact)
        cross_total += len(cross)
        ok = not exact and cross_pct <= 3 and not repeats

        print(f"{'✅' if ok else '❌'} {slug}  (검사 문장 {len(sents)}개)")
        print(f"   A 발행분 완전일치: {len(exact)}건" + (" ← 기준 0건 위반" if exact else ""))
        for e in exact[:5]:
            print(f"      · {e['sentence'][:70]}…  → {', '.join(e['pages'][:3])}")
        if len(exact) > 5:
            print(f"      … 외 {len(exact) - 5}건")
        print(f"   B 초안 간 중복: {len(cross)}건 / {cross_pct:.1f}%" + (" ← 기준 3% 위반" if cross_pct > 3 else ""))
        for c in cross[:3]:
            print(f"      · {c['sentence'][:70]}…  → {', '.join(c['drafts'])}")
        flag = '⚠️ ' if near and near[0][0] >= a.near else ''
        print(f"   C 근접 최대: {flag}" + " · ".join(f"{o} {p:.1f}%" for p, o in near))
        if repeats:
            print(f"   D 문서 내 반복: {len(repeats)}문장" + (f" (최다 {repeats[0][0]}회)" if repeats else ""))
            for n, x in repeats[:3]:
                print(f"      · {n}회  {x[:64]}…")
        print()

        result.append({'slug': slug, 'sentences': len(sents), 'exact': exact,
                       'cross': cross, 'cross_pct': round(cross_pct, 2),
                       'near': [{'slug': o, 'pct': round(p, 1)} for p, o in near],
                       'repeats': [{'n': n, 'sentence': x} for n, x in repeats]})

    rep_total = sum(len(r['repeats']) for r in result)
    fail = (exact_total > 0) or any(r['cross_pct'] > 3 for r in result) or (rep_total > 0)
    print("─" * 60)
    print(f"합계: 발행분 완전일치 {exact_total}건 · 초안 간 중복 {cross_total}건 · 문서 내 반복 {rep_total}건")
    print("판정: " + ("❌ 위반 있음 — 승인 불가" if fail else "✅ 중복 기준 통과"))
    print("※ 이 스크립트는 중복만 본다. 마침표 뒤 공백·related 실재·템플릿 토큰·태그 균형은 미검사.")

    if a.json:
        json.dump(result, open(a.json, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
        print(f"JSON 저장: {a.json}")
    return 1 if fail else 0


if __name__ == '__main__':
    sys.exit(main())
