import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {verifyRuntimeLineage} from '../scripts/runtime-lineage.mjs';

const root=new URL('../',import.meta.url),read=path=>readFile(new URL(path,root),'utf8');
const [compat,model,modelSource,environment,threeModule,threeCore]=await Promise.all([
  read('assets/index-02987539.js'),read('assets/model-runtime-c96327ba.js'),read('src/runtime-reconstructed/model/model-runtime.js'),read('assets/environment-runtime.js'),read('assets/vendor/three.module.min.js'),read('assets/vendor/three.core.min.js')
]);

await verifyRuntimeLineage();
assert.equal(model,modelSource,'model source reproduces shipping model runtime');
assert.match(compat,/Multiple instances of Three\.js being imported/,'compatibility bundle embeds a Three.js owner');
assert.match(threeModule,/from "\.\.\/\.\.\/node_modules\/three\/build\/three\.module\.min\.js"/,'vendored module re-exports canonical installed module');
assert.match(threeCore,/from "\.\.\/\.\.\/node_modules\/three\/build\/three\.core\.min\.js"/,'vendored core re-exports canonical installed core');
assert.match(modelSource,/from '\.\/vendor\/three\.module\.min\.js'/);
assert.match(environment,/from '\.\/vendor\/three\.module\.min\.js'/);
assert.equal((modelSource.match(/new KTX2Loader/g)||[]).length,0);
assert.equal((environment.match(/new KTX2Loader/g)||[]).length,0);
const service=await read('packages/assets/src/threeAssetService.js');assert.equal((service.match(/new KTX2Loader/g)||[]).length,1,'one shared decoder construction site');
const vendor=await import('../assets/vendor/three.module.min.js'),gpu=await import('../node_modules/three/build/three.webgpu.min.js');assert.equal(vendor.Object3D,gpu.Object3D);
assert.match(compat,/Clock: This module has been deprecated/,'Clock warning remains owned by protected compatibility runtime');
assert.doesNotMatch(modelSource,/InstancedSkinnedMesh|BatchedMesh/,'skinned model runtime has no safe instanced-rig implementation');
console.log('Renderer ownership certification: PASS (2 Three owners including frozen inline runtime, 1 shared KTX2 creation site, reviewed lineage intact)');
