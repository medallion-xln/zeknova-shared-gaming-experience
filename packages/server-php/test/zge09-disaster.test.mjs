import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { supervisedFixture } from './helpers/supervised-fixture.mjs';
const evidence=[];
const hash=path=>createHash('sha256').update(readFileSync(path)).digest('hex');
function run(f,args,extra={}){const p=spawnSync('php',args,{env:{...f.env,...extra},encoding:'utf8',timeout:120000});return {code:p.status,signal:p.signal,...(p.status===0?JSON.parse(p.stdout):{}),reason:p.stderr.trim()};}
function asyncRun(f,args){return new Promise(resolve=>{const p=spawn('php',args,{env:f.env,stdio:['ignore','pipe','pipe']});let out='',err='';p.stdout.on('data',v=>out+=v);p.stderr.on('data',v=>err+=v);p.on('exit',(code,signal)=>resolve({code,signal,...(code===0?JSON.parse(out):{}),reason:err.trim()}));});}
const ops=(f,args)=>run(f,['packages/server-php/src/operations.php',...args]);
const recover=(f,extra={})=>run(f,['packages/server-php/src/recover.php','valley'],extra);
const rows=(f,table)=>f.sql('SELECT * FROM '+table+' ORDER BY rowid');
const economicTables=['worlds','world_integrity','events','event_integrity','commands','rewards','player_claims','checkpoints','recovery_audit'];
const capture=f=>Object.fromEntries(economicTables.map(t=>[t,rows(f,t)]));
async function populated(){const f=await supervisedFixture();const server=await f.start();await f.join(server,'alice');await f.join(server,'bob');for(const[player,id,x]of[['alice','a',2],['bob','b',6]]){const before=await f.send(server,player),r=await f.send(server,player,{command:{commandId:id,action:'place',id,type:'shelter',x,z:2,expectedRevision:before.revision}});assert.equal(r.result.ok,true);}return{f,server};}

test('consistent multiplayer hot backup and cold backup restore exact source identities into new private directories',async()=>{
 const {f,server}=await populated();try{
  const lower=rows(f,'commands').length;const pending=asyncRun(f,['packages/server-php/src/operations.php','backup',f.directory+'/hot']);let last;
  for(let i=0;i<16;i++){const before=await f.send(server,'alice');last=await f.send(server,'alice',{command:{commandId:'hot-'+i,action:'move',dx:i%2?-.03:.03,dz:0,expectedRevision:before.revision,expectedPlayerRevision:before.snapshot.player.revision}});assert.equal(last.status,200,last.reason);assert.equal(last.result.ok,true);}
  const hot=await pending;assert.equal(hot.ok,true,hot.reason);assert.ok(hot.records.commands>=lower&&hot.records.commands<=rows(f,'commands').length);assert.equal(hot.records.player_claims,2);assert.equal(hot.records.rewards,1);
  const rtoStart=performance.now(),restored=ops(f,['restore',f.directory+'/hot',f.directory+'/fresh-hot']);assert.equal(restored.ok,true,restored.reason);assert.equal(hash(f.directory+'/hot/world.sqlite'),hash(f.directory+'/fresh-hot/world.sqlite'));const old=f.env.ZGE_STAGING_DB;f.env.ZGE_STAGING_DB=f.directory+'/fresh-hot/world.sqlite';const hotReplay=recover(f);assert.equal(hotReplay.ok,true,hotReplay.reason);assert.equal(rows(f,'commands').length,hot.records.commands);f.env.ZGE_STAGING_DB=old;const rtoMs=performance.now()-rtoStart;
  await f.close();const source=capture(f),cold=ops(f,['backup',f.directory+'/cold']);assert.equal(cold.ok,true,cold.reason);assert.equal(ops(f,['restore',f.directory+'/cold',f.directory+'/fresh-cold']).ok,true);f.env.ZGE_STAGING_DB=f.directory+'/fresh-cold/world.sqlite';assert.deepEqual(capture(f),source);assert.equal(f.sql('PRAGMA integrity_check')[0].integrity_check,'ok');assert.equal(recover(f).ok,true);assert.equal(rows(f,'commands').length,source.commands.length);assert.equal(rows(f,'events').length,source.events.length);assert.equal(rows(f,'player_claims').length,2);assert.equal(rows(f,'rewards').length,1);
  evidence.push({scenario:'hot-cold-fresh-restore',hotMs:hot.ms,coldMs:cold.ms,restoreAndReplayMs:rtoMs,hotCommittedCommands:hot.records.commands,coldCommittedCommands:cold.records.commands,committedAfterHotSnapshot:cold.records.commands-hot.records.commands,rpoCommittedPrefix:true,sourceAndBackupBytesIdentical:true,coldIntegrity:'ok',personalClaims:2,teamRewards:1});
 }finally{await f.close();}
});

