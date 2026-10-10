import test from 'node:test';
import assert from 'node:assert/strict';
import {validateSearch,searchControl} from '../app/cloud/search.js';
import {searchBatches} from '../scripts/search-batches.mjs';
test('search limits and scheduled times reject invalid or duplicate values',()=>{
 for(const n of [0,21,1.5,NaN,'5']) assert.throws(()=>validateSearch(n));
 for(const times of [['09:00'],['24:00'],['12:00','12:00'],[''],['01:00','02:00','03:00','04:00']]) assert.throws(()=>validateSearch(5,times));
 assert.deepEqual(validateSearch(20,['18:30','07:00']),{count:20,times:['07:00','18:30']});
});
test('larger searches split into stable validated batches including empty successful searches',()=>{
 const jobs=Array.from({length:17},(_,i)=>({title:String(i)}));
 const batch={runId:'search-123',summary:'Verified research',jobs};
 const parts=searchBatches(batch);
 assert.deepEqual(parts.map(p=>p.jobs.length),[5,5,5,2]);
 assert.deepEqual(parts.flatMap(p=>p.jobs),jobs);
 assert.deepEqual(parts,searchBatches(batch));
 assert.equal(searchBatches({...batch,jobs:[]}).length,1);
 assert.throws(()=>searchBatches({...batch,jobs:Array(21)}));
 assert.throws(()=>searchBatches({...batch,runId:'../bad'}));
});
test('search RPC retains request ID for safe retry and propagates server errors',async()=>{
 let called; const client={rpc:(name,args)=>{called={name,args};return {abortSignal:async()=>({data:{preferences:{},requests:[]}})};}};
 await searchControl(client,'request',{count:12,requestId:'same-id'});
 assert.equal(called.name,'jobpilot_search_control');assert.equal(called.args.p_request_id,'same-id');assert.equal(called.args.p_count,12);
 await assert.rejects(()=>searchControl({rpc:()=>({abortSignal:async()=>({error:{message:'Access denied'}})})}),/Access denied/);
});
