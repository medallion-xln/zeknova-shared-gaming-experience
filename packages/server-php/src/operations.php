<?php
declare(strict_types=1);
require_once __DIR__.'/security.php';

// This operator tool is intentionally not routed over HTTP. A backup contains
// hashed authentication records and must receive the same protection as its DB.
function ops_private(string $path, bool $directory): void {
    $stat=@lstat($path);$real=realpath($path);$tmp=realpath('/tmp');
    if(!$stat||!$real||!str_starts_with($path,'/tmp/')||$real!==$tmp.substr($path,4)||is_link($path)||($directory?!is_dir($path):!is_file($path))||($stat['mode']&0077)!==0||(function_exists('posix_geteuid')&&$stat['uid']!==posix_geteuid()))throw new RuntimeException('private-path-required');
}
function ops_new_target(string $path): void {
    if(!preg_match('~^/tmp/.+/[a-zA-Z0-9_.-]+$~D',$path)||in_array(basename($path),['.','..'],true)||file_exists($path)||is_link($path))throw new RuntimeException('new-target-required');
    ops_private(dirname($path),true);
}
function ops_schema(PDO $db): string {
    return hash('sha256',canonical(query($db,"SELECT type,name,tbl_name,sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY type,name")->fetchAll(PDO::FETCH_ASSOC)));
}
function ops_policy(): array {
    $root=dirname(__DIR__,3);$files=['examples/construction-world/world.js','packages/server-php/src/schema.sql','packages/server-php/src/worker.mjs','packages/server-php/src/recover.php','packages/server-php/src/recover-multiplayer.php','packages/server-php/runtime/evaluator.mjs','src/game/OfficerRank.js','src/game/CampaignPlan.js','src/world/Biomes.js'];
    foreach(['core','gameplay-construction','gameplay-missions'] as $package){$it=new RecursiveIteratorIterator(new RecursiveDirectoryIterator($root.'/packages/'.$package.'/src',FilesystemIterator::SKIP_DOTS));foreach($it as $file)if($file->isFile()&&in_array($file->getExtension(),['js','mjs'],true))$files[]=substr($file->getPathname(),strlen($root)+1);}
    sort($files,SORT_STRING);$hashes=[];foreach($files as $file)$hashes[$file]=hash_file('sha256',$root.'/'.$file);
    return ['algorithm'=>'sha256','files'=>$hashes,'digest'=>hash('sha256',canonical((object)$hashes))];
}
function ops_publish(string $pending,string $target,string $marker): void {
    // mkdir is the exclusive claim: rename alone can replace an existing empty
    // directory. The manifest/provenance marker is published last. An interrupted
    // target without that marker is never a valid bundle and is never reused.
    if(!@mkdir($target,0700))throw new RuntimeException('publication-target-exists');
    foreach(glob($pending.'/*')?:[] as $file)if(basename($file)!==$marker&&!rename($file,$target.'/'.basename($file)))throw new RuntimeException('publication-failed');
    if(!rename($pending.'/'.$marker,$target.'/'.$marker)||!rmdir($pending))throw new RuntimeException('publication-failed');
}
function ops_flush(string $path): void { $handle=fopen($path,'r+b');if(!$handle||!fflush($handle)||!fsync($handle))throw new RuntimeException('file-sync-failed');fclose($handle);chmod($path,0600); }
function ops_fault(string $phase): void { if(getenv('ZGE_STAGING_FAULTS')==='1'&&getenv('ZGE_OPERATIONS_FAULT')===$phase){posix_kill(getmypid(),SIGKILL);exit(1);} }
function ops_readonly(string $path): PDO {ops_private($path,false);$db=new PDO('sqlite:file:'.$path.'?mode=ro',null,null,[PDO::ATTR_ERRMODE=>PDO::ERRMODE_EXCEPTION]);$db->exec('PRAGMA query_only=ON; PRAGMA busy_timeout=15000');return $db;}
function ops_replay(string $path,array $worlds,string $scratch): void {
    // Existing recovery is run only against an expendable copy. The published
    // snapshot/unknown fields are never rewritten by this verification step.
    $copy=$scratch.'/replay.sqlite';if(!copy($path,$copy))throw new RuntimeException('replay-copy-failed');chmod($copy,0600);
    $env=getenv();$env['ZGE_STAGING_DB']=$copy;
    try{foreach($worlds as $world){$pipes=[];$proc=proc_open([PHP_BINARY,__DIR__.'/recover.php',$world['worldId']],[['pipe','r'],['pipe','w'],['pipe','w']],$pipes,null,$env);if(!is_resource($proc))throw new RuntimeException('replay-unavailable');fclose($pipes[0]);$output=stream_get_contents($pipes[1]);fclose($pipes[1]);stream_get_contents($pipes[2]);fclose($pipes[2]);$code=proc_close($proc);if($code!==0)throw new RuntimeException('archive-replay-failed');$result=json_decode($output,true,512,JSON_THROW_ON_ERROR);if(!$result['ok']||$result['revision']!==$world['revision']||$result['cursor']!==$world['cursor'])throw new RuntimeException('archive-replay-mismatch');}}
    finally{foreach([$copy,$copy.'-wal',$copy.'-shm'] as $file)if(is_file($file))unlink($file);}
}
function ops_validate(string $path,string $scratch): array {
    $db=ops_readonly($path);
    if(query($db,'PRAGMA integrity_check')->fetchColumn()!=='ok'||query($db,'PRAGMA foreign_key_check')->fetch())throw new RuntimeException('sqlite-integrity-failed');
    $tables=query($db,"SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name")->fetchAll(PDO::FETCH_COLUMN);$counts=[];
    foreach($tables as $table)$counts[$table]=(int)query($db,'SELECT COUNT(*) FROM "'.str_replace('"','""',$table).'"')->fetchColumn();
    foreach(['worlds','commands','events','checkpoints','rewards','world_integrity','event_integrity'] as $table)if(!array_key_exists($table,$counts))throw new RuntimeException('required-schema-missing');
    $worlds=[];
    foreach(query($db,'SELECT * FROM worlds ORDER BY id')->fetchAll(PDO::FETCH_ASSOC) as $row){
        if(!preg_match('/^[a-zA-Z0-9_.:-]{1,120}$/D',$row['id']))throw new RuntimeException('world-id-invalid');
        verify_world($db,$row);$snapshot=json_decode($row['snapshot'],false,512,JSON_THROW_ON_ERROR);
        if($snapshot->worldId!==$row['id']||$snapshot->revision!==(int)$row['revision']||($snapshot->checkpoint->eventSequence??0)+count($snapshot->events)!==(int)$row['cursor'])throw new RuntimeException('snapshot-cursor-mismatch');
        worker(['worldId'=>$row['id'],'snapshot'=>$snapshot]);
        $cursor=0;$revision=0;$events=query($db,'SELECT e.*,i.checksum FROM events e LEFT JOIN event_integrity i ON i.world_id=e.world_id AND i.sequence=e.sequence WHERE e.world_id=? ORDER BY e.sequence',[$row['id']]);
        while($event=$events->fetch(PDO::FETCH_ASSOC)){$value=json_decode($event['payload'],true,512,JSON_THROW_ON_ERROR);if(!$event['checksum']||!hash_equals($event['checksum'],hash('sha256',$event['payload']))||(int)$event['sequence']!==$cursor||$value['sequence']!==$cursor||$value['worldId']!==$row['id']||$value['id']!==$event['event_id']||$value['transactionId']!==$event['transaction_id']||$value['revision']!==(int)$event['revision']||(int)$event['revision']<$revision)throw new RuntimeException('event-integrity-failed');$cursor++;$revision=(int)$event['revision'];}
        if($cursor!==(int)$row['cursor']||$revision>(int)$row['revision'])throw new RuntimeException('archive-cursor-mismatch');
        foreach(query($db,'SELECT * FROM checkpoints WHERE world_id=?',[$row['id']])->fetchAll(PDO::FETCH_ASSOC) as $cp){$value=json_decode($cp['snapshot'],false,512,JSON_THROW_ON_ERROR);if((int)$cp['cursor']>(int)$row['cursor']||(int)$cp['revision']>(int)$row['revision']||$value->revision!==(int)$cp['revision']||($value->checkpoint->eventSequence??0)+count($value->events)!==(int)$cp['cursor'])throw new RuntimeException('checkpoint-bounds-invalid');worker(['worldId'=>$row['id'],'snapshot'=>$value]);}
        foreach(query($db,'SELECT * FROM commands WHERE world_id=? ORDER BY rowid',[$row['id']])->fetchAll(PDO::FETCH_ASSOC) as $entry){$command=json_decode($entry['command'],false,512,JSON_THROW_ON_ERROR);if($command->commandId!==$entry['command_id']&&$command->commandId!==json_encode([$entry['player_id'],$entry['command_id']],JSON_THROW_ON_ERROR))throw new RuntimeException('receipt-identity-invalid');$command->commandId=$entry['command_id'];if(!hash_equals($entry['fingerprint'],hash('sha256',canonical($command))))throw new RuntimeException('receipt-fingerprint-invalid');$receipt=json_decode($entry['result'],true,512,JSON_THROW_ON_ERROR);if(!is_bool($receipt['ok']??null)||(int)$entry['accepted']!==($receipt['ok']?1:0)||(int)$entry['revision']>(int)$row['revision'])throw new RuntimeException('receipt-result-invalid');}
        $worlds[]=['worldId'=>$row['id'],'revision'=>(int)$row['revision'],'cursor'=>(int)$row['cursor'],'commands'=>(int)query($db,'SELECT COUNT(*) FROM commands WHERE world_id=?',[$row['id']])->fetchColumn(),'rewards'=>(int)query($db,'SELECT COUNT(*) FROM rewards WHERE world_id=?',[$row['id']])->fetchColumn()];
    }
    // Orphans in pre-existing tables without declared foreign keys are invalid.
    foreach(['commands','events','checkpoints','rewards','player_claims','event_integrity','world_integrity'] as $table)if(query($db,'SELECT 1 FROM "'.$table.'" a LEFT JOIN worlds w ON w.id=a.world_id WHERE w.id IS NULL LIMIT 1')->fetchColumn())throw new RuntimeException('orphan-archive-record');
    if($counts['event_integrity']!==$counts['events'])throw new RuntimeException('event-seal-count-invalid');
    $schema=ops_schema($db);$db=null;ops_replay($path,$worlds,$scratch);
    return ['schemaSha256'=>$schema,'worlds'=>$worlds,'records'=>$counts];
}
function ops_bundle(string $directory,string $scratch): array {
    ops_private($directory,true);$manifestPath=$directory.'/manifest.json';$path=$directory.'/world.sqlite';ops_private($manifestPath,false);ops_private($path,false);
    if(filesize($manifestPath)>1048576)throw new RuntimeException('manifest-too-large');$manifest=json_decode(file_get_contents($manifestPath),true,64,JSON_THROW_ON_ERROR);
    if(($manifest['schema']??null)!=='zge.staging.backup.v1'||($manifest['database']['file']??null)!=='world.sqlite')throw new RuntimeException('backup-schema-incompatible');
    if(canonical($manifest['contentPolicy']??null)!==canonical(ops_policy()))throw new RuntimeException('runtime-policy-incompatible');
    if(($manifest['database']['bytes']??null)!==filesize($path)||!hash_equals($manifest['database']['sha256']??'',hash_file('sha256',$path)))throw new RuntimeException('backup-file-integrity-failed');
    $validated=ops_validate($path,$scratch);foreach(['schemaSha256','worlds','records'] as $key)if(canonical($manifest[$key]??null)!==canonical($validated[$key]))throw new RuntimeException('backup-manifest-mismatch');
    return $manifest;
}

