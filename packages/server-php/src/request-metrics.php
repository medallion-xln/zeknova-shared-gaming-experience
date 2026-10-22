<?php
declare(strict_types=1);
/** Monotonic handler timings. No headers, credentials or peer-private payloads. */
function zge_metrics_start(): void {
    $GLOBALS['zge_metrics']=['start'=>hrtime(true),'marks'=>[],'stages'=>[],'meta'=>['worldId'=>null,'commandId'=>null,'commandClass'=>'state','transactionId'=>null,'generation'=>null],'runtime'=>['queueWaitMs'=>0.0,'evaluationMs'=>0.0],'transactionStart'=>null,'transactionMs'=>0.0];
}
function zge_stage_start(string $name): void { $GLOBALS['zge_metrics']['marks'][$name]=hrtime(true); }
function zge_stage_end(string $name): void {
    $m=&$GLOBALS['zge_metrics'];if(!isset($m['marks'][$name]))return;
    $m['stages'][$name]=($m['stages'][$name]??0)+(hrtime(true)-$m['marks'][$name])/1e6;unset($m['marks'][$name]);
}
function zge_metrics_runtime(array $runtime): void {
    $m=&$GLOBALS['zge_metrics'];foreach(['queueWaitMs','evaluationMs'] as $key)$m['runtime'][$key]+=(float)($runtime['runtimeMetrics'][$key]??0);
    if(isset($runtime['runtimeFence']['generation']))$m['meta']['generation']=(int)$runtime['runtimeFence']['generation'];
}
function zge_metrics_finish(array $data): array {
    $m=&$GLOBALS['zge_metrics'];foreach(array_keys($m['marks']) as $name)zge_stage_end($name);
    if($m['transactionStart']!==null)$m['transactionMs']=(hrtime(true)-$m['transactionStart'])/1e6;
    zge_stage_start('responseSerialization');json_encode($data,JSON_THROW_ON_ERROR);zge_stage_end('responseSerialization');
    $names=['payload','databaseOpen','quota','authentication','authorization','runtimeEnsure','admission','lockWait','validation','ipc','candidateValidation','transactionWrites','commitValidation','commit','eventRead','receiptConstruction','responseSerialization'];
    $stages=[];foreach($names as $name)$stages[$name]=round($m['stages'][$name]??0,6);
    return ['schema'=>'zge.command-metrics.v1',...$m['meta'],'stagesMs'=>$stages,'runtime'=>$m['runtime'],'transactionMs'=>round($m['transactionMs'],6),'totalMs'=>round((hrtime(true)-$m['start'])/1e6,6),'upstreamQueueMs'=>null];
}
