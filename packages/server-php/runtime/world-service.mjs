import net from 'node:net';
import { fork } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { constants, mkdirSync, lstatSync, realpathSync, readFileSync, writeFileSync, openSync, closeSync, fsyncSync, fstatSync, appendFileSync, renameSync, unlinkSync, chmodSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runtimeRequest } from './client.mjs';
const launcherPath=fileURLToPath(new URL('../../../scripts/zge08-server.mjs',import.meta.url));
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const alive=pid=>{try{process.kill(pid,0);return true;}catch(error){return error.code!=='ESRCH';}};
function privateDirectory(directory){
 if(!directory?.startsWith('/tmp/')||directory.length>75)throw Error('private service directory required');
 mkdirSync(directory,{recursive:true,mode:0o700});const info=lstatSync(directory);
 if(!info.isDirectory()||info.isSymbolicLink()||info.uid!==process.getuid()||(info.mode&0o077)!==0||realpathSync(directory)!==realpathSync('/tmp')+directory.slice(4))throw Error('private service directory required');
}
function privateFile(file){const info=lstatSync(file);if(!info.isFile()||info.isSymbolicLink()||info.uid!==process.getuid()||(info.mode&0o077)!==0)throw Error('private service file required');return info;}
function databaseFileIdentity(file){privateFile(file);const info=lstatSync(file,{bigint:true});return{dev:String(info.dev),ino:String(info.ino)};}
const validDatabaseIdentity=value=>value&&typeof value.dev==='string'&&typeof value.ino==='string'&&/^\d{1,30}$/.test(value.dev)&&/^\d{1,30}$/.test(value.ino);
const sameDatabase=(a,b)=>validDatabaseIdentity(a)&&validDatabaseIdentity(b)&&a.dev===b.dev&&a.ino===b.ino;
function claimLock(file,identity){
 const create=()=>{const fd=openSync(file,constants.O_WRONLY|constants.O_CREAT|constants.O_EXCL,0o600);try{writeFileSync(fd,JSON.stringify(identity));fsyncSync(fd);}finally{closeSync(fd);}};
 try{create();return;}catch(error){if(error.code!=='EEXIST')throw error;}
 const old=privateFile(file),record=JSON.parse(readFileSync(file,'utf8'));
 if(!Number.isSafeInteger(record.pid)||record.pid<1||alive(record.pid))throw Error('service already active or ownership uncertain');
 // Exclusive reclamation prevents a second recovering service unlinking a new owner.
 const recovery=file+'.recovery';const fd=openSync(recovery,constants.O_WRONLY|constants.O_CREAT|constants.O_EXCL,0o600);
 try{const current=privateFile(file);if(current.ino!==old.ino||current.dev!==old.dev||alive(record.pid))throw Error('service ownership changed');unlinkSync(file);create();}finally{closeSync(fd);unlinkSync(recovery);}
}
async function clearStaleSocket(socketPath){
 if(!existsSync(socketPath))return;const info=lstatSync(socketPath);
 if(!info.isSocket()||info.uid!==process.getuid()||(info.mode&0o077)!==0)throw Error('unsafe service socket');
 await new Promise((resolve,reject)=>{const probe=net.createConnection(socketPath);probe.setTimeout(300,()=>{probe.destroy();reject(Error('service socket uncertain'));});probe.on('connect',()=>{probe.destroy();reject(Error('service socket active'));});probe.on('error',error=>{probe.destroy();if(['ECONNREFUSED','ENOENT'].includes(error.code))resolve();else reject(Error('service socket uncertain'));});});
 const current=lstatSync(socketPath);if(current.ino!==info.ino||current.dev!==info.dev)throw Error('service socket ownership changed');unlinkSync(socketPath);
}
/** Foreground developer service; owns one launcher, never installs an OS daemon. */
export async function startWorldService(options={}){
 const directory=path.resolve(options.directory??process.env.ZGE_STAGING_DIR??'/tmp/zge09-world');privateDirectory(directory);
 const port=options.port??Number(process.env.ZGE_STAGING_PORT??8799),gatewayCount=options.gatewayCount??Number(process.env.ZGE_GATEWAY_COUNT??1);
 if(!Number.isInteger(port)||port<1024||port+gatewayCount>65535||!Number.isInteger(gatewayCount)||gatewayCount<1||gatewayCount>8)throw Error('invalid service gateway configuration');
 const config={healthIntervalMs:2000,healthTimeoutMs:5000,healthFailures:3,restartBaseMs:250,restartMaxMs:10000,restartLimit:8,restartWindowMs:60000,startupTimeoutMs:25000,shutdownTimeoutMs:8000,...options};
 for(const key of['healthIntervalMs','healthTimeoutMs','healthFailures','restartBaseMs','restartMaxMs','restartLimit','restartWindowMs','startupTimeoutMs','shutdownTimeoutMs'])if(!Number.isSafeInteger(config[key])||config[key]<1)throw Error('invalid service policy');
 if(config.healthIntervalMs<100||config.healthTimeoutMs>15000||config.healthFailures>20||config.restartLimit>100||config.restartBaseMs>config.restartMaxMs||config.restartMaxMs>60000||config.startupTimeoutMs>60000||config.shutdownTimeoutMs>15000)throw Error('invalid service policy');
 const serviceId='service-'+randomUUID(),lockPath=directory+'/service.lock',controlPath=directory+'/service.sock',auditPath=directory+'/service-audit.ndjson',statusPath=directory+'/service-status.json',dbPath=directory+'/world.sqlite';
 claimLock(lockPath,{pid:process.pid,serviceId});
 let auditFd,server,closed=false,stopping=false,child=null,healthTimer=null,restartTimer=null,startupTimer=null,healthRunning=false,consecutiveHealthFailures=0,consecutiveRestarts=0,readyAt=null,probeIndex=0,ownedGatewayPids=[],restartTimes=[],knownDatabase=existsSync(dbPath),databaseIdentity=null,closePromise;
 const began=Date.now();let resolveClosed;const ended=new Promise(resolve=>{resolveClosed=resolve;});
 const state={protocol:'zge.world-service.v1',serviceId,pid:process.pid,state:'starting',launcherPid:null,gatewayPids:[],launches:0,restarts:0,lastFailure:null,lastHealth:null,world:null,port,gatewayCount,startedAt:began,nextRestartAt:null,knownDatabase,databaseIdentity:null};
 const status=()=>({...state,databaseIdentity:databaseIdentity?{...databaseIdentity}:null,gatewayPids:[...ownedGatewayPids],policy:{healthIntervalMs:config.healthIntervalMs,healthTimeoutMs:config.healthTimeoutMs,healthFailures:config.healthFailures,restartBaseMs:config.restartBaseMs,restartMaxMs:config.restartMaxMs,restartLimit:config.restartLimit,restartWindowMs:config.restartWindowMs}});
 const publish=()=>{const temp=statusPath+'.'+serviceId+'.pending';writeFileSync(temp,JSON.stringify(status(),null,2),{mode:0o600});renameSync(temp,statusPath);};
 const audit=(event,details={})=>{appendFileSync(auditFd,JSON.stringify({protocol:'zge.service-audit.v1',at:Date.now(),elapsedMs:Math.round(performance.now()-monotonicStart),serviceId,event,...details})+'\n');fsyncSync(auditFd);};
 const monotonicStart=performance.now();
 try{
  if(existsSync(auditPath)){const info=privateFile(auditPath);if(info.size>16*1024*1024)throw Error('service audit retention requires operator review');const raw=readFileSync(auditPath,'utf8');if(raw&&!raw.endsWith('\n'))throw Error('incomplete service audit requires operator review');for(const line of raw.trim().split('\n').filter(Boolean)){const event=JSON.parse(line);if(event.event==='launcher-ready'||event.event==='service-start'&&event.knownDatabase){if(!validDatabaseIdentity(event.databaseIdentity))throw Error('database identity requires operator review');knownDatabase=true;databaseIdentity=event.databaseIdentity;}}}
  auditFd=openSync(auditPath,constants.O_WRONLY|constants.O_APPEND|constants.O_CREAT|constants.O_NOFOLLOW,0o600);const info=fstatSync(auditFd);if(!info.isFile()||info.uid!==process.getuid()||(info.mode&0o077)!==0)throw Error('private service audit required');
  await clearStaleSocket(controlPath);
  server=net.createServer(socket=>{let input='';socket.setTimeout(2000,()=>socket.destroy());socket.on('error',()=>{});socket.on('data',part=>{input+=part;if(input.length>4096)return socket.destroy();if(!input.includes('\n'))return;try{const request=JSON.parse(input);if(!['status','stop'].includes(request.op))throw Error();socket.end(JSON.stringify({ok:true,...status()})+'\n');if(request.op==='stop')setTimeout(()=>close(),10);}catch{socket.end(JSON.stringify({ok:false,reason:'invalid-service-operation'})+'\n');}});});
  server.maxConnections=16;await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(controlPath,resolve);});chmodSync(controlPath,0o600);
  if(knownDatabase&&!databaseIdentity)databaseIdentity=databaseFileIdentity(dbPath);state.knownDatabase=knownDatabase;state.databaseIdentity=databaseIdentity;audit('service-start',{pid:process.pid,port,gatewayCount,knownDatabase,databaseIdentity});publish();
 }catch(error){if(auditFd!==undefined)closeSync(auditFd);try{const current=JSON.parse(readFileSync(lockPath));if(current.serviceId===serviceId)unlinkSync(lockPath);}catch{}throw error;}
 function databaseAvailable(){try{return sameDatabase(databaseIdentity,databaseFileIdentity(dbPath));}catch{return false;}}
 function schedule(reason){
  if(stopping)return;state.lastFailure=reason;state.world=null;state.lastHealth=null;state.launcherPid=null;ownedGatewayPids=[];state.gatewayPids=[];clearTimeout(startupTimer);clearTimeout(healthTimer);
  const now=Date.now();restartTimes=restartTimes.filter(at=>now-at<config.restartWindowMs);
  if(restartTimes.length>=config.restartLimit){state.state='failed';state.nextRestartAt=null;audit('restart-ceiling',{reason,restarts:state.restarts,restartLimit:config.restartLimit});publish();return;}
  restartTimes.push(now);const backoffMs=Math.min(config.restartMaxMs,config.restartBaseMs*2**Math.min(consecutiveRestarts++,20));state.state='backoff';state.nextRestartAt=now+backoffMs;state.restarts++;audit('restart-scheduled',{reason,backoffMs,restarts:state.restarts});publish();restartTimer=setTimeout(launch,backoffMs);
 }
 async function stopOwned(reason){
  const owned=child;if(!owned||owned.exitCode!==null||owned.signalCode)return;
  audit('launcher-stop-requested',{reason,launcherPid:owned.pid});
  await new Promise(resolve=>{let done=false;const timer=setTimeout(()=>{if(child===owned)owned.kill('SIGKILL');},config.shutdownTimeoutMs);const finish=()=>{if(done)return;done=true;clearTimeout(timer);resolve();};owned.once('exit',finish);owned.kill('SIGTERM');});
 }
 async function checkHealth(){
  if(stopping||state.state!=='ready'||healthRunning)return;healthRunning=true;let reason=null;
  try{
   if(!databaseAvailable())throw Error('database-unavailable');
   const runtime=await runtimeRequest({socketPath:directory+'/runtime.sock',keyPath:directory+'/runtime.key',timeoutMs:config.healthTimeoutMs},'health');
   if(stopping)return;const world=runtime.worlds.find(value=>value.worldId==='valley');if(runtime.state!=='ready'||!world||world.state==='fenced'||world.expires<=Date.now())throw Error('world-fenced-or-unavailable');
   // One rotating gateway probe uses 30/min total, within the existing 60/min health quota.
   const identities=JSON.parse(readFileSync(directory+'/identities.json','utf8')),identity=identities.viewer??identities.alice;
   const probe=probeIndex++%gatewayCount;const response=await fetch('http://127.0.0.1:'+(port+probe)+'/staging/health',{method:'POST',headers:{'content-type':'application/json',authorization:'Bearer '+identity.token},body:JSON.stringify({worldId:identity.worldId}),signal:AbortSignal.timeout(config.healthTimeoutMs)});
   const result=await response.json();if(stopping)return;if(!response.ok||!result.ok)throw Error('gateway-or-database-unavailable');
   state.world={worldId:world.worldId,generation:world.generation,workerId:world.workerId,state:world.state};state.lastHealth={at:Date.now(),ok:true,probe};consecutiveHealthFailures=0;
   if(readyAt&&Date.now()-readyAt>=config.restartWindowMs)consecutiveRestarts=0;publish();
  }catch(error){if(stopping)return;reason=['database-unavailable','world-fenced-or-unavailable'].includes(error.message)?error.message:'gateway-or-database-unavailable';consecutiveHealthFailures++;state.lastHealth={at:Date.now(),ok:false,failures:consecutiveHealthFailures};audit('health-failed',{reason,failures:consecutiveHealthFailures});publish();}
  finally{healthRunning=false;}
  if(stopping)return;
  if(reason&&consecutiveHealthFailures>=config.healthFailures){state.lastFailure=reason;state.state='restarting';publish();await stopOwned(reason);}else healthTimer=setTimeout(checkHealth,config.healthIntervalMs);
 }
 function launch(){
  if(stopping)return;state.nextRestartAt=null;
  if(knownDatabase&&!databaseAvailable()){audit('database-unavailable');schedule('database-unavailable');return;}
  state.state='starting';state.launches++;state.lastHealth=null;consecutiveHealthFailures=0;
  const env={...process.env,...options.env,ZGE_STAGING_DIR:directory,ZGE_STAGING_PORT:String(port),ZGE_GATEWAY_COUNT:String(gatewayCount),ZGE_REQUIRE_EXISTING_DB:knownDatabase?'1':'0',ZGE_ALLOW_NEW_STAGING_DB:knownDatabase?'0':'1',...(databaseIdentity?{ZGE_EXPECTED_DB_DEVICE:databaseIdentity.dev,ZGE_EXPECTED_DB_INODE:databaseIdentity.ino}:{})};
  child=fork(launcherPath,[],{execArgv:[],env,stdio:['ignore','ignore','ignore','ipc']});const owned=child;state.launcherPid=owned.pid;audit('launcher-start',{launcherPid:owned.pid,launch:state.launches});publish();
  startupTimer=setTimeout(()=>{if(child===owned&&state.state==='starting'){state.lastFailure='launcher-readiness-timeout';stopOwned('launcher-readiness-timeout');}},config.startupTimeoutMs);
  owned.on('message',message=>{if(child!==owned||stopping||message?.event!=='launcher-ready')return;clearTimeout(startupTimer);let current;try{current=databaseFileIdentity(dbPath);if(databaseIdentity&&!sameDatabase(databaseIdentity,current))throw Error();}catch{state.lastFailure='database-unavailable';stopOwned('database-unavailable');return;}databaseIdentity=current;knownDatabase=true;state.knownDatabase=true;state.databaseIdentity=databaseIdentity;readyAt=Date.now();ownedGatewayPids=message.gatewayPids.filter(Number.isSafeInteger);state.gatewayPids=ownedGatewayPids;state.world=message.world??null;state.state='ready';state.lastFailure=null;audit('launcher-ready',{launcherPid:owned.pid,gatewayPids:ownedGatewayPids,world:state.world,databaseIdentity});publish();healthTimer=setTimeout(checkHealth,config.healthIntervalMs);});
  owned.on('error',()=>{state.lastFailure='launcher-start-failed';});
  owned.on('exit',(code,signal)=>{if(child!==owned)return;child=null;state.launcherPid=null;clearTimeout(startupTimer);clearTimeout(healthTimer);audit('launcher-exit',{launcherPid:owned.pid,code,signal});if(!stopping)schedule(state.lastFailure??'launcher-exited');});
 }
 function close(){
  if(closePromise)return closePromise;stopping=true;state.state='stopping';clearTimeout(healthTimer);clearTimeout(restartTimer);clearTimeout(startupTimer);audit('operator-stop');publish();
  closePromise=(async()=>{await stopOwned('operator-stop');server.close();try{unlinkSync(controlPath);}catch{}state.state='stopped';state.launcherPid=null;ownedGatewayPids=[];state.gatewayPids=[];state.nextRestartAt=null;audit('service-stopped');publish();closeSync(auditFd);const lock=JSON.parse(readFileSync(lockPath));if(lock.serviceId===serviceId)unlinkSync(lockPath);closed=true;resolveClosed();})();return closePromise;
 }
 launch();
 return{directory,controlPath,status,close,closed:ended,async waitUntilReady(timeoutMs=30000){const deadline=Date.now()+timeoutMs;while(Date.now()<deadline){if(state.state==='ready')return status();if(state.state==='failed'||closed)throw Error('service not ready: '+state.state);await delay(25);}throw Error('service readiness timeout');}};
}
export async function serviceRequest(directory,op='status'){
 directory=path.resolve(directory);privateDirectory(directory);const socketPath=directory+'/service.sock';
 return new Promise((resolve,reject)=>{const socket=net.createConnection(socketPath);let raw='';socket.setTimeout(3000,()=>{socket.destroy();reject(Error('service control timeout'));});socket.on('error',()=>reject(Error('service control unavailable')));socket.on('connect',()=>socket.write(JSON.stringify({op})+'\n'));socket.on('data',part=>{raw+=part;if(raw.length>32768)socket.destroy();});socket.on('end',()=>{try{const result=JSON.parse(raw);if(!result.ok)throw Error();resolve(result);}catch{reject(Error('invalid service control reply'));}});});
}