if(PHP_SAPI!=='cli'||!staging_enabled()){if(PHP_SAPI!=='cli')http_response_code(404);exit(1);}
umask(0077);$started=hrtime(true);$pending=null;
try{
    $action=$argv[1]??'';
    if($action==='backup'){
        $target=$argv[2]??'';ops_new_target($target);$pending=dirname($target).'/.zge-backup-'.bin2hex(random_bytes(12));if(!mkdir($pending,0700))throw new RuntimeException('private-staging-failed');
        $db=db();$db->exec('VACUUM INTO '.$db->quote($pending.'/world.sqlite'));$db=null;chmod($pending.'/world.sqlite',0600);ops_fault('after-snapshot');
        $validation=ops_validate($pending.'/world.sqlite',$pending);$manifest=['schema'=>'zge.staging.backup.v1','createdAtUtc'=>gmdate('Y-m-d\TH:i:s\Z'),'sqliteVersion'=>query(ops_readonly($pending.'/world.sqlite'),'SELECT sqlite_version()')->fetchColumn(),'database'=>['file'=>'world.sqlite','bytes'=>filesize($pending.'/world.sqlite'),'sha256'=>hash_file('sha256',$pending.'/world.sqlite')],'contentPolicy'=>ops_policy(),...$validation];
        if(file_put_contents($pending.'/manifest.json',json_encode($manifest,JSON_THROW_ON_ERROR|JSON_PRETTY_PRINT))===false)throw new RuntimeException('manifest-write-failed');ops_flush($pending.'/world.sqlite');ops_flush($pending.'/manifest.json');ops_fault('before-publication');
        ops_publish($pending,$target,'manifest.json');$pending=null;
        echo json_encode(['ok'=>true,'schema'=>'zge.operations.v1','operation'=>'backup','bytes'=>$manifest['database']['bytes'],'records'=>$manifest['records'],'worlds'=>$manifest['worlds'],'ms'=>(hrtime(true)-$started)/1e6],JSON_THROW_ON_ERROR)."\n";
    }elseif($action==='restore'){
        $source=$argv[2]??'';$target=$argv[3]??'';ops_new_target($target);$pending=dirname($target).'/.zge-restore-'.bin2hex(random_bytes(12));if(!mkdir($pending,0700))throw new RuntimeException('private-staging-failed');
        $manifest=ops_bundle($source,$pending);ops_fault('after-validation');if(!copy($source.'/world.sqlite',$pending.'/world.sqlite'))throw new RuntimeException('restore-copy-failed');chmod($pending.'/world.sqlite',0600);ops_flush($pending.'/world.sqlite');
        if(!hash_equals($manifest['database']['sha256'],hash_file('sha256',$pending.'/world.sqlite')))throw new RuntimeException('restore-copy-mismatch');
        file_put_contents($pending.'/restore-provenance.json',json_encode(['schema'=>'zge.restore.v1','sourceDatabaseSha256'=>$manifest['database']['sha256'],'sourceSchemaSha256'=>$manifest['schemaSha256'],'contentPolicyDigest'=>$manifest['contentPolicy']['digest'],'restoredAtUtc'=>gmdate('Y-m-d\TH:i:s\Z')],JSON_THROW_ON_ERROR|JSON_PRETTY_PRINT));ops_flush($pending.'/restore-provenance.json');ops_fault('before-publication');
        ops_publish($pending,$target,'restore-provenance.json');$pending=null;
        echo json_encode(['ok'=>true,'schema'=>'zge.operations.v1','operation'=>'restore','bytes'=>$manifest['database']['bytes'],'records'=>$manifest['records'],'worlds'=>$manifest['worlds'],'ms'=>(hrtime(true)-$started)/1e6],JSON_THROW_ON_ERROR)."\n";
    }else throw new RuntimeException('unsupported-operation');
}catch(Throwable $error){
    // Only our own uncommitted files are removed. SIGKILL may leave a private
    // pending directory, which cannot be mistaken for a published backup.
    if($pending&&is_dir($pending)){foreach(glob($pending.'/*')?:[] as $file)if(is_file($file)&&!is_link($file))unlink($file);@rmdir($pending);}
    fwrite(STDERR,"Staging operation rejected: ".($error instanceof HttpFailure?'archive-integrity-failed':(preg_match('/^[a-z-]+$/D',$error->getMessage())?$error->getMessage():'validation-failed'))."\n");exit(1);
}
