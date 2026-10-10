import fs from 'node:fs/promises';
const c=JSON.parse(await fs.readFile(process.argv[2],'utf8'));
for(const [name,key,method,body] of [
  ['no-key',null,'GET',null], ['read-key',c.readKey,'GET',null],
  ['read-cannot-write',c.readKey,'POST',{runId:'blocked-test',summary:'Must not save',jobs:[]}],
  ['invalid-body',c.writeKey,'POST',{jobs:[{}]}]
]) {
  const r=await fetch(c.endpoint,{method,headers:{...(key?{Authorization:`Bearer ${key}`} : {}),'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(20000)});
  const data=await r.json();
  const expected={'no-key':401,'read-key':200,'read-cannot-write':403,'invalid-body':400}[name];
  if(r.status!==expected) throw new Error(`${name}: expected ${expected}, got ${r.status}`);
  console.log(`${name}: ${r.status} PASS${name==='read-key'?` (${data.jobs.length} jobs)`:''}`);
}
