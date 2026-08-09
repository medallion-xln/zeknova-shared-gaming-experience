#!/usr/bin/env node
'use strict';
const assert=require('node:assert/strict'),path=require('node:path');const{pathToFileURL}=require('node:url');
function store(){const d=new Map();return{getItem:k=>d.get(k)??null,setItem:(k,v)=>d.set(k,String(v)),removeItem:k=>d.delete(k)}}
function object(x=0,y=0,z=0){return{position:{x,y,z},userData:{}}}
function gameFixture(){const structure={id:'watch-1',type:'zek_watch',x:4,y:0,z:5,statusBand:'damaged',health:40,userData:{}},infra={id:'transit-1',type:'zek_transit',x:2,y:0,z:3,status:'degraded',userData:{}};const resource=object(-4,0,6);resource.userData.resourceId='bio-1';return{user:{id:'user-1',teamCode:'FOREST ALPHA',officerClass:'ensign'},biomeSeed:5207,player:{group:object(0,0,0)},perceptionQuantum:20,diplomacyTension:50,simulation:{resources:{minerals:100,trust:50},indicators:{}},terrain:{localTerritories:[{x:0,y:0,z:0},{x:45,y:0,z:20}],harvestableTrees:[],powerUpNodes:[],mineableRocks:[],resourceNodes:[resource]},buildings:{records:[structure,infra],addRecord(r){this.records.push(r);return r;}},enemies:[],forestPatrols:[],forestRepairCrews:[],multiplayerRoom:{clientId:'local',remotePlayers:new Map()},spawnEnemy(hostile=true,role='stalker',x=6,z=0){const e=object(x,0,z);Object.assign(e.userData,{health:50,hostile,enemyType:role});this.enemies.push(e);return e;},structure,infra,resource};}
(async()=>{const root=path.join(__dirname,'..');const imp=async p=>import(pathToFileURL(path.join(root,p)).href);const{IdentityIntegration}=await imp('src/game/IdentityIntegration.js'),{PerceptionEventIntegration}=await imp('src/game/PerceptionEventIntegration.js'),{FactionKnowledgeIntegration}=await imp('src/game/FactionKnowledgeIntegration.js'),{FactionObservationIntegration}=await imp('src/game/FactionObservationIntegration.js'),{ForestDefensiveActionIntegration}=await imp('src/game/ForestDefensiveActionIntegration.js'),{ForestDefensiveCommandIntegrationV2}=await imp('src/game/ForestDefensiveCommandIntegrationV2.js'),{LiveParityClosureIntegration}=await imp('src/game/LiveParityClosureIntegration.js');
let checks=0;function test(n,fn){fn();checks++;console.log('  PASS '+n)}
function setup(){const game=gameFixture(),storage=store(),identity=new IdentityIntegration({game,storage}).install(),perception=new PerceptionEventIntegration({game,identityIntegration:identity,storage,quantumProvider:()=>game.perceptionQuantum}).install(),knowledge=new FactionKnowledgeIntegration({game,identityIntegration:identity,perceptionIntegration:perception,storage,quantumProvider:()=>game.perceptionQuantum}).install(),observation=new FactionObservationIntegration({game,identityIntegration:identity,knowledgeIntegration:knowledge,quantumProvider:()=>game.perceptionQuantum}).install(),forest=new ForestDefensiveActionIntegration({game,identityIntegration:identity,observationIntegration:observation}).install();const commands=new ForestDefensiveCommandIntegrationV2({game,identityIntegration:identity,forestActionIntegration:forest,perceptionIntegration:perception,knowledgeIntegration:knowledge,quantumProvider:()=>game.perceptionQuantum,initialReadiness:100,initialMaterials:100}).install();commands.registerPatrol({factionId:identity.humanFactionId,object:object(0,0,0)});commands.registerRepairCrew({factionId:identity.humanFactionId,object:object(0,0,0)});const routeId=globalThis.ZekNovaIdentityContract.routeEntityId({worldId:identity.worldId,routeKey:'central-river-crossing'}),structureId=globalThis.ZekNovaIdentityContract.structureEntityId({worldId:identity.worldId,recordId:'watch-1'}),infraId=globalThis.ZekNovaIdentityContract.structureEntityId({worldId:identity.worldId,recordId:'transit-1'}),resourceId=game.resource.userData.entityId;commands.registerRoute({subjectId:routeId,object:object(1,0,1),position:{x:1,y:0,z:1},status:'damaged'});commands.registerStructure({subjectId:structureId,object:game.structure,position:game.structure,status:'damaged'});commands.registerResource({subjectId:resourceId,object:game.resource,position:game.resource.position,status:'available'});commands.registerInfrastructure({subjectId:infraId,object:game.infra,position:game.infra,status:'degraded'});const enemy=game.spawnEnemy(true,'stalker',8,2),source=game.player.group.userData.entityId,f=identity.humanFactionId;perception.observeEnemyByProximity({observer:game.player.group,enemy,radius:20,observedAtQuantum:20,hostility:'hostile',movementBand:'fast'});perception.reportCombatAlert({observer:game.player.group,subject:enemy,observedAtQuantum:20,severity:'high',contactRole:'attacker'});perception.reportStructureObserved({observer:game.player.group,structureEntityId:structureId,position:game.structure,structureKind:'zek_watch',observedOwnerFactionId:f,statusBand:'damaged',observedAtQuantum:20,sourceType:'structure_sensor'});perception.reportResourceDiscovered({observer:game.player.group,resource:game.resource,resourceKind:'biomass',abundanceBand:'high',observedAtQuantum:20});perception.append({eventType:'route_observed',observerFactionId:f,sourceFactionId:f,sourceEntityId:source,subjectId:routeId,observedAtQuantum:20,sourceType:'route_sensor',payload:{observedCell:{x:1,y:0,z:1},status:'damaged'}});perception.append({eventType:'infrastructure_status_observed',observerFactionId:f,sourceFactionId:f,sourceEntityId:source,subjectId:infraId,observedAtQuantum:20,sourceType:'infrastructure_sensor',payload:{infrastructureKind:'transit',positionCell:{x:2,y:0,z:3},status:'degraded'}});const closure=new LiveParityClosureIntegration({game,identityIntegration:identity,forestActionIntegration:forest,commandIntegrationV2:commands}).install();return{game,identity,perception,knowledge,observation,forest,commands,closure,dispose(){closure.dispose();commands.dispose();forest.dispose();observation.dispose();knowledge.dispose();perception.dispose();identity.dispose();}}}
const e=setup();
test('closure integration global',()=>assert.equal(globalThis.ZekNovaLiveParityClosureIntegration,e.closure));
test('closure adapter installed',()=>assert.equal(globalThis.ZEK_LIVE_PARITY_CLOSURE_ADAPTER.id,'zeknova-live-parity-closure-adapter-v1'));
test('closure adapter read only',()=>assert.equal('issue' in globalThis.ZEK_LIVE_PARITY_CLOSURE_ADAPTER,false));
test('adapter exposes no execute',()=>assert.equal('execute' in globalThis.ZEK_LIVE_PARITY_CLOSURE_ADAPTER,false));
test('adapter exposes no dispatch',()=>assert.equal('dispatch' in globalThis.ZEK_LIVE_PARITY_CLOSURE_ADAPTER,false));
test('adapter exposes no apply',()=>assert.equal('apply' in globalThis.ZEK_LIVE_PARITY_CLOSURE_ADAPTER,false));
const surface=e.closure.captureRuntimeSurface();
test('command contract observed',()=>assert.equal(surface.commandContractV2,true));
test('command integration observed',()=>assert.equal(surface.commandIntegrationV2,true));
test('forest action integration observed',()=>assert.equal(surface.forestActionIntegration,true));
test('incumbent controller observed',()=>assert.equal(surface.incumbentControllerV2,true));
test('public adapter observed',()=>assert.equal(surface.publicAdapterV2,true));
test('registry binding count thirteen',()=>assert.equal(surface.registryBindingCount,13));
test('supported action count thirteen',()=>assert.equal(surface.supportedActionCount,13));
const runtimeBefore=e.commands.captureRuntimeSnapshot(),bundle=e.closure.captureLocalClosure(),runtimeAfter=e.commands.captureRuntimeSnapshot();
test('capture returns closure report',()=>assert.equal(bundle.closureReport.contractId,'zeknova-live-parity-closure-contract-v1'));
test('closure exact count thirteen',()=>assert.equal(bundle.closureReport.exactObservedCount,13));
test('closure missing count zero',()=>assert.equal(bundle.closureReport.missingCount,0));
test('command parity complete',()=>assert.equal(bundle.closureReport.commandParityComplete,true));
test('production ready false',()=>assert.equal(bundle.closureReport.productionReady,false));
test('Sentinel authority false',()=>assert.equal(bundle.closureReport.sentinelAuthority,false));
test('strategic competence false',()=>assert.equal(bundle.closureReport.strategicCompetenceClaim,false));
test('capture does not mutate command runtime',()=>assert.deepEqual(runtimeAfter,runtimeBefore));
test('capture issues no command',()=>assert.equal(runtimeAfter.commandSequence,0));
test('capture appends no ledger event',()=>assert.equal(runtimeAfter.ledger.lastEventSequence,0));
test('all entries exact observed',()=>assert.equal(bundle.closureReport.entries.every(x=>x.effectiveStatus==='exact-observed'),true));
test('report binds local faction',()=>assert.equal(bundle.closureReport.factionId,e.identity.humanFactionId));
test('report binds observation',()=>assert.equal(bundle.closureReport.observationId,bundle.observation.observationId));
test('report binds planning state',()=>assert.equal(bundle.closureReport.planningStateId,bundle.planningState.stateId));
test('report binds candidate set',()=>assert.equal(bundle.closureReport.candidateSetId,bundle.candidateSet.candidateSetId));
test('adapter equals integration',()=>assert.deepEqual(globalThis.ZEK_LIVE_PARITY_CLOSURE_ADAPTER.captureLocalClosure(),e.closure.captureLocalClosure()));
const repeat=e.closure.captureLocalClosure();
test('repeated report deterministic',()=>assert.deepEqual(repeat.closureReport,bundle.closureReport));
const hidden=e.game.spawnEnemy(true,'stalker',500,500);e.perception.observeEnemyByProximity({observer:e.game.player.group,enemy:hidden,radius:20,observedAtQuantum:20,hostility:'hostile',movementBand:'fast'});const afterHidden=e.closure.captureLocalClosure();
test('hidden enemy leaves observation unchanged',()=>assert.equal(afterHidden.observation.observationId,bundle.observation.observationId));
test('hidden enemy leaves closure report unchanged',()=>assert.equal(afterHidden.closureReport.reportId,bundle.closureReport.reportId));
const missing=e.closure.captureLocalClosure({runtimeSurface:{...surface,publicAdapterV2:false}});
test('missing adapter closes parity',()=>assert.equal(missing.closureReport.commandParityComplete,false));
test('missing adapter exact count zero',()=>assert.equal(missing.closureReport.exactObservedCount,0));
test('missing adapter missing count thirteen',()=>assert.equal(missing.closureReport.missingCount,13));
const prior=structuredClone(bundle);e.dispose();
test('dispose clears closure global',()=>assert.equal(globalThis.ZekNovaLiveParityClosureIntegration,null));
test('prior bundle remains detached',()=>assert.deepEqual(prior,bundle));
console.log(`W0-P.3 LIVE PARITY CLOSURE INTEGRATION TESTS PASS (${checks}/${checks})`);
})().catch(e=>{console.error(e.stack||e);process.exit(1)});
