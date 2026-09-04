import { readFileSync } from 'node:fs'; import { createSign } from 'node:crypto'; import { homedir } from 'node:os';
const P='528679246';
const key=JSON.parse(readFileSync(`${homedir()}/.config/dreams-ga4/sa-key.json`,'utf8'));
const b64=o=>Buffer.from(JSON.stringify(o)).toString('base64url'); const now=Math.floor(Date.now()/1000);
const h=b64({alg:'RS256',typ:'JWT'}), c=b64({iss:key.client_email,scope:'https://www.googleapis.com/auth/analytics.readonly',aud:'https://oauth2.googleapis.com/token',iat:now,exp:now+3600});
const sg=createSign('RSA-SHA256'); sg.update(`${h}.${c}`);
const tok=await (await fetch('https://oauth2.googleapis.com/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:`grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${h}.${c}.${sg.sign(key.private_key,'base64url')}`})).json();
const H={Authorization:`Bearer ${tok.access_token}`};
const get=async u=>{const r=await fetch(u,{headers:H});const j=await r.json();return {status:r.status,j};};
const prop=await get(`https://analyticsadmin.googleapis.com/v1beta/properties/${P}`);
console.log('■ 속성:', prop.status, prop.j.error?prop.j.error.message:JSON.stringify({name:prop.j.displayName,timeZone:prop.j.timeZone,currency:prop.j.currencyCode,industry:prop.j.industryCategory,created:prop.j.createTime}));
const ds=await get(`https://analyticsadmin.googleapis.com/v1beta/properties/${P}/dataStreams`);
console.log('■ 데이터 스트림:', ds.status, ds.j.error?ds.j.error.message:'');
for(const s of ds.j.dataStreams||[]){
  console.log('   ', JSON.stringify({id:s.name.split('/').pop(), type:s.type, name:s.displayName, measurementId:s.webStreamData?.measurementId, defaultUri:s.webStreamData?.defaultUri, created:s.createTime}));
  const em=await get(`https://analyticsadmin.googleapis.com/v1alpha/${s.name}/enhancedMeasurementSettings`);
  console.log('    향상된 측정:', em.status, em.j.error?em.j.error.message:JSON.stringify({enabled:em.j.streamEnabled,scrolls:em.j.scrollsEnabled,outbound:em.j.outboundClicksEnabled,siteSearch:em.j.siteSearchEnabled,searchParam:em.j.searchQueryParameter}));
}
const ret=await get(`https://analyticsadmin.googleapis.com/v1beta/properties/${P}/dataRetentionSettings`);
console.log('■ 데이터 보관:', ret.status, ret.j.error?ret.j.error.message:JSON.stringify({eventRetention:ret.j.eventDataRetention}));
