// Keep each API request within the existing validated five-job limit.
import fs from 'node:fs/promises';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {searchBatches} from './search-batches.mjs';
const [connection,file] = process.argv.slice(2);
if(!connection || !file) throw new Error('Usage: node scripts/publish-search.mjs CONNECTION_FILE SEARCH_PACKAGE');
const batch=JSON.parse(await fs.readFile(file,'utf8'));
const batches=searchBatches(batch), receipts=[];
const publisher=fileURLToPath(new URL('./publish-shortlist.mjs',import.meta.url));
for(let i=0;i<batches.length;i++) {
  const part=path.resolve(file)+`.part${i+1}.json`, body=JSON.stringify(batches[i],null,2);
  try { await fs.writeFile(part,body,{flag:'wx'}); }
  catch(e) { if(e.code!=='EEXIST') throw e; if(await fs.readFile(part,'utf8')!==body) throw new Error('Existing search part differs. Keep the original package for exact retry.'); }
  const result=spawnSync(process.execPath,[publisher,connection,part],{encoding:'utf8'});
  if(result.status!==0) throw new Error(`Delivery stopped at part ${i+1}. Earlier receipts are retained; retry the exact package. ${result.stderr || ''}`);
  const receipt=JSON.parse(await fs.readFile(part+'.receipt.json','utf8'));
  if(receipt.runId!==batches[i].runId || !Number.isInteger(receipt.added) || !Number.isInteger(receipt.skipped)) throw new Error('Invalid part receipt');
  receipts.push(receipt);
}
const receipt={runId:batch.runId,added:receipts.reduce((n,r)=>n+r.added,0),skipped:receipts.reduce((n,r)=>n+r.skipped,0),parts:receipts,confirmedAt:new Date().toISOString()};
await fs.writeFile(path.resolve(file)+'.receipt.json',JSON.stringify(receipt,null,2));
console.log(JSON.stringify(receipt));
