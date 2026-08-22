import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder } from 'meshoptimizer';
import { PerformanceFixtureMaterializer } from '../src/game/PerformanceFixtureMaterializer.js';

let releaseEnvironment;
let releaseResidency;
const game={environmentReady:new Promise(resolve=>releaseEnvironment=resolve)};
const materializer=new PerformanceFixtureMaterializer({game});
const waiting=materializer.waitForEnvironmentResidency();
game.aoEnvironment={group:{},ready:Promise.resolve(),residencyReady:new Promise(resolve=>releaseResidency=resolve)};
releaseEnvironment();
let completed=false;
waiting.then(()=>completed=true);
await Promise.resolve();
assert.equal(completed,false,'base environment completion cannot bypass the resource residency promise');
releaseResidency();
assert.equal(await waiting,game.aoEnvironment,'environment service is read only after environmentReady creates it');

await MeshoptDecoder.ready;
const io=new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({'meshopt.decoder':MeshoptDecoder});
const document=await io.read('assets/models/environment/red-trumpet-flower.glb');
const root=document.getRoot();
let triangles=0,primitives=0;
for(const mesh of root.listMeshes())for(const primitive of mesh.listPrimitives()){
  primitives++;
  triangles+=Math.floor((primitive.getIndices()?.getCount()||primitive.getAttribute('POSITION')?.getCount()||0)/3);
}
assert.equal(primitives,1);
assert.equal(triangles,8732);
assert.equal(root.listTextures().length,4);
const runtime=await readFile('assets/environment-runtime.js','utf8');
assert.match(runtime,/await loadAsset\('redTrumpetFlower'\)/,'environment closure awaits the exact late asset family');
assert.match(runtime,/const residencyReady = eagerVillageKit\s*\? ready\.then/,'residency promise is chained after base render children');

console.log('ZEK-18D resource residency closure: PASS (environment ordering, red-trumpet manifest, texture/triangle attribution)');
