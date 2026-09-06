#!/usr/bin/env python3
"""로컬 정적 미리보기 서버. 배포 전 확인용 개발 도구 — 사이트 코드가 아니다.

`python3 -m http.server`는 이 환경에서 못 쓴다. 모듈의 __main__ 블록이
`default=os.getcwd()`를 평가하는데 샌드박스가 getcwd를 막아 import 단계에서 죽는다.
디렉터리를 명시해 그 경로를 피한다.

사용: python3 scripts/preview-server.py [포트] [디렉터리]
"""
import sys, os
from functools import partial
from http.server import HTTPServer, SimpleHTTPRequestHandler

port = int(sys.argv[1]) if len(sys.argv) > 1 else 8199
root = sys.argv[2] if len(sys.argv) > 2 else os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


class Handler(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store')  # 수정 즉시 반영
        super().end_headers()

    def log_message(self, fmt, *args):
        sys.stderr.write("%s\n" % (fmt % args))


print(f"serving {root} at http://127.0.0.1:{port}", flush=True)
HTTPServer(('127.0.0.1', port), partial(Handler, directory=root)).serve_forever()