test('archive damage and contradictory claim or receipt data fail closed without rewriting any evidence',async()=>{
 const {f}=await populated();try{await f.close();
  const source=f.env.ZGE_STAGING_DB;const backup=ops(f,['backup',f.directory+'/baseline']);assert.equal(backup.ok,true,backup.reason);
  const damages=[['missing-archive-page',"DELETE FROM events WHERE world_id='valley' AND sequence=2"],['truncated-event-log',"UPDATE events SET payload=substr(payload,1,30) WHERE sequence=3 AND world_id='valley'"],['damaged-receipt',"UPDATE commands SET result='{}' WHERE command_id='b'"],['duplicate-personal-claim',"INSERT INTO player_claims VALUES('valley','bob','invented-duplicate','bogus')"],['missing-team-claim',"DELETE FROM rewards WHERE world_id='valley'"]];
  for(const [name,sql]of damages){const target=f.directory+'/'+name;assert.equal(ops(f,['restore',f.directory+'/baseline',target]).ok,true);f.env.ZGE_STAGING_DB=target+'/world.sqlite';f.sql(sql);const before=capture(f),result=recover(f);assert.notEqual(result.code,0,name);assert.deepEqual(capture(f),before,name+' wrote despite rejection');evidence.push({scenario:name,rejected:true,archivePreserved:true,partialRepair:false});f.env.ZGE_STAGING_DB=source;}
  // Physical duplicate primary keys are rejected at the durable SQL boundary.
  const duplicate=run(f,['-r',"require 'packages/server-php/src/bootstrap.php';try{query(db(),\"INSERT INTO player_claims SELECT * FROM player_claims LIMIT 1\");exit(2);}catch(PDOException $e){echo json_encode(['sqliteCode'=>$e->errorInfo[1]]);}"]);
  assert.equal(duplicate.sqliteCode,19);evidence.push({scenario:'duplicate-claim-primary-key',sqliteCode:19,rejected:true});
 }finally{await f.close();}
});

test('corrupt derived checkpoints repair from complete actor archive; killed repair rolls back all audit and checkpoint writes',async()=>{
 const {f}=await populated();try{await f.close();const exact=rows(f,'worlds')[0],receipts=rows(f,'commands'),events=rows(f,'events');f.sql("UPDATE checkpoints SET snapshot='{}',checksum='damaged' WHERE world_id='valley'");f.sql("UPDATE worlds SET snapshot='{}' WHERE id='valley'");const damaged=capture(f);
  const killed=recover(f,{ZGE_RECOVERY_FAULT:'before-commit'});assert.equal(killed.signal,'SIGKILL');assert.deepEqual(capture(f),damaged);const started=performance.now(),repaired=recover(f);assert.equal(repaired.ok,true,repaired.reason);assert.deepEqual(rows(f,'commands'),receipts);assert.deepEqual(rows(f,'events'),events);assert.equal(rows(f,'worlds')[0].revision,exact.revision);assert.equal(rows(f,'worlds')[0].cursor,exact.cursor);assert.equal(rows(f,'recovery_audit').length,1);assert.equal(rows(f,'recovery_audit')[0].previous_snapshot,'{}');assert.equal(f.sql('PRAGMA integrity_check')[0].integrity_check,'ok');evidence.push({scenario:'corrupt-checkpoint-interrupted-recovery',killedBeforeCommit:true,partialRepair:false,auditPreservesDamagedSnapshot:true,recoveryMs:performance.now()-started,commands:receipts.length,events:events.length});
 }finally{await f.close();}
});

test('SQLite write lock contention times out explicitly then recovery succeeds after lock ownership ends',async()=>{
 const {f}=await populated();let locker;try{await f.close();const before=capture(f);locker=spawn('php',['-r',"require 'packages/server-php/src/bootstrap.php';$d=db();$d->exec('BEGIN IMMEDIATE');echo 'locked';fflush(STDOUT);usleep(2500000);$d->exec('ROLLBACK');"],{env:f.env,stdio:['ignore','pipe','ignore']});await new Promise(resolve=>locker.stdout.once('data',resolve));const busy=run(f,['-r',"require 'packages/server-php/src/bootstrap.php';$d=db();$d->exec('PRAGMA busy_timeout=80');$s=hrtime(true);try{$d->exec('BEGIN IMMEDIATE');exit(2);}catch(PDOException $e){echo json_encode(['sqliteCode'=>$e->errorInfo[1],'waitMs'=>(hrtime(true)-$s)/1e6]);}"]);assert.equal(busy.sqliteCode,5);assert.ok(busy.waitMs>=60);await new Promise(resolve=>locker.exitCode!==null?resolve():locker.once('exit',resolve));assert.deepEqual(capture(f),before);const recovered=recover(f);assert.equal(recovered.ok,true,recovered.reason);evidence.push({scenario:'sqlite-busy-locked',sqliteCode:5,measuredWaitMs:busy.waitMs,partialEffects:false,recoveryMs:recovered.ms});
 }finally{locker?.kill('SIGTERM');await f.close();}
});

test.after(()=>{const directory=process.env.ZGE_EVIDENCE_DIR||'/tmp/zge09-evidence/operations';mkdirSync(directory,{recursive:true,mode:0o700});writeFileSync(directory+'/disaster-recovery.json',JSON.stringify({schema:'zge.disaster-recovery.v1',scenarios:evidence,exhaustionEvidence:'zge08-operations.test.mjs actual SQLITE_FULL allocation exhaustion; separate explicit disposable-volume drill'},null,2));});
