// Explicit, developer-invoked destructive drill, confined to one owned 32MiB
// image. Never run against an existing path or the development database.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, chmodSync, copyFileSync, writeFileSync, openSync, writeSync, closeSync, ftruncateSync, unlinkSync, statSync } from 'node:fs';
import { supervisedFixture } from '../packages/server-php/test/helpers/supervised-fixture.mjs';
const evidenceDir=process.env.ZGE_EVIDENCE_DIR||'/tmp/zge09-evidence/operations';mkdirSync(evidenceDir,{recursive:true,mode:0o700});
if(process.env.ZGE_DISPOSABLE_VOLUME_DRILL!=='1')throw Error('Explicit ZGE_DISPOSABLE_VOLUME_DRILL=1 required');
const directory=mkdtempSync('/tmp/zge09-volume-'),volume=directory+'/volume',image=directory+'/disposable.dmg';mkdirSync(volume,{mode:0o700});
const record={schema:'zge.disposable-volume.v1',scope:'owned 32MiB HFS+ image, actual ENOSPC and SQLITE_FULL, direct economic candidate transaction; not whole-machine power-loss certification',status:'STARTED',imageBytes:32*1024*1024};
let mounted=false,f;
function hdi(args){const r=spawnSync('/usr/bin/hdiutil',args,{encoding:'utf8',timeout:45000});if(r.status!==0)throw Error('isolated-image-'+args[0]+'-failed');return r;}
function php(code,env){const r=spawnSync('php',['-r',code],{env,encoding:'utf8',timeout:120000});assert.equal(r.status,0,'disposable-volume PHP fixture rejected');return JSON.parse(r.stdout);}
try{
 if(process.platform!=='darwin'){record.status='UNAVAILABLE';record.reason='macOS hdiutil required';}
 else{
  hdi(['create','-size','32m','-fs','HFS+','-volname','ZGE09Disposable',image]);chmodSync(image,0o600);hdi(['attach','-nobrowse','-owners','on','-mountpoint',volume,image]);mounted=true;chmodSync(volume,0o700);
  f=await supervisedFixture();const server=await f.start();await f.join(server,'alice');await f.join(server,'bob');const before=await f.send(server,'alice');const first=await f.send(server,'alice',{command:{commandId:'first',action:'place',id:'first',type:'shelter',x:2,z:2,expectedRevision:before.revision}});assert.equal(first.result.ok,true);await f.close();
  const backup=spawnSync('php',['packages/server-php/src/operations.php','backup',f.directory+'/backup'],{env:f.env,encoding:'utf8',timeout:120000});assert.equal(backup.status,0,'disposable-volume backup preparation failed');copyFileSync(f.directory+'/backup/world.sqlite',volume+'/world.sqlite');chmodSync(volume+'/world.sqlite',0o600);const env={...f.env,ZGE_STAGING_DB:volume+'/world.sqlite'};
  const tables=['worlds','world_integrity','commands','events','event_integrity','player_claims','rewards','checkpoints'];
  const capture=()=>php("require 'packages/server-php/src/bootstrap.php';$d=db();$out=[];foreach("+JSON.stringify(tables)+" as $t)$out[$t]=query($d,'SELECT * FROM '.$t.' ORDER BY rowid')->fetchAll(PDO::FETCH_ASSOC);echo json_encode($out);",env);
  const initial=capture();php("require 'packages/server-php/src/bootstrap.php';db()->exec('CREATE TABLE full_volume_fixture(payload BLOB)');echo '{}';",env);
  // Fill only this bounded image until the OS itself reports ENOSPC. Release
  // 1MiB for rollback metadata; the following 32MiB SQL allocation still cannot fit.
  const filler=volume+'/filler.bin',fd=openSync(filler,'wx',0o600),chunk=Buffer.alloc(65536,0x79);let filled=0,osCode=null;
  try{while(filled<40*1024*1024)filled+=writeSync(fd,chunk);}catch(error){osCode=error.code;}
  assert.equal(osCode,'ENOSPC');assert.ok(filled>1024*1024);ftruncateSync(fd,filled-1024*1024);closeSync(fd);record.osError=osCode;record.fillerBytes=filled-1024*1024;
  const economic=String.raw`
   require 'packages/server-php/src/bootstrap.php';$d=db();$row=query($d,"SELECT * FROM worlds WHERE id='valley'")->fetch(PDO::FETCH_ASSOC);
   $command=(object)['commandId'=>'completion','action'=>'place','id'=>'completion','type'=>'shelter','x'=>6,'z'=>2,'expectedRevision'=>(int)$row['revision']];$candidate=worker(['worldId'=>'valley','snapshot'=>json_decode($row['snapshot']),'multiPlayer'=>true,'players'=>[['id'=>'alice','role'=>'builder'],['id'=>'bob','role'=>'builder']],'playerId'=>'bob','command'=>$command,'checkpointEvery'=>2]);if(!$candidate['result']['ok'])exit(3);
   $prepared=false;$sqliteCode=null;$start=hrtime(true);try{$d->exec('BEGIN IMMEDIATE');$next=json_encode($candidate['snapshot'],JSON_THROW_ON_ERROR|JSON_PRESERVE_ZERO_FRACTION);$cursor=(int)$row['cursor']+count($candidate['events']);query($d,'UPDATE worlds SET snapshot=?,revision=?,cursor=?,checkpoint_cursor=? WHERE id=?',[$next,$candidate['snapshot']->revision,$cursor,$candidate['snapshot']->checkpoint->eventSequence??0,'valley']);query($d,'UPDATE world_integrity SET snapshot_hash=?,cursor=? WHERE world_id=?',[hash('sha256',$next),$cursor,'valley']);
    foreach($candidate['events'] as $e){$payload=json_encode($e,JSON_THROW_ON_ERROR);query($d,'INSERT INTO events VALUES(?,?,?,?,?,?)',['valley',$e['sequence'],$e['id'],$e['transactionId'],$e['revision'],$payload]);query($d,'INSERT INTO event_integrity VALUES(?,?,?)',['valley',$e['sequence'],hash('sha256',$payload)]);if($e['type']==='MissionRewardApplied')query($d,'INSERT INTO rewards VALUES(?,?,?)',['valley',$e['rewardId'],$e['transactionId']]);if($e['type']==='PersonalAchievementClaimed')query($d,'INSERT INTO player_claims VALUES(?,?,?,?)',['valley',$e['playerId'],$e['claimId'],$e['transactionId']]);}
    query($d,'INSERT INTO commands VALUES(?,?,?,?,?,?,?,?)',['valley','bob','completion',hash('sha256',canonical($command)),$candidate['snapshot']->revision,1,json_encode($candidate['result']),json_encode($command)]);$prepared=true;
    if(getenv('ZGE_VOLUME_ALLOCATE')==='1')$d->exec('INSERT INTO full_volume_fixture VALUES(zeroblob(33554432))');$d->exec('COMMIT');
   }catch(PDOException $e){$sqliteCode=$e->errorInfo[1]??null;try{$d->exec('ROLLBACK');}catch(Throwable $ignored){}}
   echo json_encode(['prepared'=>$prepared,'sqliteCode'=>$sqliteCode,'ms'=>(hrtime(true)-$start)/1e6]);`;
  const full=php(economic,{...env,ZGE_VOLUME_ALLOCATE:'1'});assert.equal(full.prepared,true);assert.equal(full.sqliteCode,13);assert.deepEqual(capture(),initial);record.failedTransaction=full;record.partialEffects=0;
  unlinkSync(filler);const retry=php(economic,env);assert.equal(retry.sqliteCode,null);const after=capture(),state=JSON.parse(after.worlds[0].snapshot);assert.equal(state.team.xp,25);assert.equal(state.players.find(p=>p.id==='alice').xp,14);assert.equal(state.players.find(p=>p.id==='bob').xp,14);assert.equal(after.rewards.length,1);assert.equal(after.player_claims.length,2);const integrity=php("require 'packages/server-php/src/bootstrap.php';echo json_encode(['integrity'=>query(db(),'PRAGMA integrity_check')->fetchColumn()]);",env);assert.equal(integrity.integrity,'ok');record.retryMs=retry.ms;record.integrity='ok';record.teamRewards=1;record.personalClaims=2;record.status='PASS';record.databaseBytes=statSync(volume+'/world.sqlite').size;
 }
}catch(error){record.status='FAIL';record.reason=error.message;process.exitCode=1;}
finally{await f?.close();if(mounted){try{hdi(['detach',volume]);record.detached=true;}catch{record.detached=false;process.exitCode=1;}}writeFileSync(evidenceDir+'/disposable-volume.json',JSON.stringify(record,null,2));console.log(JSON.stringify(record));}
