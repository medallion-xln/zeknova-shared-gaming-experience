import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { Construction, dispatchConstruction, installConstruction } from '../src/index.js';
import { createEngine, Authority } from '../../core/src/index.js';
import { runDemo } from '../../../examples/construction-world/main.mjs';
import { evaluateDamage } from '../../gameplay-combat/src/index.js';
import { evaluateMission } from '../../gameplay-missions/src/index.js';
import { createCampaignTiers, objectiveValue, objectiveComplete } from '../../../src/game/Missions.js';

const options = () => ({ definitions: [{ type: 'hut', cost: { stone: 4 }, radius: 1 }], inventory: { stone: 10 }, terrain: { isValid: (_d,x,z) => x>=0 && z>=0, heightAt: () => 2 } });
const place = (id='a',x=2) => ({ action: 'place', commandId: id, id, type: 'hut', x, z: 2 });

test('atomic placement, idempotency, occupancy, terrain and resource rejection', () => {
  const c = new Construction(options()); const a = c.execute(place()); assert.equal(a.ok,true);
  assert.deepEqual(c.execute(place()), a); assert.equal(c.snapshot().inventory.stone,6);
  assert.equal(c.snapshot().buildings.length,1);
  assert.equal(c.execute(place('b')).reason,'occupied');
  assert.equal(c.execute(place('c',-1)).reason,'terrain');
  assert.equal(c.execute(place('d',6)).ok,true); assert.equal(c.execute(place('e',10)).reason,'resources');
  assert.equal(c.execute({ ...place('nan'), x: NaN }).reason,'invalid-request');
  assert.equal(c.execute({ ...place('nan-rotation'), rotation: Infinity }).reason,'invalid-request');
});
test('remove, reverse rollback, serialization and deterministic replay', () => {
  const c = new Construction(options()), initial=c.snapshot(), commands=[place(),place('b',6)];
  c.replay(commands); const saved = JSON.parse(JSON.stringify(c.snapshot()));
  c.execute({ action:'remove', id:'a', commandId:'remove' }); assert.equal(c.snapshot().buildings.length,1);
  c.rollback('remove'); assert.deepEqual(c.snapshot(),saved);
  c.rollback('b'); c.rollback('a'); assert.deepEqual(c.snapshot(),initial);
  c.replay(commands); assert.deepEqual(c.snapshot(),saved);
  const restored = new Construction({ ...options(),snapshot:saved }); saved.inventory.stone=999;
  assert.equal(restored.snapshot().inventory.stone,2);
  assert.throws(()=>c.restore({ ...initial,version:9 }),/invalid/);
});
test('throwing validation cannot deduct inventory or modify collision occupancy', () => {
  const o=options(); o.terrain.heightAt=()=>{throw Error('terrain unavailable');}; const c=new Construction(o),before=c.snapshot();
  assert.throws(()=>c.execute(place()),/terrain unavailable/); assert.deepEqual(c.snapshot(),before);
});
test('authority switching invokes exactly one mutator; shadow is immutable', () => {
  const construction=new Construction(options()),authority=new Authority({ construction:'SHADOW' });let legacy=0;
  const args={construction,authority,command:place(),legacy:()=>{legacy++;return {ok:true};}};
  const before=construction.snapshot();assert.equal(dispatchConstruction(args).equivalent,true); assert.deepEqual(construction.snapshot(),before); assert.equal(legacy,1);
  authority.set('construction','ENGINE');dispatchConstruction(args);assert.equal(legacy,1);assert.equal(construction.snapshot().inventory.stone,6);
  authority.set('construction','LEGACY');dispatchConstruction(args);assert.equal(legacy,2);assert.equal(construction.snapshot().inventory.stone,6);
});
test('actual legacy construction methods agree for costs, water sites, discounts and placement outcomes', () => {
  const bundle=readFileSync(new URL('../../../assets/index-02987539.js',import.meta.url),'utf8');
  const start=bundle.indexOf('class LR{'),end=bundle.indexOf('createModel(e,t){',start);
  // Evaluate the actual oracle methods with presentation and randomness replaced by deterministic stubs.
  const source=bundle.slice(start,end)+ 'createModel(){return {}}}';
  const defs=[{type:'power',cost:{minerals:24,iron:8,timber:8,credits:12}},{type:'bridge',cost:{minerals:13,timber:5}},{type:'boat',cost:{minerals:10}}];
  const Legacy=vm.runInNewContext(source+';LR',{ Ge:class{add(){}},eo:defs,Be:{waterLevel:3},crypto:{randomUUID:()=> 'fixture'},Math:Object.assign(Object.create(Math),{random:()=>0}) });
  for(const officer of ['ensign','lieutenant','captain'])for(const type of ['power','bridge','boat','missing'])for(const valid of [false,true])for(const amount of [0,100]) {
    const l=new Legacy(officer); l.selectedType=type;l.addRecord=r=>l.records.push(r);
    const terrain={isBuildable:()=>valid,isWaterInfrastructureSite:()=>!valid,heightAt:()=>7,bridgeRotationAt:()=>1.2};
    const inventory={minerals:amount,iron:amount,timber:amount,credits:amount};const resourceCopy=structuredClone(inventory);
    const costFor=d=>Object.fromEntries(Object.entries(d.cost).map(([k,v])=>[k,k==='minerals'?Math.ceil(v*(officer==='lieutenant'?.85:1)):v]));
    const c=new Construction({definitions:defs,inventory,terrain:{isValid:(d,x,z)=>l.isValidSite(d.type,x,z,terrain),heightAt:(d,x,z)=>l.siteHeight(d.type,x,z,terrain),rotationAt:(d)=>d.type==='bridge'?1.2:0},costFor});
    const old=l.place({x:2,z:4},resourceCopy,terrain), next=c.execute({action:'place',commandId:'test',id:'fixture',type,x:2,z:4});
    assert.equal(next.ok,Boolean(old),`${officer}/${type}/${valid}/${amount}`);
    assert.deepEqual(c.snapshot().inventory,resourceCopy);
    if(old)for(const key of ['id','type','x','y','z','rotation','level'])assert.equal(next.building[key],old[key]);
  }
});
test('kernel commands execute only at fixed steps; ownership blocks writes and disposal releases handlers', async()=>{
  const engine=createEngine({scheduler:'manual',config:{features:{construction:'LEGACY'}}}),handle=installConstruction(engine,options());await engine.start();
  engine.commands.enqueue({id:'blocked',type:'construction',payload:place()});engine.step();assert.equal(handle.construction.snapshot().buildings.length,0);
  engine.authority.set('construction','ENGINE');engine.commands.enqueue({id:'allowed',type:'construction',payload:place()});assert.equal(handle.construction.snapshot().buildings.length,0);engine.step();assert.equal(handle.construction.snapshot().buildings.length,1);
  await engine.dispose();assert.equal(engine.commands.handlers.size,0);assert.throws(()=>handle.construction.execute(place('b')),/disposed/);
});
test('standalone demo saves, restores and replays without game or rendering dependencies',async()=>{ const result=await runDemo(); assert.equal(result.deterministic,true);assert.equal(result.state.inventory.stone,8);assert.equal(result.rejected.reason,'occupied');assert.equal(result.step,3);assert.equal(result.entityCount,1); });
test('combat proposal has hit/projectile guards, overkill clamp, effects and one death transition',()=>{
 const target={id:'enemy',health:20};const command={targetId:'enemy',sourceId:'player',amount:30,effects:[{type:'slow',ticks:2}]};
 const r=evaluateDamage(target,command,{projectileOwner:'player'});assert.equal(r.state.health,0);assert.equal(r.damage,20);assert.equal(r.events.at(-1).type,'combat:death');assert.equal(target.health,20);
 assert.equal(evaluateDamage(target,command,{projectileOwner:'other'}).ok,false);assert.equal(evaluateDamage(r.state,command).reason,'already-dead');
 assert.equal(evaluateDamage(target,{...command,amount:NaN}).ok,false);
});
test('mission progress and rewards are pure and completion is idempotent; twelve legacy missions retained',()=>{
 const state={status:'locked'}, definition={id:'one',prerequisites:['zero'],objectives:[{id:'build',key:'huts',target:2}],rewards:[{stone:1}]};
 assert.equal(evaluateMission(definition,state,{}).state.status,'locked');const r=evaluateMission(definition,state,{completed:['zero'],values:{huts:2}});
 assert.equal(r.state.status,'complete');assert.equal(r.rewards.length,1);assert.equal(state.status,'locked');assert.equal(evaluateMission(definition,r.state,{}).rewards.length,0);
 const missions=createCampaignTiers().flatMap(t=>t.missions);assert.equal(missions.length,12);
 for(const mission of missions) for(const objective of mission.subObjectives) {
  const context={buildings:{},stats:{},biomes:{},bossDefeats:{}};const value=objectiveValue(objective,context);
  const generic=evaluateMission({id:mission.id,objectives:[{id:objective.id,key:'value',target:objective.target}]},{status:'active'},{values:{value}});
  assert.equal(generic.state.status==='complete',objectiveComplete(objective,context));
 }
});
test('standalone production module graph imports only independent engine packages',()=>{
 const seen=new Set();
 function visit(url){if(seen.has(url.href))return;seen.add(url.href);const source=readFileSync(url,'utf8');assert.doesNotMatch(url.pathname,/assets\/index-|\/src\/game\/|\/zeknova-compat\//);
 for(const match of source.matchAll(/(?:from\s*|import\s*)['"]([^'"]+)['"]/g)){if(match[1].startsWith('.'))visit(new URL(match[1],url));}}
 visit(new URL('../../../examples/construction-world/main.mjs',import.meta.url));assert.ok(seen.size>5);
});
