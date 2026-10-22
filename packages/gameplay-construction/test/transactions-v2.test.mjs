import {test} from 'node:test';import assert from 'node:assert/strict';
import {Construction,compareConstruction,ConstructionParityReport,utilityStatus} from '../src/index.js';
import {AuthorityDomain,createWorldState,restoreWorldState,serializeWorldState} from '../../core/src/index.js';
const options=()=>({definitions:[{type:'hut',radius:1,cost:{stone:4}}],inventory:{stone:10},terrain:{isValid:(_d,x,z)=>Math.abs(x)<=10&&Math.abs(z)<=10,heightAt:()=>0}});
const command=(id='a',x=1)=>({action:'place',commandId:id,id,type:'hut',x,z:1});
test('world and inventory revisions reject concurrent stale balances; duplicate commands charge once',()=>{
 const c=new Construction(options());const a={...command(),expectedRevision:0,expectedInventoryRevision:0};assert.equal(c.execute(a).ok,true);assert.deepEqual(c.execute(a),c.execute(a));
 assert.equal(c.execute({...command('b',5),expectedRevision:0}).reason,'stale-world-revision');assert.equal(c.execute({...command('c',5),expectedInventoryRevision:0}).reason,'stale-inventory-revision');
 assert.equal(c.execute({...a,x:3}).reason,'idempotency-conflict');assert.equal(c.snapshot().inventory.stone,6);assert.equal(c.snapshot().revision,1);assert.equal(c.snapshot().inventoryRevision,1);assert.equal(c.snapshot().buildings.length,1);
});
test('prepare/commit failure and reentrant writes cannot partially publish state',()=>{
 let c; c=new Construction({...options(),beforeCommit:()=>{assert.throws(()=>c.execute(command('reentrant',5)),/in progress/);throw Error('projection validation failed');}});const before=c.snapshot();assert.throws(()=>c.execute(command()),/projection validation/);assert.deepEqual(c.snapshot(),before);
});
test('pending operation survives reload, aborts safely by default and opt-in recovery is idempotent',()=>{
 const c=new Construction(options());c.stage(command());const other=new Construction({...options(),snapshot:JSON.parse(JSON.stringify(c.snapshot()))});assert.equal(other.snapshot().inventory.stone,10);assert.equal(other.recoverPending()[0].reason,'interrupted-operation-aborted');assert.equal(other.snapshot().buildings.length,0);
 other.stage(command());other.recoverPending({commit:true});other.stage(command());other.recoverPending({commit:true});assert.equal(other.snapshot().inventory.stone,6);assert.equal(other.snapshot().buildings.length,1);
});
test('transaction failure classifications are deterministic and rejections cannot create occupancy',()=>{
 const c=new Construction(options());for(const req of [{...command('bad'),type:'unknown'},command('outside',100),{...command('invalid'),x:NaN}]){const result=c.execute(req);assert.equal(result.ok,false);assert.equal(c.snapshot().inventory.stone,10);assert.equal(c.snapshot().buildings.length,0);}
 c.execute(command());assert.equal(c.execute(command('overlap')).reason,'occupied');c.execute(command('second',5));assert.equal(c.execute(command('expensive',9)).reason,'resources');
});
test('version-1 snapshots migrate, rollback/replay roundtrip and world schema remain independent',()=>{
 const c=new Construction(options());const legacy={version:1,inventory:{stone:10},buildings:[],events:[],ledger:[]};c.restore(legacy);const initial=c.snapshot();const commands=[command(),command('b',5)];c.replay(commands);const expected=c.snapshot();c.rollback('b');c.rollback('a');assert.deepEqual(c.snapshot(),initial);c.replay(commands);assert.deepEqual(c.snapshot(),expected);
 const world=c.worldState({domain:'construction',owner:'engine-local',epoch:2});assert.deepEqual(restoreWorldState(serializeWorldState(world)),world);assert.throws(()=>world.inventory.stone=999,TypeError);assert.equal(world.occupancy.length,2);
 assert.throws(()=>createWorldState({inventory:{stone:Infinity}}),/finite/);assert.throws(()=>restoreWorldState(JSON.stringify({...world,schema:'wrong'})),/schema/);assert.throws(()=>restoreWorldState(JSON.stringify({...world,occupancy:[]})),/occupancy/);
});
test('single writer registration, activation, migration, stale epochs, conflict and rollback',()=>{
 const domain=new AuthorityDomain({domain:'construction',localFixture:true});let legacy=0,engine=0;
 domain.register('LEGACY','bundle',()=>{legacy++;return {ok:true};});domain.register('ENGINE','engine',()=>{engine++;assert.throws(()=>domain.transition('LEGACY'),/unavailable/);return {ok:true};});assert.throws(()=>domain.register('ENGINE','second',()=>{}),/conflict/);
 domain.execute(command());assert.equal(legacy,1);assert.throws(()=>domain.transition('ENGINE',{certified:true}),/not certified/);
 domain.transition('SHADOW');assert.throws(()=>domain.transition('ENGINE',{certified:true,validateMigration:()=>false}),/migration/);const oldEpoch=domain.epoch;domain.transition('ENGINE',{certified:true});assert.throws(()=>domain.execute(command(),{epoch:oldEpoch}),/stale/);assert.throws(()=>domain.writers.get('LEGACY').run(command()),/inactive/);domain.execute(command('engine'));assert.equal(engine,1);assert.equal(legacy,1);domain.transition('LEGACY');domain.execute(command('rollback'));assert.equal(legacy,2);assert.equal(engine,1);domain.dispose();
 const live=new AuthorityDomain({domain:'construction'});live.register('ENGINE','x',()=>{});live.transition('SHADOW');assert.throws(()=>live.transition('ENGINE',{certified:true}),/not certified/);
});
test('pure utility graph requires operational chained sources and rejects broken/cyclic supply',()=>{
 const rules={source:{power:'power',water:'water'},range:{power:30,water:36},requirements:{water:['power'],hut:['power','water']}};
 const records=[{id:'p',type:'power',x:0,z:0},{id:'w',type:'water',x:10,z:0}];assert.equal(utilityStatus(records,'hut',15,0,rules).ok,true);assert.equal(utilityStatus(records,'hut',70,0,rules).ok,false);records[0].health=0;assert.equal(utilityStatus(records,'hut',15,0,rules).ok,false);
});
test('parity classes expose mismatches and unobservable fields without erasing semantics',()=>{
 const c=new Construction(options()),before={inventory:{stone:10},records:[]},predicted=c.evaluate(command());const actual=c.execute(command()).building,after={inventory:{stone:6},records:[actual]};const observation={fixtureId:'same',request:command(),before,after,predicted,actual,identityControlled:true,rotationControlled:true,serializedRecords:JSON.stringify(after.records),events:['record-added','progression','save-requested'],collisionActual:true,collisionExpected:true};
 assert.equal(compareConstruction(observation).matched,true);const report=new ConstructionParityReport();report.record(observation);const row=report.record({...observation,after:{...after,inventory:{stone:5}},actual:{...actual,x:2},events:['save-requested','record-added'],collisionActual:false,serializedRecords:'[]'});
 for(const cls of ['RESOURCE_COST_MISMATCH','POSITION_MISMATCH','EVENT_ORDER_MISMATCH','COLLISION_MISMATCH','SERIALIZATION_MISMATCH'])assert.ok(row.differences.some(d=>d.classification===cls));assert.equal(report.snapshot().mismatched,1);
});
test('canonical command key order deduplicates; recovery retains intent when commit fails',()=>{
 const c=new Construction(options());const cmd=command();c.execute(cmd);assert.equal(c.execute(Object.fromEntries(Object.entries(cmd).reverse())).ok,true);assert.equal(c.snapshot().inventory.stone,6);
 const pending=new Construction({...options(),beforeCommit:()=>{throw Error('interrupted');}});pending.stage(command());assert.throws(()=>pending.stage({...command(),x:5}),/conflict/);assert.throws(()=>pending.recoverPending({commit:true}),/interrupted/);assert.equal(pending.snapshot().pending.length,1);assert.equal(pending.snapshot().inventory.stone,10);
});
test('authority constructor and public diagnostics cannot bypass the activation gate',()=>{
 assert.throws(()=>new AuthorityDomain({domain:'construction',mode:'ENGINE'}),/must start/);const a=new AuthorityDomain({domain:'construction'});assert.throws(()=>a.mode='ENGINE',TypeError);assert.throws(()=>a.epoch=0,TypeError);a.writers.set('ENGINE',{owner:'intruder',run(){}});a.transition('SHADOW');assert.throws(()=>a.transition('ENGINE',{certified:true}),/not certified/);
});
test('different transport command IDs cannot republish one construction placement event',async()=>{
 const {createEngine}=await import('../../core/src/index.js');const {installConstruction}=await import('../src/index.js');const e=createEngine({scheduler:'manual',config:{features:{construction:'ENGINE'}}});const h=installConstruction(e,options());let events=0;e.events.on('construction:changed',()=>events++);await e.start();e.commands.enqueue({id:'transport-a',type:'construction',payload:command()});e.commands.enqueue({id:'transport-b',type:'construction',payload:command()});e.step();assert.equal(events,1);assert.equal(h.construction.snapshot().inventory.stone,6);assert.equal(h.construction.snapshot().buildings.length,1);await e.dispose();
});
test('world state rejects entity/occupancy disagreement and malformed events',()=>{
 const c=new Construction(options());c.execute(command());const state=JSON.parse(JSON.stringify(c.worldState()));state.entities[0].components.transform.x=99;assert.throws(()=>restoreWorldState(JSON.stringify(state)),/entity transform/);assert.throws(()=>createWorldState({events:[{type:4}]}),/gameplay event/);
});
test('parity never normalizes acceptance, missing records or duplicate world identities',()=>{
 const c=new Construction(options()),predicted=c.evaluate(command()),actual=c.execute(command()).building;
 const base={fixtureId:'faults',request:command(),before:{inventory:{stone:10},records:[]},after:{inventory:{stone:6},records:[actual]},predicted,actual};
 const normalized=compareConstruction(base);assert.ok(normalized.differences.some(d=>d.classification==='EXPECTED_NORMALIZATION'));assert.ok(normalized.unobservable.includes('random-rotation-draw'));
 const denied=compareConstruction({...base,actual:null});assert.ok(denied.differences.some(d=>d.classification==='ACCEPTANCE_MISMATCH'));
 const missing=compareConstruction({...base,after:{inventory:{stone:6},records:[]}});assert.ok(missing.differences.some(d=>d.classification==='WORLD_STATE_MISMATCH'));
});
