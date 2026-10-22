import test from 'node:test';
import assert from 'node:assert/strict';
import net from 'node:net';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp,readFile,writeFile,chmod } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { startSupervisor } from '../runtime/supervisor.mjs';
const exec=promisify(execFile),leasePath=fileURLToPath(new URL('../src/runtime-lease.php',import.meta.url));
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function fixture(options={}){
 const dir=await mkdtemp('/tmp/zge08-runtime-');await chmod(dir,0o700);const dbPath=dir+'/world.sqlite',socketPath=dir+'/runtime.sock',keyPath=dir+'/ipc.key';
 await exec('php',['-r',"$db=new PDO('sqlite:'.$argv[1]);$db->exec('CREATE TABLE world_leases(world_id TEXT PRIMARY KEY,owner TEXT,generation INTEGER,expires INTEGER,worker_id TEXT)');chmod($argv[1],0600);",dbPath]);
 const service=await startSupervisor({dbPath,socketPath,keyPath,faults:true,...options});const key=(await readFile(keyPath,'utf8')).trim();
 const request=(op,input={},credential=key)=>new Promise((resolve,reject)=>{
  const socket=net.createConnection(socketPath),id='test-'+Math.random();let output='';socket.setTimeout(6000,()=>socket.destroy(Error('test IPC timeout')));socket.on('error',reject);socket.on('connect',()=>socket.write(JSON.stringify({version:1,id,key:credential,op,input})+'\n'));socket.on('data',chunk=>output+=chunk);socket.on('end',()=>{try{resolve(JSON.parse(output));}catch{reject(Error('invalid test response'));}});
 });
 return{dir,dbPath,socketPath,keyPath,service,request};
}
test('private supervised runtime reuses one executor, reconciles rolled-back candidate and denies unauthenticated IPC',async()=>{
 const f=await fixture();try{
  assert.equal((await f.request('health',{},'0'.repeat(64))).ok,false);
  const ensured=await f.request('ensure',{worldId:'valley'});assert.equal(ensured.ok,true);
  const first=await f.request('evaluate',{worldId:'valley'});assert.equal(first.ok,true);
  const snapshot=first.data.snapshot;
  const move=await f.request('evaluate',{worldId:'valley',snapshot,command:{action:'move',commandId:'speculative',expectedRevision:0,dx:0.2,dz:0}});
  assert.equal(move.ok,true);assert.equal(move.data.result.ok,true);
  const read=await f.request('evaluate',{worldId:'valley',snapshot});assert.equal(read.data.snapshot.revision,0);
  assert.equal(read.data.runtimeFence.workerId,first.data.runtimeFence.workerId);
  assert.equal(f.service.health().metrics.workerStarts,1);assert.equal(f.service.health().metrics.completed,3);
  assert.equal((await f.request('health')).data.metrics.authenticationFailures,1);
 }finally{await f.service.close();}
});
test('worker death rejects its request, restarts with a larger SQL fence and bounded queue reports backpressure',async()=>{
 const f=await fixture({queueCapacity:1});try{
  const initial=await f.request('ensure',{worldId:'valley'});const generation=initial.data.runtimeFence.generation;
  const crashing=await f.request('evaluate',{worldId:'valley',runtimeFault:'crash-during-validation'});assert.equal(crashing.ok,false);
  let resumed;for(let i=0;i<50;i++){await wait(30);resumed=await f.request('ensure',{worldId:'valley'});if(resumed.ok)break;}
  assert.equal(resumed.ok,true);assert.ok(resumed.data.runtimeFence.generation>generation);
  const delayed=f.request('evaluate',{worldId:'valley',runtimeFault:'delay-response'});await wait(60);
  const rejected=await f.request('evaluate',{worldId:'valley'});assert.equal(rejected.reason,'runtime-backpressure');
  assert.equal((await delayed).ok,false);assert.ok(f.service.health().metrics.timeouts>=1);
 }finally{await f.service.close();}
});
test('competing supervisor cannot claim a live world and a missed heartbeat permanently retires its owner',async()=>{
 const f=await fixture({leaseMs:1400,heartbeatMs:300,timeoutMs:500});let competitor;
 try{
  assert.equal((await f.request('ensure',{worldId:'valley'})).ok,true);
  competitor=await startSupervisor({dbPath:f.dbPath,socketPath:f.dir+'/other.sock',keyPath:f.dir+'/other.key',leaseMs:1400,heartbeatMs:300,timeoutMs:500});
  const challenger=await new Promise((resolve,reject)=>{const s=net.createConnection(f.dir+'/other.sock'),id='competitor';let output='';readFile(f.dir+'/other.key','utf8').then(key=>s.write(JSON.stringify({version:1,id,key:key.trim(),op:'ensure',input:{worldId:'valley'}})+'\n'));s.on('data',chunk=>output+=chunk);s.on('end',()=>resolve(JSON.parse(output)));s.on('error',reject);});
  assert.equal(challenger.ok,false);
  assert.equal((await f.request('fault',{action:'pause-heartbeat'})).ok,true);await wait(1500);
  assert.equal((await f.request('evaluate',{worldId:'valley'})).ok,false);
  const expired=f.service.health().worlds[0];assert.equal(expired.state,'fenced');
  assert.equal(f.service.health().metrics.completed,0);
 }finally{await competitor?.close();await f.service.close();}
});
test('graceful supervisor shutdown drains accepted bounded queue and disposes its worker and private socket',async()=>{const f=await fixture({queueCapacity:8,shutdownMs:1500});try{await f.request('ensure',{worldId:'valley'});const tasks=Array.from({length:4},()=>f.request('evaluate',{worldId:'valley',runtimeFault:'delay-short-response'}));for(let i=0;i<100&&f.service.health().metrics.accepted<4;i++)await wait(5);assert.equal(f.service.health().metrics.accepted,4);await f.service.close();const results=await Promise.all(tasks);assert.equal(results.filter(r=>r.ok).length,4);assert.equal(f.service.health().metrics.completed,4);}finally{await f.service.close();}});
test('whole supervisor SIGKILL leaves a refused socket that safely recovers under a new fenced owner',async()=>{const{spawn}=await import('node:child_process');const f=await fixture();let child;try{await f.service.close();const start=()=>new Promise((resolve,reject)=>{child=spawn(process.execPath,['packages/server-php/test/helpers/crash-supervisor.mjs'],{env:{...process.env,ZGE_RUNTIME_SOCKET:f.socketPath,ZGE_RUNTIME_KEY_FILE:f.keyPath,ZGE_STAGING_DB:f.dbPath},stdio:['ignore','pipe','ignore']});child.once('exit',()=>reject(Error('supervisor startup failed')));child.stdout.once('data',resolve);});await start();const before=await f.request('ensure',{worldId:'valley'});assert.equal(before.ok,true);await assert.rejects(startSupervisor({dbPath:f.dbPath,socketPath:f.socketPath,keyPath:f.keyPath,recoverStaleSocket:true}),/socket active/);child.kill('SIGKILL');await new Promise(resolve=>child.once('exit',resolve));await wait(1550);await start();const after=await f.request('ensure',{worldId:'valley'});assert.equal(after.ok,true);assert.notEqual(after.data.runtimeFence.owner,before.data.runtimeFence.owner);assert.ok(after.data.runtimeFence.generation>before.data.runtimeFence.generation);assert.equal((await f.request('evaluate',{worldId:'valley'})).ok,true);}finally{if(child&&child.exitCode===null&&!child.signalCode)await new Promise(resolve=>{child.once('exit',resolve);child.kill('SIGTERM');});await f.service.close();}});
