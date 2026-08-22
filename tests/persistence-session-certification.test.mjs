import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { spawn } from 'node:child_process';
import net from 'node:net';

const root = new URL('..', import.meta.url).pathname;
const dataDir = await mkdtemp(`${tmpdir()}/zeknova-persistence-`);
const port = await new Promise((resolve, reject) => {
  const server = net.createServer();
  server.once('error', reject); server.listen(0, '127.0.0.1', () => {
    const { port } = server.address(); server.close(() => resolve(port));
  });
});
const php = spawn('php', ['-S', `127.0.0.1:${port}`, '-t', root], {
  cwd: root, env: { ...process.env, ZEKNOVA_ENV: 'local', ZEKNOVA_DATA_DIR: dataDir }, stdio: ['ignore','ignore','pipe'],
});
let phpErrors = ''; php.stderr.on('data', chunk => { phpErrors += chunk; });
const base = `http://127.0.0.1:${port}/api`;
for (let attempt=0; attempt<40; attempt++) {
  try { await fetch(`${base}/session.php`); break; } catch { await new Promise(r=>setTimeout(r,50)); }
}

function client(cookie = '') {
  return {
    cookie,
    async request(path, init={}) {
      const response = await fetch(`${base}${path}`, { ...init, headers: { Accept:'application/json', ...(init.body ? {'Content-Type':'application/json'} : {}), ...(this.cookie ? {Cookie:this.cookie} : {}), ...init.headers } });
      const setCookie = response.headers.get('set-cookie'); if (setCookie) this.cookie = setCookie.split(';')[0];
      const body = await response.json(); return { response, body };
    }
  };
}
const snapshot = (user, mission, operationId, baseRevision=0, buildings=[]) => ({
  version:4, user, buildings, resources:{credits:mission*10}, indicators:{resilience:mission}, phase:Math.ceil(mission/3), civilizationScore:mission*100,
  worldProgress:{harvestedTreeIds:[],treeHarvestedAt:{},collectedPowerUpIds:[],minedRockIds:[]},
  missionStats:{certifiedMission:mission,bossDefeats:mission===12?{'mission-12':{rewardId:'final-reward'}}:{}},
  combat:{specialGauge:mission}, diplomacy:{outcome:null,tension:50}, persistence:{operationId,baseRevision}
});

try {
  const anonymous = client();
  assert.equal((await anonymous.request('/save.php')).response.status, 401, 'protected save requires a session');
  assert.equal((await anonymous.request('/multiplayer.php',{method:'POST',body:'{}'})).response.status, 401, 'protected multiplayer requires a session');

  const a = client(), b = client();
  const enroll = (name,email) => JSON.stringify({displayName:name,email,teamName:'Certification Crew',teamCode:'CERT-1515',biome:'highlands'});
  let result = await a.request('/session.php',{method:'POST',body:enroll('Officer A','a@example.test')}); assert.equal(result.response.status,201); const userA=result.body.user;
  result = await b.request('/session.php',{method:'POST',body:enroll('Officer B','b@example.test')}); assert.equal(result.response.status,201); const userB=result.body.user;
  assert.notEqual(userA.id,userB.id);

  const missions=[1,4,8,12]; let revision=0;
  for (const mission of missions) {
    const payload=snapshot(userA,mission,`A-${mission}`,revision,mission===4?[{id:'shared-power',type:'power',healthUpdatedAt:1}]:[]);
    result=await a.request('/save.php',{method:'POST',body:JSON.stringify(payload)}); assert.equal(result.response.status,200); revision=result.body.revision;
    const restored=await a.request(`/save.php?team=${userA.teamCode}`); assert.equal(restored.body.save.missionStats.certifiedMission,mission); assert.equal(restored.body.save.persistence.revision,revision);
  }
  assert.equal((await a.request('/save.php',{method:'POST',body:JSON.stringify(snapshot(userA,12,'A-12',revision-1))})).body.duplicate,true,'retry is exactly once');
  assert.equal((await a.request('/save.php',{method:'POST',body:JSON.stringify(snapshot(userA,8,'stale-A',revision-1))})).response.status,409,'stale snapshot rejected');

  result=await b.request('/save.php',{method:'POST',body:JSON.stringify(snapshot(userB,1,'B-1',0))}); assert.equal(result.response.status,200);
  const restoredA=await client(a.cookie).request(`/save.php?team=${userA.teamCode}`); // new client process boundary, same server session
  const restoredB=await client(b.cookie).request(`/save.php?team=${userB.teamCode}`);
  assert.equal(restoredA.body.save.missionStats.certifiedMission,12,'Mission 12 restores across a session boundary');
  assert.equal(restoredA.body.save.missionStats.bossDefeats['mission-12'].rewardId,'final-reward');
  assert.equal(restoredB.body.save.missionStats.certifiedMission,1,'campaign state is isolated by user');
  assert.equal(restoredB.body.save.buildings.some(x=>x.id==='shared-power'),true,'team buildings remain shared');

  const roomPayload={teamCode:userA.teamCode,clientId:'client-a',revision:0,player:{x:1,y:0,z:2},world:{buildings:[]}};
  result=await a.request('/multiplayer.php',{method:'POST',body:JSON.stringify(roomPayload)}); assert.equal(result.response.status,200);
  result=await b.request('/multiplayer.php',{method:'POST',body:JSON.stringify({...roomPayload,clientId:'client-b'})}); assert.equal(result.response.status,200);
  assert.equal(result.body.players.some(player=>player.userId===userA.id),true,'room identity comes from authenticated session');

  result=await a.request('/reset.php',{method:'POST',body:'{}'}); assert.equal(result.response.status,200);
  const reset=await a.request(`/save.php?team=${userA.teamCode}`);
  assert.equal(reset.body.save.missionStats.certifiedMission,undefined); assert.deepEqual(reset.body.save.buildings,[]);
  console.log('ZEK-15 persistence/session certification: PASS (auth, checkpoints 1/4/8/12, restart, exactly-once, stale rejection, isolation, multiplayer identity, reset)');
} finally {
  php.kill('SIGTERM'); await new Promise(resolve=>php.once('exit',resolve)); await rm(dataDir,{recursive:true,force:true});
}
if (phpErrors.includes('Fatal error')) throw new Error(phpErrors);
