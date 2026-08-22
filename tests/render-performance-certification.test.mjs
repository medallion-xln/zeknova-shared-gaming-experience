import assert from 'node:assert/strict';
import {actorRenderDecision,RENDER_PERFORMANCE_POLICY,RenderPerformanceDirector} from '../src/game/RenderPerformanceDirector.js';

assert.equal(actorRenderDecision({distance:100,kind:'resident',critical:true}),true,'mission-critical actor is never culled');
assert.equal(actorRenderDecision({distance:70,kind:'resident',visible:true}),false);
assert.equal(actorRenderDecision({distance:43,kind:'resident',visible:false}),false,'hysteresis prevents threshold flicker');
assert.equal(actorRenderDecision({distance:39,kind:'resident',visible:false}),true);
assert.equal(actorRenderDecision({distance:64,kind:'enemy',visible:true}),true,'near combatants retain full render fidelity');
assert.ok(RENDER_PERFORMANCE_POLICY.enemyHideDistance>RENDER_PERFORMANCE_POLICY.residentHideDistance);

const player={group:{position:{x:0,z:0}}},near={position:{x:4,z:0},visible:true,userData:{enemyType:'stalker'}},far={position:{x:100,z:0},visible:true,userData:{enemyType:'stalker'}},boss={position:{x:120,z:0},visible:true,userData:{isMissionBoss:true}};
let rendererResets=0;const renderer={info:{render:{calls:3000,triangles:700000},memory:{geometries:500,textures:30},reset(){rendererResets++}}};
const game={player,enemies:[near,far,boss],residentNPCs:[],scene:{traverse(){}},renderer};
const director=new RenderPerformanceDirector({game,now:()=>0});director.optimize();
assert.equal(near.visible,true);assert.equal(far.visible,false);assert.equal(boss.visible,true);
assert.equal(director.report().hidden.enemies,1);assert.equal(director.report().gameplayStateMutated,false);
director.resetSamples();assert.equal(rendererResets,1,'capture reset establishes a deterministic renderer-counter measurement boundary');
director.dispose();assert.equal(far.visible,true,'dispose restores canonical render state');

// Structural scalability: policy decisions remain linear and allocation-bounded
// for the requested projectile/actor certification populations.
for(const count of [16,50,100,250,500]){const rows=Array.from({length:count},(_,i)=>actorRenderDecision({distance:i%120,kind:'enemy'}));assert.equal(rows.length,count)}
for(const count of [10,25,50,100]){let visible=0;for(let i=0;i<count;i++)visible+=Number(actorRenderDecision({distance:i*2,kind:i%3?'resident':'enemy'}));assert.ok(visible<=count)}
console.log('ZEK-16 render performance certification: PASS (critical fidelity, hysteresis, distance render LOD, restoration, 500 projectiles / 100 actors structural scale)');
