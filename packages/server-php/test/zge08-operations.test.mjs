import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, existsSync, mkdirSync, chmodSync, copyFileSync, statSync, readdirSync } from 'node:fs';
import { fixture, place } from './helpers/fixture.mjs';
const evidence = [];
const digest = path => createHash('sha256').update(readFileSync(path)).digest('hex');
function operation(f, args, extra = {}) {
 const r = spawnSync('php', ['packages/server-php/src/operations.php', ...args], { env: { ...f.env, ...extra }, encoding: 'utf8', timeout: 120000 });
 return { code: r.status, signal: r.signal, reason: r.stderr.trim(), ...(r.status === 0 ? JSON.parse(r.stdout) : {}) };
}
function cloneBundle(source, target) { mkdirSync(target, {mode:0o700}); for (const file of ['manifest.json','world.sqlite']) { copyFileSync(source+'/'+file,target+'/'+file); chmodSync(target+'/'+file,0o600); } }
function rewriteManifest(directory, change) { const path=directory+'/manifest.json', manifest=JSON.parse(readFileSync(path)); change(manifest); writeFileSync(path,JSON.stringify(manifest),{mode:0o600}); }
function php(f, script, input) { const r=spawnSync('php',['-r',script],{env:f.env,encoding:'utf8',input:JSON.stringify(input),timeout:120000});assert.equal(r.status,0,'operational fixture PHP rejected');return JSON.parse(r.stdout); }

test('consistent SQLite backup and isolated restore retain complete archives, unknown fields and authenticated state', async () => {
 const f=await fixture();try {
  const server=await f.start();await f.send(server,'alice',{command:place('first')});await f.send(server,'bob',{command:place('completion',6,2,1)});
  f.sql('CREATE TABLE operator_extension(id INTEGER PRIMARY KEY, opaque BLOB NOT NULL, metadata TEXT NOT NULL)');f.sql("INSERT INTO operator_extension VALUES(1,x'00ff1a7f',?)",['{"future":{"unrecognized":true}}']);
  const before=await f.send(server), archive=f.sql('SELECT * FROM events ORDER BY world_id,sequence'), receipts=f.sql('SELECT * FROM commands ORDER BY rowid');
  const backup=operation(f,['backup',f.directory+'/backup']);assert.equal(backup.ok,true,backup.reason);assert.equal(backup.records.commands,2);assert.equal(backup.records.rewards,1);assert.equal(backup.records.operator_extension,1);
  const sourceDigest=digest(f.directory+'/backup/world.sqlite');assert.equal(statSync(f.directory+'/backup').mode&0o077,0);assert.equal(statSync(f.directory+'/backup/world.sqlite').mode&0o077,0);
  const restored=operation(f,['restore',f.directory+'/backup',f.directory+'/restored']);assert.equal(restored.ok,true,restored.reason);assert.equal(digest(f.directory+'/restored/world.sqlite'),sourceDigest);assert.equal(digest(f.directory+'/backup/world.sqlite'),sourceDigest);
  f.env.ZGE_STAGING_DB=f.directory+'/restored/world.sqlite';const isolated=await f.start(), after=await f.send(isolated);assert.deepEqual(after.world,before.world);assert.deepEqual(f.sql('SELECT * FROM events ORDER BY world_id,sequence'),archive);assert.deepEqual(f.sql('SELECT * FROM commands ORDER BY rowid'),receipts);assert.deepEqual(f.sql('SELECT hex(opaque) AS opaque, metadata FROM operator_extension'),[{opaque:'00FF1A7F',metadata:'{"future":{"unrecognized":true}}'}]);assert.equal(f.sql('SELECT * FROM recovery_audit').length,0);
  const retry=await f.send(isolated,'bob',{command:place('completion',6,2,1)});assert.equal(retry.duplicate,true);assert.equal(retry.snapshot.player.xp,25);assert.equal(f.sql('SELECT * FROM rewards').length,1);
  evidence.push({scenario:'consistent-backup-isolated-restore',backupMs:backup.ms,restoreMs:restored.ms,bytes:backup.bytes,archiveEvents:archive.length,receipts:receipts.length,rewards:1,unknownBlobPreserved:true,unchangedBackup:true});
 } finally { await f.close(); }
});

