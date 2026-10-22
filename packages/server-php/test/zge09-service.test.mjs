import test from 'node:test';import assert from 'node:assert/strict';import{spawn}from'node:child_process';import net from'node:net';
import{mkdtempSync,readFileSync,writeFileSync,mkdirSync,renameSync,rmdirSync,unlinkSync,statSync,existsSync}from'node:fs';
import{startWorldService,serviceRequest}from'../runtime/world-service.mjs';import{runtimeRequest}from'../runtime/client.mjs';
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const wait=async(predicate,timeout=30000)=>{const end=Date.now()+timeout;while(Date.now()<end){const value=await predicate();if(value)return value;await delay(25);}throw Error('condition deadline exceeded');};
const port=()=>new Promise(resolve=>{const s=net.createServer().listen(0,'127.0.0.1',()=>{const value=s.address().port;s.close(()=>resolve(value));});});
const evidence=(name,data)=>{const directory=(process.env.ZGE_EVIDENCE_DIR??'/tmp/zge09-evidence')+'/service';mkdirSync(directory,{recursive:true});writeFileSync(directory+'/'+name+'.json',JSON.stringify(data,null,2));};
async function fixture(options={}){const directory=mkdtempSync('/tmp/zge09-service-'),service=await startWorldService({directory,port:await port(),healthIntervalMs:2000,healthFailures:1,...options,env:{ZGE_STAGING_FAULTS:'1',ZGE_RUNTIME_FAULTS:'1'}});await service.waitUntilReady();
 const identity=JSON.parse(readFileSync(directory+'/identities.json')).alice;
 const send=async(body={},fault=null)=>{const response=await fetch('http://127.0.0.1:'+service.status().port+'/staging/world',{method:'POST',headers:{'content-type':'application/json',authorization:'Bearer '+identity.token,...(fault?{'X-ZGE-Fault':fault}:{})},body:JSON.stringify({worldId:'valley',...body}),signal:AbortSignal.timeout(20000)});return{status:response.status,...await response.json()};};
 const runtime=(op,input)=>runtimeRequest({socketPath:directory+'/runtime.sock',keyPath:directory+'/runtime.key'},op,input);
 return{directory,service,send,runtime};}
