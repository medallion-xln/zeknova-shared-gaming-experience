import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import net from 'node:net';
import assert from 'node:assert/strict';
export async function fixture(extra = {}) {
 const directory=mkdtempSync('/tmp/zge07-php-'), env={...process.env,ZEKNOVA_ENV:'zge-staging',ZGE_STAGING_ENABLED:'1',ZGE_STAGING_DB:directory+'/world.sqlite',ZGE_STAGING_IDENTITIES:directory+'/identities.json',ZGE_NODE_PATH:process.execPath,ZGE_STAGING_FAULTS:'1',ZGE_CHECKPOINT_EVERY:'2',...extra};
 const setup=spawnSync('php',['packages/server-php/src/setup.php'],{env,encoding:'utf8'});assert.equal(setup.status,0,setup.stderr);
 const identities=JSON.parse(readFileSync(env.ZGE_STAGING_IDENTITIES));let servers=[];
 const sql=(text,params=[])=>{const r=spawnSync('php',['-r',"require 'packages/server-php/src/bootstrap.php'; $i=json_decode(stream_get_contents(STDIN),true,512,JSON_THROW_ON_ERROR); echo json_encode(query(db(),$i['sql'],$i['params'])->fetchAll(PDO::FETCH_ASSOC),JSON_THROW_ON_ERROR);"],{env,input:JSON.stringify({sql:text,params}),encoding:'utf8'});assert.equal(r.status,0,'fixture SQL failed');return JSON.parse(r.stdout);};
 async function start(port){port??=await new Promise(resolve=>{const s=net.createServer().listen(0,'127.0.0.1',()=>{const p=s.address().port;s.close(()=>resolve(p));});});const child=spawn('php',['-S','127.0.0.1:'+port,'packages/server-php/src/router.php'],{env,stdio:'ignore'});servers.push(child);const base='http://127.0.0.1:'+port;
 for(let i=0;i<100;i++){try{await fetch(base+'/not-found');return{child,port,base};}catch{await new Promise(r=>setTimeout(r,20));}}throw Error('fixture startup failed');}
 async function send(server,player='alice',body={},options={}) {const identity=identities[player],headers={'content-type':'application/json',authorization:'Bearer '+identity.token,...options.headers};const r=await fetch(server.base+(options.path??'/staging/world'),{method:'POST',headers,body:JSON.stringify({worldId:identity.worldId,...body})});return{status:r.status,...await r.json()};}
 async function close(){await Promise.all(servers.map(child=>new Promise(resolve=>{if(child.exitCode!==null||child.signalCode)return resolve();child.once('exit',resolve);child.kill('SIGTERM');})));}
 function recover(world='valley'){const r=spawnSync('php',['packages/server-php/src/recover.php',world],{env,encoding:'utf8'});return{ok:r.status===0,...(r.status===0?JSON.parse(r.stdout):{})};}
 return {directory,env,identities,sql,start,send,close,recover};
}
export const place=(commandId,x=2,z=2,expectedRevision=0)=>({commandId,action:'place',id:'b-'+commandId,type:'shelter',x,z,expectedRevision});
