<?php
declare(strict_types=1);
require_once __DIR__.'/security.php';
if(!staging_enabled())response(['ok'=>false,'reason'=>'staging-disabled'],404);
$db=null;$inTransaction=false;
try {
    $input=body(['worldId','playerId','command','cursor','replay','connectionId']);
    if(property_exists($input,'cursor')&&(!is_int($input->cursor)||$input->cursor<0))deny('invalid-cursor',422);
    if(property_exists($input,'replay')&&!is_bool($input->replay))deny('invalid-replay',422);
    $hash=access_token();$db=db();
    limit_requests($db,'world-ip:'.hash('sha256',$_SERVER['REMOTE_ADDR']??'loopback'),600);
    $session=authenticate($db,$hash);
    limit_requests($db,'principal:'.hash('sha256',$session['player_id'].'|'.$session['world_id']),max(8,min(600,(int)(getenv('ZGE_REQUEST_LIMIT')?:240))));
    $worldId=$input->worldId??'';if($worldId!==$session['world_id'])response(['ok'=>false,'reason'=>'cross-world-access'],403);
    if(isset($input->playerId)&&$input->playerId!==$session['player_id'])response(['ok'=>false,'reason'=>'forged-identity'],403);
    $command=$input->command??null;
    if(isset($input->command)&&!is_object($command))deny('invalid-command',422);
    if($command && $session['role']!=='builder')response(['ok'=>false,'reason'=>'forbidden'],403);
    if($command) {
        if(!is_object($command)||!is_string($command->commandId??null)||!preg_match('/^[a-zA-Z0-9_.:-]{1,100}$/D',$command->commandId)||!is_int($command->expectedRevision??null)||$command->expectedRevision<0||$command->expectedRevision>9007199254740991)response(['ok'=>false,'reason'=>'invalid-command'],422);
        $allowed=match($command->action??''){'place'=>['commandId','expectedRevision','action','id','type','x','z','rotation'],'remove'=>['commandId','expectedRevision','action','id'],'move'=>['commandId','expectedRevision','action','dx','dz'],'select'=>['commandId','expectedRevision','action','type'],default=>[]};
        if(!$allowed||array_diff(array_keys(get_object_vars($command)),$allowed))response(['ok'=>false,'reason'=>'forbidden-command-fields'],422);
        if(($command->action==='place'||$command->action==='remove')&&(!is_string($command->id??null)||!preg_match('/^[a-zA-Z0-9_.:-]{1,120}$/D',$command->id)))response(['ok'=>false,'reason'=>'invalid-building-id'],422);
    }
    // SQLite serializes authoritative arrivals. Never run gameplay before acquiring the write lock.
    $db->exec('BEGIN IMMEDIATE');$inTransaction=true;
    $session=authenticate($db,$hash);check_connection($db,$session,$input->connectionId??null);
    if($command&&$session['role']!=='builder')deny('forbidden',403);
    $row=query($db,'SELECT * FROM worlds WHERE id=?',[$worldId])->fetch(PDO::FETCH_ASSOC);if(!$row)throw new RuntimeException('World missing');
    verify_world($db,$row);
    $since=$input->cursor??0;if($since>(int)$row['cursor'])deny('cursor-ahead',409);
    $page=query($db,'SELECT e.payload,i.checksum FROM events e LEFT JOIN event_integrity i ON i.world_id=e.world_id AND i.sequence=e.sequence WHERE e.world_id=? AND e.sequence>=? AND e.sequence<? ORDER BY e.sequence LIMIT 128',[$worldId,$since,$row['cursor']])->fetchAll(PDO::FETCH_ASSOC);
    foreach($page as $event)if(!$event['checksum']||!hash_equals($event['checksum'],hash('sha256',$event['payload'])))deny('archive-integrity-failed',503);
    $snapshot=json_decode($row['snapshot'],false,512,JSON_THROW_ON_ERROR);$result=null;$duplicate=false;
    if(($snapshot->schema??'')==='zge.multiplayer-construction.v1')deny('supervised-runtime-required',503);
    if($snapshot->revision!==(int)$row['revision'] || ($snapshot->checkpoint->eventSequence??0)+count($snapshot->events)!==(int)$row['cursor'])deny('world-integrity-failed',503);
    if($command) {
        $fingerprint=hash('sha256',canonical($command));$prior=query($db,'SELECT * FROM commands WHERE world_id=? AND player_id=? AND command_id=?',[$worldId,$session['player_id'],$command->commandId])->fetch(PDO::FETCH_ASSOC);
        if($prior) { $duplicate=true;$result=$prior['fingerprint']===$fingerprint?json_decode($prior['result'],true,512,JSON_THROW_ON_ERROR):['ok'=>false,'reason'=>'idempotency-conflict']; }
        else {
            $dispatch=json_decode(json_encode($command,JSON_THROW_ON_ERROR),true,512,JSON_THROW_ON_ERROR);$dispatch['commandId']=json_encode([$session['player_id'],$command->commandId],JSON_THROW_ON_ERROR);
            $candidate=worker(['worldId'=>$worldId,'snapshot'=>$snapshot,'command'=>$dispatch,'checkpointEvery'=>max(1,min(128,(int)(getenv('ZGE_CHECKPOINT_EVERY')?:32)))]);
            $result=$candidate['result'];$snapshot=$candidate['snapshot'];
            foreach($candidate['events'] as $event){query($db,'INSERT INTO events VALUES(?,?,?,?,?,?)',[$worldId,$event['sequence'],$event['id'],$event['transactionId'],$event['revision'],json_encode($event,JSON_THROW_ON_ERROR)]);query($db,'INSERT INTO event_integrity VALUES(?,?,?)',[$worldId,$event['sequence'],hash('sha256',json_encode($event,JSON_THROW_ON_ERROR))]);if($event['type']==='MissionRewardApplied')query($db,'INSERT INTO rewards VALUES(?,?,?)',[$worldId,$event['rewardId'],$event['transactionId']]);}
            $cursor=(int)$row['cursor']+count($candidate['events']);
            $next=json_encode($snapshot,JSON_THROW_ON_ERROR|JSON_PRESERVE_ZERO_FRACTION);
            $updated=query($db,'UPDATE worlds SET revision=?,cursor=?,snapshot=?,checkpoint_cursor=? WHERE id=? AND revision=? AND cursor=?',[$snapshot->revision,$cursor,$next,$snapshot->checkpoint->eventSequence??0,$worldId,$row['revision'],$row['cursor']]);if($updated->rowCount()!==1)throw new RuntimeException('CAS failure');
            query($db,'INSERT INTO commands VALUES(?,?,?,?,?,?,?,?)',[$worldId,$session['player_id'],$command->commandId,$fingerprint,$snapshot->revision,$result['ok']?1:0,json_encode($result,JSON_THROW_ON_ERROR),json_encode($dispatch,JSON_THROW_ON_ERROR)]);
            if(isset($snapshot->checkpoint) && count($snapshot->ledger)===0)query($db,'INSERT INTO checkpoints VALUES(?,?,?,?,?)',[$worldId,$cursor,$snapshot->revision,$next,hash('sha256',$next)]);
            if(isset($snapshot->checkpoint) && count($snapshot->ledger)===0)query($db,'DELETE FROM checkpoints WHERE world_id=? AND cursor NOT IN (SELECT cursor FROM checkpoints WHERE world_id=? ORDER BY cursor DESC LIMIT 2)',[$worldId,$worldId]);
            query($db,'UPDATE world_integrity SET snapshot_hash=?,cursor=? WHERE world_id=?',[hash('sha256',$next),$cursor,$worldId]);
            $row['cursor']=$cursor;$row['revision']=$snapshot->revision;
        }
    }
    $fault=getenv('ZGE_STAGING_FAULTS')==='1'?($_SERVER['HTTP_X_ZGE_FAULT']??''):'';
    if($command&&!$duplicate&&$fault==='crash-before-commit')posix_kill(getmypid(),SIGKILL);
    if($command&&!$duplicate&&$fault==='rollback')throw new RuntimeException('Injected rollback');
    // Fault fixtures exercise expiry after candidate effects but before publication.
    if($fault==='wait-for-expiry'){ $deadline=microtime(true)+3;while(time()<(int)$session['expires']&&microtime(true)<$deadline)usleep(10000); }
    if($fault==='expire-before-commit')query($db,'UPDATE sessions SET expires=0 WHERE token_hash=?',[$hash]);
    $current=authenticate($db,$hash);if($command&&$current['role']!=='builder')deny('forbidden',403);
    $db->exec('COMMIT');$inTransaction=false;
    if($command&&!$duplicate&&$fault==='crash-after-commit')posix_kill(getmypid(),SIGKILL);
    if($command&&!$duplicate&&$fault==='lose-ack')response(['ok'=>false,'reason'=>'acknowledgment-lost'],503);
    $events=query($db,'SELECT e.payload,i.checksum FROM events e LEFT JOIN event_integrity i ON i.world_id=e.world_id AND i.sequence=e.sequence WHERE e.world_id=? AND e.sequence>=? AND e.sequence<? ORDER BY e.sequence LIMIT 128',[$worldId,$since,$row['cursor']])->fetchAll(PDO::FETCH_ASSOC);
    foreach($events as $event)if(!$event['checksum']||!hash_equals($event['checksum'],hash('sha256',$event['payload'])))deny('archive-integrity-failed',503);
    $runtime=worker(['worldId'=>$worldId,'snapshot'=>$snapshot,'replay'=>!empty($input->replay)]);
    authenticate($db,$hash);
    response(['ok'=>true,'protocol'=>'zge.session.v1','sessionId'=>$session['session_id'],'connectionId'=>$input->connectionId??null,'expires'=>(int)$session['expires'],'snapshotChecksum'=>$runtime['snapshotChecksum'],'result'=>$result,'duplicate'=>$duplicate,'identity'=>['playerId'=>$session['player_id'],'worldId'=>$worldId,'role'=>$session['role']], 'revision'=>(int)$row['revision'],'cursor'=>(int)$row['cursor'],'nextCursor'=>$events?$since+count($events):$since,'events'=>array_map(fn($e)=>json_decode($e['payload'],true,512,JSON_THROW_ON_ERROR),$events),'snapshot'=>$snapshot,'world'=>$runtime['world'],'replay'=>$runtime['replay'],'acknowledgment'=>['kind'=>'sqlite-commit','revision'=>(int)$row['revision']]]);
} catch(HttpFailure $e) { if($inTransaction)$db->exec('ROLLBACK');response(['ok'=>false,'reason'=>$e->reason],$e->status); }
catch(JsonException|TypeError $e) { if($inTransaction)$db->exec('ROLLBACK');response(['ok'=>false,'reason'=>'invalid-payload'],422); }
catch(Throwable $e) { if($inTransaction)$db->exec('ROLLBACK');error_log('ZGE staging transaction failed: '.get_class($e));response(['ok'=>false,'reason'=>'transaction-aborted'],503); }