test('continuous service automatically recovers owned launcher SIGKILL with fenced durable retry, worker restart and competing-owner denial', {timeout:60000},async()=>{
 const f=await fixture();try{
  const joined=await f.send({command:{commandId:'join',action:'join',expectedRevision:0}});assert.equal(joined.result.ok,true);
  const command={commandId:'lost-before-service-restart',action:'place',id:'preserved',type:'shelter',x:2,z:2,expectedRevision:joined.revision};assert.equal((await f.send({command},'lose-ack')).status,503);
  await assert.rejects(startWorldService({directory:f.directory,port:f.service.status().port}),/service already active/);
  const competing=spawn(process.execPath,['scripts/zge08-server.mjs'],{env:{...process.env,ZGE_STAGING_DIR:f.directory,ZGE_STAGING_PORT:String(f.service.status().port)},stdio:'ignore'});const competingExit=await new Promise(resolve=>competing.once('exit',resolve));assert.notEqual(competingExit,0);assert.equal(f.service.status().state,'ready');
  const old=f.service.status(),began=performance.now();process.kill(old.launcherPid,'SIGKILL');
  const after=await wait(()=>{const s=f.service.status();return s.state==='ready'&&s.launcherPid!==old.launcherPid&&s.world.generation>joined.runtime.generation?s:null;});
  const recoveredMs=performance.now()-began,retry=await f.send({command});assert.equal(retry.duplicate,true);assert.equal(retry.world.inventory.stone,8);assert.equal(retry.snapshot.player.xp,14);assert.equal(retry.world.buildings.length,1);
  await f.runtime('fault',{action:'crash-worker',worldId:'valley'});const worker=await wait(async()=>{try{const h=await f.runtime('health');return h.worlds[0].state==='ready'&&h.worlds[0].generation>after.world.generation?h.worlds[0]:null;}catch{return null;}});
  assert.equal(f.service.status().launcherPid,after.launcherPid,'worker restart belongs to inner supervisor');assert.equal((await f.send({command})).duplicate,true);
  const audit=readFileSync(f.directory+'/service-audit.ndjson','utf8').trim().split('\n').map(JSON.parse);assert.ok(audit.some(e=>e.event==='launcher-exit'&&e.signal==='SIGKILL'));assert.ok(audit.filter(e=>e.event==='launcher-ready').length===2);
  evidence('automatic-launcher-recovery',{recoveryMs:recoveredMs,oldGeneration:joined.runtime.generation,newGeneration:after.world.generation,workerGeneration:worker.generation,duplicate:true,personalXP:14,teamXP:0,stone:8,buildings:1,restarts:after.restarts,audit});
 }finally{await f.service.close();}
});
test('service rejects missing and substituted established database across gateway reads and lease heartbeats, then resumes original durable inode', {timeout:45000},async()=>{
 const f=await fixture({healthIntervalMs:5000,restartBaseMs:250,restartMaxMs:500});let moved=false;try{
  const joined=await f.send({command:{commandId:'join-db',action:'join',expectedRevision:0}}),command={commandId:'db-original-receipt',action:'place',id:'db-original-building',type:'shelter',x:2,z:2,expectedRevision:joined.revision};assert.equal((await f.send({command},'lose-ack')).status,503);
  const db=f.directory+'/world.sqlite',saved=f.directory+'/world.saved',identity=f.service.status().databaseIdentity;renameSync(db,saved);moved=true;
  assert.equal((await f.send()).status,503);assert.equal(existsSync(db),false,'gateway must not recreate a missing established database');
  await delay(2400);assert.equal(existsSync(db),false,'lease heartbeat must not recreate a missing established database');
  writeFileSync(db,'',{mode:0o600});assert.notEqual(String(statSync(db).ino),identity.ino);assert.equal((await f.send()).status,503,'gateway rejects a substituted private empty database');
  await wait(()=>f.service.status().lastFailure==='database-unavailable'&&f.service.status().state==='backoff');const attempts=f.service.status().launches;await delay(600);assert.equal(f.service.status().launches,attempts,'launcher setup cannot initialize a replacement inode');assert.equal(statSync(db).size,0,'replacement stays empty');
  unlinkSync(db);renameSync(saved,db);moved=false;const recovered=await wait(()=>{const s=f.service.status();return s.state==='ready'?s:null;});assert.deepEqual(recovered.databaseIdentity,identity);const retry=await f.send({command});assert.equal(retry.duplicate,true);assert.equal(retry.snapshot.player.xp,14);assert.equal(retry.world.buildings.length,1);assert.equal(retry.world.inventory.stone,8);assert.ok(recovered.world.generation>joined.runtime.generation);
  evidence('database-availability',{restarts:recovered.restarts,revision:retry.revision,personalXP:14,duplicate:true,missingFileNotRecreated:true,emptyReplacementNotInitialized:true,originalInodeRestored:true,databaseIdentity:identity,audit:readFileSync(f.directory+'/service-audit.ndjson','utf8').trim().split('\n').map(JSON.parse)});
 }finally{await f.service.close();if(moved){if(existsSync(f.directory+'/world.sqlite'))unlinkSync(f.directory+'/world.sqlite');renameSync(f.directory+'/world.saved',f.directory+'/world.sqlite');}}
});
test('real repeated launcher crashes stop at restart ceiling and remain operator inspectable', {timeout:20000},async()=>{
 const f=await fixture({restartLimit:2,restartBaseMs:40,restartMaxMs:100,restartWindowMs:60000});try{
  const killed=new Set();await wait(()=>{const state=f.service.status();if(state.launcherPid&&!killed.has(state.launcherPid)){killed.add(state.launcherPid);process.kill(state.launcherPid,'SIGKILL');}return state.state==='failed';},15000);
  const status=await serviceRequest(f.directory);assert.equal(status.state,'failed');assert.equal(status.restarts,2);assert.equal(status.launches,3);assert.equal(status.launcherPid,null);await delay(300);assert.equal(f.service.status().launches,3);
  evidence('restart-ceiling',{launches:status.launches,restarts:status.restarts,state:status.state,audit:readFileSync(f.directory+'/service-audit.ndjson','utf8').trim().split('\n').map(JSON.parse)});
 }finally{await f.service.close();}
});
test('operator control stops only owned service, flushes private audit and supports explicit restart', {timeout:20000},async()=>{
 const f=await fixture();let second;try{
  const before=await serviceRequest(f.directory);assert.equal(before.state,'ready');assert.equal(statSync(f.directory+'/service-audit.ndjson').mode&0o077,0);assert.equal(statSync(f.directory+'/service.sock').mode&0o077,0);await serviceRequest(f.directory,'stop');await f.service.closed;assert.equal(existsSync(f.directory+'/service.lock'),false);assert.equal(existsSync(f.directory+'/service.sock'),false);
  const audit=readFileSync(f.directory+'/service-audit.ndjson','utf8').trim().split('\n').map(JSON.parse);assert.equal(audit.at(-1).event,'service-stopped');assert.equal(f.service.status().state,'stopped');await assert.rejects(fetch('http://127.0.0.1:'+before.port+'/not-found'));
  second=await startWorldService({directory:f.directory,port:before.port});const restarted=await second.waitUntilReady();assert.ok(restarted.world.generation>before.world.generation);assert.equal(restarted.knownDatabase,true);await second.close();writeFileSync(f.directory+'/service-audit.ndjson',JSON.stringify({event:'launcher-ready'})+'\n',{flag:'a',mode:0o600});await assert.rejects(startWorldService({directory:f.directory,port:before.port}),/database identity requires operator review/);evidence('operator-shutdown',{stopped:true,auditFlushed:true,privateFiles:true,explicitRestartGeneration:restarted.world.generation});
 }finally{await f.service.close();await second?.close();}
});
test('top service parent death shuts down owned launcher and permits explicit stale-control recovery', {timeout:25000},async()=>{
 const directory=mkdtempSync('/tmp/zge09-parent-'),gatewayPort=await port();let child,second;
 try{
  child=spawn(process.execPath,['scripts/zge09-service.mjs','start'],{env:{...process.env,ZGE_STAGING_DIR:directory,ZGE_STAGING_PORT:String(gatewayPort)},stdio:'ignore'});
  const before=await wait(async()=>{try{const s=await serviceRequest(directory);return s.state==='ready'?s:null;}catch{return null;}});child.kill('SIGKILL');await new Promise(resolve=>child.once('exit',resolve));
  await wait(async()=>{try{await fetch('http://127.0.0.1:'+gatewayPort+'/not-found');return false;}catch{return true;}});second=await startWorldService({directory,port:gatewayPort});const after=await second.waitUntilReady();assert.ok(after.world.generation>before.world.generation);assert.equal(after.knownDatabase,true);evidence('service-parent-ownership',{ownedGatewayStopped:true,staleControlRecovered:true,newGeneration:after.world.generation,automaticOuterParentRestart:false});
 }finally{if(child&&child.exitCode===null&&!child.signalCode){child.kill('SIGTERM');await new Promise(resolve=>child.once('exit',resolve));}await second?.close();}
});
test('lost heartbeat retires old owner and outer service restores a higher fenced generation automatically', {timeout:30000},async()=>{
 const f=await fixture({healthIntervalMs:1000});try{
  const joined=await f.send({command:{commandId:'heartbeat-join',action:'join',expectedRevision:0}}),before=f.service.status(),began=performance.now();await f.runtime('fault',{action:'pause-heartbeat'});
  const after=await wait(()=>{const s=f.service.status();return s.state==='ready'&&s.launcherPid!==before.launcherPid&&s.world.generation>before.world.generation?s:null;},25000);
  const state=await f.send();assert.equal(state.revision,joined.revision);assert.equal(state.snapshot.player.xp,0);evidence('heartbeat-recovery',{recoveryMs:performance.now()-began,oldGeneration:before.world.generation,newGeneration:after.world.generation,oldOwnerRetired:true,exactPlayerProgress:true,audit:readFileSync(f.directory+'/service-audit.ndjson','utf8').trim().split('\n').map(JSON.parse)});
 }finally{await f.service.close();}
});
test('automatic stack restart after real gateway death before and after COMMIT preserves cost, personal and team receipt semantics', {timeout:30000},async()=>{
 const f=await fixture();try{
  const joined=await f.send({command:{commandId:'commit-join',action:'join',expectedRevision:0}});let before=f.service.status();const first={commandId:'before-commit-intent',action:'place',id:'first-building',type:'shelter',x:2,z:2,expectedRevision:joined.revision};
  let began=performance.now();await assert.rejects(f.send({command:first},'crash-before-commit'));await wait(()=>{const s=f.service.status();return s.state==='ready'&&s.launcherPid!==before.launcherPid;});const beforeRecoveryMs=performance.now()-began;
  const rolledBack=await f.send();assert.equal(rolledBack.snapshot.player.xp,0);assert.equal(rolledBack.world.buildings.length,0);assert.equal(rolledBack.world.inventory.stone,12);const committed=await f.send({command:first});assert.equal(committed.duplicate,false);
  before=f.service.status();const second={commandId:'after-commit-intent',action:'place',id:'second-building',type:'shelter',x:6,z:2,expectedRevision:committed.revision};began=performance.now();await assert.rejects(f.send({command:second},'crash-after-commit'));await wait(()=>{const s=f.service.status();return s.state==='ready'&&s.launcherPid!==before.launcherPid;});const afterRecoveryMs=performance.now()-began;
  const retry=await f.send({command:second});assert.equal(retry.duplicate,true);assert.equal(retry.snapshot.player.xp,28);assert.equal(retry.snapshot.team.xp,25);assert.equal(retry.world.buildings.length,2);assert.equal(retry.world.inventory.stone,4);assert.equal((await f.send({command:first})).duplicate,true);
  evidence('automatic-commit-recovery',{beforeRecoveryMs,afterRecoveryMs,preCommitPartialEffects:0,postCommitDuplicate:true,personalXP:28,teamXP:25,stone:4,buildings:2});
 }finally{await f.service.close();}
});
