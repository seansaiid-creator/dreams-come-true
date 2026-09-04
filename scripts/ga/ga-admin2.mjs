import { readFileSync } from 'node:fs'; import { createSign } from 'node:crypto'; import { homedir } from 'node:os';
const P='528679246';
const key=JSON.parse(readFileSync(`${homedir()}/.config/dreams-ga4/sa-key.json`,'utf8'));
const b64=o=>Buffer.from(JSON.stringify(o)).toString('base64url'); const now=Math.floor(Date.now()/1000);
const h=b64({alg:'RS256',typ:'JWT'}), c=b64({iss:key.client_email,scope:'https://www.googleapis.com/auth/analytics.readonly',aud:'https://oauth2.googleapis.com/token',iat:now,exp:now+3600});
const sg=createSign('RSA-SHA256'); sg.update(`${h}.${c}`);
const tok=await (await fetch('https://oauth2.googleapis.com/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:`grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${h}.${c}.${sg.sign(key.private_key,'base64url')}`})).json();
const H={Authorization:`Bearer ${tok.access_token}`,'Content-Type':'application/json'};
const get=async u=>{const r=await fetch(u,{headers:H});const t=await r.text();let j;try{j=JSON.parse(t)}catch{j={error:{message:'비JSON 응답 (HTTP '+r.status+') — 엔드포인트 없음으로 판단'}}}return {status:r.status,j};};
// Search Console 링크 (Admin API에 존재하는지 자체를 확인)
for (const v of ['v1alpha','v1beta']) {
  const r=await get(`https://analyticsadmin.googleapis.com/${v}/properties/${P}/searchConsoleLinks`);
  console.log(`■ Search Console 링크 (${v}):`, r.status, r.j.error? r.j.error.message.slice(0,120) : JSON.stringify(r.j));
}
// 사이트 검색 오인 여부: view_search_results의 search_term 실측 (30일)
const run=b=>fetch(`https://analyticsdata.googleapis.com/v1beta/properties/${P}:runReport`,{method:'POST',headers:H,body:JSON.stringify(b)}).then(r=>r.json());
const r=await run({dateRanges:[{startDate:'30daysAgo',endDate:'yesterday'}],dimensions:[{name:'searchTerm'}],metrics:[{name:'eventCount'}],
  dimensionFilter:{filter:{fieldName:'eventName',stringFilter:{value:'view_search_results'}}},limit:20,orderBys:[{metric:{metricName:'eventCount'},desc:true}]});
console.log('■ view_search_results의 search_term (30일):', r.error?r.error.message:'');
for(const row of r.rows||[]) console.log('   ', JSON.stringify(row.dimensionValues[0].value), '→', row.metricValues[0].value);
if(!r.rows) console.log('   (행 없음)');
