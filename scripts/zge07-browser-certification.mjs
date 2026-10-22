/** Local-only QA. PLAYWRIGHT_MODULE points to an installed Playwright ESM entry. */
import fs from 'node:fs';
import assert from 'node:assert/strict';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const output=process.env.ZGE_EVIDENCE_DIR||'/tmp/zge07-evidence/browser-diagnostics';fs.mkdirSync(output,{recursive:true});
const browser=await chromium.launch({executablePath:process.env.CHROME_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true,args:['--enable-unsafe-webgpu']});
const context=await browser.newContext({viewport:{width:1280,height:900}});const page=await context.newPage();let errors=[],warnings=[];
page.on('pageerror',e=>errors.push(e.message));page.on('console',msg=>{if(['warning','error'].includes(msg.type()))warnings.push(msg.text());});
const base='http://127.0.0.1:8790';
async function launch(query=''){
 await page.goto(base+'/?zge=probe&qaRank=ensign&construction=shadow'+query);
 const launch=page.locator('#launch-game');
 await page.waitForFunction(()=>document.querySelector('#launch-game')||document.querySelector('input[name="displayName"]'),null,{timeout:15000});
 if(!await launch.count()){
  await page.locator('input[name="displayName"]').fill('ZGE03 QA');await page.locator('input[name="email"]').fill('zge03-qa@example.invalid');await page.locator('#login-new-team').fill('ZGE03 isolated '+Date.now());
  await page.getByRole('button',{name:'COMPLETE ENLISTMENT'}).click();
 }
 await launch.waitFor({timeout:15000});await launch.click();await page.waitForFunction(()=>window.ZGE?.engine?.lifecycle.state==='running',null,{timeout:90000});await page.waitForTimeout(5000);
 await page.evaluate(async()=>{await Promise.race([ZekNovaGame.environmentReady,new Promise(r=>setTimeout(r,20000))]);});
}
try{
 const report={date:new Date().toISOString(),runs:[]};
 for(const query of ['', '&safe=1', '&boss=1', '&present=neural&neural=none']){
  errors=[];warnings=[];await launch(query);
  await page.evaluate(()=>{const active=new Map(),set=window.setInterval,clear=window.clearInterval;window.__zge07Intervals=active;window.setInterval=function(...args){const id=set.apply(this,args);active.set(id,{ms:args[1],stack:new Error().stack});return id;};window.clearInterval=function(id){active.delete(id);return clear.call(this,id);};});
  const initial=await page.evaluate(async()=>{
   const g=ZekNovaGame,a=await import('/packages/assets/src/threeAssetService.js');let proto=g,methods=[];while(proto&&proto!==Object.prototype){methods.push(...Object.getOwnPropertyNames(proto).filter(k=>/colli|damage|save|mission|build|boss/i.test(k)));proto=Object.getPrototypeOf(proto);}
   return {backend:g.renderer.backend.isWebGPUBackend?'WebGPU':'WebGL',assets:a.getThreeAssetService().status(),missionCount:ZekNovaSource.Missions.createCampaignTiers().flatMap(t=>t.missions).length,boss:g.bossManager?.config?.name,bossActive:g.bossManager?.active,methods:[...new Set(methods)],presentation:ZGE.presentation(),player:g.player.group.position.toArray(),xp:g.player.xp,paused:g.paused};
  });
  const movementStart=await page.evaluate(()=>{const g=ZekNovaGame;g.paused=false;window.__zge06MovementSetup={healthBefore:g.player.health,pendingExtraction:!!g.deathStateUntil};g.deathStateUntil=0;g.player.health=100;g.player.clearCombatAnimation?.();g.player.setMoveTarget(null);g.player.clearControls();let site=null;for(let x=-65;x<=65&&!site;x+=5)for(let z=-65;z<=65;z+=5){let clear=true;for(let a=0;a<8&&clear;a++)for(let d=0;d<=12;d+=2){const px=x+Math.cos(a*Math.PI/4)*d,pz=z+Math.sin(a*Math.PI/4)*d;if(g.terrain.isWaterAt(px,pz)||g.terrain.isObstacleAt(px,pz,.8))clear=false;}if(clear){site={x,z};break;}}if(!site)throw Error('No clear movement fixture');g.player.group.position.set(site.x,g.terrain.heightAt(site.x,site.z),site.z);g.renderer.domElement.focus();return g.player.group.position.toArray();});
  await page.bringToFront();await page.keyboard.down('w');await page.waitForTimeout(1000);await page.keyboard.up('w');
  const movement=await page.evaluate(start=>{const p=ZekNovaGame.player.group.position;return {distance:Math.hypot(p.x-start[0],p.z-start[2]),end:p.toArray(),setup:window.__zge06MovementSetup,healthAfter:ZekNovaGame.player.health};},movementStart);
  const gameplay=await page.evaluate(()=>{
   const g=ZekNovaGame;let site;for(let x=-75;x<70&&!site;x+=5)for(let z=-75;z<70;z+=5)if(g.buildings.isValidSite('power',x,z,g.terrain)){site={x,z};break;}
   Object.assign(g.simulation.resources,{minerals:1000,iron:1000,biomass:1000,credits:1000});
   const before=structuredClone(g.simulation.resources);g.buildings.select('power');const placed=site&&g.buildings.place(site,g.simulation.resources,g.terrain);g.buildings.select(null);
   const deduction=Object.fromEntries(Object.keys(before).map(k=>[k,before[k]-g.simulation.resources[k]]).filter(([,v])=>v));
   const enemy=g.enemies.find(e=>(e.userData?.health??0)>0)||g.bossManager?.boss;let combat=null;
   if(enemy){const owner=enemy.userData??enemy,health=owner.health;g.damageWeaponTarget(enemy,5,'#fff','rifle');combat={before:health,after:owner.health};}
   const snap=__zgeLeakProbe.snapshot();return {site,placed:placed?{id:placed.id,type:placed.type,x:placed.x,z:placed.z}:null,deduction,combat,collision:placed?g.terrain.isObstacleAt(placed.x,placed.z,.65):null,shadow:ZGE.construction(),leakBefore:snap,bossHealth:g.bossManager?.boss?.userData?.health};
  });
  const restart=await page.evaluate(async()=>{await new Promise(r=>setTimeout(r,1500));const before=__zgeLeakProbe.snapshot(),beforeIds=[...__zge07Intervals.keys()];const cycles=[];for(let i=0;i<3;i++)cycles.push(await ZGE.restartDirectorLayer());await new Promise(r=>setTimeout(r,1500));return {cycles:cycles.map(c=>({certified:c.certified,failures:c.failures,installed:c.installed.length})),diff:__zgeLeakProbe.diff(before,__zgeLeakProbe.snapshot()),before,after:__zgeLeakProbe.snapshot(),intervals:[...__zge07Intervals].filter(([id])=>!beforeIds.includes(id)).map(([,info])=>info)};});
  const frames=await page.evaluate(async()=>{const samples=[];let previous=performance.now();for(let i=0;i<120;i++)await new Promise(r=>requestAnimationFrame(t=>{samples.push(t-previous);previous=t;r();}));samples.sort((a,b)=>a-b);return {fps:1000/(samples.reduce((a,b)=>a+b,0)/samples.length),p99:samples[Math.floor(samples.length*.99)]};});
  const save=await page.evaluate(async()=>{ZekNovaGame.player.xp=321;ZekNovaGame.save();await ZekNovaGame.flushAdaptiveSave?.();await new Promise(r=>setTimeout(r,150));const transport=ZGE.engine.world.getResource('persistence').transport;await transport.flush();for(let i=0;i<200&&transport.hasPending();i++)await new Promise(r=>setTimeout(r,50));return ZGE.persistence();});
  fs.writeFileSync(output+'/restart-diagnostic-'+(report.runs.length)+'.json',JSON.stringify({query,restart},null,2));
  assert.equal(initial.missionCount,12);fs.writeFileSync(output+'/movement-last.json',JSON.stringify({query,movement,initial},null,2));assert.ok(movement.distance>1&&movement.distance<15, JSON.stringify(movement));assert.ok(gameplay.placed);assert.equal(gameplay.collision,true);assert.equal(gameplay.shadow.mismatches,0);assert.equal(gameplay.shadow.errors,0);assert.ok(restart.cycles.every(c=>c.certified));assert.equal(restart.diff.intervals,0);assert.deepEqual(errors,[]);
  const run={query,initial,movement,gameplay,restart,frames,save,errors:[...errors],warnings:[...warnings]};report.runs.push(run);fs.writeFileSync(output+'/browser-gameplay.json',JSON.stringify(report,null,2));
  if(query===''){
   const stress=await page.evaluate(async()=>{const {runStress}=await import('/examples/asset-stress/stress.js');return runStress(ZekNovaGame.renderer,{mode:ZekNovaGame.renderer.backend.isWebGPUBackend?'WebGPU':'WebGL'});});fs.writeFileSync(output+'/stress-webgpu.json',JSON.stringify(stress,null,2));
  }
  console.log(JSON.stringify({query,backend:initial.backend,movement,placed:gameplay.placed,shadow:gameplay.shadow,restart:restart.diff,frames,errors}));
 }
 const beforeRestart=await page.evaluate(()=>({xp:ZekNovaGame.player.xp,buildings:ZekNovaGame.buildings.records.map(b=>b.id)}));
 await Promise.all([page.waitForNavigation({waitUntil:'domcontentloaded'}),page.evaluate(()=>ZGE.requestFullPageRestart({reason:'zge03-certification'}))]);
 await page.waitForFunction(()=>window.ZGE?.engine?.lifecycle.state==='running',null,{timeout:90000});await page.waitForTimeout(1500);
 report.restore=await page.evaluate(before=>({xp:ZekNovaGame.player.xp,expectedXp:before.xp,buildingsRetained:before.buildings.every(id=>ZekNovaGame.buildings.records.some(b=>b.id===id)),autoLaunch:document.documentElement.dataset.zgeAutoLaunch}),beforeRestart);
 await page.goto(base+'/examples/construction-world/');await page.waitForFunction(()=>window.demoResult);report.standalone=await page.evaluate(()=>window.demoResult);
 assert.equal(report.standalone.deterministic,true);assert.ok(report.restore.buildingsRetained);assert.ok(report.restore.xp>=report.restore.expectedXp);
 fs.writeFileSync(output+'/browser-gameplay.json',JSON.stringify(report,null,2));
 await page.goto(base+'/examples/asset-stress/');await page.waitForFunction(()=>window.stressResult||window.stressError,null,{timeout:60000});fs.writeFileSync(output+'/stress-webgl.json',JSON.stringify(await page.evaluate(()=>({result:window.stressResult,error:window.stressError})),null,2));
 // A new page/JS realm must recreate and dispose all workers cleanly.
 await page.reload();await page.waitForFunction(()=>window.stressResult||window.stressError,null,{timeout:60000});fs.writeFileSync(output+'/stress-browser-restart.json',JSON.stringify(await page.evaluate(()=>({result:window.stressResult,error:window.stressError})),null,2));
}catch(error){fs.writeFileSync(output+'/browser-failure.txt',error.stack);throw error;}finally{await browser.close();}
