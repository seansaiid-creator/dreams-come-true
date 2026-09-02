#!/usr/bin/env python3
"""dreams-db.js 생성 — 각 dream 페이지의 실제 해몽 본문/조언/등급을 추출.
신규 페이지 발행 후 실행: python3 scripts/build-dreams-db.py"""
import glob,re,csv,html as H,json,os
os.chdir(os.path.join(os.path.dirname(__file__),'..'))
KW={r[0]:(r[1],r[2]) for r in list(csv.reader(open('kw-cat-map.csv',encoding='utf-8')))[1:]}
idx=open('index.html',encoding='utf-8').read()
hand=dict(re.findall(r"keyword:\s*'([^']+)'\s*,\s*luck:\s*'([^']+)'", idx))
for m in re.finditer(r"keyword:\s*'([^']+)',\n\s*luck:\s*'([^']+)'", idx): hand.setdefault(m.group(1),m.group(2))
CATDEF={'animal':'⭐⭐⭐⭐ 길몽','money':'⭐⭐⭐⭐ 길몽','change':'⭐⭐⭐⭐ 길몽','nature':'⭐⭐⭐ 중길몽',
        'people':'⭐⭐⭐ 중길몽','body':'⭐⭐⭐ 중길몽','loss':'⭐⭐ 주의몽','blocked':'⭐⭐ 주의몽'}
SCORE={'⭐⭐⭐⭐⭐ 대길몽':5,'⭐⭐⭐⭐ 길몽':4,'⭐⭐⭐ 중길몽':3,'⭐⭐ 주의몽':2}
txt=lambda x: re.sub(r'\s+',' ',H.unescape(re.sub(r'<[^>]+>',' ',x))).strip()
def pick(secs,*ns):
    for n in ns:
        for h,b in secs:
            if n in h: return b
    return ''
out={}
for f in sorted(glob.glob('dream-*.html')):
    slug=f[6:-5]
    if slug not in KW: continue
    kw,cat=KW[slug]; s=open(f,encoding='utf-8').read()
    cut=s.find('<!-- ════════ 회유 섹션 시작'); body=s[:cut] if cut>0 else s
    secs=[(txt(m.group(1)),m.group(2)) for m in re.finditer(r'<h2[^>]*>(.*?)</h2>(.*?)(?=<h2|$)',body,re.S)]
    paras=[txt(p) for p in re.findall(r'<p[^>]*>(.*?)</p>',pick(secs,'기본 의미','란?','요약'),re.S)]
    text=' '.join(paras[:2])[:330]
    if not text:
        h=re.search(r'<div class="hero">.*?<p>(.*?)</p>',body,re.S); text=txt(h.group(1)) if h else ''
    apar=[txt(p) for p in re.findall(r'<p[^>]*>(.*?)</p>',pick(secs,'이 꿈을 꿨다면','활용','조언'),re.S)]
    luck=None; base=kw.replace('꿈','').strip()
    for hk,hv in hand.items():
        hb=hk.replace('꿈','').strip()
        if hb and (hb==base or (len(hb)>2 and hb in base) or (len(base)>2 and base in hb)): luck=hv; break
    luck=luck or CATDEF[cat]
    out[slug]={'k':kw,'l':luck,'s':SCORE[luck],'t':text,
               'a':(apar[0][:190] if apar else '오늘은 이 꿈이 가리키는 부분을 차분히 점검해보세요.')}
open('dreams-db.js','w',encoding='utf-8').write(
    "/* 꿈별 해몽 상세 DB — CTA 착지 시 동적 로드 (scripts/build-dreams-db.py 생성) */\n"
    "window.DREAM_DETAILS="+json.dumps(out,ensure_ascii=False,separators=(',',':'))+";\n")
print(f"dreams-db.js 생성: {len(out)}개 항목")
