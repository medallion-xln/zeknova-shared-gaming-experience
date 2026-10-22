import net from 'node:net';
import { fork, spawn } from 'node:child_process';
import { randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { mkdir, stat, lstat, realpath, chmod, readFile, writeFile, unlink } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const workerPath=fileURLToPath(new URL('./world-worker.mjs',import.meta.url));
const leasePath=fileURLToPath(new URL('../src/runtime-lease.php',import.meta.url));
const validId=value=>typeof value==='string'&&/^[A-Za-z0-9._:-]{1,120}$/.test(value);
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
/** One private transport, bounded world executors, SQLite-fenced candidates. */
export async function startSupervisor(options={}){
 const socketPath=options.socketPath??process.env.ZGE_RUNTIME_SOCKET;
 const keyPath=options.keyPath??process.env.ZGE_RUNTIME_KEY_FILE;
 const dbPath=options.dbPath??process.env.ZGE_STAGING_DB;
 const phpPath=options.phpPath??process.env.ZGE_PHP_PATH??'php';
 const owner=options.owner??`supervisor-${randomUUID()}`;
 const leaseMs=options.leaseMs??10000,heartbeatMs=options.heartbeatMs??2000;
 const queueCapacity=options.queueCapacity??16,timeoutMs=options.timeoutMs??2000,startupMs=options.startupMs??2500,shutdownMs=options.shutdownMs??3000;
 const faults=options.faults===true||process.env.ZGE_RUNTIME_FAULTS==='1';
 const maxFrame=options.maxFrame??8*1024*1024,maxWorlds=options.maxWorlds??16,maxConnections=options.maxConnections??64;
 if(!validId(owner)||!socketPath?.startsWith('/tmp/')||!keyPath?.startsWith('/tmp/')||!dbPath?.startsWith('/tmp/')||path.dirname(socketPath)!==path.dirname(keyPath)||socketPath.length>100)throw Error('invalid private runtime configuration');
 const databaseIdentity=await lstat(dbPath,{bigint:true});if(!databaseIdentity.isFile()||databaseIdentity.isSymbolicLink())throw Error('existing runtime database required');
 if(!Number.isInteger(queueCapacity)||queueCapacity<1||queueCapacity>256||!Number.isInteger(maxWorlds)||maxWorlds<1||maxWorlds>256||timeoutMs>=leaseMs||heartbeatMs*2>=leaseMs)throw Error('invalid runtime limits');
 const directory=path.dirname(socketPath);await mkdir(directory,{recursive:true,mode:0o700});
 const directoryStat=await lstat(directory),tmp=await realpath('/tmp');
 if(directoryStat.isSymbolicLink()||(directoryStat.mode&0o077)!==0||directoryStat.uid!==process.getuid()||await realpath(directory)!==tmp+directory.slice(4))throw Error('private runtime directory required');
 let key;
 try{const info=await lstat(keyPath);if(info.isSymbolicLink()||(info.mode&0o077)!==0||info.uid!==process.getuid())throw Error('private runtime key required');key=(await readFile(keyPath,'utf8')).trim();}
 catch(error){if(error.code!=='ENOENT')throw error;key=randomBytes(32).toString('hex');await writeFile(keyPath,key,{mode:0o600,flag:'wx'});}
 if(!/^[a-f0-9]{64}$/.test(key))throw Error('invalid runtime key');
 // Explicit crash recovery can remove only an owned, private, refused socket.
 // An exclusive claim prevents two recovering launchers unlinking a new owner.
 try{
  const old=await lstat(socketPath);
  if(!options.recoverStaleSocket||!old.isSocket()||old.uid!==process.getuid()||(old.mode&0o077)!==0)throw Error('runtime socket already exists');
  const claim=socketPath+'.recovery-lock';await writeFile(claim,owner,{mode:0o600,flag:'wx'});
  try{
   await new Promise((resolve,reject)=>{const probe=net.createConnection(socketPath);probe.setTimeout(300,()=>{probe.destroy();reject(Error('runtime socket uncertain'));});probe.once('connect',()=>{probe.destroy();reject(Error('runtime socket active'));});probe.once('error',error=>{probe.destroy();if(['ECONNREFUSED','ENOENT'].includes(error.code))resolve();else reject(Error('runtime socket uncertain'));});});
   const current=await lstat(socketPath);if(current.ino!==old.ino||current.dev!==old.dev||current.uid!==old.uid)throw Error('runtime socket ownership changed');
   await unlink(socketPath);
  }finally{await unlink(claim).catch(()=>{});}
 }catch(error){if(error.code!=='ENOENT')throw error;}
 let closing=false,heartbeatPaused=false;
 const worlds=new Map(),connections=new Set();
 const metrics={accepted:0,rejected:0,completed:0,failed:0,restarts:0,timeouts:0,staleReplies:0,authenticationFailures:0,leaseFailures:0,queuePeak:0,workerStarts:0,totalEvaluationMs:0};
 async function lease(action,entry,workerId=entry.workerId){
  return new Promise((resolve,reject)=>{
   const child=spawn(phpPath,[leasePath],{stdio:['pipe','pipe','ignore'],env:{PATH:process.env.PATH??'/usr/bin:/bin',ZGE_STAGING_ENABLED:'1',ZEKNOVA_ENV:'zge-staging',ZGE_STAGING_DB:dbPath,ZGE_REQUIRE_EXISTING_DB:'1',ZGE_EXPECTED_DB_DEVICE:String(databaseIdentity.dev),ZGE_EXPECTED_DB_INODE:String(databaseIdentity.ino)}});
   let output='';const timer=setTimeout(()=>{child.kill('SIGKILL');reject(Error('lease-timeout'));},Math.min(leaseMs,4000));
   child.on('error',()=>{clearTimeout(timer);reject(Error('lease-unavailable'));});
   child.stdout.on('data',part=>{output+=part;if(output.length>8192)child.kill('SIGKILL');});
   child.on('close',code=>{clearTimeout(timer);try{const result=JSON.parse(output);if(code!==0||!result.ok)throw Error();resolve(result.fence);}catch{reject(Error('lease-unavailable'));}});
   child.stdin.on('error',()=>{});child.stdin.end(JSON.stringify({action,worldId:entry.worldId,owner,generation:entry.fence?.generation,workerId,ttlMs:leaseMs}));
  });
 }
 function failQueued(entry,reason){if(entry.active){clearTimeout(entry.active.timer);entry.active.reject(Error(reason));entry.active=null;}for(const task of entry.queue.splice(0))task.reject(Error(reason));}
 function retire(entry,reason){entry.lastFailure=reason;entry.state='fenced';metrics.leaseFailures++;failQueued(entry,reason);entry.child?.kill('SIGKILL');}
 async function start(entry){
  if(closing||entry.state==='fenced')throw Error('runtime-unavailable');
  entry.state='starting';
  if(entry.renewPromise)await entry.renewPromise;
  if(entry.state==='fenced')throw Error('lease-unavailable');
  entry.workerId=`worker-${randomUUID()}`;
  try{entry.fence=await lease(entry.fence?'bump':'acquire',entry);}
  catch{if(entry.fence)retire(entry,'lease-unavailable');else{entry.state='blocked';entry.lastFailure='lease-held-or-unavailable';entry.retryAfter=Date.now()+250;metrics.leaseFailures++;}throw Error('lease-unavailable');}
  if(closing){await lease('release',entry).catch(()=>{});throw Error('runtime-shutting-down');}
  const child=fork(workerPath,[],{execArgv:[],stdio:['ignore','ignore','ignore','ipc'],env:{PATH:process.env.PATH??'/usr/bin:/bin',ZGE_RUNTIME_WORLD:entry.worldId,ZGE_RUNTIME_WORKER:entry.workerId,ZGE_RUNTIME_FAULTS:faults?'1':'0'},serialization:'json'});entry.child=child;metrics.workerStarts++;
  await new Promise((resolve,reject)=>{
   const timer=setTimeout(()=>{child.kill('SIGKILL');reject(Error('worker-startup-timeout'));},startupMs);
   entry.readyReject=reject;
   child.on('message',message=>{
    if(message.op==='ready'&&message.worldId===entry.worldId&&message.workerId===entry.workerId){clearTimeout(timer);entry.readyReject=null;entry.state='ready';entry.failures=0;resolve();pump(entry);}
    else if(message.op==='result'){
     const task=entry.active;
     if(!task||message.id!==task.id||message.workerId!==entry.workerId||child!==entry.child||entry.state!=='ready'){metrics.staleReplies++;return;}
     clearTimeout(task.timer);entry.active=null;metrics.totalEvaluationMs+=performance.now()-task.started;
     if(message.error){metrics.failed++;task.reject(Error('runtime-validation-failed'));}
     else if(entry.fence.expires<=Date.now()){metrics.staleReplies++;task.reject(Error('stale-runtime-fence'));retire(entry,'stale-runtime-fence');}
     else{metrics.completed++;entry.telemetry={pid:child.pid,memory:message.data.runtimeMetrics?.memory??null,gc:message.data.runtimeMetrics?.gc??null};entry.evaluation=message.data.evaluation??null;task.resolve({...message.data,runtimeMetrics:{...message.data.runtimeMetrics,queueWaitMs:task.started-task.enqueued},runtimeFence:{...entry.fence}});}
     pump(entry);
    }
   });
   child.on('error',()=>{clearTimeout(timer);reject(Error('worker-start-failed'));});
   child.on('exit',()=>{
    clearTimeout(timer);entry.readyReject?.(Error('worker-exited'));entry.readyReject=null;
    if(child!==entry.child)return;
    // The gateway must receive failure and roll back BEFORE bumping SQL fence.
    failQueued(entry,'worker-exited');entry.child=null;
    if(closing||entry.state==='fenced')return;
    entry.state='backoff';entry.lastFailure='worker-exited';metrics.restarts++;entry.failures++;
    entry.restartTimer=setTimeout(()=>{entry.starting=start(entry).catch(()=>{});},Math.min(1000,50*2**Math.min(entry.failures,4)));
   });
  });
 }
 async function ensure(worldId){
  if(!validId(worldId)||closing)throw Error('invalid-world');
  let entry=worlds.get(worldId);
  if(!entry){if(worlds.size>=maxWorlds)throw Error('world-capacity');entry={worldId,queue:[],active:null,child:null,fence:null,state:'new',failures:0,renewing:false};worlds.set(worldId,entry);entry.starting=start(entry);entry.starting.catch(()=>{});}
  if(entry.state==='blocked'&&Date.now()>=entry.retryAfter){entry.starting=start(entry);entry.starting.catch(()=>{});}
  if(entry.state==='starting'||entry.state==='new')await entry.starting;
  if(entry.fence?.expires<=Date.now())retire(entry,'lease-expired');
  if(entry.state!=='ready')throw Error('runtime-unavailable');
  return entry;
 }
 function pump(entry){
  if(entry.active||entry.state!=='ready'||!entry.queue.length)return;
  if(entry.fence.expires<=Date.now()){retire(entry,'stale-runtime-fence');return;}
  const task=entry.queue.shift();entry.active=task;task.started=performance.now();
  task.timer=setTimeout(()=>{metrics.timeouts++;failQueued(entry,'runtime-deadline');entry.child?.kill('SIGKILL');},timeoutMs);
  entry.child.send({op:'evaluate',id:task.id,input:task.input},error=>{if(error){failQueued(entry,'runtime-send-failed');entry.child?.kill('SIGKILL');}});
 }
 async function evaluate(input){
  const entry=await ensure(input.worldId);
  if(entry.queue.length+(entry.active?1:0)>=queueCapacity){metrics.rejected++;throw Error('runtime-backpressure');}
  metrics.accepted++;return new Promise((resolve,reject)=>{entry.queue.push({id:randomUUID(),input,resolve,reject,enqueued:performance.now()});metrics.queuePeak=Math.max(metrics.queuePeak,entry.queue.length+(entry.active?1:0));pump(entry);});
 }
 const heartbeat=setInterval(()=>{
  if(closing||heartbeatPaused)return;
  for(const entry of worlds.values())if(entry.fence&&entry.state==='ready'&&!entry.renewing){
   if(entry.fence.expires<=Date.now()){retire(entry,'lease-expired');continue;}
   entry.renewing=true;entry.renewPromise=lease('renew',entry).then(fence=>{if(entry.fence.generation===fence.generation&&entry.state!=='fenced')entry.fence=fence;}).catch(()=>retire(entry,'lease-renewal-failed')).finally(()=>{entry.renewing=false;});
  }
 },heartbeatMs);heartbeat.unref();
 function health(){return{version:1,owner,state:closing?'stopping':'ready',limits:{queueCapacity,maxWorlds,maxConnections,maxFrame,timeoutMs,leaseMs},metrics:{...metrics},worlds:[...worlds.values()].map(entry=>({worldId:entry.worldId,state:entry.state,workerId:entry.workerId,generation:entry.fence?.generation??null,expires:entry.fence?.expires??null,queue:entry.queue.length,active:!!entry.active,lastFailure:entry.lastFailure??null,evaluation:entry.evaluation??null,telemetry:entry.telemetry??null}))};}
 const server=net.createServer(socket=>{
  if(closing||connections.size>=maxConnections){socket.destroy();metrics.rejected++;return;}
  connections.add(socket);socket.on('close',()=>connections.delete(socket));socket.on('error',()=>{});socket.setTimeout(timeoutMs+startupMs+500,()=>socket.destroy());
  let buffer=Buffer.alloc(0),handled=false;
  const send=(id,ok,data)=>{const frame=JSON.stringify({version:1,id,ok,...(ok?{data}:{reason:data})})+'\n';if(Buffer.byteLength(frame)>maxFrame){socket.end(JSON.stringify({version:1,id,ok:false,reason:'response-too-large'})+'\n');return;}socket.end(frame);};
  socket.on('data',async part=>{
   if(handled)return;buffer=Buffer.concat([buffer,part]);if(buffer.length>maxFrame){handled=true;socket.destroy();metrics.rejected++;return;}
   const end=buffer.indexOf(10);if(end<0)return;handled=true;let request;
   try{
    request=JSON.parse(buffer.subarray(0,end).toString('utf8'));
    if(request.version!==1||typeof request.id!=='string'||request.id.length>100||typeof request.key!=='string'||request.key.length!==key.length||!timingSafeEqual(Buffer.from(request.key),Buffer.from(key))){metrics.authenticationFailures++;throw Error('unauthorized-runtime');}
    if(request.op==='health')send(request.id,true,health());
    else if(request.op==='ensure'){const entry=await ensure(request.input?.worldId);send(request.id,true,{runtimeFence:{...entry.fence}});}
    else if(request.op==='evaluate'&&request.input&&typeof request.input==='object')send(request.id,true,await evaluate(request.input));
    else if(faults&&request.op==='fault'&&request.input?.action==='pause-heartbeat'){heartbeatPaused=true;send(request.id,true,{paused:true});}
    else if(faults&&request.op==='fault'&&request.input?.action==='crash-worker'){const entry=worlds.get(request.input.worldId);entry?.child?.kill('SIGKILL');send(request.id,true,{requested:!!entry});}
    else throw Error('invalid-runtime-operation');
   }catch(error){send(typeof request?.id==='string'?request.id:null,false,['runtime-backpressure','runtime-unavailable','lease-unavailable','unauthorized-runtime','runtime-deadline','worker-exited','world-capacity','runtime-validation-failed','stale-runtime-fence'].includes(error.message)?error.message:'runtime-request-failed');}
  });
 });
 await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(socketPath,resolve);});await chmod(socketPath,0o600);
 async function close(){
  if(closing)return;closing=true;clearInterval(heartbeat);for(const entry of worlds.values())clearTimeout(entry.restartTimer);
  server.close();const until=Date.now()+shutdownMs;
  // Finish accepted tasks within a bound; no further transport admissions.
  while([...worlds.values()].some(entry=>entry.active||entry.queue.length)&&Date.now()<until)await delay(10);
  for(const entry of worlds.values()){
   failQueued(entry,'runtime-shutting-down');if(entry.child?.connected)entry.child.send({op:'dispose'},()=>{});entry.state='stopping';
  }
  await delay(Math.min(100,shutdownMs));
  for(const entry of worlds.values()){entry.child?.kill('SIGKILL');if(entry.fence)await lease('release',entry).catch(()=>{});}
  for(const socket of connections)socket.destroy();await unlink(socketPath).catch(()=>{});
 }
 return{socketPath,keyPath,owner,health,close};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{const service=await startSupervisor();process.stdout.write(JSON.stringify({event:'runtime-ready',owner:service.owner,transport:'private-unix',version:1})+'\n');let stopping=false;for(const signal of['SIGTERM','SIGINT'])process.on(signal,async()=>{if(stopping)return;stopping=true;await service.close();process.exit(0);});}
 catch{process.stderr.write(JSON.stringify({event:'runtime-start-failed',reason:'configuration-or-lease-unavailable'})+'\n');process.exit(1);}
}
