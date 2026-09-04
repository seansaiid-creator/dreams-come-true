import { readFileSync } from 'node:fs';
import { createSign } from 'node:crypto';
import { homedir } from 'node:os';
const PROPERTY='528679246';
const key=JSON.parse(readFileSync(process.env.GA4_KEY||`${homedir()}/.config/dreams-ga4/sa-key.json`,'utf8'));
const b64=o=>Buffer.from(JSON.stringify(o)).toString('base64url');
const now=Math.floor(Date.now()/1000);
const h=b64({alg:'RS256',typ:'JWT'});
const c=b64({iss:key.client_email,scope:'https://www.googleapis.com/auth/analytics.readonly',aud:'https://oauth2.googleapis.com/token',iat:now,exp:now+3600});
const s=createSign('RSA-SHA256'); s.update(`${h}.${c}`);
const jwt=`${h}.${c}.${s.sign(key.private_key,'base64url')}`;
const tok=await (await fetch('https://oauth2.googleapis.com/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:`grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`})).json();
const H={Authorization:`Bearer ${tok.access_token}`,'Content-Type':'application/json'};

// 1) 이 속성에서 사용 가능한 측정기준/측정항목 메타데이터
const meta=await (await fetch(`https://analyticsdata.googleapis.com/v1beta/properties/${PROPERTY}/metadata`,{headers:H})).json();
const custom=(meta.dimensions||[]).filter(d=>d.apiName.startsWith('customEvent:')||d.apiName.startsWith('customUser:'));
console.log('■ 등록된 맞춤 측정기준:', custom.length ? custom.map(d=>d.apiName.replace('customEvent:','')).join(', ') : '(없음)');

// 2) 사이트가 보내는 파라미터 목록
const params=['page','method','to','from','dream','len_bucket','cat','slug','matched','legacy','kw','query','result_count'];
const reg=new Set(custom.map(d=>d.apiName.replace(/^custom(Event|User):/,'')));
console.log('\n■ 파라미터별 등록 여부');
for(const p of params) console.log(`   ${reg.has(p)?'✅ 등록':'❌ 미등록'}  ${p}`);

// 3) 인구통계(Google 신호) 확인
const demo=await (await fetch(`https://analyticsdata.googleapis.com/v1beta/properties/${PROPERTY}:runReport`,{method:'POST',headers:H,
 body:JSON.stringify({dateRanges:[{startDate:'30daysAgo',endDate:'yesterday'}],dimensions:[{name:'userAgeBracket'}],metrics:[{name:'activeUsers'}],limit:10})})).json();
console.log('\n■ 연령(userAgeBracket):', demo.error? '오류: '+demo.error.message : JSON.stringify((demo.rows||[]).map(r=>[r.dimensionValues[0].value,r.metricValues[0].value])));
const gen=await (await fetch(`https://analyticsdata.googleapis.com/v1beta/properties/${PROPERTY}:runReport`,{method:'POST',headers:H,
 body:JSON.stringify({dateRanges:[{startDate:'30daysAgo',endDate:'yesterday'}],dimensions:[{name:'userGender'}],metrics:[{name:'activeUsers'}],limit:10})})).json();
console.log('■ 성별(userGender):', gen.error? '오류: '+gen.error.message : JSON.stringify((gen.rows||[]).map(r=>[r.dimensionValues[0].value,r.metricValues[0].value])));
