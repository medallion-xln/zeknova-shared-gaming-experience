<?php
declare(strict_types=1);
// Deliberately independent of api/bootstrap.php and all production configuration.
function staging_enabled(): bool { return getenv('ZGE_STAGING_ENABLED') === '1' && getenv('ZEKNOVA_ENV') === 'zge-staging' && in_array($_SERVER['REMOTE_ADDR'] ?? '127.0.0.1', ['127.0.0.1','::1'], true); }
function db(): PDO {
    umask(0077);
    $path = getenv('ZGE_STAGING_DB');
    if (!$path || !str_starts_with($path, '/tmp/') || is_link($path)) throw new RuntimeException('Isolated temporary database required');
    $parent=dirname($path);$real=realpath($parent);$tmp=realpath('/tmp');
    if(!$real || !str_starts_with($real,$tmp.'/') || $real!==$tmp.substr($parent,4) || (fileperms($parent)&0077)!==0 || (is_file($path)&&(fileperms($path)&0077)!==0))throw new RuntimeException('Private staging directory required');
    if(function_exists('posix_geteuid')&&(fileowner($parent)!==posix_geteuid()||(is_file($path)&&fileowner($path)!==posix_geteuid())))throw new RuntimeException('Staging ownership mismatch');
    // Managed readers/lease helpers must never create a replacement empty DB
    // when an established database temporarily disappears. URI mode=rw also
    // closes the existence-check/open race without granting create permission.
    $existingOnly=getenv('ZGE_REQUIRE_EXISTING_DB')==='1';
    if($existingOnly&&!is_file($path))throw new RuntimeException('Established staging database unavailable');
    $expectedDevice=getenv('ZGE_EXPECTED_DB_DEVICE');$expectedInode=getenv('ZGE_EXPECTED_DB_INODE');
    if($expectedDevice!==false||$expectedInode!==false){clearstatcache(true,$path);$identity=@stat($path);if(!$identity||(string)$identity['dev']!==$expectedDevice||(string)$identity['ino']!==$expectedInode)throw new RuntimeException('Established staging database identity mismatch');}
    $dsn=$existingOnly?'sqlite:file:'.strtr($path,['%'=>'%25','?'=>'%3F','#'=>'%23']).'?mode=rw':'sqlite:'.$path;
    $db = new PDO($dsn, null, null, [PDO::ATTR_ERRMODE=>PDO::ERRMODE_EXCEPTION]);
    $db->exec('PRAGMA foreign_keys=ON; PRAGMA busy_timeout=15000; PRAGMA synchronous=FULL;');
    return $db;
}
function query(PDO $db, string $sql, array $params=[]): PDOStatement { $stmt=$db->prepare($sql); $stmt->execute($params); return $stmt; }
function canonical(mixed $v): string {
    $sort=function($x) use (&$sort) { if (is_object($x)) { $a=get_object_vars($x); ksort($a,SORT_STRING); foreach($a as $k=>$v) $a[$k]=$sort($v); return (object)$a; } if(is_array($x)) return array_map($sort,$x); return $x; };
    return json_encode($sort($v), JSON_THROW_ON_ERROR|JSON_UNESCAPED_SLASHES|JSON_UNESCAPED_UNICODE);
}
function worker(array $input): array {
    if(PHP_SAPI!=='cli'&&getenv('ZGE_RUNTIME_SOCKET')){require_once __DIR__.'/runtime-ipc.php';return supervised_worker($input);}
    $node=getenv('ZGE_NODE_PATH'); if (!$node || !is_executable($node)) throw new RuntimeException('Configured Node runtime required');
    $pipes=[]; $proc=proc_open([$node,__DIR__.'/worker.mjs'], [['pipe','r'],['pipe','w'],['pipe','w']],$pipes,null,['PATH'=>getenv('PATH') ?: '/usr/bin:/bin']);
    if(!is_resource($proc))throw new RuntimeException('Runtime worker unavailable');
    fwrite($pipes[0],json_encode($input,JSON_THROW_ON_ERROR));fclose($pipes[0]);
    stream_set_timeout($pipes[1],10);$output=stream_get_contents($pipes[1]);$meta=stream_get_meta_data($pipes[1]);fclose($pipes[1]);if($meta['timed_out'])proc_terminate($proc,9);$error=stream_get_contents($pipes[2]);fclose($pipes[2]);
    if($meta['timed_out'])proc_terminate($proc,9);$exit=proc_close($proc);
    if($exit!==0 || $meta['timed_out'])throw new RuntimeException('Authoritative worker rejected input');
    $result=json_decode($output,true,512,JSON_THROW_ON_ERROR);$objects=json_decode($output,false,512,JSON_THROW_ON_ERROR);$result['snapshot']=$objects->snapshot;$result['world']=$objects->world;return $result;
}
function response(array $data,int $status=200): never { if(isset($GLOBALS['zge_admission_permits']))foreach($GLOBALS['zge_admission_permits'] as $permit)zge_admission_release($permit);if(isset($GLOBALS['zge_metrics']))$data['metrics']=zge_metrics_finish($data);http_response_code($status);header('Content-Type: application/json');header('Cache-Control: no-store');header('X-Content-Type-Options: nosniff');echo json_encode($data,JSON_THROW_ON_ERROR);exit; }
