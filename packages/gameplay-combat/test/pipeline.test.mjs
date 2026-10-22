import {test} from 'node:test';import assert from 'node:assert/strict';import {reduceCombat} from '../src/index.js';import {createCombatResult} from '../../../src/game/CombatResult.js';
test('minimal combat result matches legacy publisher numeric damage and defeat semantics',()=>{
 for(const health of [1,20,325])for(const amount of [0,5,50,400]){
  const state={targets:[{id:'enemy',health}],ledger:[],events:[],revision:0},command={id:'hit',targetId:'enemy',sourceId:'player',amount};const next=reduceCombat(state,command);
  const legacy=createCombatResult({id:'hit',target:{entityId:'enemy'},source:{entityId:'player'},requestedDamage:amount,beforeHealth:health,afterHealth:Math.max(0,health-amount)});
  assert.equal(next.damage,legacy.damageAmount);assert.equal(next.events.some(e=>e.type==='combat:death'),legacy.killed);assert.equal(next.state.targets[0].health,Math.max(0,health-amount));assert.equal(state.targets[0].health,health);
  const repeat=reduceCombat(next.state,command);assert.deepEqual(repeat.events,[]);assert.equal(repeat.state.targets[0].health,next.state.targets[0].health);
 }
});
test('illegal targets, hit masks, projectile owners, malformed damage and duplicate conflicts do not write health',()=>{
 const state={targets:[{id:'enemy',health:10}],ledger:[],events:[],revision:0},cmd={id:'hit',targetId:'enemy',sourceId:'p',amount:5};
 for(const [command,options]of [[{...cmd,targetId:'missing'},{}],[cmd,{validateHit:()=>false}],[cmd,{projectileOwner:'other'}],[{...cmd,amount:NaN},{}]]){const r=reduceCombat(state,command,options);assert.equal(r.ok,false);assert.deepEqual(r.state,state);}
 const first=reduceCombat(state,cmd);assert.equal(reduceCombat(first.state,{...cmd,amount:9}).reason,'idempotency-conflict');
});
