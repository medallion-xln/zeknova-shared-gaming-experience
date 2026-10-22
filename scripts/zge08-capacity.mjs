import{execFileSync}from'node:child_process';import path from'node:path';
import{supervisedFixture}from'../packages/server-php/test/helpers/supervised-fixture.mjs';import{randomBytes,createHash}from'node:crypto';import{mkdirSync,writeFileSync,statSync,existsSync}from'node:fs';import assert from'node:assert/strict';
const out=process.env.ZGE_EVIDENCE_DIR||'/tmp/zge08-evidence';mkdirSync(out,{recursive:true});const rows=[];
const stats=values=>{const s=[...values].sort((a,b)=>a-b);return{count:s.length,p50:s[Math.floor(s.length*.5)],p95:s[Math.floor(s.length*.95)],p99:s[Math.floor(s.length*.99)]};};
for(const clients of[1,2,4,8]){
 const f=await supervisedFixture({env:{ZGE_REQUEST_LIMIT:'600',ZGE_CHECKPOINT_EVERY:'32'}});
 try{
  const gateways=await Promise.all(Array.from({length:Math.min(clients,4)},()=>f.start())),sessions=[];
  for(let n=0;n<clients;n++){
   const name='capacity-'+n,token=randomBytes(24).toString('hex'),hash=createHash('sha256').update(token).digest('hex');f.identities[name]={token,worldId:'valley',playerId:name,role:'builder'};
   f.sql('INSERT INTO memberships VALUES(?,?,?,0)',[name,'valley','builder']);f.sql('INSERT INTO sessions VALUES(?,?,?,?,?)',[hash,name,'valley','builder',Math.floor(Date.now()/1000)+3600]);f.sql('INSERT INTO session_meta VALUES(?,?,?,0,1)',[hash,randomBytes(16).toString('hex'),Math.floor(Date.now()/1000)]);
   const server=gateways[n%gateways.length],joined=await f.join(server,name);assert.equal(joined.result.ok,true);sessions.push({name,server,playerRevision:joined.snapshot.player.revision,worldRevision:joined.revision});
  }
  const latency=[],errors=[],start=performance.now(),count=512;let completed=0;
  await Promise.all(sessions.map(async(actor,index)=>{for(let i=index;i<count;i+=clients){const began=performance.now(),result=await f.send(actor.server,actor.name,{command:{commandId:'load-'+i,action:'move',dx:Math.floor(i/clients)%2===0?.05:-.05,dz:0,expectedRevision:actor.worldRevision,expectedPlayerRevision:actor.playerRevision}});latency.push(performance.now()-began);if(result.status!==200||!result.result.ok){errors.push({status:result.status,reason:result.reason??result.result?.reason});continue;}actor.playerRevision=result.snapshot.player.revision;actor.worldRevision=result.revision;completed++;}}));
  const elapsed=performance.now()-start,state=await f.send(gateways[0],sessions[0].name),health=f.health();assert.deepEqual(errors,[]);assert.equal(completed,count);assert.equal(state.revision,count+clients);assert.equal(health.metrics.workerStarts,1);assert.equal(health.worlds[0].evaluation.created,1);assert.equal(state.world.inventory.stone,12);assert.equal(state.world.buildings.length,0);assert.equal(state.snapshot.player.xp,0);
  const archived=f.sql("SELECT COUNT(*) AS n FROM commands WHERE world_id='valley'")[0].n;assert.equal(archived,count+clients);
  const replay=await f.send(gateways[0],sessions[0].name,{replay:true});assert.equal(replay.replay.deterministic,true);
  const processes=execFileSync('ps',['-axo','pid=,ppid=,rss=,comm='],{encoding:'utf8'}).split('\n').map(line=>line.trim().match(/^(\d+)\s+(\d+)\s+(\d+)\s+(.+)$/)).filter(m=>m&&Number(m[2])===process.pid&&path.basename(m[4])==='node');
  assert.equal(processes.length,1);const workerResidentBytes=Number(processes[0][3])*1024,databaseBytes=[f.env.ZGE_STAGING_DB,f.env.ZGE_STAGING_DB+'-wal',f.env.ZGE_STAGING_DB+'-shm'].filter(existsSync).reduce((sum,file)=>sum+statSync(file).size,0);
  rows.push({workerResidentBytes,databaseBytes,clients,phpGateways:gateways.length,commands:completed,elapsedMs:elapsed,commandsPerSecond:completed/(elapsed/1000),latencyMs:stats(latency),revision:state.revision,events:state.cursor,archiveReceipts:archived,workersStarted:health.metrics.workerStarts,queuePeak:health.metrics.queuePeak,workerGeneration:health.worlds[0].generation,evaluator:health.worlds[0].evaluation,inventoryInvariant:true,privateProgressInvariant:true,deterministic:true,errors});
  writeFileSync(out+'/multiplayer-capacity.json',JSON.stringify({scope:'actual authenticated HTTP + PHP gateways + one persistent Node world worker + SQLite FULL WAL; 512 real actor movement commands per run',quota:'existing supported staging configuration 600 requests/min/IP and 600/principal; burst measurement, not sustained WAN SLA',rows},null,2));console.log('Capacity '+clients+' clients: '+completed+' real commands; one worker; PASS');
 }finally{await f.close();}
}
