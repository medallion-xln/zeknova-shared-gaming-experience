import {test} from 'node:test';import assert from 'node:assert/strict';import {reduceMission} from '../src/index.js';import {objectiveComplete} from '../../../src/game/Missions.js';
test('representative legacy objective transitions, prerequisites, ordered eligibility and idempotency',()=>{
 const cases=[[{kind:'building',key:'power',target:1},{buildings:{power:1}},1],[{kind:'either',keys:['bridge','boat'],target:1},{buildings:{boat:1}},1],[{kind:'biomeVisit',biome:'forest',target:1},{biomes:{forest:{visited:true}}},1],[{kind:'biomeResource',biome:'forest',target:3},{biomes:{forest:{resources:3}}},3],[{kind:'biomeBuilding',biome:'forest',key:'water',target:2},{biomes:{forest:{buildings:{water:2}}}},2],[{kind:'boss',missionId:'grid',target:1},{bossDefeats:{grid:{defeatedAt:1}}},1]];
 for(const [legacy,context,value]of cases){const d={id:'fixture',prerequisites:['prior'],objectives:[{id:'objective',key:'value',target:legacy.target}],rewards:[{stone:2}]},state={status:'locked'};
  assert.equal(reduceMission(d,state,{id:'locked',facts:{values:{value}}}).state.status,'locked');const next=reduceMission(d,state,{id:'complete',facts:{completed:['prior'],values:{value}}});assert.equal(next.state.status==='complete',objectiveComplete(legacy,context));assert.deepEqual(next.events.map(e=>e.type),['objective:progress','mission:complete','mission:reward-eligible']);assert.equal(next.rewards.length,1);assert.equal(state.status,'locked');
  const repeat=reduceMission(d,JSON.parse(JSON.stringify(next.state)),{id:'complete',facts:{completed:['prior'],values:{value}}});assert.equal(repeat.rewards.length,0);assert.equal(repeat.events.length,0);
  assert.equal(reduceMission(d,next.state,{id:'later',facts:{completed:['prior'],values:{value}}}).rewards.length,0);
 }
});
