<?php
declare(strict_types=1);
require __DIR__.'/security.php';if(PHP_SAPI!=='cli'||!staging_enabled())exit(1);
$db=db();$db->exec(file_get_contents(__DIR__.'/schema.sql'));$file=$argv[1];if(!str_starts_with($file,'/tmp/'))exit(1);
$stream=fopen($file,'r');$append=[];$compact=[];$count=0;$db->exec('BEGIN IMMEDIATE');$start=hrtime(true);
while(($line=fgets($stream))!==false){$record=json_decode($line,true,512,JSON_THROW_ON_ERROR);
 if(isset($record['event'])){$e=$record['event'];query($db,'INSERT INTO events VALUES(?,?,?,?,?,?)',[$e['worldId'],$e['sequence'],$e['id'],$e['transactionId'],$e['revision'],json_encode($e,JSON_THROW_ON_ERROR)]);$count++;query($db,'INSERT INTO event_integrity VALUES(?,?,?)',[$e['worldId'],$e['sequence'],hash('sha256',json_encode($e,JSON_THROW_ON_ERROR))]);}
 if(isset($record['checkpoint'])){$cp=$record['checkpoint'];$json=json_encode(json_decode($line,false,512,JSON_THROW_ON_ERROR)->checkpoint->state,JSON_THROW_ON_ERROR);$t=hrtime(true);query($db,'INSERT INTO checkpoints VALUES(?,?,?,?,?)',[$cp['state']['worldId'],$cp['cursor'],$cp['state']['revision'],$json,hash('sha256',$json)]);query($db,'DELETE FROM checkpoints WHERE world_id=? AND cursor NOT IN (SELECT cursor FROM checkpoints WHERE world_id=? ORDER BY cursor DESC LIMIT 2)',[$cp['state']['worldId'],$cp['state']['worldId']]);$compact[]=(hrtime(true)-$t)/1e6;
 $db->exec('COMMIT');$append[]=(hrtime(true)-$start)/1e6;$db->exec('BEGIN IMMEDIATE');$start=hrtime(true);}
}
$db->exec('COMMIT');$db->exec('PRAGMA wal_checkpoint(TRUNCATE)');fclose($stream);
// Synthetic history projection, not an executable construction snapshot. This
// identity grants only authenticated archive paging in this isolated fixture.
$world=$e['worldId'];query($db,"INSERT INTO worlds VALUES(?,?,?,'{}',0)",[$world,$e['revision'],$count]);
query($db,'INSERT INTO world_integrity VALUES(?,?,?)',[$world,hash('sha256','{}'),$count]);
$token=bin2hex(random_bytes(24));$hash=hash('sha256',$token);query($db,'INSERT INTO sessions VALUES(?,?,?,?,?)',[$hash,'history-reader',$world,'viewer',time()+3600]);query($db,'INSERT INTO session_meta VALUES(?,?,?,0,1)',[$hash,bin2hex(random_bytes(16)),time()]);query($db,'INSERT INTO memberships VALUES(?,?,?,0)',['history-reader',$world,'viewer']);
file_put_contents(getenv('ZGE_STAGING_DB').'.identity',json_encode(['worldId'=>$world,'token'=>$token],JSON_THROW_ON_ERROR));chmod(getenv('ZGE_STAGING_DB').'.identity',0600);
$t=hrtime(true);$last=query($db,'SELECT * FROM checkpoints ORDER BY cursor DESC LIMIT 1')->fetch(PDO::FETCH_ASSOC);$restore=(hrtime(true)-$t)/1e6;
if(!hash_equals($last['checksum'],hash('sha256',$last['snapshot'])))throw new RuntimeException('checkpoint mismatch');
$sync=[];$cursor=0;do{$t=hrtime(true);$page=query($db,'SELECT e.sequence,e.payload,i.checksum FROM events e JOIN event_integrity i ON i.world_id=e.world_id AND i.sequence=e.sequence WHERE e.world_id=? AND e.sequence>=? ORDER BY e.sequence LIMIT 256',[$world,$cursor])->fetchAll(PDO::FETCH_ASSOC);foreach($page as $event){if(!hash_equals($event['checksum'],hash('sha256',$event['payload']))||(int)$event['sequence']!==$cursor)throw new RuntimeException('archive mismatch');$cursor++;}$sync[]=(hrtime(true)-$t)/1e6;}while(count($page)===256);
$row=query($db,'SELECT * FROM worlds WHERE id=?',[$world])->fetch(PDO::FETCH_ASSOC);verify_world($db,$row);
$db->exec('BEGIN IMMEDIATE');query($db,"UPDATE checkpoints SET snapshot='corrupt' WHERE world_id=?",[$world]);$corruptDenied=false;try{verify_world($db,$row);}catch(HttpFailure $failure){$corruptDenied=$failure->reason==='checkpoint-integrity-failed';}$db->exec('ROLLBACK');
$db->exec('BEGIN IMMEDIATE');query($db,'DELETE FROM events WHERE world_id=? AND sequence=0',[$world]);$gapDenied=false;try{verify_world($db,$row);}catch(HttpFailure $failure){$gapDenied=$failure->reason==='archive-integrity-failed';}$db->exec('ROLLBACK');
$checkpoints=query($db,'SELECT cursor,snapshot FROM checkpoints ORDER BY cursor')->fetchAll(PDO::FETCH_ASSOC);
$db->exec('PRAGMA wal_checkpoint(TRUNCATE)');
echo json_encode(['count'=>$count,'appendBatch1000Ms'=>$append,'compactionMs'=>$compact,'checkpointLoadMs'=>$restore,'syncPage256Ms'=>$sync,'databaseBytes'=>filesize(getenv('ZGE_STAGING_DB')),'checkpointCount'=>count($checkpoints),'checkpointIntegrityVerified'=>true,'archivePageHashesVerified'=>true,'corruptCheckpointDenied'=>$corruptDenied,'eventGapDenied'=>$gapDenied,'checkpoints'=>array_map(fn($c)=>['cursor'=>(int)$c['cursor'],'state'=>json_decode($c['snapshot'],false,512,JSON_THROW_ON_ERROR)],$checkpoints)],JSON_THROW_ON_ERROR);
