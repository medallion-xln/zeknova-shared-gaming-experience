import test from 'node:test';
import assert from 'node:assert/strict';
import { createEngine } from '../../core/src/index.js';
import { EditorSession, validateProjectManifest } from '../src/index.js';
const project = () => ({ schema:'zge.project.v1', id:'valley', entryScene:'main', plugins:['tools'], assets:[{id:'main',kind:'scene',path:'scenes/main.json',sha256:'0'.repeat(64)}] });
const session = (engine, options = {}) => new EditorSession({engine,enabled:true,principal:{id:'local-developer'},authority:'sandbox',authorize:()=>true,...options});
const setup = async () => { const engine=createEngine({scheduler:'manual'}); engine.world.registerComponent('transform',v=>typeof v.x==='number'&&Number.isFinite(v.x)); const id=engine.world.createEntity('avatar');engine.world.addComponent(id,'transform',{x:1}); await engine.initialize();await engine.start();return {engine,id}; };

test('tool sessions are explicitly enabled, default-deny every read, and forbid live-authority debug writes',async()=>{
 const {engine,id}=await setup();try{
  assert.throws(()=>new EditorSession({engine}),/disabled/);
  const denied=session(engine,{authorize:()=>false});for(const read of[()=>denied.saveScene(),()=>denied.inspectEntity(id),()=>denied.inspectComponent(id,'transform'),()=>denied.snapshot(),()=>denied.metrics(),()=>denied.project()])assert.throws(read,/permission/);
  const live=session(engine,{authority:'inspect'});assert.equal(live.inspectComponent(id,'transform').x,1);assert.throws(()=>live.pause(),/inspection-only/);assert.throws(()=>live.setComponent(id,'transform',{x:2}),/inspection-only/);
  const delegated=createEngine({clock:{mode:'delegated'},scheduler:'manual'});assert.throws(()=>session(delegated),/owned-clock/);
  engine.world.setResource('nonserializable',()=>{});assert.throws(()=>live.snapshot(),/plain JSON/);assert.throws(()=>live.saveScene(),/plain JSON/);engine.world.deleteResource('nonserializable');
 }finally{await engine.dispose();}
});
test('scene load is validated atomically and inspection snapshots cannot mutate the engine',async()=>{
 const {engine,id}=await setup();try{const tools=session(engine),scene=tools.saveScene();assert.throws(()=>tools.loadScene(scene),/pause/);tools.pause();tools.setComponent(id,'transform',{x:7});assert.equal(tools.inspectComponent(id,'transform').x,7);tools.loadScene(scene);assert.equal(tools.inspectEntity(id).components.transform.x,1);assert.ok(Object.isFrozen(tools.snapshot().entities[0].components.transform));const before=tools.snapshot();for(const mutate of[s=>s.world.entities.push(s.world.entities[0]),s=>s.world.entities[0].components.transform.x='bad',s=>s.world.entities[0].components.unknown={},s=>s.world.nextEntityId=1]){const bad=structuredClone(scene);mutate(bad);assert.throws(()=>tools.loadScene(bad));assert.deepEqual(tools.snapshot(),before);}assert.throws(()=>tools.setComponent(id,'transform',{x:NaN}),/finite/);
 }finally{await engine.dispose();}
});
test('project assets, prefab roundtrip, bounded paused stepping, and plugin ownership use existing engine registries',async()=>{
 const engine=createEngine({scheduler:'manual'}),tools=session(engine);let installed=0,disposed=0;tools.registerPlugin({id:'tools',install(){installed++;},dispose(){disposed++;}});engine.world.registerComponent('transform',v=>Number.isFinite(v.x));const id=engine.world.createEntity('one');engine.world.addComponent(id,'transform',{x:3});tools.setProject(project());assert.equal(tools.project().entryScene,'main');const prefab=tools.serializePrefab(id,['main']);await engine.initialize();await engine.start();assert.equal(installed,1);assert.throws(()=>tools.registerPlugin({id:'late',install(){}}),/before-initialize/);assert.throws(()=>tools.step(),/pause/);tools.pause();const copy=tools.instantiatePrefab(prefab);assert.deepEqual(tools.inspectComponent(copy,'transform'),{x:3});const initial=engine.clock.stepNumber;assert.equal(tools.step(3),initial+3);assert.equal(engine.clock.paused,true);assert.throws(()=>tools.step(121),/step-count/);assert.throws(()=>tools.serializePrefab(id,['missing']),/unknown-asset/);tools.resume();await engine.dispose();assert.equal(disposed,1);
});
test('project and prefab interfaces reject traversal, unknown asset references and non-JSON data',async()=>{
 for(const path of['../outside','https://example.test/file','/absolute','a/./b','a\\b','a//b']){const bad=project();bad.assets[0].path=path;assert.throws(()=>validateProjectManifest(bad),/asset/);}const missing=project();missing.entryScene='missing';assert.throws(()=>validateProjectManifest(missing),/entry/);const {engine}=await setup();try{const tools=session(engine);tools.pause();const before=engine.world.snapshot();assert.throws(()=>tools.instantiatePrefab({schema:'zge.prefab.v1',label:'bad',components:{unknown:{}},assetIds:[]}),/component/);assert.deepEqual(engine.world.snapshot(),before);assert.throws(()=>tools.loadScene({self(){}}),/plain JSON/);}finally{await engine.dispose();}
});
