import { HUMAN_BUILDINGS } from '../Buildings.js';
import { utilityStatus, evaluatePlacement, Construction } from '../../../packages/gameplay-construction/src/index.js';
import { immutableData } from '../../../packages/core/src/index.js';

export const AID_BUILDINGS = [{type:"zek_clinic",label:"Field Clinic",icon:"✚",audience:"zeknovan",description:"Build a ZekNovan field clinic. Costs 28 minerals and 8 Colony Credits; reduces tension by 12 and adds 8 trust.",cost:{minerals:28,credits:8},tension:-12,trust:8,indicator:"morale",indicatorDelta:4},{type:"zek_watershed",label:"Watershed Renewal",icon:"◉",audience:"zeknovan",description:"Restore a community watershed. Costs 34 minerals and 10 Colony Credits; reduces tension by 16 and adds 10 trust.",cost:{minerals:34,credits:10},tension:-16,trust:10,indicator:"ecology",indicatorDelta:8},{type:"zek_beacon",label:"Peace Beacon",icon:"⌁",audience:"zeknovan",description:"Install a ZekNovan peace beacon. Costs 40 minerals and 12 Colony Credits; reduces tension by 20 and adds 12 trust.",cost:{minerals:40,credits:12},tension:-20,trust:12,indicator:"governance",indicatorDelta:5},{type:"zek_grove",label:"Sacred Grove Nursery",icon:"♧",audience:"zeknovan",description:"Cultivate replacement sacred trees. Costs 24 minerals and 7 Colony Credits; reduces tension by 10 and adds 7 trust.",cost:{minerals:24,credits:7},tension:-10,trust:7,indicator:"ecology",indicatorDelta:10},{type:"zek_habitat",label:"Village Habitat",icon:"⌂",audience:"zeknovan",description:"Construct communal ZekNovan housing. Costs 36 minerals and 11 Colony Credits; reduces tension by 14 and adds 9 trust.",cost:{minerals:36,credits:11},tension:-14,trust:9,indicator:"morale",indicatorDelta:7},{type:"zek_archive",label:"Cultural Archive",icon:"◈",audience:"zeknovan",description:"Preserve ZekNovan history and language. Costs 30 minerals and 9 Colony Credits; reduces tension by 12 and adds 10 trust.",cost:{minerals:30,credits:9},tension:-12,trust:10,indicator:"governance",indicatorDelta:7},{type:"zek_market",label:"Trade Pavilion",icon:"◇",audience:"zeknovan",description:"Open a neutral exchange pavilion. Costs 32 minerals and 10 Colony Credits; reduces tension by 11 and adds 8 trust.",cost:{minerals:32,credits:10},tension:-11,trust:8,indicator:"economy",indicatorDelta:7},{type:"zek_watch",label:"Guardian Watch",icon:"⬡",audience:"zeknovan",description:"Equip a joint settlement watchpost. Costs 38 minerals and 12 Colony Credits; reduces tension by 15 and adds 8 trust.",cost:{minerals:38,credits:12},tension:-15,trust:8,indicator:"defense",indicatorDelta:8},{type:"zek_transit",label:"Transit Gate",icon:"∩",audience:"zeknovan",description:"Connect settlements with a safe transit gate. Costs 35 minerals and 11 Colony Credits; reduces tension by 13 and adds 9 trust.",cost:{minerals:35,credits:11},tension:-13,trust:9,indicator:"resilience",indicatorDelta:7}];
export const CONSTRUCTION_CATALOG = [...Object.values(HUMAN_BUILDINGS), ...AID_BUILDINGS];
export const UTILITY_RULES = {range:{power:30,water:36,data:36},source:{power:"power",water:"water",data:"communications"},requirements:{water:["power"],communications:["power"],habitat:["power","water","data"],defense:["power","data"],boat:["power"],capitol:["power","water","data"],hospital:["power","water","data"],university:["power","water","data"],transit:["power","data"],commerce:["power","water","data"],planetary_capitol:["power","water","data"],war_economy:["power","water","data"],defense_contractor:["power","water","data"],corporate_hq:["power","water","data"],stock_exchange:["power","water","data"]},labels:{power:"Solar Grid",water:"Water Works",data:"Communications Hub"},colors:{power:16762183,water:5102079,data:10782207}};

/** Captured scalar facts only. No engine evaluation calls the live game. */
export function siteDecision(input) {
  const {request:r,terrain:t,records}=input,water=r.type==='bridge'||r.type==='boat';
  if(!Number.isFinite(r.x)||!Number.isFinite(r.z))return {ok:false,reason:'invalid-request'};
  const bounds=t.worldSize*(water?.45:.46);
  if(Math.abs(r.x)>bounds||Math.abs(r.z)>bounds)return {ok:false,reason:'outside-world'};
  if(water){if(!t.waterInfrastructure)return {ok:false,reason:'water-site'};}
  else {
    if(t.obstacles.some(o=>Math.hypot(o.x-r.x,o.z-r.z)<o.radius+3))return {ok:false,reason:'occupied'};
    if(t.height<t.waterLevel+.8||t.height>18)return {ok:false,reason:'terrain-height'};
    if(r.type!=='habitat'&&Math.abs(t.heights[0]-t.heights[1])+Math.abs(t.heights[2]-t.heights[3])>=3.3)return {ok:false,reason:'slope'};
  }
  const utilities=utilityStatus(records,r.type,r.x,r.z,UTILITY_RULES);
  return utilities.ok?{ok:true,utilities}:{ok:false,reason:'utility',missing:utilities.missing};
}
export function evaluateZekNovaPlacement(input) {
  const facts=immutableData(input),definition=CONSTRUCTION_CATALOG.find(d=>d.type===facts.request.type);
  if(!definition)return {ok:false,reason:'unknown-building'};
  if(definition.audience==='zeknovan'&&facts.aidCooldownRemaining>0)return {ok:false,reason:'aid-cooldown'};
  const site=siteDecision(facts);
  if(!site.ok)return {ok:false,reason:site.reason};
  return evaluatePlacement({definitions:[{type:definition.type,cost:definition.cost,radius:0}],state:{inventory:facts.inventory,buildings:facts.records},request:facts.request,
    terrain:{isValid:()=>true,heightAt:()=>facts.request.type==='bridge'?facts.terrain.bridgeHeight:facts.request.type==='boat'?facts.terrain.waterLevel+.18:facts.terrain.height,rotationAt:()=>facts.request.type==='bridge'?facts.terrain.bridgeRotation:0},
    costFor:d=>Object.fromEntries(Object.entries(d.cost).map(([key,value])=>[key,key==='minerals'?Math.ceil(value*(facts.officerClass==='lieutenant'?.85:1)):value])),
  });
}

/** Runs the real generic transaction against detached input for differential QA. */
export function simulateZekNovaPlacement(input) {
  const decision=evaluateZekNovaPlacement(input);
  if(!decision.ok)return {result:decision,inventory:structuredClone(input.inventory),records:structuredClone(input.records),events:[]};
  const c=new Construction({definitions:[{type:input.request.type,cost:decision.cost}],inventory:input.inventory,terrain:{isValid:()=>true,heightAt:()=>decision.building.y,rotationAt:()=>decision.building.rotation}});
  const initial=c.snapshot();initial.buildings=structuredClone(input.records);c.restore(initial);
  const result=c.execute({...input.request,commandId:input.request.id,action:'place'}),state=c.snapshot();c.dispose();
  return {result,inventory:state.inventory,records:state.buildings,events:state.events};
}
