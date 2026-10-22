<?php
declare(strict_types=1);
require __DIR__.'/security.php';
require_once __DIR__.'/request-metrics.php';zge_metrics_start();$GLOBALS['zge_metrics']['meta']['commandClass']='history';
if(!staging_enabled())response(['ok'=>false,'reason'=>'staging-disabled'],404);
$db=null;$transaction=false;
try{
 zge_stage_start('payload');$input=body(['worldId','cursor','limit','throughCursor','connectionId']);zge_stage_end('payload');zge_stage_start('databaseOpen');$db=db();zge_stage_end('databaseOpen');
 zge_stage_start('quota');limit_requests($db,'events-ip:'.hash('sha256',$_SERVER['REMOTE_ADDR']??'loopback'),600);
 zge_stage_end('quota');zge_stage_start('authentication');$hash=access_token();zge_stage_end('authentication');zge_stage_start('lockWait');$db->exec('BEGIN');zge_stage_end('lockWait');$transaction=true;$GLOBALS['zge_metrics']['transactionStart']=hrtime(true);zge_stage_start('authentication');$s=authenticate($db,$hash);zge_stage_end('authentication');zge_stage_start('authorization');$GLOBALS['zge_metrics']['meta']['worldId']=$s['world_id'];
 if(($input->worldId??null)!==$s['world_id'])deny('cross-world-access',403);
 check_connection($db,$s,$input->connectionId??null,false);
 zge_stage_end('authorization');zge_stage_start('validation');$row=query($db,'SELECT * FROM worlds WHERE id=?',[$s['world_id']])->fetch(PDO::FETCH_ASSOC);verify_world($db,$row);
 $project=query($db,'SELECT model FROM world_policies WHERE world_id=?',[$s['world_id']])->fetchColumn()==='multiplayer.v1';
 $cursor=property_exists($input,'cursor')?$input->cursor:0;$limit=property_exists($input,'limit')?$input->limit:128;$end=property_exists($input,'throughCursor')?$input->throughCursor:(int)$row['cursor'];
 if(!is_int($cursor)||$cursor<0||!is_int($limit)||$limit<1||$limit>256||!is_int($end)||$end<0)deny('invalid-cursor',422);
 if($cursor>$end||$end>(int)$row['cursor'])deny('cursor-ahead',409);
 zge_stage_end('validation');zge_stage_start('eventRead');$rows=query($db,'SELECT e.sequence,e.payload,i.checksum FROM events e LEFT JOIN event_integrity i ON i.world_id=e.world_id AND i.sequence=e.sequence WHERE e.world_id=? AND e.sequence>=? AND e.sequence<? ORDER BY e.sequence LIMIT ?',[$s['world_id'],$cursor,$end,$limit])->fetchAll(PDO::FETCH_ASSOC);$events=[];
 foreach($rows as $row){if((int)$row['sequence']!==$cursor+count($events)||!$row['checksum']||!hash_equals($row['checksum'],hash('sha256',$row['payload'])))deny('archive-integrity-failed',503);$event=json_decode($row['payload'],true,512,JSON_THROW_ON_ERROR);if($event['worldId']!==$s['world_id']||$event['sequence']!==(int)$row['sequence'])deny('archive-integrity-failed',503);$events[]=filter_private_event($event,$s['player_id'],$project);}
 if($cursor<$end&&!$events)deny('archive-integrity-failed',503);
 zge_stage_end('eventRead');zge_stage_start('commit');$db->exec('COMMIT');zge_stage_end('commit');$transaction=false;$GLOBALS['zge_metrics']['transactionMs']=(hrtime(true)-$GLOBALS['zge_metrics']['transactionStart'])/1e6;$GLOBALS['zge_metrics']['transactionStart']=null;zge_stage_start('authentication');$fresh=authenticate($db,$hash);check_connection($db,$fresh,$input->connectionId??null,true,60);zge_stage_end('authentication');
 response(['ok'=>true,'protocol'=>'zge.events.v1','worldId'=>$s['world_id'],'cursor'=>$end,'nextCursor'=>$cursor+count($events),'events'=>$events]);
}catch(HttpFailure $e){if($transaction)$db->exec('ROLLBACK');response(['ok'=>false,'reason'=>$e->reason],$e->status);}
catch(Throwable $e){if($transaction)$db->exec('ROLLBACK');response(['ok'=>false,'reason'=>'history-unavailable'],503);}
