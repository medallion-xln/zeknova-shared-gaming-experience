<?php
declare(strict_types=1);
require_once __DIR__.'/security.php';
require_once __DIR__.'/runtime-ipc.php';
require_once __DIR__.'/request-metrics.php';
require_once __DIR__.'/command-admission.php';
zge_metrics_start();
function zge_world_response(array $data,int $status=200): never {
    global $db,$quotaCharged,$quotaScopes;
    // Authenticated early rejections still consume the unchanged admission budget.
    // Valid requests retain pre-SQL fair scheduling; charge once on either exit.
    if(!$quotaCharged&&$db&&$quotaScopes){
        $quotaCharged=true;zge_stage_start('quota');
        try{limit_request_scopes($db,$quotaScopes);}catch(HttpFailure $error){$data=['ok'=>false,'reason'=>$error->reason];$status=$error->status;}catch(Throwable $error){$data=['ok'=>false,'reason'=>'transaction-aborted'];$status=503;}
        zge_stage_end('quota');
    }
    response($data,$status);
}
$quotaCharged=false;$quotaScopes=[];

if(!staging_enabled())zge_world_response(['ok'=>false,'reason'=>'staging-disabled'],404);
$db=null;$inTransaction=false;
try {
    zge_stage_start('payload');$input=body(['worldId','playerId','command','cursor','replay','connectionId']);
    if(property_exists($input,'cursor')&&(!is_int($input->cursor)||$input->cursor<0))deny('invalid-cursor',422);
    if(property_exists($input,'replay')&&!is_bool($input->replay))deny('invalid-replay',422);
    zge_stage_end('payload');zge_stage_start('authentication');$hash=access_token();zge_stage_end('authentication');zge_stage_start('databaseOpen');$db=db();zge_stage_end('databaseOpen');
    $ipScope='world-ip:'.hash('sha256',$_SERVER['REMOTE_ADDR']??'loopback');
    zge_stage_start('authentication');$quotaScopes=[[$ipScope,600]];try{$session=authenticate($db,$hash);}catch(HttpFailure $error){zge_stage_end('authentication');throw $error;}zge_stage_end('authentication');
    $quotaScopes[]= ['principal:'.hash('sha256',$session['player_id'].'|'.$session['world_id']),max(8,min(600,(int)(getenv('ZGE_REQUEST_LIMIT')?:240)))];
    zge_stage_start('authorization');$worldId=$input->worldId??'';if($worldId!==$session['world_id'])zge_world_response(['ok'=>false,'reason'=>'cross-world-access'],403);
    if(isset($input->playerId)&&$input->playerId!==$session['player_id'])zge_world_response(['ok'=>false,'reason'=>'forged-identity'],403);
    $command=$input->command??null;
    if(isset($input->command)&&!is_object($command))deny('invalid-command',422);
    if($command && $session['role']!=='builder')zge_world_response(['ok'=>false,'reason'=>'forbidden'],403);
    if($command) {
        if(!is_object($command)||!is_string($command->commandId??null)||!preg_match('/^[a-zA-Z0-9_.:-]{1,100}$/D',$command->commandId)||!is_int($command->expectedRevision??null)||$command->expectedRevision<0||$command->expectedRevision>9007199254740991)zge_world_response(['ok'=>false,'reason'=>'invalid-command'],422);
        $allowed=match($command->action??''){'place'=>['commandId','expectedRevision','action','id','type','x','z','rotation'],'remove'=>['commandId','expectedRevision','action','id'],'move'=>['commandId','expectedRevision','expectedPlayerRevision','action','dx','dz'],'select'=>['commandId','expectedRevision','expectedPlayerRevision','action','type'],'join'=>['commandId','expectedRevision','action'],default=>[]};
        if(!$allowed||array_diff(array_keys(get_object_vars($command)),$allowed))zge_world_response(['ok'=>false,'reason'=>'forbidden-command-fields'],422);
        if(($command->action==='place'||$command->action==='remove')&&(!is_string($command->id??null)||!preg_match('/^[a-zA-Z0-9_.:-]{1,120}$/D',$command->id)))zge_world_response(['ok'=>false,'reason'=>'invalid-building-id'],422);
    }
    zge_stage_end('authorization');$GLOBALS['zge_metrics']['meta']=['worldId'=>$worldId,'commandId'=>$command->commandId??null,'commandClass'=>match($command->action??''){'move','select'=>'movement','place','remove'=>'construction','join'=>'session-control',default=>'state'},'transactionId'=>$command?hash('sha256',canonical([$worldId,$session['player_id'],$command->commandId])):null,'generation'=>null];
    zge_stage_start('admission');$permit=$command?zge_admit($worldId,$session['player_id'],$GLOBALS['zge_metrics']['meta']['commandClass']):null;zge_stage_end('admission');
    zge_stage_start('quota');$quotaCharged=true;limit_request_scopes($db,$quotaScopes);zge_stage_end('quota');
    zge_stage_start('runtimeEnsure');$lease=runtime_ensure_world($worldId);zge_stage_end('runtimeEnsure');zge_metrics_runtime($lease);
    // Admission orders mutation arrivals without holding SQL. All mutable gameplay checks
    // remain inside BEGIN IMMEDIATE; reads acquire a consistent verified WAL snapshot.
    zge_stage_start('lockWait');$db->exec($command?'BEGIN IMMEDIATE':'BEGIN');zge_stage_end('lockWait');$inTransaction=true;$GLOBALS['zge_metrics']['transactionStart']=hrtime(true);zge_stage_start('validation');
    runtime_assert_fence($db,$lease['runtimeFence']);
    zge_stage_end('validation');zge_stage_start('authentication');$session=authenticate($db,$hash);zge_stage_end('authentication');zge_stage_start('validation');check_connection($db,$session,$input->connectionId??null,$command!==null);
    if($command&&$session['role']!=='builder')deny('forbidden',403);
    $row=query($db,'SELECT * FROM worlds WHERE id=?',[$worldId])->fetch(PDO::FETCH_ASSOC);if(!$row)throw new RuntimeException('World missing');
    verify_world($db,$row);
    $since=$input->cursor??0;if($since>(int)$row['cursor'])deny('cursor-ahead',409);
    $page=query($db,'SELECT e.payload,i.checksum FROM events e LEFT JOIN event_integrity i ON i.world_id=e.world_id AND i.sequence=e.sequence WHERE e.world_id=? AND e.sequence>=? AND e.sequence<? ORDER BY e.sequence LIMIT 128',[$worldId,$since,$row['cursor']])->fetchAll(PDO::FETCH_ASSOC);
    foreach($page as $event)if(!$event['checksum']||!hash_equals($event['checksum'],hash('sha256',$event['payload'])))deny('archive-integrity-failed',503);
    $snapshot=json_decode($row['snapshot'],false,512,JSON_THROW_ON_ERROR);$result=null;$duplicate=false;
    $multi=getenv('ZGE_MULTIPLAYER_WORLD')==='1'||($snapshot->schema??'')==='zge.multiplayer-construction.v1';
    $roster=array_map(fn($p)=>['id'=>$p['player_id'],'role'=>$p['role']],query($db,'SELECT player_id,role FROM memberships WHERE world_id=? AND revoked=0 ORDER BY player_id',[$worldId])->fetchAll(PDO::FETCH_ASSOC));
    $runtimeInput=['worldId'=>$worldId,'multiPlayer'=>$multi,'players'=>$roster,'playerId'=>$session['player_id'],'runtimeFault'=>getenv('ZGE_STAGING_FAULTS')==='1'?($_SERVER['HTTP_X_ZGE_RUNTIME_FAULT']??''):''];
    if($snapshot->revision!==(int)$row['revision'] || ($snapshot->checkpoint->eventSequence??0)+count($snapshot->events)!==(int)$row['cursor'])deny('world-integrity-failed',503);
    if($command) {
        $fingerprint=hash('sha256',canonical($command));$prior=query($db,'SELECT * FROM commands WHERE world_id=? AND player_id=? AND command_id=?',[$worldId,$session['player_id'],$command->commandId])->fetch(PDO::FETCH_ASSOC);
        if($prior) { $duplicate=true;$result=$prior['fingerprint']===$fingerprint?json_decode($prior['result'],true,512,JSON_THROW_ON_ERROR):['ok'=>false,'reason'=>'idempotency-conflict']; }
        else {
            $dispatch=json_decode(json_encode($command,JSON_THROW_ON_ERROR),true,512,JSON_THROW_ON_ERROR);$dispatch['commandId']=$multi?$command->commandId:json_encode([$session['player_id'],$command->commandId],JSON_THROW_ON_ERROR);
            zge_stage_end('validation');zge_stage_start('ipc');$candidate=worker([...$runtimeInput,'snapshot'=>$snapshot,'command'=>$dispatch,'runtimeFault'=>getenv('ZGE_STAGING_FAULTS')==='1'?($_SERVER['HTTP_X_ZGE_RUNTIME_FAULT']??''):'','checkpointEvery'=>max(1,min(128,(int)(getenv('ZGE_CHECKPOINT_EVERY')?:32)))]);
            zge_stage_end('ipc');zge_metrics_runtime($candidate);zge_stage_start('candidateValidation');runtime_assert_fence($db,$candidate['runtimeFence']);zge_stage_end('candidateValidation');zge_stage_start('transactionWrites');
            $result=$candidate['result'];$snapshot=$candidate['snapshot'];
            foreach($candidate['events'] as $event){query($db,'INSERT INTO events VALUES(?,?,?,?,?,?)',[$worldId,$event['sequence'],$event['id'],$event['transactionId'],$event['revision'],json_encode($event,JSON_THROW_ON_ERROR)]);query($db,'INSERT INTO event_integrity VALUES(?,?,?)',[$worldId,$event['sequence'],hash('sha256',json_encode($event,JSON_THROW_ON_ERROR))]);if($event['type']==='PersonalAchievementClaimed')query($db,'INSERT INTO player_claims VALUES(?,?,?,?)',[$worldId,$event['playerId'],$event['claimId'],$event['transactionId']]);if($event['type']==='MissionRewardApplied')query($db,'INSERT INTO rewards VALUES(?,?,?)',[$worldId,$event['rewardId'],$event['transactionId']]);}
            $cursor=(int)$row['cursor']+count($candidate['events']);
            $next=json_encode($snapshot,JSON_THROW_ON_ERROR|JSON_PRESERVE_ZERO_FRACTION);
            $updated=query($db,'UPDATE worlds SET revision=?,cursor=?,snapshot=?,checkpoint_cursor=? WHERE id=? AND revision=? AND cursor=?',[$snapshot->revision,$cursor,$next,$snapshot->checkpoint->eventSequence??0,$worldId,$row['revision'],$row['cursor']]);if($updated->rowCount()!==1)throw new RuntimeException('CAS failure');
            query($db,'INSERT INTO commands VALUES(?,?,?,?,?,?,?,?)',[$worldId,$session['player_id'],$command->commandId,$fingerprint,$snapshot->revision,$result['ok']?1:0,json_encode($result,JSON_THROW_ON_ERROR),json_encode($dispatch,JSON_THROW_ON_ERROR)]);
            if(isset($snapshot->checkpoint) && count($snapshot->ledger)===0)query($db,'INSERT INTO checkpoints VALUES(?,?,?,?,?)',[$worldId,$cursor,$snapshot->revision,$next,hash('sha256',$next)]);
            if(isset($snapshot->checkpoint) && count($snapshot->ledger)===0)query($db,'DELETE FROM checkpoints WHERE world_id=? AND cursor NOT IN (SELECT cursor FROM checkpoints WHERE world_id=? ORDER BY cursor DESC LIMIT 2)',[$worldId,$worldId]);
            if($multi)query($db,"INSERT INTO world_policies VALUES(?,'multiplayer.v1') ON CONFLICT(world_id) DO NOTHING",[$worldId]);
            query($db,'UPDATE world_integrity SET snapshot_hash=?,cursor=? WHERE world_id=?',[hash('sha256',$next),$cursor,$worldId]);
            $row['cursor']=$cursor;$row['revision']=$snapshot->revision;zge_stage_end('transactionWrites');
        }
    }
    zge_stage_end('validation');zge_stage_start('commitValidation');$fault=getenv('ZGE_STAGING_FAULTS')==='1'?($_SERVER['HTTP_X_ZGE_FAULT']??''):'';
    if($command&&!$duplicate&&$fault==='crash-before-commit')posix_kill(getmypid(),SIGKILL);
    if($command&&!$duplicate&&$fault==='rollback')throw new RuntimeException('Injected rollback');
    // Fault fixtures exercise expiry after candidate effects but before publication.
    if($fault==='wait-for-expiry'){ $deadline=microtime(true)+3;while(time()<(int)$session['expires']&&microtime(true)<$deadline)usleep(10000); }
    if($fault==='expire-before-commit')query($db,'UPDATE sessions SET expires=0 WHERE token_hash=?',[$hash]);
    zge_stage_end('commitValidation');zge_stage_start('authentication');$current=authenticate($db,$hash);zge_stage_end('authentication');zge_stage_start('commitValidation');if($command&&$current['role']!=='builder')deny('forbidden',403);
    runtime_assert_fence($db,$candidate['runtimeFence']??$lease['runtimeFence']);
    zge_stage_end('commitValidation');zge_stage_start('commit');$db->exec('COMMIT');zge_stage_end('commit');$inTransaction=false;$GLOBALS['zge_metrics']['transactionMs']=(hrtime(true)-$GLOBALS['zge_metrics']['transactionStart'])/1e6;$GLOBALS['zge_metrics']['transactionStart']=null;zge_admission_release($permit);
    if($command&&!$duplicate&&$fault==='crash-after-commit')posix_kill(getmypid(),SIGKILL);
    if($command&&!$duplicate&&$fault==='worker-after-commit'){runtime_ipc_request('fault',['action'=>'crash-worker','worldId'=>$worldId]);zge_world_response(['ok'=>false,'reason'=>'acknowledgment-lost'],503);}
    if($command&&!$duplicate&&$fault==='lose-ack')zge_world_response(['ok'=>false,'reason'=>'acknowledgment-lost'],503);
    zge_stage_start('eventRead');$events=query($db,'SELECT e.payload,i.checksum FROM events e LEFT JOIN event_integrity i ON i.world_id=e.world_id AND i.sequence=e.sequence WHERE e.world_id=? AND e.sequence>=? AND e.sequence<? ORDER BY e.sequence LIMIT 128',[$worldId,$since,$row['cursor']])->fetchAll(PDO::FETCH_ASSOC);
    foreach($events as $event)if(!$event['checksum']||!hash_equals($event['checksum'],hash('sha256',$event['payload'])))deny('archive-integrity-failed',503);
    zge_stage_end('eventRead');zge_stage_start('ipc');$runtime=isset($candidate)&&empty($input->replay)?$candidate:worker([...$runtimeInput,'snapshot'=>$snapshot,'replay'=>!empty($input->replay)]);
    zge_stage_end('ipc');if(!isset($candidate)||!empty($input->replay))zge_metrics_runtime($runtime);zge_stage_start('authentication');$fresh=authenticate($db,$hash);check_connection($db,$fresh,$input->connectionId??null,$command===null,60);zge_stage_end('authentication');zge_stage_start('receiptConstruction');
    $view=$multi?($runtime['projection']??throw new RuntimeException('Private projection required')):$snapshot;
    $publicEvents=array_map(fn($e)=>filter_private_event(json_decode($e['payload'],true,512,JSON_THROW_ON_ERROR),$session['player_id'],$multi),$events);
    zge_stage_end('receiptConstruction');zge_world_response(['ok'=>true,'protocol'=>'zge.session.v1','sessionId'=>$session['session_id'],'connectionId'=>$input->connectionId??null,'expires'=>(int)$session['expires'],'snapshotChecksum'=>$multi?$runtime['projectionChecksum']:$runtime['snapshotChecksum'],'result'=>$result,'duplicate'=>$duplicate,'identity'=>['playerId'=>$session['player_id'],'worldId'=>$worldId,'role'=>$session['role']], 'revision'=>(int)$row['revision'],'cursor'=>(int)$row['cursor'],'nextCursor'=>$events?$since+count($events):$since,'events'=>$publicEvents,'snapshot'=>$view,'world'=>$runtime['world'],'replay'=>$runtime['replay'],'runtime'=>['generation'=>$runtime['runtimeFence']['generation'],'workerId'=>$runtime['runtimeFence']['workerId']],'acknowledgment'=>['kind'=>'sqlite-commit','revision'=>(int)$row['revision']]]);
} catch(RuntimeGatewayException $e) { if($inTransaction)$db->exec('ROLLBACK');zge_world_response(['ok'=>false,'reason'=>$e->reason],$e->reason==='queue-full'?429:503); }
catch(HttpFailure $e) { if($inTransaction)$db->exec('ROLLBACK');zge_world_response(['ok'=>false,'reason'=>$e->reason],$e->status); }
catch(JsonException|TypeError $e) { if($inTransaction)$db->exec('ROLLBACK');zge_world_response(['ok'=>false,'reason'=>'invalid-payload'],422); }
catch(Throwable $e) { if($inTransaction)$db->exec('ROLLBACK');error_log('ZGE staging transaction failed: '.get_class($e));zge_world_response(['ok'=>false,'reason'=>'transaction-aborted'],503); }
