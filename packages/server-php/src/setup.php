<?php
declare(strict_types=1);
require __DIR__.'/bootstrap.php';
if(PHP_SAPI!=='cli'||!staging_enabled())exit(1);
$db=db();$db->exec(file_get_contents(__DIR__.'/schema.sql'));
$fixturePath=getenv('ZGE_STAGING_IDENTITIES');
if(!$fixturePath||dirname($fixturePath)!==dirname(getenv('ZGE_STAGING_DB'))||is_link($fixturePath)||is_link($fixturePath.'.pending'))exit(1);
if(is_file($fixturePath)&&(fileperms($fixturePath)&0077)!==0)exit(1);
$identitySource=is_file($fixturePath.'.pending')?$fixturePath.'.pending':$fixturePath;
$identities=is_file($identitySource)?json_decode(file_get_contents($identitySource),true,512,JSON_THROW_ON_ERROR):[];
$db->exec('BEGIN IMMEDIATE');
try {
 foreach(['valley','other-world'] as $world){
  $row=query($db,'SELECT * FROM worlds WHERE id=?',[$world])->fetch(PDO::FETCH_ASSOC);
  $newWorld=!$row;
  if(!$row){$state=worker(['worldId'=>$world]);query($db,'INSERT INTO worlds(id,revision,snapshot) VALUES(?,0,?)',[$world,json_encode($state['snapshot'],JSON_THROW_ON_ERROR)]);}
  foreach(($world==='valley'?['alice','bob','carol','viewer']:['outsider']) as $player){
   if(!isset($identities[$player])){
    if(query($db,'SELECT 1 FROM sessions WHERE player_id=? AND world_id=?',[$player,$world])->fetchColumn())throw new RuntimeException('Missing private provisioned identities');
    $token=bin2hex(random_bytes(24));$role=$player==='viewer'?'viewer':'builder';
    query($db,'INSERT INTO sessions VALUES(?,?,?,?,?)',[hash('sha256',$token),$player,$world,$role,time()+86400]);
    $identities[$player]=['token'=>$token,'worldId'=>$world,'playerId'=>$player,'role'=>$role];
   }
   $identity=&$identities[$player];$hash=hash('sha256',$identity['token']);
   $s=query($db,'SELECT * FROM sessions WHERE token_hash=? AND player_id=? AND world_id=?',[$hash,$player,$world])->fetch(PDO::FETCH_ASSOC);if(!$s&&$newWorld){query($db,'INSERT INTO sessions VALUES(?,?,?,?,?)',[$hash,$player,$world,$identity['role'],time()+86400]);$s=['role'=>$identity['role']];}
   if(!$s)throw new RuntimeException('Provisioning identity mismatch');
   query($db,'INSERT OR IGNORE INTO memberships VALUES(?,?,?,0)',[$player,$world,$s['role']]);
   query($db,'INSERT OR IGNORE INTO session_meta VALUES(?,?,?,0,1)',[$hash,bin2hex(random_bytes(16)),time()]);
   $sessionId=query($db,'SELECT session_id FROM session_meta WHERE token_hash=?',[$hash])->fetchColumn();
   $identity['refreshToken']??=bin2hex(random_bytes(32));
   query($db,'INSERT OR IGNORE INTO credentials VALUES(?,?,?,?,?,0)',[hash('sha256',$identity['refreshToken']),$player,$world,$sessionId,time()+2592000]);
  }
  // Adopt a pre-ZGE-07 staging snapshot only after validating it and archive bounds.
  if(!query($db,'SELECT 1 FROM world_integrity WHERE world_id=?',[$world])->fetchColumn()){
   $row=query($db,'SELECT * FROM worlds WHERE id=?',[$world])->fetch(PDO::FETCH_ASSOC);worker(['worldId'=>$world,'snapshot'=>json_decode($row['snapshot'],false,512,JSON_THROW_ON_ERROR)]);
   if((int)query($db,'SELECT COUNT(*) FROM events WHERE world_id=?',[$world])->fetchColumn()!==(int)$row['cursor'])throw new RuntimeException('Archive adoption failed');
   query($db,'INSERT INTO world_integrity VALUES(?,?,?)',[$world,hash('sha256',$row['snapshot']),$row['cursor']]);
   foreach(query($db,'SELECT sequence,payload FROM events WHERE world_id=?',[$world])->fetchAll(PDO::FETCH_ASSOC) as $event)query($db,'INSERT INTO event_integrity VALUES(?,?,?)',[$world,$event['sequence'],hash('sha256',$event['payload'])]);
  }
 }
 // Private pending file makes provisioning recoverable across DB commit/file rename.
 $identityJson=json_encode($identities,JSON_THROW_ON_ERROR);$handle=fopen($fixturePath.'.pending','wb');if(!$handle||fwrite($handle,$identityJson)!==strlen($identityJson)||!fflush($handle)||!fsync($handle))throw new RuntimeException('Private identity persistence failed');fclose($handle);chmod($fixturePath.'.pending',0600);
 $db->exec('COMMIT');if(!rename($fixturePath.'.pending',$fixturePath))throw new RuntimeException('Private identity publication failed');chmod($fixturePath,0600);
 echo "Isolated staging schema and private identities ready\n";
}catch(Throwable $e){if($db->inTransaction())$db->exec('ROLLBACK');fwrite(STDERR,"Staging provisioning failed\n");exit(1);}
