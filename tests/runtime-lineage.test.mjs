import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdtemp,mkdir,rm} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {verifyRuntimeLineage} from '../scripts/runtime-lineage.mjs';

test('reviewed shipping references, reconstructed source and candidate artifacts verify', async () => {
  await verifyRuntimeLineage();
  const root=new URL('../',import.meta.url),provenance=JSON.parse(await readFile(new URL('src/runtime-reconstructed/provenance.json',root)));
  for(const key of ['compatibility','model']) {
    const entry=provenance[key],source=await readFile(new URL(entry.candidate,root),'utf8');
    for(const match of source.matchAll(/(?:from\s*|import\(\s*)["'](\.[^"']+)["']/g)) {
      const target=new URL(match[1],new URL(entry.deploymentPath,root));target.search='';
      const relative=path.relative(new URL(root).pathname,target.pathname);
      if(provenance.optionalDeploymentImports?.[relative]) {
        // Optional WASM is gated off by default in the actual runtime. Do not
        // invent generated binaries or depend on an ignored local build in CI.
        assert.match(source,/zkDisableWasm=zkStartupSafeMode\|\|!zkStartupParams\.has\("wasm"\)/);
      } else await readFile(target); // Deployment path, not artifact storage path.
    }
  }
});
test('integrity gate rejects shipping tampering, candidate tampering, and source drift in both runtimes', async () => {
  const root = new URL('../', import.meta.url), dir = await mkdtemp(path.join(os.tmpdir(), 'zge18a-tamper-'));
  try {
    const config = JSON.parse(await readFile(new URL('src/runtime-reconstructed/runtime-build.json', root)));
    const files = ['src/runtime-reconstructed/runtime-build.json','src/runtime-reconstructed/provenance.json', ...config.compatibility.segments, config.model.entrypoint, config.compatibility.output,config.model.output,'assets/index-02987539.js','assets/model-runtime-c96327ba.js'];
    for (const file of files) { await mkdir(path.dirname(path.join(dir,file)),{recursive:true}); await writeFile(path.join(dir,file),await readFile(new URL(file,root))); }
    await verifyRuntimeLineage(dir);
    for (const file of [config.compatibility.segments[3],config.model.entrypoint,config.compatibility.output,config.model.output,'assets/index-02987539.js','assets/model-runtime-c96327ba.js']) {
      const filename=path.join(dir,file),original=await readFile(filename),tampered=Buffer.from(original);tampered[0]^=1;
      await writeFile(filename,tampered);
      await assert.rejects(verifyRuntimeLineage(dir),undefined,`must reject ${file}`);
      await writeFile(filename,original);
    }
    await verifyRuntimeLineage(dir);
  } finally { await rm(dir,{recursive:true,force:true}); }
});
