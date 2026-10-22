import{fork,spawnSync}from'node:child_process';import{mkdirSync,existsSync,lstatSync}from'node:fs';import path from'node:path';
import{runtimeRequest}from'../packages/server-php/runtime/client.mjs';
import{startSupervisor}from'../packages/server-php/runtime/supervisor.mjs';
const managed=typeof process.send==='function';let service=null,gateways=[],stopping=false,stopPromise;
function stop(){
 if(stopPromise)return stopPromise;stopping=true;
 stopPromise=(async()=>{await Promise.all(gateways.map(child=>new Promise(resolve=>{if(child.exitCode!==null||child.signalCode)return resolve();const timer=setTimeout(()=>child.kill('SIGKILL'),2000);child.once('exit',()=>{clearTimeout(timer);resolve();});child.kill('SIGTERM');})));await service?.close();})();return stopPromise;
}
for(const signal of['SIGTERM','SIGINT'])process.on(signal,()=>stop().then(()=>process.exit(0)));
if(managed)process.on('disconnect',()=>stop().then(()=>process.exit(0)));
const directory=path.resolve(process.env.ZGE_STAGING_DIR||'/tmp/zge08-world');
if(!directory.startsWith('/tmp/'))throw Error('Private temporary staging directory required');mkdirSync(directory,{recursive:true,mode:0o700});
const port=Number(process.env.ZGE_STAGING_PORT||8798),count=Number(process.env.ZGE_GATEWAY_COUNT||1);
if(!Number.isInteger(port)||port<1024||port+count>65535||!Number.isInteger(count)||count<1||count>8)throw Error('Invalid staging gateway configuration');
const env={...process.env,ZEKNOVA_ENV:'zge-staging',ZGE_STAGING_ENABLED:'1',ZGE_STAGING_DB:directory+'/world.sqlite',ZGE_STAGING_IDENTITIES:directory+'/identities.json',ZGE_NODE_PATH:process.execPath,ZGE_RUNTIME_SOCKET:directory+'/runtime.sock',ZGE_RUNTIME_KEY_FILE:directory+'/runtime.key',ZGE_MULTIPLAYER_WORLD:'1'};
const existed=existsSync(env.ZGE_STAGING_DB);
if(!managed&&existsSync(directory+'/service-audit.ndjson'))throw Error('Staging directory is controlled by world service');
const provisioned=existsSync(env.ZGE_STAGING_IDENTITIES)||existsSync(env.ZGE_STAGING_IDENTITIES+'.pending');
if(!existed&&(provisioned||env.ZGE_REQUIRE_EXISTING_DB==='1'||managed&&env.ZGE_ALLOW_NEW_STAGING_DB!=='1'))throw Error('Established staging database unavailable');
if(existed&&(env.ZGE_EXPECTED_DB_DEVICE||env.ZGE_EXPECTED_DB_INODE)){const info=lstatSync(env.ZGE_STAGING_DB,{bigint:true});if(String(info.dev)!==env.ZGE_EXPECTED_DB_DEVICE||String(info.ino)!==env.ZGE_EXPECTED_DB_INODE)throw Error('Staging database identity changed');}
env.ZGE_REQUIRE_EXISTING_DB=existed?'1':'0';
const setup=spawnSync('php',['packages/server-php/src/setup.php'],{env,encoding:'utf8'});if(setup.status!==0)throw Error('Private staging initialization failed');
const databaseInfo=lstatSync(env.ZGE_STAGING_DB,{bigint:true});env.ZGE_REQUIRE_EXISTING_DB='1';env.ZGE_EXPECTED_DB_DEVICE=String(databaseInfo.dev);env.ZGE_EXPECTED_DB_INODE=String(databaseInfo.ino);
if(stopping||(managed&&!process.connected))process.exit(0);
service=await startSupervisor({dbPath:env.ZGE_STAGING_DB,socketPath:env.ZGE_RUNTIME_SOCKET,keyPath:env.ZGE_RUNTIME_KEY_FILE,recoverStaleSocket:true});
const startupDeadline=Date.now()+15000;let ready=false;
while(Date.now()<startupDeadline&&!stopping){try{await runtimeRequest({socketPath:env.ZGE_RUNTIME_SOCKET,keyPath:env.ZGE_RUNTIME_KEY_FILE},'ensure',{worldId:'valley'});ready=true;break;}catch{await new Promise(r=>setTimeout(r,250));}}
if(!ready){await stop();if(stopping)process.exit(1);throw Error('World lease readiness deadline exceeded');}
gateways=Array.from({length:count},(_,i)=>fork(new URL('../packages/server-php/runtime/gateway-process.mjs',import.meta.url),[],{execArgv:[],env:{...env,ZGE_GATEWAY_PORT:String(port+i)},stdio:['ignore','ignore','ignore','ipc']}));
for(const gateway of gateways)gateway.on('exit',()=>{if(!stopping)stop().then(()=>{process.exit(1);});});
try{
 await Promise.all(gateways.map(gateway=>new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Gateway readiness deadline exceeded')),5000);gateway.on('message',message=>{if(message?.event==='gateway-ready'){clearTimeout(timer);resolve();}});gateway.once('exit',()=>{clearTimeout(timer);reject(Error('Gateway exited before ready'));});})));
 if(!stopping&&(!managed||process.connected)){
  process.send?.({event:'launcher-ready',gatewayPids:gateways.map(gateway=>gateway.pid),world:service.health().worlds.find(world=>world.worldId==='valley')});
  console.log('Supervised independent world: http://127.0.0.1:'+port+'/examples/construction-world/?server=1');
  console.log('Gateway count: '+count+'; private fixture file: '+env.ZGE_STAGING_IDENTITIES);
 }
}catch{await stop();process.exitCode=1;}
