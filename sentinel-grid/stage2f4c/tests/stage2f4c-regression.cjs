#!/usr/bin/env node
'use strict';
const fs=require('node:fs');const path=require('node:path');const crypto=require('node:crypto');
function arg(name,def){const i=process.argv.indexOf(name);return i>=0?process.argv[i+1]:def;}
const payloadRoot=arg('--payload-root',null);const sentinel=arg('--sentinel-root',null);const zeknova=arg('--zeknova-root',null);const skipV1=process.argv.includes('--skip-v1-guard');
function assert(c,m){if(!c)throw new Error(m);}function sha(p){return crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');}
let runtime;
if(payloadRoot) runtime=path.resolve(payloadRoot,'runtime'); else runtime=path.join(sentinel,'platform/game-agnostic/stage2f4c/runtime');
const Catalog=require(path.join(runtime,'zeknova-strategic-action-catalog-v2.cjs'));
const State=require(path.join(runtime,'zeknova-strategic-state-contract-v2.cjs'));
const Legality=require(path.join(runtime,'zeknova-observation-legality-contract-v2.cjs'));
let passed=0;function test(name,fn){fn();passed++;console.log('PASS',name);}
const entries=Catalog.ACTION_KEYS.map(k=>({actionKey:k,legal:['hold_settlement_perimeter','open_defensive_channel','repair_known_structure'].includes(k),requiresTarget:Catalog.REQUIRES_TARGET[k]===true}));
const targets={repair_known_structure:[{targetId:'structure:A'}]};
const surface=Legality.buildActionSurface(entries,targets,{candidateSetId:'candidate:v2',targetViewId:'target:v2'});
const baseInput={identity:{factionId:'faction:A',biomeId:'forest',operationalAreaId:'area:1'},mission:{missionId:'grid',missionPhase:'opening',objectiveId:'obj:1',objectiveProgress:.25},strategicMetrics:{tensionValue:.5,tensionBand:'medium',infrastructureReliability:.5,infrastructureBand:'developing'},knowledge:{knownRoutes:[{id:'route:A'}],hostileContacts:[],attackerAlerts:[],knownStructures:[{id:'structure:A',damaged:true}],knownResources:[],shareableIntelligence:[]},actionSurface:surface,terminal:{isTerminal:false,terminalReason:null,requiresReplan:false}};
function state(overrides={}){return State.buildCanonicalState({...baseInput,...overrides});}
test('13-action catalog',()=>{assert(Catalog.ACTION_COUNT===13,'count');assert(new Set(Catalog.ACTION_KEYS).size===13,'unique');});
test('legal open_defensive_channel preserved',()=>{assert(surface.legalMask[Catalog.ACTION_KEYS.indexOf('open_defensive_channel')]===1,'not legal');});
test('targeted legal action requires target',()=>{let ok=false;try{Legality.buildActionSurface(entries,{},{});}catch(e){ok=/repair_known_structure/.test(e.message);}assert(ok,'missing target not rejected');});
test('illegal actions get zero visits',()=>{const visits=surface.legalMask.map(x=>x?1:0);Legality.assertIllegalVisitsZero(visits,surface);visits[1]=1;let ok=false;try{Legality.assertIllegalVisitsZero(visits,surface);}catch(e){ok=true;}assert(ok,'illegal visit accepted');});
test('deterministic source hash',()=>{assert(State.hashState(state())===State.hashState(state()),'nondeterministic');});
test('tick-only metadata excluded',()=>{const a=state();const b=State.buildCanonicalState({...baseInput,captureMetadata:{tick:999}});assert(State.hashState(a)===State.hashState(b),'tick changed hash');});
for(const [name,mutate] of [
 ['faction sensitivity',()=>({identity:{...baseInput.identity,factionId:'faction:B'}})],
 ['biome sensitivity',()=>({identity:{...baseInput.identity,biomeId:'desert'}})],
 ['mission sensitivity',()=>({mission:{...baseInput.mission,missionId:'water'}})],
 ['phase sensitivity',()=>({mission:{...baseInput.mission,missionPhase:'late'}})],
 ['tension sensitivity',()=>({strategicMetrics:{...baseInput.strategicMetrics,tensionBand:'high',tensionValue:.9}})],
 ['infrastructure sensitivity',()=>({strategicMetrics:{...baseInput.strategicMetrics,infrastructureBand:'stable',infrastructureReliability:.9}})],
 ['knowledge sensitivity',()=>({knowledge:{...baseInput.knowledge,knownResources:[{id:'resource:A'}]}})]
]) test(name,()=>assert(State.hashState(state())!==State.hashState(state(mutate())),'hash unchanged'));
test('legal mask sensitivity',()=>{const changed={...surface,legalMask:surface.legalMask.slice()};changed.legalMask[8]=1;assert(State.hashLegalMask(surface)!==State.hashLegalMask(changed),'mask hash unchanged');});
test('target sensitivity',()=>{const changed={...surface,targetSlots:{...surface.targetSlots,repair_known_structure:[{targetId:'structure:B'}]}};assert(State.hashTargetSlots(surface)!==State.hashTargetSlots(changed),'target hash unchanged');});
test('87-feature observation',()=>{assert(State.encodeObservationV2(state()).length===87,'feature count');assert(State.hashObservation(state())!==State.hashObservation(state({mission:{...baseInput.mission,missionPhase:'late'}})),'obs insensitive');});
test('R0 authority',()=>{for(const api of [Catalog,State,Legality]){assert(api.AUTHORITY.tier==='R0','tier');assert(api.AUTHORITY.canDispatch===false,'dispatch');assert(api.AUTHORITY.canMutateLiveWorld===false,'mutate');for(const forbidden of ['dispatch','execute','mutateLiveWorld'])assert(!(forbidden in api),'forbidden '+forbidden);}});
if(sentinel&&zeknova){
 const mirrors=['zeknova-strategic-action-catalog-v2.js','zeknova-strategic-state-contract-v2.js','zeknova-observation-legality-contract-v2.js'];
 test('v2 mirror parity',()=>mirrors.forEach(f=>assert(sha(path.join(sentinel,'public_html/azl',f))===sha(path.join(zeknova,'azl',f)),'mirror mismatch '+f)));
 if(!skipV1){const expected=JSON.parse(fs.readFileSync(path.join(__dirname,'expected-source-hashes.json'),'utf8'));test('v1 source hashes unchanged',()=>expected.files.forEach(r=>{const root=r.repository==='sentinel'?sentinel:zeknova;assert(sha(path.join(root,r.relativePath))===r.sha256,'v1 changed '+r.relativePath);}));}
}
console.log(`STAGE 2F.4C REGRESSION PASS (${passed}/${passed})`);