test('operations refuse existing, public and symlinked targets and reject incomplete, corrupt and incompatible bundles', async () => {
 const f=await fixture();try {
  const backup=f.directory+'/backup';assert.equal(operation(f,['backup',backup]).ok,true);
  const original=digest(backup+'/world.sqlite');assert.notEqual(operation(f,['backup',backup]).code,0);assert.equal(digest(backup+'/world.sqlite'),original);
  mkdirSync(f.directory+'/empty',{mode:0o700});assert.notEqual(operation(f,['restore',backup,f.directory+'/empty']).code,0);
  mkdirSync(f.directory+'/public',{mode:0o755});chmodSync(f.directory+'/public',0o755);assert.notEqual(operation(f,['backup',f.directory+'/public/unsafe']).code,0);
  mkdirSync(f.directory+'/incomplete',{mode:0o700});copyFileSync(backup+'/world.sqlite',f.directory+'/incomplete/world.sqlite');chmodSync(f.directory+'/incomplete/world.sqlite',0o600);assert.notEqual(operation(f,['restore',f.directory+'/incomplete',f.directory+'/no-incomplete']).code,0);assert.equal(existsSync(f.directory+'/no-incomplete'),false);
  cloneBundle(backup,f.directory+'/corrupt');const data=readFileSync(f.directory+'/corrupt/world.sqlite');data[128]^=1;writeFileSync(f.directory+'/corrupt/world.sqlite',data);assert.match(operation(f,['restore',f.directory+'/corrupt',f.directory+'/no-corrupt']).reason,/backup-file-integrity-failed/);
  cloneBundle(backup,f.directory+'/incompatible');rewriteManifest(f.directory+'/incompatible',m=>m.schema='zge.staging.backup.v99');assert.match(operation(f,['restore',f.directory+'/incompatible',f.directory+'/no-schema']).reason,/backup-schema-incompatible/);
  cloneBundle(backup,f.directory+'/policy');rewriteManifest(f.directory+'/policy',m=>m.contentPolicy.digest='0'.repeat(64));assert.match(operation(f,['restore',f.directory+'/policy',f.directory+'/no-policy']).reason,/runtime-policy-incompatible/);
  cloneBundle(backup,f.directory+'/records');rewriteManifest(f.directory+'/records',m=>m.records.commands++);assert.match(operation(f,['restore',f.directory+'/records',f.directory+'/no-records']).reason,/backup-manifest-mismatch/);
  evidence.push({scenario:'bundle-boundaries',existingTargetDenied:true,incompleteDenied:true,corruptionDenied:true,schemaMismatchDenied:true,contentMismatchDenied:true,manifestMismatchDenied:true});
 } finally { await f.close(); }
});

test('killed backup and restore never publish a valid partial bundle or change the live world', async () => {
 const f=await fixture();try {
  const server=await f.start();await f.send(server,'alice',{command:place('first')});const before=await f.send(server);
  for (const phase of ['after-snapshot','before-publication']) { const target=f.directory+'/interrupted-'+phase,r=operation(f,['backup',target],{ZGE_OPERATIONS_FAULT:phase});assert.equal(r.signal,'SIGKILL');assert.equal(existsSync(target),false); }
  const backup=f.directory+'/complete';assert.equal(operation(f,['backup',backup]).ok,true);
  for(const phase of ['after-validation','before-publication']) {const target=f.directory+'/restore-'+phase,r=operation(f,['restore',backup,target],{ZGE_OPERATIONS_FAULT:phase});assert.equal(r.signal,'SIGKILL');assert.equal(existsSync(target),false);}
  const after=await f.send(server);assert.deepEqual(after.world,before.world);assert.equal(f.sql('SELECT * FROM commands').length,1);
  const leftovers=readdirSync(f.directory).filter(p=>p.startsWith('.zge-'));assert.equal(leftovers.length,4);for(const pending of leftovers)assert.equal(statSync(f.directory+'/'+pending).mode&0o077,0);
  evidence.push({scenario:'operation-process-death',faults:4,validPartialBundles:0,liveWorldUnchanged:true,privatePendingDirectories:leftovers.length});
 } finally { await f.close(); }
});

test('logical archive corruption is denied even after a file digest is recomputed', async () => {
 const f=await fixture();try {
  const server=await f.start();await f.send(server,'alice',{command:place('first')});const backup=f.directory+'/backup';assert.equal(operation(f,['backup',backup]).ok,true);
  const old=f.env.ZGE_STAGING_DB;f.env.ZGE_STAGING_DB=backup+'/world.sqlite';f.sql("UPDATE commands SET result='{}' WHERE world_id='valley'");f.env.ZGE_STAGING_DB=old;
  rewriteManifest(backup,m=>{m.database.sha256=digest(backup+'/world.sqlite');m.database.bytes=statSync(backup+'/world.sqlite').size;});assert.match(operation(f,['restore',backup,f.directory+'/denied']).reason,/receipt-result-invalid/);assert.equal(existsSync(f.directory+'/denied'),false);
  evidence.push({scenario:'logical-archive-corruption',rehashedBadReceiptDenied:true});
 } finally { await f.close(); }
});

