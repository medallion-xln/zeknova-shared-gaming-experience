<?php
declare(strict_types=1);
// Included only by the guarded CLI recovery entry point. Private actors and
// legacy attribution provenance remain in SQLite; nothing is exported publicly.
$db->exec('BEGIN IMMEDIATE');
try{
 $row=query($db,'SELECT * FROM worlds WHERE id=?',[$world])->fetch(PDO::FETCH_ASSOC);if(!$row)throw new RuntimeException('world missing');
 $actors=query($db,'SELECT DISTINCT player_id FROM commands WHERE world_id=? ORDER BY player_id',[$world])->fetchAll(PDO::FETCH_COLUMN);
 $players=array_map(fn($id)=>['id'=>$id,'role'=>'builder'],$actors);$snapshot=null;$cursor=0;$offset=0;$total=0;$multi=false;
 do{
  $entries=query($db,'SELECT * FROM commands WHERE world_id=? ORDER BY rowid LIMIT 32 OFFSET ?',[$world,$offset])->fetchAll(PDO::FETCH_ASSOC);if(!$entries)break;
  $groups=[];
  foreach($entries as $entry){
   $command=json_decode($entry['command'],false,512,JSON_THROW_ON_ERROR);
   $new=$command->commandId===$entry['command_id'];
   if(!$new&&$command->commandId!==json_encode([$entry['player_id'],$entry['command_id']],JSON_THROW_ON_ERROR))throw new RuntimeException('identity mismatch');
   if($multi&&!$new)throw new RuntimeException('model regression');
   $logical=clone $command;$logical->commandId=$entry['command_id'];if(!hash_equals($entry['fingerprint'],hash('sha256',canonical($logical))))throw new RuntimeException('fingerprint mismatch');
   $last=count($groups)-1;if($last<0||$groups[$last]['multi']!==$new)$groups[]=['multi'=>$new,'entries'=>[],'commands'=>[],'actors'=>[]];$last=count($groups)-1;
   $groups[$last]['entries'][]=$entry;$groups[$last]['commands'][]=$command;$groups[$last]['actors'][]=$entry['player_id'];$multi=$new;
  }
  foreach($groups as $group){
   $candidate=worker(['worldId'=>$world,'snapshot'=>$snapshot,'multiPlayer'=>$group['multi'],'players'=>$players,'commands'=>$group['commands'],'commandActors'=>$group['actors'],'checkpointEvery'=>max(1,min(128,(int)(getenv('ZGE_CHECKPOINT_EVERY')?:32)))]);
   foreach($group['entries'] as $i=>$entry)if(canonical(json_decode($entry['result'],false,512,JSON_THROW_ON_ERROR))!==canonical(json_decode(json_encode($candidate['results'][$i]),false,512,JSON_THROW_ON_ERROR)))throw new RuntimeException('receipt mismatch');
   foreach($candidate['events'] as $event){$archived=query($db,'SELECT e.payload,i.checksum FROM events e JOIN event_integrity i ON i.world_id=e.world_id AND i.sequence=e.sequence WHERE e.world_id=? AND e.sequence=?',[$world,$cursor])->fetch(PDO::FETCH_ASSOC);if(!$archived||!hash_equals($archived['checksum'],hash('sha256',$archived['payload']))||canonical(json_decode($archived['payload'],false,512,JSON_THROW_ON_ERROR))!==canonical(json_decode(json_encode($event),false,512,JSON_THROW_ON_ERROR)))throw new RuntimeException('event mismatch');$cursor++;}
   $snapshot=$candidate['snapshot'];
  }
  $offset+=count($entries);$total+=count($entries);
 }while(count($entries)===32);
 if(!$snapshot||!$multi||$snapshot->revision!==(int)$row['revision']||$cursor!==(int)$row['cursor']||(int)query($db,'SELECT COUNT(*) FROM events WHERE world_id=?',[$world])->fetchColumn()!==$cursor)throw new RuntimeException('bounds mismatch');
 foreach([['MissionRewardApplied','rewards','reward_id','rewardId'],['PersonalAchievementClaimed','player_claims','claim_id','claimId']] as [$type,$table,$column,$field]){
  $claims=query($db,"SELECT payload FROM events WHERE world_id=? AND json_extract(payload,'$.type')=? ORDER BY sequence",[$world,$type])->fetchAll(PDO::FETCH_COLUMN);$stored=query($db,'SELECT * FROM '.$table.' WHERE world_id=?',[$world])->fetchAll(PDO::FETCH_ASSOC);if(count($claims)!==count($stored))throw new RuntimeException('claim count mismatch');
  foreach($claims as $payload){$event=json_decode($payload,true,512,JSON_THROW_ON_ERROR);$found=false;foreach($stored as $claim)if($claim[$column]===$event[$field]&&$claim['transaction_id']===$event['transactionId']&&($table!=='player_claims'||$claim['player_id']===$event['playerId']))$found=true;if(!$found)throw new RuntimeException('claim mismatch');}
 }
 $next=json_encode($snapshot,JSON_THROW_ON_ERROR|JSON_PRESERVE_ZERO_FRACTION);
 query($db,'INSERT INTO recovery_audit(world_id,recovered_at,previous_snapshot,previous_checkpoints,recovered_hash) VALUES(?,?,?,?,?)',[$world,time(),$row['snapshot'],json_encode(query($db,'SELECT * FROM checkpoints WHERE world_id=?',[$world])->fetchAll(PDO::FETCH_ASSOC),JSON_THROW_ON_ERROR),hash('sha256',$next)]);
 query($db,'UPDATE worlds SET snapshot=?,checkpoint_cursor=? WHERE id=?',[$next,$snapshot->checkpoint->eventSequence??0,$world]);query($db,'UPDATE world_integrity SET snapshot_hash=?,cursor=? WHERE world_id=?',[hash('sha256',$next),$cursor,$world]);
 query($db,'DELETE FROM checkpoints WHERE world_id=?',[$world]);query($db,'INSERT INTO checkpoints VALUES(?,?,?,?,?)',[$world,$cursor,$snapshot->revision,$next,hash('sha256',$next)]);
 // Explicit CLI staging fault only: certify that process death after all repair
 // writes still rolls back the audit, derived snapshot and checkpoints together.
 if(getenv('ZGE_STAGING_FAULTS')==='1'&&getenv('ZGE_RECOVERY_FAULT')==='before-commit'){posix_kill(getmypid(),SIGKILL);exit(1);}
 $db->exec('COMMIT');echo json_encode(['ok'=>true,'schema'=>'zge.recovery.v2','worldId'=>$world,'revision'=>$snapshot->revision,'cursor'=>$cursor,'commands'=>$total,'ms'=>(hrtime(true)-$start)/1e6],JSON_THROW_ON_ERROR)."\n";
}catch(Throwable $e){$db->exec('ROLLBACK');fwrite(STDERR,"Staging multiplayer recovery rejected: archive not certified\n");exit(1);}
