import{mkdirSync,writeFileSync,readFileSync,openSync,writeSync,closeSync,statSync}from'node:fs';import{spawnSync,spawn}from'node:child_process';import{createHash}from'node:crypto';import{performance}from'node:perf_hooks';
import{ConstructionRuntime}from'../packages/gameplay-construction/src/index.js';import{GameplayEventJournal,canonicalJSON}from'../packages/core/src/index.js';import{historyState,applyWorldEvent,replayWorldEvents}from'../packages/persistence/src/index.js';import{worldOptions}from'../examples/construction-world/world.js';
const out=process.env.ZGE_EVIDENCE_DIR||'/tmp/zge07-evidence',dir='/tmp/zge07-history-'+Date.now();mkdirSync(dir,{recursive:true,mode:0o700});mkdirSync(out,{recursive:true});
const stats=a=>{const s=[...a].sort((a,b)=>a-b);return{count:s.length,p50:s[Math.floor(s.length*.5)]??null,p95:s.length>=20?s[Math.floor(s.length*.95)]:null,p99:s.length>=100?s[Math.floor(s.length*.99)]:null};};
const results=[];
async function httpBackfill(dbPath, initial, expected) {
 const net=await import('node:net');const port=await new Promise(resolve=>{const s=net.createServer().listen(0,'127.0.0.1',()=>{const p=s.address().port;s.close(()=>resolve(p));});});
 const identity=JSON.parse(readFileSync(dbPath+'.identity'));
 const env={...process.env,ZGE_STAGING_ENABLED:'1',ZEKNOVA_ENV:'zge-staging',ZGE_STAGING_DB:dbPath};
 const child=spawn('php',['-S','127.0.0.1:'+port,'packages/server-php/src/router.php'],{env,stdio:'ignore'});
 const base='http://127.0.0.1:'+port;try{
 for(let i=0;i<100;i++){try{await fetch(base+'/not-found');break;}catch{await new Promise(r=>setTimeout(r,20));}}
 const state=structuredClone(initial),window=[],pages=[];let cursor=0,through=null;
 const started=performance.now();
 do{const start=performance.now(),response=await fetch(base+'/staging/events',{method:'POST',headers:{authorization:'Bearer '+identity.token,'content-type':'application/json'},body:JSON.stringify({worldId:identity.worldId,cursor,limit:256})});const data=await response.json();if(!response.ok)throw Error('Authenticated history paging failed: '+data.reason);through=data.cursor;for(const event of data.events){if(event.sequence!==cursor)throw Error('HTTP cursor gap');applyWorldEvent(state,event);window.push(event);cursor++;}if(window.length>256)window.splice(0,window.length-256);if(data.nextCursor!==cursor)throw Error('HTTP nextCursor mismatch');pages.push(performance.now()-start);}while(cursor<through);
 if(canonicalJSON(state)!==expected)throw Error('HTTP replay mismatch');
 const denied=await fetch(base+'/staging/events',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({worldId:identity.worldId,cursor:0})});if(denied.status!==401)throw Error('History auth not enforced');
 return{totalMs:performance.now()-started,pageMs:stats(pages),events:cursor,window:window.length,authenticated:true,negativeAuth:denied.status,exactMatch:true};
 }finally{await new Promise(resolve=>{child.once('exit',resolve);child.kill('SIGTERM');});}
}

