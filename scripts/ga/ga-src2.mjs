import { readFileSync } from 'node:fs'; import { createSign } from 'node:crypto'; import { homedir } from 'node:os';
const P='528679246';
const key=JSON.parse(readFileSync(`${homedir()}/.config/dreams-ga4/sa-key.json`,'utf8'));
const b64=o=>Buffer.from(JSON.stringify(o)).toString('base64url'); const now=Math.floor(Date.now()/1000);
const h=b64({alg:'RS256',typ:'JWT'}), c=b64({iss:key.client_email,scope:'https://www.googleapis.com/auth/analytics.readonly',aud:'https://oauth2.googleapis.com/token',iat:now,exp:now+3600});
const sg=createSign('RSA-SHA256'); sg.update(`${h}.${c}`);
const tok=await (await fetch('https://oauth2.googleapis.com/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:`grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${h}.${c}.${sg.sign(key.private_key,'base64url')}`})).json();
const H={Authorization:`Bearer ${tok.access_token}`,'Content-Type':'application/json'};
const run=b=>fetch(`https://analyticsdata.googleapis.com/v1beta/properties/${P}:runReport`,{method:'POST',headers:H,body:JSON.stringify(b)}).then(r=>r.json());
// 오전 0~12시만 잘라서 유입원 비교
for (const [label,st,en] of [['오늘 09-03','today','today'],['어제 09-02','yesterday','yesterday'],['1주전 08-27','7daysAgo','7daysAgo']]) {
  const r=await run({dateRanges:[{startDate:st,endDate:en}],dimensions:[{name:'sessionSource'},{name:'hour'}],metrics:[{name:'sessions'}],limit:200});
  const agg={};
  for(const row of r.rows||[]){const s=row.dimensionValues[0].value,hh=+row.dimensionValues[1].value;
    if(hh<=12) agg[s]=(agg[s]||0)+ +row.metricValues[0].value;}
  const tot=Object.values(agg).reduce((a,b)=>a+b,0);
  console.log(`■ ${label} (0~12시) 총 ${tot}세션`);
  for(const [k,v] of Object.entries(agg).sort((a,b)=>b[1]-a[1])) console.log(`    ${k.padEnd(24)} ${v}`);
}
