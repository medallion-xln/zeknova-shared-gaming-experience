/** Additional controlled browser fixtures: neural labels, boss defeat, save restore. */
import fs from 'node:fs';
import assert from 'node:assert/strict';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const output=process.env.ZGE_EVIDENCE_DIR||'/tmp/zge03-evidence/final';fs.mkdirSync(output,{recursive:true});
const browser=await chromium.launch({executablePath:process.env.CHROME_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true,args:['--enable-unsafe-webgpu']});
const context=await browser.newContext(),page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
const report={};
try{
 await page.goto('http://127.0.0.1:8790/?zge=probe&construction=shadow&boss=1&present=neural&neural=mock');
 await page.locator('input[name="displayName"]').fill('ZGE03 followup');await page.locator('input[name="email"]').fill('zge03-followup@example.invalid');await page.locator('#login-new-team').fill('ZGE03 followup '+Date.now());await page.getByRole('button',{name:'COMPLETE ENLISTMENT'}).click();await page.locator('#launch-game').click();
 await page.waitForFunction(()=>window.ZGE?.engine?.lifecycle.state==='running',null,{timeout:90000});await page.waitForTimeout(3000);
 report.mock=await page.evaluate(()=>ZGE.presentation());assert.equal(report.mock.presentation.mock,true);assert.match(report.mock.presentation.label,/MOCK/);assert.ok(report.mock.neural.sequencer||report.mock.neural);
 report.boss=await page.evaluate(async()=>{
  const g=ZekNovaGame,m=g.bossManager,id=m.config?.missionId,before=m.boss?.userData?.health;
  // Exercise the legacy damage and finish path, never a new engine combat mutator.
  for(let i=0;i<8&&m.active&&m.boss;i++)g.damageWeaponTarget(m.boss,250,'#fff','rifle');
  await new Promise(r=>setTimeout(r,600));
  return {missionId:id,before,active:m.active,defeat:structuredClone(g.missionStats.bossDefeats?.[id]??null)};
 });
 assert.ok(report.boss.defeat,'legacy boss defeat should persist a mission result');
 // Inspect reference capture through its public backend as well as the neural mock path.
 report.reference=await page.evaluate(async()=>{const h=ZGE.engine.world.getResource('presentation');const frame=await h.capture.capture({simulationTime:ZekNovaGame.clock.elapsedTime});const info={width:frame.width,height:frame.height,kind:frame.kind,stats:h.capture.status()};frame.bitmap?.close?.();return info;});
 report.restart=await page.evaluate(async()=>{
  const g=ZekNovaGame;g.paused=true;const {getThreeAssetService}=await import('/packages/assets/src/threeAssetService.js');
  for(let i=0;i<200&&getThreeAssetService().status().pending;i++)await new Promise(r=>setTimeout(r,50));await new Promise(r=>setTimeout(r,1500));
  const before=__zgeLeakProbe.snapshot();const cycles=[];for(let i=0;i<3;i++)cycles.push((await ZGE.restartDirectorLayer()).certified);
  for(let i=0;i<200&&getThreeAssetService().status().pending;i++)await new Promise(r=>setTimeout(r,50));await new Promise(r=>setTimeout(r,1500));
  return {cycles,diff:__zgeLeakProbe.diff(before,__zgeLeakProbe.snapshot()),assets:getThreeAssetService().status()};
 });
 assert.ok(report.restart.cycles.every(Boolean));
 // QA boss staging deliberately disables normal saves. Switch to the ordinary game before certifying persistence.
 await page.goto('http://127.0.0.1:8790/?zge=probe&construction=shadow');await page.locator('#launch-game').click();await page.waitForFunction(()=>window.ZGE?.engine?.lifecycle.state==='running',null,{timeout:90000});
 await page.evaluate(async()=>{
  const g=ZekNovaGame;g.paused=true;g.player.xp=777;g.save();await g.flushAdaptiveSave?.();await new Promise(r=>setTimeout(r,150));const t=ZGE.engine.world.getResource('persistence').transport;await t.flush();for(let i=0;i<200&&t.hasPending();i++)await new Promise(r=>setTimeout(r,50));
 });
 report.save=await page.evaluate(async()=>{const body=await(await fetch('./api/save.php')).json();return {status:ZGE.persistence(),xp:body.save?.zge?.player?.xp,version:body.save?.version,keys:Object.keys(body.save??{})};});
 assert.equal(report.save.status.state,'saved');assert.equal(report.save.version,4);assert.equal(report.save.xp,777);assert.equal(report.save.keys.includes('construction.shadow'),false);
 // Reload the normal game to verify the acknowledged extension is restored.
 await page.goto('http://127.0.0.1:8790/?zge=probe&construction=shadow');await page.locator('#launch-game').click();await page.waitForFunction(()=>window.ZGE?.engine?.lifecycle.state==='running',null,{timeout:90000});
 report.restore=await page.evaluate(()=>({xp:ZekNovaGame.player.xp,extension:ZGE.persistence().loadedExtension,construction:ZGE.construction(),moduleResources:performance.getEntriesByType('resource').filter(e=>e.name.includes('/assets/model-runtime')).map(e=>e.name)}));assert.ok(report.restore.xp>=777);
 report.errors=errors;assert.deepEqual(errors,[]);
 fs.writeFileSync(output+'/browser-followup.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}catch(error){report.errors=errors;report.failure=error.stack;fs.writeFileSync(output+'/browser-followup.json',JSON.stringify(report,null,2));throw error;}finally{await browser.close();}
