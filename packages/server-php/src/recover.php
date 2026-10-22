<?php
declare(strict_types=1);
require __DIR__.'/security.php';
// Explicit, operator-invoked, loopback staging repair. Never deletes archives or
// trusts a damaged snapshot/checkpoint to reconstruct authoritative effects.
if(PHP_SAPI!=='cli'||!staging_enabled())exit(1);
$db=db();$start=hrtime(true);$world=$argv[1]??'';
if(!preg_match('/^[a-zA-Z0-9_.:-]{1,120}$/D',$world))exit(1);
if(query($db,'SELECT model FROM world_policies WHERE world_id=?',[$world])->fetchColumn()==='multiplayer.v1'){require __DIR__.'/recover-multiplayer.php';exit;}
$db->exec('BEGIN IMMEDIATE');
try{
 $row=query($db,'SELECT * FROM worlds WHERE id=?',[$world])->fetch(PDO::FETCH_ASSOC);if(!$row)throw new RuntimeException('world missing');
 $snapshot=null;$cursor=0;$offset=0;$total=0;
 do{
  $commands=query($db,'SELECT * FROM commands WHERE world_id=? ORDER BY rowid LIMIT 32 OFFSET ?',[$world,$offset])->fetchAll(PDO::FETCH_ASSOC);if(!$commands)break;
  $inputs=[];
  foreach($commands as $entry){$command=json_decode($entry['command'],false,512,JSON_THROW_ON_ERROR);if($command->commandId!==json_encode([$entry['player_id'],$entry['command_id']],JSON_THROW_ON_ERROR))throw new RuntimeException('identity mismatch');$logical=clone $command;$logical->commandId=$entry['command_id'];if(!hash_equals($entry['fingerprint'],hash('sha256',canonical($logical))))throw new RuntimeException('command mismatch');$inputs[]=$command;}
  $candidate=worker(['worldId'=>$world,'snapshot'=>$snapshot,'commands'=>$inputs,'checkpointEvery'=>max(1,min(128,(int)(getenv('ZGE_CHECKPOINT_EVERY')?:32)))]);
  foreach($commands as $i=>$entry)if(canonical(json_decode($entry['result'],false,512,JSON_THROW_ON_ERROR))!==canonical(json_decode(json_encode($candidate['results'][$i]),false,512,JSON_THROW_ON_ERROR)))throw new RuntimeException('receipt mismatch');
  foreach($candidate['events'] as $event){$archived=query($db,'SELECT e.payload,i.checksum FROM events e JOIN event_integrity i ON i.world_id=e.world_id AND i.sequence=e.sequence WHERE e.world_id=? AND e.sequence=?',[$world,$cursor])->fetch(PDO::FETCH_ASSOC);if(!$archived||!hash_equals($archived['checksum'],hash('sha256',$archived['payload']))||canonical(json_decode($archived['payload'],false,512,JSON_THROW_ON_ERROR))!==canonical(json_decode(json_encode($event),false,512,JSON_THROW_ON_ERROR)))throw new RuntimeException('event mismatch');$cursor++;}
  $snapshot=$candidate['snapshot'];$offset+=count($commands);$total+=count($commands);
 }while(count($commands)===32);
 if(!$snapshot)$snapshot=worker(['worldId'=>$world])['snapshot'];
 if($cursor!==(int)$row['cursor']||$snapshot->revision!==(int)$row['revision']||(int)query($db,'SELECT COUNT(*) FROM events WHERE world_id=?',[$world])->fetchColumn()!==$cursor)throw new RuntimeException('archive bounds mismatch');
 $claims=[];foreach(query($db,"SELECT payload FROM events WHERE world_id=? AND json_extract(payload,'$.type')='MissionRewardApplied' ORDER BY sequence",[$world])->fetchAll(PDO::FETCH_COLUMN) as $payload){$event=json_decode($payload,true,512,JSON_THROW_ON_ERROR);if($event['type']==='MissionRewardApplied')$claims[$event['rewardId']]=$event['transactionId'];}
 $rewards=query($db,'SELECT reward_id,transaction_id FROM rewards WHERE world_id=?',[$world])->fetchAll(PDO::FETCH_ASSOC);if(count($rewards)!==count($claims))throw new RuntimeException('reward mismatch');foreach($rewards as $reward)if(($claims[$reward['reward_id']]??null)!==$reward['transaction_id'])throw new RuntimeException('reward mismatch');
 $next=json_encode($snapshot,JSON_THROW_ON_ERROR|JSON_PRESERVE_ZERO_FRACTION);
 query($db,'UPDATE worlds SET snapshot=?,checkpoint_cursor=? WHERE id=?',[$next,$snapshot->checkpoint->eventSequence??0,$world]);
 query($db,'UPDATE world_integrity SET snapshot_hash=?,cursor=? WHERE world_id=?',[hash('sha256',$next),$cursor,$world]);
 query($db,'INSERT INTO recovery_audit(world_id,recovered_at,previous_snapshot,previous_checkpoints,recovered_hash) VALUES(?,?,?,?,?)',[$world,time(),$row['snapshot'],json_encode(query($db,'SELECT * FROM checkpoints WHERE world_id=?',[$world])->fetchAll(PDO::FETCH_ASSOC),JSON_THROW_ON_ERROR),hash('sha256',$next)]);
 // Derived checkpoints can be rebuilt; archived commands/events/claims are retained.
 query($db,'DELETE FROM checkpoints WHERE world_id=?',[$world]);
 query($db,'INSERT INTO checkpoints VALUES(?,?,?,?,?)',[$world,$cursor,$snapshot->revision,$next,hash('sha256',$next)]);
 $db->exec('COMMIT');echo json_encode(['ok'=>true,'schema'=>'zge.recovery.v1','worldId'=>$world,'revision'=>$snapshot->revision,'cursor'=>$cursor,'commands'=>$total,'ms'=>(hrtime(true)-$start)/1e6],JSON_THROW_ON_ERROR)."\n";
}catch(Throwable $e){$db->exec('ROLLBACK');fwrite(STDERR,"Staging recovery rejected: archive not certified\n");exit(1);}
