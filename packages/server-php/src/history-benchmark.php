<?php
declare(strict_types=1);
require __DIR__.'/bootstrap.php';if(PHP_SAPI!=='cli'||!staging_enabled())exit(1);
$db=db();$db->exec(file_get_contents(__DIR__.'/schema.sql'));$file=$argv[1];if(!str_starts_with($file,'/tmp/'))exit(1);
$stream=fopen($file,'r');$append=[];$compact=[];$count=0;$db->exec('BEGIN IMMEDIATE');$start=hrtime(true);
while(($line=fgets($stream))!==false){$record=json_decode($line,true,512,JSON_THROW_ON_ERROR);
 if(isset($record['event'])){$e=$record['event'];query($db,'INSERT INTO events VALUES(?,?,?,?,?,?)',[$e['worldId'],$e['sequence'],$e['id'],$e['transactionId'],$e['revision'],json_encode($e,JSON_THROW_ON_ERROR)]);$count++;}
 if(isset($record['checkpoint'])){$cp=$record['checkpoint'];$json=json_encode(json_decode($line,false,512,JSON_THROW_ON_ERROR)->checkpoint->state,JSON_THROW_ON_ERROR);$t=hrtime(true);query($db,'INSERT INTO checkpoints VALUES(?,?,?,?,?)',[$cp['state']['worldId'],$cp['cursor'],$cp['state']['revision'],$json,hash('sha256',$json)]);query($db,'DELETE FROM checkpoints WHERE world_id=? AND cursor NOT IN (SELECT cursor FROM checkpoints WHERE world_id=? ORDER BY cursor DESC LIMIT 2)',[$cp['state']['worldId'],$cp['state']['worldId']]);$compact[]=(hrtime(true)-$t)/1e6;
 $db->exec('COMMIT');$append[]=(hrtime(true)-$start)/1e6;$db->exec('BEGIN IMMEDIATE');$start=hrtime(true);}
}
$db->exec('COMMIT');$db->exec('PRAGMA wal_checkpoint(TRUNCATE)');fclose($stream);
$t=hrtime(true);$last=query($db,'SELECT * FROM checkpoints ORDER BY cursor DESC LIMIT 1')->fetch(PDO::FETCH_ASSOC);$restore=(hrtime(true)-$t)/1e6;
// Synchronization is paged and never loads the entire archive into client memory.
$sync=[];$cursor=0;do{$t=hrtime(true);$page=query($db,'SELECT sequence,payload FROM events WHERE sequence>=? ORDER BY sequence LIMIT 256',[$cursor])->fetchAll(PDO::FETCH_ASSOC);$sync[]=(hrtime(true)-$t)/1e6;$cursor+=count($page);}while(count($page)===256);
$checkpoints=query($db,'SELECT cursor,snapshot FROM checkpoints ORDER BY cursor')->fetchAll(PDO::FETCH_ASSOC);
echo json_encode(['count'=>$count,'appendBatch1000Ms'=>$append,'compactionMs'=>$compact,'checkpointLoadMs'=>$restore,'syncPage256Ms'=>$sync,'databaseBytes'=>filesize(getenv('ZGE_STAGING_DB')),'checkpointCount'=>count($checkpoints),'checkpoints'=>array_map(fn($c)=>['cursor'=>(int)$c['cursor'],'state'=>json_decode($c['snapshot'],false,512,JSON_THROW_ON_ERROR)],$checkpoints)],JSON_THROW_ON_ERROR);
