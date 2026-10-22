/** Run only during reserved benchmark window. Owned disposable fixtures only. */
import {spawn} from 'node:child_process';
import {mkdirSync,openSync,closeSync,writeFileSync} from 'node:fs';
const root=process.env.ZGE_EVIDENCE_DIR||'/tmp/zge-bench01/multiplayer/workloads';mkdirSync(root,{recursive:true});
const seconds=Number(process.env.ZGE_DURATION_SECONDS||30),recoverySeconds=Math.max(36,Number(process.env.ZGE_RECOVERY_SECONDS||45));
const operations=[];
const execute=(label,args,extra)=>new Promise((resolve,reject)=>{const log=openSync(root+'/'+label+'.log','w');const child=spawn(process.execPath,args,{env:{...process.env,ZGE_EVIDENCE_DIR:root,ZGE_MANAGED_SERVICE:'1',ZGE_RUNTIME_FAULTS:'1',...extra},stdio:['ignore',log,log]});child.once('error',reject);child.once('exit',(code,signal)=>{closeSync(log);operations.push({label,code,signal,completedAt:new Date().toISOString()});writeFileSync(root+'/run-results.json',JSON.stringify({schema:'zge.bench01.multiplayer-run.v1',operations},null,2));if(code!==0)reject(Error(label+' failed; see owned evidence log'));else{console.log(label+' PASS');resolve();}});});
await execute('bursts',['scripts/zge-bench01-multiplayer.mjs','matrix'],{ZGE_PROFILES:'movement,construction,mixed,read,history,recovery',ZGE_COMMAND_COUNT:'48'});
for(const clients of[2,4,8]){
 await execute('sustained-'+clients,['scripts/zge-bench01-multiplayer.mjs','sustained'],{ZGE_CLIENTS:String(clients),ZGE_PROFILES:'movement,construction,mixed,read,history',ZGE_DURATION_SECONDS:String(seconds),ZGE_REQUESTS_PER_SECOND:'6'});
 await execute('recovery-'+clients,['scripts/zge-bench01-multiplayer.mjs','sustained'],{ZGE_CLIENTS:String(clients),ZGE_PROFILES:'recovery',ZGE_DURATION_SECONDS:String(recoverySeconds),ZGE_REQUESTS_PER_SECOND:'6'});
}
