/** Isolated physical-input multiplayer verification. No legacy authority. */
import {fixture} from '../packages/server-php/test/helpers/fixture.mjs';
import {runtimeRequest} from '../packages/server-php/runtime/client.mjs';
import {startWorldService} from '../packages/server-php/runtime/world-service.mjs';
import {randomBytes,createHash} from 'node:crypto';
import {mkdirSync,writeFileSync} from 'node:fs';
import net from 'node:net';
import assert from 'node:assert/strict';
import {ConstructionRuntime} from '../packages/gameplay-construction/src/ConstructionRuntime.js';
import {worldOptions} from '../examples/construction-world/world.js';
import {captureReconciliationFrames,captureContinuousQuotaInput} from './zge-bench01-reconciliation-frames.mjs';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const out=process.env.ZGE_EVIDENCE_DIR||'/tmp/zge-bench01/multiplayer/browser';mkdirSync(out,{recursive:true});
const browser=await chromium.launch({executablePath:process.env.CHROME_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
const results=[];
try{for(const clients of(process.env.ZGE_CLIENT_MATRIX||'2,4,8').split(',').map(Number)){console.log('Starting '+clients+' independent contexts');
 const f=await fixture({ZGE_CHECKPOINT_EVERY:'32'});let service;
 const row={clients,errors:[],scope:'independent authenticated browser contexts; physical keyboard and construction button; source-owned world only; short bounded functional run'};
 try{
  for(let i=0;i<clients;i++){
   const id='bench-'+i,token=randomBytes(24).toString('hex'),hash=createHash('sha256').update(token).digest('hex');f.identities[id]={token,worldId:'valley',playerId:id,role:'builder'};
   f.sql('INSERT INTO memberships VALUES(?,?,?,0)',[id,'valley','builder']);f.sql('INSERT INTO sessions VALUES(?,?,?,?,?)',[hash,id,'valley','builder',Math.floor(Date.now()/1000)+7200]);f.sql('INSERT INTO session_meta VALUES(?,?,?,0,1)',[hash,randomBytes(16).toString('hex'),Math.floor(Date.now()/1000)]);
  }
  if(process.env.ZGE_CAPTURE_FRAMES==='1'){const runtime=new ConstructionRuntime({...worldOptions,worldId:'valley',owner:'php-staging-server',inventory:{stone:100000}}),snapshot=JSON.stringify(runtime.snapshot()),digest=createHash('sha256').update(snapshot).digest('hex');f.sql('UPDATE worlds SET snapshot=? WHERE id=?',[snapshot,'valley']);f.sql('UPDATE world_integrity SET snapshot_hash=? WHERE world_id=?',[digest,'valley']);f.sql('UPDATE checkpoints SET snapshot=?,checksum=? WHERE world_id=? AND cursor=0',[snapshot,digest,'valley']);runtime.dispose();row.syntheticStartingSharedStone=100000;}
  const port=await new Promise(resolve=>{const s=net.createServer().listen(0,'127.0.0.1',()=>{const p=s.address().port;s.close(()=>resolve(p));});});
  service=await startWorldService({directory:f.directory,port,env:f.env});await service.waitUntilReady(30000);
  const contexts=[],pages=[];
  for(let i=0;i<clients;i++){
   const context=await browser.newContext({viewport:{width:1380,height:1050}}),page=await context.newPage();contexts.push(context);pages.push(page);page.on('pageerror',error=>row.errors.push(error.message));
   await page.goto('http://127.0.0.1:'+port+'/examples/construction-world/?server=1');await page.locator('#server-token').fill(f.identities['bench-'+i].token);await page.locator('#connect-server').click();await page.waitForFunction(()=>window.sourceWorld);
  }
  await Promise.all(pages.map(p=>p.evaluate(()=>constructionLab.restore())));
  const initial=await Promise.all(pages.map(p=>p.evaluate(()=>constructionLab.inspect().player)));
  assert.equal(new Set(initial.map(p=>p.id)).size,clients);
  // Each context gets genuine key down/up input and verifies its own authoritative displacement.
  for(let i=0;i<clients;i++){const p=pages[i];await p.locator('#world').focus();await p.keyboard.down('d');await p.waitForTimeout(160);await p.keyboard.up('d');await p.waitForTimeout(150);}
  await Promise.all(pages.map(p=>p.evaluate(()=>constructionLab.restore())));
  const moved=await Promise.all(pages.map(p=>p.evaluate(()=>constructionLab.inspect().player)));
  for(let i=0;i<clients;i++)assert.ok(moved[i].x>initial[i].x,'physical movement '+i);
  for(const[i,x]of[[0,2],[1,6]]){await pages[i].locator('#x').fill(String(x));await pages[i].locator('#place').click();await Promise.all(pages.map(p=>p.waitForFunction(n=>constructionLab.inspect().world.buildings.length===n,i+1)));}
  await Promise.all(pages.map(p=>p.evaluate(()=>constructionLab.restore())));
  const states=await Promise.all(pages.map(p=>p.evaluate(()=>constructionLab.inspect())));
  for(const s of states){assert.deepEqual(s.world,states[0].world);assert.equal(s.world.buildings.length,2);assert.equal(s.team.xp,25);assert.equal(s.players.length,clients);assert.equal(s.players.some(p=>'xp'in p||'inventory'in p),false);}
  assert.deepEqual(states.map(s=>s.player.xp),Array.from({length:clients},(_,i)=>i<2?14:0));
  const replay=await pages[0].evaluate(()=>constructionLab.replay());assert.equal(replay.deterministic,true);
  row.physicalDisplacements=moved.map((p,i)=>({id:p.id,dx:p.x-initial[i].x,dz:p.z-initial[i].z}));row.xp=states.map(s=>({id:s.player.id,xp:s.player.xp,rank:s.player.rank}));row.convergence=true;row.buildings=2;row.teamXp=25;row.privateProjection=true;row.deterministicReplay=true;
  const health=service.status();row.worldGeneration=health.world.generation;const runtimeHealth=await runtimeRequest({socketPath:f.directory+'/runtime.sock',keyPath:f.directory+'/runtime.key'},'health',{});row.workerCount=runtimeHealth.worlds.filter(w=>w.state==='ready').length;row.workerStarts=runtimeHealth.metrics.workerStarts;assert.equal(row.workerCount,1);row.screenshot='multiplayer-'+clients+'clients.png';await pages[0].screenshot({path:out+'/'+row.screenshot,fullPage:true});assert.deepEqual(row.errors,[]);if(process.env.ZGE_CAPTURE_FRAMES==='1')row.frameTrials=await captureReconciliationFrames(pages,out);if(process.env.ZGE_CAPTURE_SOAK==='1'){row.continuousInput=await captureContinuousQuotaInput(pages,out);const durable=JSON.parse(f.sql("SELECT snapshot FROM worlds WHERE id='valley'")[0].snapshot);row.continuousInput.durableSnapshot={revision:durable.revision,players:durable.players,construction:durable.construction};row.continuousInput.durablePositionRetention=row.continuousInput.finalPlayers.every(view=>{const actor=durable.players.find(p=>p.id===view.player.playerId);return actor&&actor.pose.x===view.player.x&&actor.pose.y===view.player.y&&actor.pose.z===view.player.z&&actor.xp===view.player.xp;});writeFileSync(out+'/continuous-input-60s.json',JSON.stringify(row.continuousInput,null,2));}row.status=(row.frameTrials?.some(t=>t.status!=='PASS')||row.continuousInput?.throttles>0)?'PASS_WITH_LIMITS':'PASS';await Promise.all(contexts.map(c=>c.close()));
 }catch(error){row.status='FAIL';row.failure=error.stack;throw error;}finally{results.push(row);writeFileSync(out+'/browser-results.json',JSON.stringify({schema:'zge.bench01.multiplayer-browser.v1',results},null,2));await service?.close();await f.close();}
}}
finally{await browser.close();}
console.log('Physical input, independent progression and exact convergent world: requested context counts complete');