for(const count of [1000,10000,100000]){
 globalThis.gc?.();const heapBefore=process.memoryUsage().heapUsed;const worldId='history-'+count;const runtime=new ConstructionRuntime({...worldOptions,worldId,owner:'php-staging-server'}),initial=historyState(runtime.snapshot()); for(let seed=0;seed<128;seed++)initial.buildings['seed-'+seed]={id:'seed-'+seed,type:'shelter',x:seed%16*3,y:0,z:Math.floor(seed/16)*3,rotation:0,radius:1,level:1,state:'complete'}; initial.built=128;initial.rewardIds=['existing-claim'];initial.player.xp=25;const state=structuredClone(initial),events=[],append=[],fd=openSync(dir+'/'+count+'.ndjson','w');let checkpointBytes=0;
 // Representative absolute inventory, transform and building state transitions.
 // This measures archive/replay scaling, not 100k full terrain/construction executions.
 for(let i=0;i<count;i++){
  const t=performance.now(),tx=Math.floor(i/5),kind=i%5;let event;
  if(kind===0)event={type:'ResourcesChanged',inventory:{stone:12+tx},inventoryRevision:tx+1};
  else if(kind===1)event=tx===0?{type:'MissionRewardApplied',rewardId:'history-reward',xp:25}:{type:'PlayerMoved',player:{...state.player,x:tx%10,y:0,z:-5}};
  else if(kind===2)event={type:'BuildingCreated',building:{id:'b-'+tx,type:'shelter',x:tx%100,y:0,z:Math.floor(tx/100),rotation:0,radius:1,level:1,state:'complete'}};
  else if(kind===3)event={type:'BuildingRemoved',building:{id:'b-'+tx}};
  else event={type:'WorldRevisionCommitted'};
  const e=GameplayEventJournal.transaction({worldId,transactionId:'tx-'+i,revision:i+1,offset:i,authority:{mode:'ENGINE',domain:'construction-world',owner:'php-staging-server',epoch:0},events:[event]})[0];
  applyWorldEvent(state,e);events.push(e);writeSync(fd,JSON.stringify({event:e})+'\n');append.push(performance.now()-t);
  if((i+1)%1000===0){const cp={schema:'zge.history-checkpoint.v1',state,cursor:i+1};checkpointBytes=Buffer.byteLength(JSON.stringify(cp));writeSync(fd,JSON.stringify({checkpoint:cp})+'\n');}
 }
 closeSync(fd);const clientState=structuredClone(initial),clientWindow=[],clientTimes=[];let clientCursor=0;const clientStart=performance.now();for(let i=0;i<events.length;i+=256){const t=performance.now(),page=JSON.parse(JSON.stringify(events.slice(i,i+256)));for(const e of page){applyWorldEvent(clientState,e);clientWindow.push(e);clientCursor++;}if(clientWindow.length>256)clientWindow.splice(0,clientWindow.length-256);clientTimes.push(performance.now()-t);}const clientSyncMs=performance.now()-clientStart;if(canonicalJSON(clientState)!==canonicalJSON(state))throw Error('client sync checksum mismatch');
 const expected=canonicalJSON(state),replayStart=performance.now(),reference=replayWorldEvents(initial,events);const replayMs=performance.now()-replayStart;if(reference.checksum!==expected)throw Error('uncompacted checksum mismatch');
 const file=dir+'/'+count+'.ndjson',dbPath=dir+'/'+count+'.sqlite';const php=spawnSync('php',['packages/server-php/src/history-hardening.php',file],{env:{...process.env,ZGE_STAGING_ENABLED:'1',ZEKNOVA_ENV:'zge-staging',ZGE_STAGING_DB:dbPath},encoding:'utf8',maxBuffer:16*1024*1024});if(php.status!==0)throw Error(php.stderr);const db=JSON.parse(php.stdout);const cp=db.checkpoints[0];const restoreStart=performance.now();const restored=replayWorldEvents(cp.state,events.slice(cp.cursor),{cursor:cp.cursor});const restoreMs=performance.now()-restoreStart;if(restored.checksum!==expected)throw Error('checkpoint checksum mismatch');
 const http=await httpBackfill(dbPath,initial,expected);
 globalThis.gc?.();results.push({http,checkpointIntegrityVerified:db.checkpointIntegrityVerified,archivePageHashesVerified:db.archivePageHashesVerified,corruptCheckpointDenied:db.corruptCheckpointDenied,eventGapDenied:db.eventGapDenied,events:count,payload:'resources/player/reward/build-create/remove/revision; 128 resident buildings; full authoritative events retained',appendMs:stats(append),uncompactedReplayMs:replayMs,checkpointReplayMs:restoreMs,checkpointBytes,archiveInputBytes:statSync(file).size,retainedHeapDelta:process.memoryUsage().heapUsed-heapBefore,databaseBytes:db.databaseBytes,databaseAppendBatch1000Ms:stats(db.appendBatch1000Ms),compactionMs:stats(db.compactionMs),databaseCheckpointLoadMs:db.checkpointLoadMs,clientPage256Ms:stats(db.syncPage256Ms),clientDecodeReplayTotalMs:clientSyncMs,clientDecodePage256Ms:stats(clientTimes),clientWindow:clientWindow.length,clientCursor,retainedCheckpoints:db.checkpointCount,tailEvents:count-cp.cursor,checksum:createHash('sha256').update(expected).digest('hex'),exactMatch:true});
 writeFileSync(out+'/history-hardening.json',JSON.stringify({units:'ms; bytes',retention:'all durable events; last 2 derived checkpoints; client window 256',results},null,2));console.log(count,'events: exact checkpoint replay PASS');
}
