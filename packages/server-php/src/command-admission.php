<?php
declare(strict_types=1);
/** Bounded local scheduling only; SQLite + generation fencing remains authority. */
function zge_admission_path(string $world): string {
    $db=getenv('ZGE_STAGING_DB');$parent=dirname($db?:'');$real=realpath($parent);$tmp=realpath('/tmp');
    if(!$db||!str_starts_with($db,'/tmp/')||!$real||$real!==$tmp.substr($parent,4)||(fileperms($parent)&0077)!==0||is_link($parent))throw new RuntimeException('Private admission directory required');
    return $parent.'/admission-'.hash('sha256',$world).'.json';
}
function zge_admission_change(string $path,callable $change): mixed {
    // Keep the lock inode stable; atomically replace a separate metadata file.
    // SIGKILL during publication leaves the old complete state or the new one.
    $lockPath=$path.'.lock';$pendingPath=$path.'.pending';
    foreach([$path,$lockPath,$pendingPath] as $file)if(is_link($file))throw new RuntimeException('Private admission file required');
    $handle=fopen($lockPath,'c+');if(!$handle)throw new RuntimeException('Admission unavailable');
    $private=function($file):void{$stat=fstat($file);if(($stat['mode']&0170000)!==0100000||($stat['mode']&0077)!==0||$stat['nlink']!==1||(function_exists('posix_geteuid')&&$stat['uid']!==posix_geteuid()))throw new RuntimeException('Private admission file required');};
    try {
        $private($handle);$deadline=hrtime(true)+100000000;
        while(!flock($handle,LOCK_EX|LOCK_NB)){if(hrtime(true)>$deadline)deny('admission-busy',429);usleep(1000);}
        $raw='';if(is_file($path)){$source=fopen($path,'r');if(!$source)throw new RuntimeException('Admission unavailable');try{$private($source);$raw=stream_get_contents($source,65537);}finally{fclose($source);}}
        if(strlen($raw)>65536)throw new RuntimeException('Admission metadata too large');
        $state=$raw===''?['version'=>1,'queue'=>[],'active'=>null,'lastActor'=>null,'peak'=>0,'admitted'=>0,'rejected'=>0]:json_decode($raw,true,32,JSON_THROW_ON_ERROR);
        if(($state['version']??null)!==1||!is_array($state['queue']??null)||count($state['queue'])+($state['active']?1:0)>16)throw new RuntimeException('Invalid admission metadata');
        $now=hrtime(true)/1e6;
        $alive=fn($entry)=>$entry&&is_int($entry['pid']??null)&&$entry['pid']>0&&$now>=($entry['createdMs']??INF)&&($now-$entry['createdMs'])<30000&&(!function_exists('posix_kill')||posix_kill($entry['pid'],0));
        $state['queue']=array_values(array_filter($state['queue'],$alive));if(!$alive($state['active']))$state['active']=null;
        $result=$change($state);$json=json_encode($state,JSON_THROW_ON_ERROR);
        $pending=fopen($pendingPath,'c+');if(!$pending)throw new RuntimeException('Admission unavailable');
        try{$private($pending);if(!ftruncate($pending,0))throw new RuntimeException('Admission metadata write failed');if(getenv('ZGE_STAGING_FAULTS')==='1'&&getenv('ZGE_ADMISSION_FAULT')==='crash-during-publication')posix_kill(getmypid(),SIGKILL);if(fwrite($pending,$json)!==strlen($json)||!fflush($pending))throw new RuntimeException('Admission metadata write failed');}finally{fclose($pending);}
        if(getenv('ZGE_STAGING_FAULTS')==='1'&&getenv('ZGE_ADMISSION_FAULT')==='crash-before-publication')posix_kill(getmypid(),SIGKILL);
        if(!rename($pendingPath,$path))throw new RuntimeException('Admission metadata publish failed');
        return $result;
    } finally {flock($handle,LOCK_UN);fclose($handle);}
}
function zge_admit(string $world,string $player,string $class): array {
    umask(0077);$path=zge_admission_path($world);$token=bin2hex(random_bytes(16));$actor=hash('sha256',$player);$created=hrtime(true)/1e6;
    $classLimit=match($class){'movement','construction'=>8,'session-control'=>4,default=>0};if(!$classLimit)throw new RuntimeException('Unsupported command class');
    $entry=['token'=>$token,'actor'=>$actor,'class'=>$class,'pid'=>getmypid(),'createdMs'=>$created];
    $registered=zge_admission_change($path,function(&$s)use($entry,$classLimit){
        $all=[...$s['queue'],...($s['active']?[$s['active']]:[])];
        if(count($all)>=16||count(array_filter($all,fn($p)=>$p['actor']===$entry['actor']))>=2||count(array_filter($all,fn($p)=>$p['class']===$entry['class']))>=$classLimit){$s['rejected']++;return false;}
        $s['queue'][]=$entry;$s['peak']=max($s['peak'],count($all)+1);return true;
    });
    if(!$registered)deny('admission-full',429);
    $permit=['path'=>$path,'token'=>$token];$GLOBALS['zge_admission_permits'][$token]=$permit;
    register_shutdown_function(function()use($permit){try{zge_admission_release($permit);}catch(Throwable){}});
    // Monotonic deadline, independent from wall-clock session/lease policy.
    $waitMs=2000;if(getenv('ZGE_STAGING_FAULTS')==='1')$waitMs=max(50,min(10000,(int)(getenv('ZGE_ADMISSION_WAIT_MS')?:2000)));
    try {
        do {
            $accepted=zge_admission_change($path,function(&$s)use($token){
                if($s['active'])return false;
                // Round robin actors, FIFO for each actor; never coalesce commands.
                $index=0;foreach($s['queue'] as $i=>$queued)if($queued['actor']!==$s['lastActor']){$index=$i;break;}
                if(($s['queue'][$index]['token']??null)!==$token)return false;
                $s['active']=array_splice($s['queue'],$index,1)[0];$s['lastActor']=$s['active']['actor'];$s['admitted']++;return true;
            });
            if($accepted)return [...$permit,'waitMs'=>hrtime(true)/1e6-$created];
            if(connection_aborted())deny('client-disconnected',409);
            usleep(2000);
        }while(hrtime(true)/1e6-$created<$waitMs);
        deny('admission-timeout',429);
    } catch(Throwable $error){zge_admission_release($permit);throw $error;}
}
function zge_admission_release(?array $permit): void {
    if(!$permit||!isset($GLOBALS['zge_admission_permits'][$permit['token']]))return;
    zge_admission_change($permit['path'],function(&$s)use($permit){$s['queue']=array_values(array_filter($s['queue'],fn($p)=>$p['token']!==$permit['token']));if(($s['active']['token']??null)===$permit['token'])$s['active']=null;});
    unset($GLOBALS['zge_admission_permits'][$permit['token']]);
}
