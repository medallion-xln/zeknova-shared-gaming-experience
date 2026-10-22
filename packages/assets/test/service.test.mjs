import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AssetService, BoundedWorkerPool } from '../src/index.js';
import { cloneParsedGLTF } from '../src/threeAssetService.js';
import { Group, Bone, SkinnedMesh, BoxGeometry, MeshStandardMaterial, Skeleton, Float32BufferAttribute, Uint16BufferAttribute, AnimationClip, Texture } from '../../../assets/vendor/three.module.min.js';
const tick = ms => new Promise(r=>setTimeout(r,ms));
test('canonical parsed cache coalesces, leases pin resources, clones isolate and budget evicts',async()=>{
 let loads=0,disposed=0;const service=new AssetService({budgetBytes:10});
 service.register('fixture',{load:async()=>{loads++;await tick(2);return {x:1};},clone:structuredClone,size:()=>8,dispose:()=>disposed++});
 const [a,b]=await Promise.all([service.acquire('/a/../x',{type:'fixture',owner:'a'}),service.acquire('/x',{type:'fixture',owner:'b'})]);
 assert.equal(loads,1);const clone=a.instantiate();clone.x=9;assert.equal(b.value.x,1);
 const c=await service.acquire('/y',{type:'fixture'});assert.equal(service.status().bytes,16,'budget cannot evict pinned leases');
 a.release();b.release();assert.equal(disposed,1);assert.equal(service.status().bytes,8);c.release();service.dispose();assert.equal(disposed,2);
});
test('failed loads invalidate and retry; cancellation is per consumer; late success is disposed',async()=>{
 const service=new AssetService({timeoutMs:10});let calls=0,disposed=0;
 service.register('fixture',{load:async()=>{if(++calls===1)throw Error('transcoder init');return {ok:true};},clone:structuredClone,dispose:()=>disposed++});
 const a=await service.acquire('/retry',{type:'fixture',retries:1});assert.equal(calls,2);a.release();
 const controller=new AbortController();const p=service.acquire('/cancel',{type:'fixture',signal:controller.signal});controller.abort();await assert.rejects(p,/cancel/);
 const joined=await service.acquire('/cancel',{type:'fixture'});joined.release();
 service.register('slow',{load:async()=>{await tick(25);return {};},clone:structuredClone,dispose:()=>disposed++});
 await assert.rejects(service.acquire('/slow',{type:'slow'}),/timeout/);await tick(30);assert.ok(disposed>=1);assert.equal(service.status().pending,0);service.dispose();
});
test('dependencies pin parsed resources until dependents are invalidated',async()=>{
 const s=new AssetService();s.register('x',{load:async()=>({}),clone:structuredClone});
 const a=await s.acquire('/a',{type:'x'});a.release();const b=await s.acquire('/b',{type:'x',dependencies:['/a']});b.release();
 assert.equal(s.invalidate('/a'),false);assert.equal(s.invalidate('/b'),true);assert.equal(s.invalidate('/a'),true);s.dispose();
});
test('real Three skinned clones have independent bones, materials, geometry, clips and transforms',()=>{
 const geometry=new BoxGeometry();const count=geometry.attributes.position.count;
 geometry.setAttribute('skinIndex',new Uint16BufferAttribute(new Uint16Array(count*4),4));geometry.setAttribute('skinWeight',new Float32BufferAttribute(Array.from({length:count*4},(_,i)=>i%4===0?1:0),4));
 const material=new MeshStandardMaterial({map:new Texture()}), mesh=new SkinnedMesh(geometry,material),bone=new Bone();mesh.add(bone);mesh.bind(new Skeleton([bone]));const scene=new Group();scene.add(mesh);
 const parsed={scene,scenes:[scene],animations:[new AnimationClip('idle',1,[])]};const a=cloneParsedGLTF(parsed),b=cloneParsedGLTF(parsed);
 const am=a.scene.children[0],bm=b.scene.children[0];am.skeleton.bones[0].position.x=9;am.material.color.set(0xff0000);am.position.x=7;a.animations[0].name='mutated';
 assert.equal(bm.skeleton.bones[0].position.x,0);assert.notEqual(am.skeleton.bones[0],bm.skeleton.bones[0]);assert.notEqual(am.geometry,bm.geometry);assert.notEqual(am.material,bm.material);assert.notEqual(am.material.map,bm.material.map);assert.equal(b.animations[0].name,'idle');assert.equal(bm.position.x,0);
});
class FakeWorker extends EventTarget {
 postMessage(msg){if(msg.fail==='throw')throw Error('post failure');if(msg.fail==='error')queueMicrotask(()=>this.dispatchEvent(new Event('error')));else if(!msg.fail)setTimeout(()=>this.dispatchEvent(new MessageEvent('message',{data:{ok:true}})),1);}
 terminate(){this.terminated=true;}
}
test('worker limits 1/2/4/8 settle concurrent work, reset on death, restart and release timers',async()=>{
 for(const limit of [1,2,4,8]){
  const p=new BoundedWorkerPool({limit,timeoutMs:1000});p.setWorkerCreator(()=>new FakeWorker());await Promise.all(Array.from({length:16},()=>p.postMessage({})));
  assert.ok(p.status().live<=limit);const dead=p.postMessage({fail:'hang'}),queued=p.postMessage({fail:'hang'});p.workers[0].worker.terminate();
  const result=await Promise.allSettled([dead,queued]);assert.ok(result.every(r=>r.status==='rejected'));assert.equal(p.status().pending,0);
  assert.equal((await p.postMessage({})).data.ok,true);p.dispose();assert.equal(p.status().live,0);await assert.rejects(p.postMessage({}),/disposed/);
 }
});
test('timeouts, worker errors, unsupported payload and initialization exceptions are bounded',async()=>{
 for(const fault of ['hang','error','throw']){
  const p=new BoundedWorkerPool({timeoutMs:5});p.setWorkerCreator(()=>new FakeWorker());await assert.rejects(p.postMessage({fail:fault}));assert.equal(p.status().pending,0);p.dispose();
 }
 const p=new BoundedWorkerPool({timeoutMs:5});p.setWorkerCreator(()=>{throw Error('initialization failed');});await assert.rejects(p.postMessage({}),/initialization/);p.dispose();
});
test('loader types cannot collide; aborting a joined consumer preserves other leases',async()=>{
 const s=new AssetService();let calls=0;
 s.register('a',{load:async()=>{calls++;await tick(5);return {kind:'a'};},clone:structuredClone});s.register('b',{load:async()=>({kind:'b'}),clone:structuredClone});
 const controller=new AbortController(),first=s.acquire('/shared',{type:'a',signal:controller.signal}),second=s.acquire('/shared',{type:'a'});controller.abort();await assert.rejects(first,/cancel/);const a=await second,b=await s.acquire('/shared',{type:'b'});assert.equal(a.value.kind,'a');assert.equal(b.value.kind,'b');assert.equal(calls,1);a.release();b.release();s.dispose();
});
test('disposing pending assets promptly rejects even when the loader ignores cancellation',async()=>{
 const s=new AssetService({timeoutMs:1000});s.register('hang',{load:()=>new Promise(()=>{}),clone:structuredClone});const pending=s.acquire('/hang',{type:'hang'});s.dispose();await assert.rejects(pending,/cancel/);assert.equal(s.status().pending,0);
});
test('new engine rendering dependencies use only the canonical vendored Three instance',async()=>{
 const { readdir, readFile }=await import('node:fs/promises');
 const root=new URL('../../',import.meta.url);let files=[];
 async function scan(dir){for(const d of await readdir(dir,{withFileTypes:true})){const url=new URL(d.name+(d.isDirectory()?'/':''),dir);if(d.isDirectory())await scan(url);else if(d.name.endsWith('.js')&&url.pathname.includes('/src/'))files.push(url);}}
 await scan(root);
 for(const file of files){const source=await readFile(file,'utf8');for(const match of source.matchAll(/(?:from\s*|import\s*)['"]([^'"]*three[^'"]*)['"]/g)){assert.ok(match[1].includes('assets/vendor/three.module.min.js')||match[1].endsWith('./threeAssetService.js'),`${file}: unapproved Three dependency ${match[1]}`);}}
});
