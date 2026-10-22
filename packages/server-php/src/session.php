<?php
declare(strict_types=1);
require_once __DIR__.'/security.php';
if(!staging_enabled())response(['ok'=>false,'reason'=>'staging-disabled'],404);
$db=null;$transaction=false;
try {
 $input=body(['action','worldId','connectionId']);$db=db();
 // Bound both valid and invalid authentication attempts independently of token selection.
 limit_requests($db,'session-ip:'.hash('sha256',$_SERVER['REMOTE_ADDR']??'loopback'),60);
 $db->exec('BEGIN IMMEDIATE');$transaction=true;
 if(($input->action??'')==='reauthenticate'){
  if(!preg_match('/^Refresh ([a-f0-9]{64})$/D',$_SERVER['HTTP_AUTHORIZATION']??'',$m))deny('unauthorized',401);
  $c=query($db,'SELECT c.*,a.role FROM credentials c JOIN memberships a ON a.player_id=c.player_id AND a.world_id=c.world_id WHERE secret_hash=? AND c.expires>? AND c.revoked=0 AND a.revoked=0',[hash('sha256',$m[1]),time()])->fetch(PDO::FETCH_ASSOC);
  if(!$c)deny('unauthorized',401);
  if(($input->worldId??null)!==$c['world_id'])deny('cross-world-access',403);
   query($db,'UPDATE session_meta SET revoked=1 WHERE session_id=? AND token_hash NOT IN (SELECT token_hash FROM session_meta WHERE session_id=? AND revoked=0 ORDER BY created DESC,rowid DESC LIMIT 7)',[$c['session_id'],$c['session_id']]);
  $token=bin2hex(random_bytes(24));$hash=hash('sha256',$token);$expires=time()+900;
  query($db,'INSERT INTO sessions VALUES(?,?,?,?,?)',[$hash,$c['player_id'],$c['world_id'],$c['role'],$expires]);
  query($db,'INSERT INTO session_meta VALUES(?,?,?,0,1)',[$hash,$c['session_id'],time()]);
  $out=['token'=>$token,'expires'=>$expires,'sessionId'=>$c['session_id'],'identity'=>['playerId'=>$c['player_id'],'worldId'=>$c['world_id'],'role'=>$c['role']]];
 }else{
  $hash=access_token();$s=authenticate($db,$hash);if(($input->worldId??null)!==$s['world_id'])deny('cross-world-access',403);
  if(($input->action??'')==='connect'){
   query($db,'DELETE FROM connections WHERE last_seen<?',[time()-86400]);
   $connection=bin2hex(random_bytes(16));query($db,'INSERT INTO connections VALUES(?,?,?,?,0)',[$connection,$s['session_id'],$hash,time()]);
   $out=['sessionId'=>$s['session_id'],'connectionId'=>$connection,'expires'=>(int)$s['expires'],'identity'=>['playerId'=>$s['player_id'],'worldId'=>$s['world_id'],'role'=>$s['role']]];
  }elseif(($input->action??'')==='disconnect'){
   check_connection($db,$s,$input->connectionId??'');query($db,'UPDATE connections SET disconnected=1 WHERE id=?',[$input->connectionId]);$out=['disconnected'=>true];
  }elseif(($input->action??'')==='revoke'){
   query($db,'UPDATE session_meta SET revoked=1 WHERE session_id=?',[$s['session_id']]);query($db,'UPDATE credentials SET revoked=1 WHERE session_id=?',[$s['session_id']]);query($db,'UPDATE connections SET disconnected=1 WHERE session_id=?',[$s['session_id']]);$out=['revoked'=>true];
  }else deny('invalid-session-action',422);
 }
 $db->exec('COMMIT');$transaction=false;response(['ok'=>true,'protocol'=>'zge.session.v1',...$out]);
}catch(HttpFailure $e){if($transaction)$db->exec('ROLLBACK');response(['ok'=>false,'reason'=>$e->reason],$e->status);}
catch(JsonException|TypeError $e){if($transaction)$db->exec('ROLLBACK');response(['ok'=>false,'reason'=>'invalid-payload'],422);}
catch(Throwable $e){if($transaction)$db->exec('ROLLBACK');response(['ok'=>false,'reason'=>'session-unavailable'],503);}
