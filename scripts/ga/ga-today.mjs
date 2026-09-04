import { readFileSync } from 'node:fs'; import { createSign } from 'node:crypto'; import { homedir } from 'node:os';
const P='528679246';
const key=JSON.parse(readFileSync(`${homedir()}/.config/dreams-ga4/sa-key.json`,'utf8'));
const b64=o=>Buffer.from(JSON.stringify(o)).toString('base64url'); const now=Math.floor(Date.now()/1000);
const h=b64({alg:'RS256',typ:'JWT'}), c=b64({iss:key.client_email,scope:'https://www.googleapis.com/auth/analytics.readonly',aud:'https://oauth2.googleapis.com/token',iat:now,exp:now+3600});
const sg=createSign('RSA-SHA256'); sg.update(`${h}.${c}`);
const tok=await (await fetch('https://oauth2.googleapis.com/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:`grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${h}.${c}.${sg.sign(key.private_key,'base64url')}`})).json();
const H={Authorization:`Bearer ${tok.access_token}`,'Content-Type':'application/json'};
const run=b=>fetch(`https://analyticsdata.googleapis.com/v1beta/properties/${P}:runReport`,{method:'POST',headers:H,body:JSON.stringify(b)}).then(r=>r.json());
const r=await run({dateRanges:[{startDate:'today',endDate:'today'},{startDate:'yesterday',endDate:'yesterday'},{startDate:'7daysAgo',endDate:'7daysAgo'}],
 dimensions:[{name:'hour'}],metrics:[{name:'activeUsers'}],limit:30,orderBys:[{dimension:{dimensionName:'hour'}}]});
const m={};
for(const row of r.rows||[]){const hh=row.dimensionValues[0].value; (m[hh]??={})[row.dimensionValues[1]?.value ?? 'x']=0;}
// dateRange 비교는 dimension 없이 오므로 별도 조회
for (const [label,rng] of [['오늘',['today','today']],['어제',['yesterday','yesterday']],['1주전(목)',['7daysAgo','7daysAgo']]]) {
  const x=await run({dateRanges:[{startDate:rng[0],endDate:rng[1]}],dimensions:[{name:'hour'}],metrics:[{name:'activeUsers'}],limit:30,orderBys:[{dimension:{dimensionName:'hour'}}]});
  const h2={}; for(const row of x.rows||[]) h2[+row.dimensionValues[0].value]=+row.metricValues[0].value;
  let line=''; for(let i=0;i<24;i++) line+=String(h2[i]??0).padStart(3);
  console.log(`  ${label.padEnd(10)}${line}`);
}
console.log('  '+' '.repeat(10)+[...Array(24).keys()].map(i=>String(i).padStart(3)).join(''));
