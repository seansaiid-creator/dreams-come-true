#!/usr/bin/env python3
"""꿈사주 문안 초안 실측기 — 블록별 글자 수를 재서 헤더에 기록하고 범위·용어를 검사한다.
사용: python3 scripts/measure-draft.py docs/drafts/saju-content-v2-draft.md [--write]
원칙(OPERATIONS.md §0): 글자 수는 사람이 적지 않는다. 이 스크립트의 실측값만 쓴다."""
import re, sys
path = sys.argv[1]; write = '--write' in sys.argv
s = open(path, encoding='utf-8').read()
RANGE = {'tip': (60, 90), 'text': (120, 150)}; BRIDGE = (120, 160)
TERMS = ['일간','오행','천간','육친','편재','정재','식신','상관','편관','정관','편인','정인','비견','겁재',
         '갑목','을목','병화','정화','무토','기토','경금','신금','임수','계수','일진']
blk = re.compile(r'(- \[ \] \*\*([^*]+)\*\*\s*\()([^)]*)(\)\s*\n\s*> )(.+)')
rows=[]; out=[]; last=0
for m in blk.finditer(s):
    label, inner, body = m.group(2), m.group(3), m.group(5).strip()
    real = len(body)
    cur = re.search(r'현재 (\d+)자', inner)
    new_inner = f"현재 {cur.group(1)}자 → 초안 {real}자" if cur else f"초안 {real}자"
    lo, hi = RANGE.get(label, BRIDGE)
    sec = [x.group(1) for x in re.finditer(r'### \[(\w+)\]', s[:m.start()])]
    sec = sec[-1] if sec else 'REL'
    rows.append((sec, label, real, lo, hi, body))
    out.append(s[last:m.start(3)]); out.append(new_inner); last = m.end(3)
out.append(s[last:]); s2 = ''.join(out)
# 본문 영역만 용어 검사 (A/B 섹션의 '> ' 인용문)
bodies = ' '.join(r[5] for r in rows)
jargon = [t for t in TERMS if t in bodies]
bad = [(r[0], r[1], r[2], r[3], r[4]) for r in rows if not (r[3] <= r[2] <= r[4])]
print(f"블록 {len(rows)}개 · 평균 {sum(r[2] for r in rows)//max(1,len(rows))}자")
print(f"범위 밖: {len(bad)}개"); [print(f"  {b[0]:8s} {b[1]:4s} {b[2]}자 (기준 {b[3]}~{b[4]})") for b in bad]
print(f"사주 용어: {jargon if jargon else '없음'}")
if write:
    open(path, 'w', encoding='utf-8').write(s2); print("헤더에 실측값 기록 완료")
sys.exit(1 if bad or jargon else 0)
