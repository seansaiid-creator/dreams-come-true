/* saju/*.js (CommonJS) → 브라우저용 단일 파일 saju-bundle.js
   node scripts/build-saju-bundle.js */
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..');
const files = ['saju-core.js', 'lunar-core.js', 'saju-content.js', 'saju-reading.js'];
let out = `/* saju-bundle.js — 자동 생성물. 수정하지 마세요.
   원본: saju/{${files.join(',')}} / 생성: node scripts/build-saju-bundle.js
   계산은 전부 이 브라우저 안에서 이뤄지며 생년월일은 서버로 전송되지 않습니다. */
(function(global){
'use strict';
var __M = {};
`;
for (const f of files) {
  let src = fs.readFileSync(path.join(root, 'saju', f), 'utf8');
  // require(...) → 내부 모듈 참조
  src = src.replace(/const\s+(\w+)\s*=\s*require\('\.\/([\w-]+)\.js'\);/g,
    (_, v, m) => `var ${v} = __M['${m}'];`);
  // module.exports.X = / module.exports = 처리
  src = src.replace(/module\.exports\s*=\s*\{([\s\S]*?)\};/g, (_, body) => `__EXPORTS = Object.assign(__EXPORTS||{}, {${body}});`);
  src = src.replace(/module\.exports\.(\w+)\s*=\s*/g, (_, k) => `__EXPORTS.${k} = `);
  const name = f.replace(/\.js$/, '');
  out += `\n/* ── ${f} ── */\n__M['${name}'] = (function(){\nvar __EXPORTS = {};\n${src}\nreturn __EXPORTS;\n})();\n`;
}
out += `
global.Saju = {
  buildReading: __M['saju-reading'].buildReading,
  todayPillarIndex: __M['saju-reading'].todayPillarIndex,
  calcSaju: __M['saju-core'].calcSaju,
  lunarToSolar: __M['lunar-core'].lunarToSolar,
  solarToLunar: __M['lunar-core'].solarToLunar,
};
})(window);
`;
fs.writeFileSync(path.join(root, 'saju-bundle.js'), out);
console.log(`saju-bundle.js 생성: ${(out.length/1024).toFixed(1)}KB`);
