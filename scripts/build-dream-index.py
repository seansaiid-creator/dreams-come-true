#!/usr/bin/env python3
"""saju.html의 꿈 선택기용 경량 인덱스 생성 — 신규 발행 후 자동 실행"""
import json, os
os.chdir(os.path.join(os.path.dirname(__file__), '..'))
pool = json.load(open('scripts/today-pool.json', encoding='utf-8'))
idx = [{'s': x['slug'], 'k': x['kw'], 'c': x['cat'], 'e': x['emoji']} for x in pool]
idx.sort(key=lambda x: x['k'])
js = ('/* saju-dreams.js — 자동 생성물. node/py scripts/build-dream-index.py\n'
      '   사주 화면에서 "어젯밤 어떤 꿈을 꾸셨나요?" 선택기에 쓰는 경량 인덱스 */\n'
      'window.DREAM_INDEX=' + json.dumps(idx, ensure_ascii=False, separators=(',', ':')) + ';\n')
open('saju-dreams.js', 'w', encoding='utf-8').write(js)
print(f'saju-dreams.js 생성: {len(idx)}개 / {len(js.encode())/1024:.1f}KB')
