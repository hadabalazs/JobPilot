import test from 'node:test';
import assert from 'node:assert/strict';
import { swipeDirection,matchingJob,reviewFeed,saveDecision } from '../app/cloud/review.js';
const row = {id:'10',revision:0,decision:'unseen',job:{title:'Delivery Lead',company:'Example',location:'Dubai',sourceUrl:'https://www.linkedin.com/jobs/view/1234567890'}};
const client = fn => ({rpc:(name,args)=>({abortSignal:()=>fn(name,args)})});
test('swipes distinguish deliberate horizontal movement from taps and vertical scrolling',()=>{
  assert.equal(swipeDirection(100,12),'keep'); assert.equal(swipeDirection(-100,2),'pass');
  assert.equal(swipeDirection(20,1),null); assert.equal(swipeDirection(100,110),null);
  assert.equal(swipeDirection(81,0,320),'keep');
});
test('review reuses existing jobs including archived/applied links without overwriting them',()=>{
  const local={...row.job,id:'existing',status:'applied',archived:1,sourceUrl:'https://ae.linkedin.com/jobs/view/delivery-lead-1234567890?trackingId=test'};
  assert.equal(matchingJob(row.job,[local]),local);
  assert.equal(matchingJob({...row.job,sourceUrl:'https://example.com/different',company:'EXAMPLE'},[local]),local);
  assert.equal(local.status,'applied');
});
test('paginated queue retains all decisions and string IDs',async()=>{
  let calls=0; const first=Array.from({length:100},(_,i)=>({...row,id:String(i+1)}));
  const feed=await reviewFeed(client((name,args)=>{assert.equal(name,'jobpilot_review_feed');calls++; return {data:{jobs:args.p_after==='0'?first:[{...row,id:'101',decision:'keep'}],latestRun:null}};}));
  assert.equal(calls,2);assert.equal(feed.jobs.length,101);assert.equal(feed.jobs[100].decision,'keep');
});
test('feed rejects malformed order and unauthorized membership',async()=>{
  await assert.rejects(reviewFeed(client(()=>({data:{jobs:[row,row]}}))),/order/);
  await assert.rejects(reviewFeed(client(()=>({error:{code:'42501'}}))),/access/);
});
test('decision sends only job, choice, revision and retry identity, not user identity',async()=>{
  const next=await saveDecision(client((name,args)=>{
    assert.equal(name,'jobpilot_decide');assert.deepEqual(args,{p_job_id:'10',p_decision:'keep',p_revision:0,p_mutation_id:'mutation'});
    return {data:{id:'10',decision:'keep',revision:1}};
  }),row,'keep','mutation');
  assert.equal(next.revision,1); assert.equal(row.decision,'unseen');
});
test('stale devices must refresh; network failures never pretend to save',async()=>{
  await assert.rejects(saveDecision(client(()=>({error:{code:'40001'}})),row,'pass','id'),/another device/);
  await assert.rejects(saveDecision(client(()=>({error:{message:'failed fetch'}})),row,'keep','id'),/Could not confirm/);
  await assert.rejects(saveDecision(client(()=>({data:{...row}})),row,'keep','id'),/confirm/);
});
