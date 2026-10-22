<?php
declare(strict_types=1);
require_once __DIR__.'/bootstrap.php';
/** Lease changes use the same SQLite serialization boundary as gameplay. */
function runtime_lease_change(PDO $db,array $input): array {
    $world=$input['worldId']??null;$owner=$input['owner']??null;$action=$input['action']??null;
    if(!is_string($world)||!preg_match('/^[a-zA-Z0-9._:-]{1,120}$/D',$world)||!is_string($owner)||!preg_match('/^[a-zA-Z0-9._:-]{1,120}$/D',$owner))throw new RuntimeException('Invalid lease identity');
    $ttl=$input['ttlMs']??10000;if(!is_int($ttl)||$ttl<1000||$ttl>60000)throw new RuntimeException('Invalid lease duration');
    $now=(int)floor(microtime(true)*1000);$db->exec('BEGIN IMMEDIATE');
    try {
        $row=query($db,'SELECT * FROM world_leases WHERE world_id=?',[$world])->fetch(PDO::FETCH_ASSOC);
        if($action==='acquire') {
            // A process whose own lease expired must retire its identity. It may
            // not resurrect a cached executor after losing the heartbeat.
            if($row&&((int)$row['expires']>$now||$row['owner']===$owner))throw new RuntimeException('Lease unavailable');
            $generation=$row?(int)$row['generation']+1:1;$worker=$input['workerId']??'';
            if(!is_string($worker)||!preg_match('/^[a-zA-Z0-9._:-]{1,120}$/D',$worker))throw new RuntimeException('Invalid worker identity');
            query($db,'INSERT INTO world_leases(world_id,owner,generation,expires,worker_id) VALUES(?,?,?,?,?) ON CONFLICT(world_id) DO UPDATE SET owner=excluded.owner,generation=excluded.generation,expires=excluded.expires,worker_id=excluded.worker_id',[$world,$owner,$generation,$now+$ttl,$worker]);
        } else {
            if(!$row||$row['owner']!==$owner||(int)$row['generation']!==($input['generation']??null)||(int)$row['expires']<=$now)throw new RuntimeException('Stale runtime lease');
            $generation=(int)$row['generation'];$worker=$row['worker_id'];
            if($action==='bump') { $generation++;$worker=$input['workerId']??'';if(!is_string($worker)||!preg_match('/^[a-zA-Z0-9._:-]{1,120}$/D',$worker))throw new RuntimeException('Invalid worker identity'); }
            elseif(!in_array($action,['renew','release'],true))throw new RuntimeException('Invalid lease action');
            query($db,'UPDATE world_leases SET generation=?,worker_id=?,expires=? WHERE world_id=? AND owner=?',[$generation,$worker,$action==='release'?0:$now+$ttl,$world,$owner]);
        }
        $row=query($db,'SELECT * FROM world_leases WHERE world_id=?',[$world])->fetch(PDO::FETCH_ASSOC);$db->exec('COMMIT');
        return ['worldId'=>$world,'owner'=>$row['owner'],'generation'=>(int)$row['generation'],'expires'=>(int)$row['expires'],'workerId'=>$row['worker_id']];
    } catch(Throwable $e) { if($db->inTransaction())$db->exec('ROLLBACK');else try{$db->exec('ROLLBACK');}catch(Throwable){} throw $e; }
}
function runtime_assert_fence(PDO $db,array $fence): void {
    $row=query($db,'SELECT owner,generation,expires,worker_id FROM world_leases WHERE world_id=?',[$fence['worldId']??''])->fetch(PDO::FETCH_ASSOC);
    $now=(int)floor(microtime(true)*1000);
    if(!$row||!is_string($fence['owner']??null)||!hash_equals($row['owner'],$fence['owner'])||(int)$row['generation']!==($fence['generation']??null)||$row['worker_id']!==($fence['workerId']??null)||(int)$row['expires']<=$now)throw new RuntimeException('Stale runtime fence');
}
if(PHP_SAPI==='cli'&&realpath($_SERVER['SCRIPT_FILENAME']??'')===__FILE__) {
    if(!staging_enabled()) { fwrite(STDERR,"staging-disabled\n");exit(1); }
    try { $raw=stream_get_contents(STDIN,4097);if(strlen($raw)>4096)throw new RuntimeException('Oversized lease message');$input=json_decode($raw,true,16,JSON_THROW_ON_ERROR);echo json_encode(['ok'=>true,'fence'=>runtime_lease_change(db(),$input)],JSON_THROW_ON_ERROR); }
    catch(Throwable $e) { echo json_encode(['ok'=>false,'reason'=>'lease-unavailable']);exit(1); }
}
