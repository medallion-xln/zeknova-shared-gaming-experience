<?php
declare(strict_types=1);
require_once __DIR__.'/bootstrap.php';
final class HttpFailure extends RuntimeException { public function __construct(public string $reason, public int $status) { parent::__construct($reason); } }
function deny(string $reason,int $status): never { throw new HttpFailure($reason,$status); }
function body(array $fields): stdClass {
    if(($_SERVER['REQUEST_METHOD']??'')!=='POST')deny('method-not-allowed',405);
    // Authentication is exclusively an explicit header. Cookies cannot authorize requests.
    if(isset($_SERVER['HTTP_ORIGIN']) && $_SERVER['HTTP_ORIGIN']!==('http://'.($_SERVER['HTTP_HOST']??'')))deny('origin-forbidden',403);
    $raw=file_get_contents('php://input',false,null,0,65537);
    if(strlen($raw)>65536)deny('request-too-large',413);
    $input=json_decode($raw,false,64,JSON_THROW_ON_ERROR);
    if(!$input instanceof stdClass)deny('invalid-request',422);
    if(array_diff(array_keys(get_object_vars($input)),$fields))deny('forbidden-request-fields',422);
    return $input;
}
function limit_requests(PDO $db,string $scope,int $limit): void {
    $bucket=intdiv(time(),60);
    query($db,'DELETE FROM rate_limits WHERE bucket<?',[$bucket-1]);
    query($db,'INSERT INTO rate_limits VALUES(?,?,1) ON CONFLICT(scope,bucket) DO UPDATE SET requests=requests+1',[$scope,$bucket]);
    if((int)query($db,'SELECT requests FROM rate_limits WHERE scope=? AND bucket=?',[$scope,$bucket])->fetchColumn()>$limit)deny('rate-limited',429);
}
/** One short metadata transaction, preserving fixed-minute quotas under concurrency. */
function limit_request_scopes(PDO $db,array $scopes): void {
    $bucket=intdiv(time(),60);$reason=null;$started=false;
    try {
        $db->exec('BEGIN IMMEDIATE');$started=true;
        query($db,'DELETE FROM rate_limits WHERE bucket<?',[$bucket-1]);
        foreach($scopes as [$scope,$limit]){
            $statement=query($db,'INSERT INTO rate_limits VALUES(?,?,1) ON CONFLICT(scope,bucket) DO UPDATE SET requests=requests+1 RETURNING requests',[$scope,$bucket]);
            $count=(int)$statement->fetchColumn();$statement->closeCursor();
            if($count>$limit){$reason='rate-limited';break;}
        }
        $db->exec('COMMIT');$started=false;
    }catch(Throwable $error){if($started)$db->exec('ROLLBACK');throw $error;}
    if($reason)deny($reason,429);
}
function access_token(): string {
    if(!preg_match('/^Bearer ([a-f0-9]{48})$/D',$_SERVER['HTTP_AUTHORIZATION']??'',$m))deny('unauthorized',401);
    return hash('sha256',$m[1]);
}
function authenticate(PDO $db,string $hash): array {
    $session=query($db,'SELECT s.*,m.session_id,m.version FROM sessions s JOIN session_meta m ON m.token_hash=s.token_hash JOIN memberships a ON a.player_id=s.player_id AND a.world_id=s.world_id WHERE s.token_hash=? AND s.expires>? AND m.revoked=0 AND m.version=1 AND a.revoked=0',[$hash,time()])->fetch(PDO::FETCH_ASSOC);
    if(!$session)deny('unauthorized',401);
    // Membership is the current source of permissions; the original token role is informational only.
    $session['role']=query($db,'SELECT role FROM memberships WHERE player_id=? AND world_id=?',[$session['player_id'],$session['world_id']])->fetchColumn();
    return $session;
}
function check_connection(PDO $db,array $session,?string $connection,bool $touch=true,int $minimumInterval=0): void {
    if($connection===null)return; // v1 clients supported explicitly, with the same authorization checks.
    if(!preg_match('/^[a-f0-9]{32}$/D',$connection))deny('invalid-connection',422);
    $row=query($db,'SELECT * FROM connections WHERE id=? AND token_hash=? AND session_id=? AND disconnected=0',[$connection,$session['token_hash'],$session['session_id']])->fetch(PDO::FETCH_ASSOC);
    if(!$row)deny('connection-closed',409);
    if($touch&&(int)$row['last_seen']<=time()-$minimumInterval)query($db,'UPDATE connections SET last_seen=? WHERE id=?',[time(),$connection]);
}
function verify_world(PDO $db,array $row): void {
    $seal=query($db,'SELECT * FROM world_integrity WHERE world_id=?',[$row['id']])->fetch(PDO::FETCH_ASSOC);
    if(!$seal || !hash_equals($seal['snapshot_hash'],hash('sha256',$row['snapshot'])) || (int)$seal['cursor']!==(int)$row['cursor'])deny('world-integrity-failed',503);
    $archive=query($db,'SELECT COUNT(*) AS n,MAX(sequence) AS last,MIN(sequence) AS first FROM events WHERE world_id=?',[$row['id']])->fetch(PDO::FETCH_ASSOC);
    if((int)$archive['n']!==(int)$row['cursor'] || ($archive['n']>0&&((int)$archive['last']!==((int)$row['cursor']-1)||(int)$archive['first']!==0)))deny('archive-integrity-failed',503);
    foreach(query($db,'SELECT snapshot,checksum FROM checkpoints WHERE world_id=?',[$row['id']])->fetchAll(PDO::FETCH_ASSOC) as $cp)if(!hash_equals($cp['checksum'],hash('sha256',$cp['snapshot'])))deny('checkpoint-integrity-failed',503);
}
/** Actor-specific event projection; sequence is stable but private payloads and
 * another client's logical command IDs never cross the HTTP boundary. */
function filter_private_event(array $event,?string $player,bool $project=false): array {
    if(!$project&&!isset($event['visibility']) && !isset($event['actorId']) && !isset($event['playerId']))return $event;
    $order=(int)($event['order']??0);$sequence=(int)$event['sequence'];
    $transaction=json_encode(['projection',$event['worldId'],$sequence-$order],JSON_THROW_ON_ERROR|JSON_UNESCAPED_SLASHES);
    $identity=['schema'=>$event['schema'],'id'=>json_encode([$event['worldId'],$transaction,$order],JSON_THROW_ON_ERROR|JSON_UNESCAPED_SLASHES),'worldId'=>$event['worldId'],'transactionId'=>$transaction,'revision'=>$event['revision'],'sequence'=>$sequence,'authority'=>$event['authority'],'order'=>$order];
    if(($event['visibility']??'')==='private'&&($event['playerId']??null)!==$player)return [...$identity,'type'=>'EventRedacted'];
    return [...$event,...$identity];
}
