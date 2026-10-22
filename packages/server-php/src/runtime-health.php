<?php
declare(strict_types=1);
require __DIR__.'/security.php';require __DIR__.'/runtime-ipc.php';
if(!staging_enabled())response(['ok'=>false,'reason'=>'staging-disabled'],404);
try{$input=body(['worldId']);$db=db();$s=authenticate($db,access_token());if(($input->worldId??null)!==$s['world_id'])deny('cross-world-access',403);limit_requests($db,'health:'.hash('sha256',$s['player_id'].'|'.$s['world_id']),60);$health=runtime_ipc_request('health',[]);response(['ok'=>true,'protocol'=>'zge.runtime-health.v1','state'=>$health['state'],'limits'=>$health['limits'],'worlds'=>array_values(array_filter($health['worlds'],fn($w)=>$w['worldId']===$s['world_id']))]);}
catch(HttpFailure $e){response(['ok'=>false,'reason'=>$e->reason],$e->status);}catch(Throwable $e){response(['ok'=>false,'reason'=>'runtime-unavailable'],503);}
