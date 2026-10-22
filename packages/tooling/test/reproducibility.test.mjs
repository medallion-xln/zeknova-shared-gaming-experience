import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, existsSync } from 'node:fs';
import { captureSourceSnapshot } from '../../../scripts/zge09-source-snapshot.mjs';
test('independent source snapshot excludes legacy artifacts and produces a standalone deterministic engine build',async()=>{
 const parent=mkdtempSync('/tmp/zge09-source-test-');const manifest=await captureSourceSnapshot(parent+'/captured',{runTests:false});assert.equal(manifest.build.repeatBuildIdentical,true);assert.equal(manifest.build.standaloneSmoke,true);assert.ok(manifest.build.bytes>10000);assert.ok(manifest.phpSyntaxFiles>10);assert.equal(manifest.legacyAssetsIncluded,false);assert.equal(manifest.thirdPartyModulesIncluded,false);assert.equal(existsSync(parent+'/captured/assets'),false);assert.equal(existsSync(parent+'/captured/node_modules'),false);assert.ok(Object.keys(manifest.files).includes('packages/server-php/runtime/supervisor.mjs'));assert.ok(Object.keys(manifest.files).includes('src/game/OfficerRank.js'));await assert.rejects(()=>captureSourceSnapshot(parent+'/captured'),/new-private/);
});
