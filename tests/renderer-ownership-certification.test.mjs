import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';

const root=new URL('../',import.meta.url),read=path=>readFile(new URL(path,root),'utf8'),hash=value=>createHash('sha256').update(value).digest('hex');
const [compat,model,modelSource,environment,threeModule,threeCore]=await Promise.all([
  read('assets/index-02987539.js'),read('assets/model-runtime-c96327ba.js'),read('src/runtime-reconstructed/model/model-runtime.js'),read('assets/environment-runtime.js'),read('assets/vendor/three.module.min.js'),read('assets/vendor/three.core.min.js')
]);

assert.equal(hash(compat),'7a9cdfeec0c7b2ffe6e3f0f250fafb0e0d41ef0bd66d823240086985f36f5dab');
assert.equal(hash(model),'e6af33cdf1f56c098d16156ce34ff435c7fa7a5490ed640a63c6e5e43ca726d0');
assert.match(compat,/Multiple instances of Three\.js being imported/,'compatibility bundle embeds a Three.js owner');
assert.match(threeModule,/from"\.\/three\.core\.min\.js"/,'vendored module loads its separate core owner');
assert.match(threeCore,/Multiple instances of Three\.js being imported/,'vendored core registers the second Three.js owner');
assert.match(modelSource,/from '\.\/vendor\/three\.module\.min\.js'/);
assert.match(environment,/from '\.\/vendor\/three\.module\.min\.js'/);
assert.equal((modelSource.match(/new KTX2Loader/g)||[]).length,1);
assert.equal((environment.match(/new KTX2Loader/g)||[]).length,1);
assert.match(compat,/Clock: This module has been deprecated/,'Clock warning remains owned by protected compatibility runtime');
assert.doesNotMatch(modelSource,/InstancedSkinnedMesh|BatchedMesh/,'skinned model runtime has no safe instanced-rig implementation');
console.log('ZEK-17 renderer ownership certification: PASS (2 Three owners, 2 KTX2 creation sites, protected hashes intact, generated boundary explicit)');
