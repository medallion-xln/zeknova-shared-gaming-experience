import fs from 'node:fs';import assert from 'node:assert/strict';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');const out=process.env.ZGE_EVIDENCE_DIR||'/tmp/zge04-evidence';fs.mkdirSync(out,{recursive:true});
const browser=await chromium.launch({executablePath:process.env.CHROME_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true,args:['--enable-unsafe-webgpu']});const context=await browser.newContext({viewport:{width:1280,height:900}}),page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
try{
 await page.goto('http://127.0.0.1:8790/?construction=shadow&zge=probe');await page.locator('[name=displayName]').fill('ZGE04 parity');await page.locator('[name=email]').fill('zge04-parity@example.invalid');await page.locator('#login-new-team').fill('ZGE04 parity '+Date.now());await page.getByRole('button',{name:'COMPLETE ENLISTMENT'}).click();await page.locator('#launch-game').click();await page.waitForFunction(()=>window.ZGE?.engine?.lifecycle.state==='running',null,{timeout:90000});await page.waitForTimeout(4000);
 const result=await page.evaluate(async()=>{
  const {captureConstructionInput}=await import('/packages/zeknova-compat/src/constructionShadow.js');const {CONSTRUCTION_CATALOG,simulateZekNovaPlacement}=await import('/src/game/construction/policy.js');const {ConstructionParityReport}=await import('/packages/gameplay-construction/src/index.js');
  const placementProjection=(inventory,records)=>({inventory,records:records.map(b=>({id:b.id,type:b.type,x:b.x,y:b.y,z:b.z,rotation:b.rotation,level:b.level??1}))});
  const g=ZekNovaGame,t=g.terrain,originalManager=g.buildings,originalTerrainManager=t.worldBuildings,originalRandom=Math.random,originalUUID=crypto.randomUUID,originalCooldown=g.zeknovanAidCooldownUntil,report=new ConstructionParityReport({limit:1000});g.paused=true;
  // Stop the installed observer while inspecting separate real legacy managers.
  ZGE.engine.world.getResource('construction.shadow').dispose();
  const querySite=(type,manager)=>{for(let x=-65;x<=65;x+=5)for(let z=-65;z<=65;z+=5)if(manager.isValidSite(type,x,z,t))return {x,z};return null;};
  const cleanup=manager=>{manager.group.removeFromParent();const disposed=new Set();manager.group.traverse(o=>{if(o.geometry&&!disposed.has(o.geometry)){disposed.add(o.geometry);o.geometry.dispose();}for(const m of [o.material].flat().filter(Boolean))if(!disposed.has(m)){disposed.add(m);m.dispose();}});};
  let skipped=0;const skippedFixtures=[];
  try{
   for(const rank of ['ensign','lieutenant','captain'])for(const definition of CONSTRUCTION_CATALOG)for(const scenario of ['valid','resources','outside','overlap','cooldown']){
    const manager=new originalManager.constructor(rank),events=[];g.buildings=manager;t.worldBuildings=manager;t.rebuildWorldObstacleIndexes(true);g.scene.add(manager.group);manager.utilityTerrain=t;
    let waterSite=null;if(definition.type==='boat')for(let x=-65;x<=65&&!waterSite;x+=5)for(let z=-65;z<=65;z+=5)if(t.isWaterInfrastructureSite(x,z)){waterSite={x,z};break;}
    const fallback=waterSite??querySite(definition.type,manager)??querySite('power',manager)??{x:10,z:10};
    // Operational utility sources are synthetic, explicit starting state; the target always uses real terrain.
    for(const [type,dx,dz]of [['power',-10,-10],['water',-10,0],['communications',0,-10]])manager.addRecord({id:'seed-'+type,type,x:fallback.x+dx,z:fallback.z+dz,y:t.heightAt(fallback.x+dx,fallback.z+dz),rotation:0,level:1,health:1000});
    const site=querySite(definition.type,manager);if(scenario==='valid'&&!site){skipped++;skippedFixtures.push({rank,type:definition.type,scenario,reason:'no valid site in deterministic terrain scan'});cleanup(manager);continue;}
    const point=scenario==='outside'?{x:1000,z:1000}:site??fallback;
    if(scenario==='overlap')manager.addRecord({id:'overlap',type:'power',x:point.x,z:point.z,y:t.heightAt(point.x,point.z),rotation:0,level:1,health:1000});
    const inventory=Object.fromEntries(['minerals','credits','iron','biomass','energy','data','trust'].map(k=>[k,scenario==='resources'?0:1000]));manager.selectedType=definition.type;g.zeknovanAidCooldownUntil=scenario==='cooldown'?Date.now()+60000:0;manager.canPlaceZeknovanAid=p=>g.canPlaceZeknovanAid(p,{announce:false});
    const fixtureId=`browser/${rank}/${definition.type}/${scenario}`,id=fixtureId.replaceAll('/','-');const control={id};if(definition.type!=='bridge')control.rotation=Math.PI/2;
    const collisionActual=Boolean(t.isObstacleAt(point.x,point.z,3));const facts=captureConstructionInput(g,point,inventory,control),collisionExpected=facts.terrain.obstacles.some(o=>Math.hypot(o.x-point.x,o.z-point.z)<o.radius+3),engine=simulateZekNovaPlacement(facts),before={inventory:structuredClone(inventory),records:structuredClone(facts.records)};
    const add=manager.addRecord;manager.addRecord=function(r){const value=add.call(this,r);events.push('record-added');return value;};manager.onProgressionPlacement=()=>events.push('progression');
    Math.random=()=>.25;crypto.randomUUID=()=>id;
    const actual=manager.place(point,inventory,t);Math.random=originalRandom;crypto.randomUUID=originalUUID;
    const afterFacts=captureConstructionInput(g,point,inventory,control),row=report.record({fixtureId,request:facts.request,before,after:{inventory:structuredClone(inventory),records:structuredClone(afterFacts.records)},actual:actual?{id:actual.id,type:actual.type,x:actual.x,y:actual.y,z:actual.z,rotation:actual.rotation,level:actual.level}:null,predicted:engine.result,identityControlled:true,rotationControlled:true,collisionActual,collisionExpected,events,serializedRecords:JSON.stringify(afterFacts.records),serializedEngineState:JSON.stringify(placementProjection(engine.inventory,engine.records)),serializedLegacyState:JSON.stringify(placementProjection(inventory,afterFacts.records)),unobservable:['full-pointer-progression','health-utility-extensions','server-save-restore','distributed-authority'],reproduce:'Run scripts/zge04-browser-parity.mjs; synthetic utility seeds, real terrain and runtime class'});
    cleanup(manager);
   }
  }finally{g.buildings=originalManager;t.worldBuildings=originalTerrainManager;g.zeknovanAidCooldownUntil=originalCooldown;t.rebuildWorldObstacleIndexes(true);Math.random=originalRandom;crypto.randomUUID=originalUUID;g.paused=false;}
  return {report:report.snapshot(),skipped,skippedFixtures,liveAuthority:ZGE.engine.authority.get('construction')};
 });
 fs.writeFileSync(out+'/browser-parity.json',JSON.stringify({result,errors},null,2));console.log(JSON.stringify({total:result.report.total,matched:result.report.matched,mismatched:result.report.mismatched,skipped:result.skipped,errors}));assert.deepEqual(errors,[]);assert.equal(result.report.mismatched,0);assert.equal(result.skipped,0);assert.equal(result.report.total,390);
 // Known divergences are retained and block takeover, never silently normalized.
}catch(error){fs.writeFileSync(out+'/browser-parity-error.txt',error.stack);throw error;}finally{await browser.close();}
