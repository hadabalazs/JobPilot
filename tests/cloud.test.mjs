import test from 'node:test';
import assert from 'node:assert/strict';
import { createHandler } from '../supabase/functions/jobpilot-inbox/handler.js';
import { canonicalJobUrl } from '../app/intake/jobUrl.js';
import { prepareJobImport } from '../app/intake/jobImport.js';
import { DEFAULT_ENDPOINT, getFeed, syncFeed, unseenJobs, validateConnection } from '../app/cloud/client.js';
const key='jp_'+'a'.repeat(43), config={endpoint:DEFAULT_ENDPOINT, readKey:key};
const job={title:'Delivery Manager',company:'Example',location:'Dubai',sourceUrl:'https://ae.linkedin.com/jobs/view/delivery-at-example-123456',description:'Responsibilities: lead delivery across several banking software teams, coordinate dependencies and stakeholders, and manage releases.',notes:'Fit notes'};
const batch={runId:'2026-10-10',summary:'One match',jobs:[job]};
const req=(method='POST',value=batch,token=key)=>new Request(DEFAULT_ENDPOINT,{method,headers:{Authorization:token?'Bearer '+token:'','Content-Type':'application/json'},body:method==='POST'?JSON.stringify(value):undefined});
const handler=(rpc)=>createHandler({rpc,canonicalJobUrl,prepareJobImport});

test('unauthenticated calls cannot touch the database',async()=>{
  let called=false;const h=handler(async()=>{called=true;});assert.equal((await h(req('GET',null,null))).status,401);assert.equal(called,false);
});
test('read keys can retrieve but cannot publish',async()=>{
  const h=handler(async n=>n==='jobpilot_authorize'?'read':{jobs:[]});
  assert.equal((await h(req('GET'))).status,200);assert.equal((await h(req())).status,403);
});
test('valid publisher calls carry canonical keys and discard injected fields',async()=>{
  let written;const h=handler(async(n,p)=>{if(n==='jobpilot_authorize')return 'write';written=p;return{added:1};});
  assert.equal((await h(req('POST',{...batch,jobs:[{...job,status:'applied',apiKey:'secret',id:'fake'}]}))).status,200);
  assert.equal(written.p_jobs[0].job_key,'https://linkedin.com/jobs/view/123456');
  assert.equal(written.p_jobs[0].payload.status,undefined);assert.equal(written.p_jobs[0].payload.apiKey,undefined);
});
test('invalid, oversized and six-job batches never import',async()=>{
  let imports=0;const h=handler(async n=>{if(n==='jobpilot_authorize')return 'write';imports++;});
  for(const b of [{...batch,jobs:[{}]},{...batch,jobs:Array(6).fill(job)},{...batch,summary:'x'.repeat(400001)},null])
    assert.ok([400,413].includes((await h(req('POST',b))).status));
  assert.equal(imports,0);
});
test('empty successful searches can be recorded and conflicting retries are explicit',async()=>{
  let payload;const h=handler(async(n,p)=>{if(n==='jobpilot_authorize')return 'write';payload=p;return{added:0};});
  assert.equal((await h(req('POST',{...batch,jobs:[]}))).status,200);assert.deepEqual(payload.p_jobs,[]);
  const conflict=handler(async n=>{if(n==='jobpilot_authorize')return 'write';throw{code:'23505'};});assert.equal((await conflict(req())).status,409);
});
test('connection rejects other hosts and malformed keys',()=>{
  assert.throws(()=>validateConnection({...config,endpoint:'https://evil.example'}));assert.throws(()=>validateConnection({...config,readKey:'bad'}));
});
test('feed validates ordering and descriptions before import',async()=>{
  await assert.rejects(()=>getFeed(config,'10',async()=>Response.json({jobs:[{id:'9',job}]})));
  await assert.rejects(()=>getFeed(config,'0',async()=>Response.json({jobs:[{id:'1',job:{...job,description:''}}]})));
});
test('existing applied and archived jobs are deduplicated by URL and role',()=>{
  assert.equal(unseenJobs([{job}], [{...job,sourceUrl:'https://linkedin.com/jobs/view/123456',status:'applied'}]).length,0);
  assert.equal(unseenJobs([{job}], [{...job,sourceUrl:'https://example.com/different',archived:1}]).length,0);
});
test('failed local writes do not advance sync progress',async()=>{
  let saved=false;
  await assert.rejects(()=>syncFeed({config,getState:async()=>null,saveState:async()=>{saved=true;},loadJobs:async()=>[],importJobs:async()=>{throw Error('disk full');},fetchImpl:async()=>Response.json({jobs:[{id:'1',job}],latestRun:null})}));
  assert.equal(saved,false);
});
test('retry after a checkpoint failure does not duplicate imported jobs',async()=>{
  let local=[],state=null,writes=0,fail=true;
  const options={config,getState:async()=>state,saveState:async s=>{if(fail)throw Error('checkpoint');state=s;},loadJobs:async()=>local,importJobs:async rows=>{writes++;local.push(...rows);return{added:rows.length};},fetchImpl:async()=>Response.json({jobs:[{id:'1',job}],latestRun:{summary:'one'}})};
  await assert.rejects(()=>syncFeed(options));fail=false;await syncFeed(options);
  assert.equal(writes,1);assert.equal(state.cursor,'1');assert.equal(local.length,1);
});