test('actual SQLite SQLITE_FULL rolls back prepared cost, building, events, receipt and mission reward together', async () => {
 const f=await fixture();try {
  const server=await f.start();await f.send(server,'alice',{command:place('first')});const before=await f.send(server);const tables=['worlds','world_integrity','events','event_integrity','commands','rewards'];const baseline=Object.fromEntries(tables.map(t=>[t,f.sql('SELECT * FROM '+t+' ORDER BY rowid')]));
  const result=php(f,String.raw`
   require 'packages/server-php/src/bootstrap.php';$d=db();$row=query($d,"SELECT * FROM worlds WHERE id='valley'")->fetch(PDO::FETCH_ASSOC);
   $logical=(object)['commandId'=>'completion','action'=>'place','id'=>'b-completion','type'=>'shelter','x'=>6,'z'=>2,'expectedRevision'=>1];$dispatch=clone $logical;$dispatch->commandId=json_encode(['bob','completion']);
   $candidate=worker(['worldId'=>'valley','snapshot'=>json_decode($row['snapshot']),'command'=>$dispatch,'checkpointEvery'=>2]);if(!$candidate['result']['ok'])exit(2);
   $d->exec('CREATE TABLE disk_full_fixture(payload BLOB)');$pages=(int)query($d,'PRAGMA page_count')->fetchColumn();$limit=(int)query($d,'PRAGMA max_page_count='.($pages+32))->fetchColumn();$started=hrtime(true);$economicPrepared=false;$sqliteCode=null;
   try{$d->exec('BEGIN IMMEDIATE');$next=json_encode($candidate['snapshot'],JSON_THROW_ON_ERROR|JSON_PRESERVE_ZERO_FRACTION);$cursor=(int)$row['cursor']+count($candidate['events']);
    query($d,'UPDATE worlds SET snapshot=?,revision=?,cursor=? WHERE id=?',[$next,$candidate['snapshot']->revision,$cursor,'valley']);query($d,'UPDATE world_integrity SET snapshot_hash=?,cursor=? WHERE world_id=?',[hash('sha256',$next),$cursor,'valley']);
    foreach($candidate['events'] as $e){$payload=json_encode($e,JSON_THROW_ON_ERROR);query($d,'INSERT INTO events VALUES(?,?,?,?,?,?)',['valley',$e['sequence'],$e['id'],$e['transactionId'],$e['revision'],$payload]);query($d,'INSERT INTO event_integrity VALUES(?,?,?)',['valley',$e['sequence'],hash('sha256',$payload)]);if($e['type']==='MissionRewardApplied')query($d,'INSERT INTO rewards VALUES(?,?,?)',['valley',$e['rewardId'],$e['transactionId']]);}
    query($d,'INSERT INTO commands VALUES(?,?,?,?,?,?,?,?)',['valley','bob','completion',hash('sha256',canonical($logical)),$candidate['snapshot']->revision,1,json_encode($candidate['result']),json_encode($dispatch)]);$economicPrepared=true;
    $d->exec('INSERT INTO disk_full_fixture VALUES(zeroblob(16777216))');$d->exec('COMMIT');throw new RuntimeException('disk full was not reached');
   }catch(PDOException $e){$sqliteCode=$e->errorInfo[1]??null;try{$d->exec('ROLLBACK');}catch(Throwable $ignored){} }
   if($sqliteCode!==13)exit(3);echo json_encode(['sqliteCode'=>$sqliteCode,'economicPrepared'=>$economicPrepared,'pageLimit'=>$limit,'initialPages'=>$pages,'candidateRevision'=>$candidate['snapshot']->revision,'candidateXp'=>$candidate['snapshot']->player->xp,'candidateBuildings'=>count($candidate['snapshot']->construction->buildings??[]),'ms'=>(hrtime(true)-$started)/1e6]);
  `);
  assert.equal(result.sqliteCode,13);assert.equal(result.economicPrepared,true);assert.equal(result.candidateXp,25);for(const table of tables)assert.deepEqual(f.sql('SELECT * FROM '+table+' ORDER BY rowid'),baseline[table],table+' changed after SQLITE_FULL');assert.equal(f.sql('SELECT * FROM disk_full_fixture').length,0);
  const after=await f.send(server);assert.deepEqual(after.world,before.world);assert.equal(after.world.inventory.stone,8);assert.equal(after.world.buildings.length,1);assert.equal(after.snapshot.player.xp,0);
  const retry=await f.send(server,'bob',{command:place('completion',6,2,1)});assert.equal(retry.result.ok,true);assert.equal(retry.world.inventory.stone,4);assert.equal(retry.world.buildings.length,2);assert.equal(retry.snapshot.player.xp,25);assert.equal(f.sql('SELECT * FROM rewards').length,1);
  evidence.push({scenario:'sqlite-real-disk-exhaustion',scope:'PDO max_page_count transaction; actual gateway candidate, explicit SQL commit fixture, not filesystem-volume exhaustion',...result,partialEffects:0,retryRewards:1});
 } finally { await f.close(); }
});

test.after(()=>{const out=process.env.ZGE_EVIDENCE_DIR||'/tmp/zge08-evidence';mkdirSync(out,{recursive:true});writeFileSync(out+'/operations.json',JSON.stringify({schema:'zge.operations-certification.v1',scenarios:evidence},null,2));});
