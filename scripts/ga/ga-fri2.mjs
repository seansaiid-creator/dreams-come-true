import { readFileSync } from 'node:fs'; import { createSign } from 'node:crypto'; import { homedir } from 'node:os';
const P='528679246';
const key=JSON.parse(readFileSync(`${homedir()}/.config/dreams-ga4/sa-key.json`,'utf8'));
const b64=o=>Buffer.from(JSON.stringify(o)).toString('base64url'); const now=Math.floor(Date.now()/1000);
const h=b64({alg:'RS256',typ:'JWT'}), c=b64({iss:key.client_email,scope:'https://www.googleapis.com/auth/analytics.readonly',aud:'https://oauth2.googleapis.com/token',iat:now,exp:now+3600});
const sg=createSign('RSA-SHA256'); sg.update(`${h}.${c}`);
const tok=await (await fetch('https://oauth2.googleapis.com/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:`grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${h}.${c}.${sg.sign(key.private_key,'base64url')}`})).json();
const H={Authorization:`Bearer ${tok.access_token}`,'Content-Type':'application/json'};
const run=b=>fetch(`https://analyticsdata.googleapis.com/v1beta/properties/${P}:runReport`,{method:'POST',headers:H,body:JSON.stringify(b)}).then(r=>r.json());
for (const [label,st,en] of [['오늘 09-04(금)','today','today'],['어제 09-03(목)','yesterday','yesterday'],['지난주 08-28(금)','2026-08-28','2026-08-28']]) {
  const r=await run({dateRanges:[{startDate:st,endDate:en}],dimensions:[{name:'hour'}],metrics:[{name:'activeUsers'}],limit:30,orderBys:[{dimension:{dimensionName:'hour'}}]});
  const m={}; for(const row of r.rows||[]) m[+row.dimensionValues[0].value]=+row.metricValues[0].value;
  let line=''; for(let i=0;i<=7;i++) line+=String(m[i]||0).padStart(3);
  console.log(`${label.padEnd(16)} 0시~7시: ${line}`);
}
console.log('시간              ' + [0,1,2,3,4,5,6,7].map(i=>String(i).padStart(3)).join(''));
