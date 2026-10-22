<?php
declare(strict_types=1);
require_once __DIR__.'/runtime-lease.php';
final class RuntimeGatewayException extends RuntimeException { public function __construct(public readonly string $reason) { parent::__construct($reason); } }
function runtime_ipc_request(string $operation,array $input): array {
    $path=getenv('ZGE_RUNTIME_SOCKET');$keyPath=getenv('ZGE_RUNTIME_KEY_FILE');
    if(!$path||!$keyPath||!str_starts_with($path,'/tmp/')||!str_starts_with($keyPath,'/tmp/')||is_link($path)||is_link($keyPath)||!is_file($keyPath)||(fileperms($keyPath)&0077)!==0)throw new RuntimeException('Private runtime transport required');
    $parent=dirname($path);if(realpath($parent)!==realpath(dirname($keyPath))||(fileperms($parent)&0077)!==0||realpath($parent)!==realpath('/tmp').substr($parent,4))throw new RuntimeException('Private runtime directory required');
    if(function_exists('posix_geteuid')&&(fileowner($keyPath)!==posix_geteuid()||fileowner($parent)!==posix_geteuid()))throw new RuntimeException('Runtime ownership mismatch');
    $key=trim(file_get_contents($keyPath));if(!preg_match('/^[a-f0-9]{64}$/D',$key))throw new RuntimeException('Invalid runtime credential');
    $id=bin2hex(random_bytes(16));$body=json_encode(['version'=>1,'id'=>$id,'key'=>$key,'op'=>$operation,'input'=>$input],JSON_THROW_ON_ERROR|JSON_PRESERVE_ZERO_FRACTION)."\n";
    $limit=8*1024*1024;if(strlen($body)>$limit)throw new RuntimeException('Runtime message too large');
    $socket=@stream_socket_client('unix://'.$path,$error,$message,2,STREAM_CLIENT_CONNECT);if(!$socket)throw new RuntimeException('Runtime unavailable');
    stream_set_timeout($socket,3);$offset=0;
    try {
        while($offset<strlen($body)){ $written=fwrite($socket,substr($body,$offset));if(!$written)throw new RuntimeException('Runtime write failed');$offset+=$written; }
        $response='';while(!str_ends_with($response,"\n")){ $part=fgets($socket,min(65536,$limit+1-strlen($response)));if($part===false)throw new RuntimeException('Runtime response unavailable');$response.=$part;if(strlen($response)>$limit)throw new RuntimeException('Runtime response too large'); }
        $decoded=json_decode($response,true,512,JSON_THROW_ON_ERROR);
        if(($decoded['id']??null)!==$id||($decoded['version']??null)!==1)throw new RuntimeGatewayException('runtime-protocol');
        if(($decoded['ok']??null)!==true)throw new RuntimeGatewayException(match($decoded['reason']??'') { 'runtime-backpressure'=>'queue-full', 'worker-exited'=>'worker-crashed', 'stale-runtime-fence'=>'stale-generation', default=>'runtime-unavailable' });
        $data=$decoded['data'];$objects=json_decode($response,false,512,JSON_THROW_ON_ERROR)->data;
        foreach(['snapshot','world','projection'] as $field)if(property_exists($objects,$field))$data[$field]=$objects->$field;
        return $data;
    } finally { fclose($socket); }
}
function runtime_ensure_world(string $world): array {return runtime_ipc_request('ensure',['worldId'=>$world]);}
function supervised_worker(array $input): array {
    $data=runtime_ipc_request('evaluate',$input);
    return $data;
}
