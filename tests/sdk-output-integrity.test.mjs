import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {readFile,writeFile,mkdir,mkdtemp,readdir,rm} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {verifySDKOutputs} from '../scripts/sdk-output-integrity.mjs';

test('SDK gate accepts source-derived outputs and rejects source, JS, declaration and manifest drift',async()=>{
 await verifySDKOutputs();
 const dir=await mkdtemp(path.join(os.tmpdir(),'zge18a-sdk-tamper-'));
 try {
  const closure=await build({entryPoints:['packages/sdk/src/index.js','packages/sdk/src/three.js'],outdir:'unused',bundle:true,format:'esm',platform:'browser',write:false,metafile:true});
  const files=[...Object.keys(closure.metafile.inputs),...(await readdir('packages/sdk/src')).filter(f=>f.endsWith('.d.ts')).map(f=>'packages/sdk/src/'+f),...(await readdir('packages/sdk/dist')).map(f=>'packages/sdk/dist/'+f)];
  for(const file of new Set(files)){await mkdir(path.dirname(path.join(dir,file)),{recursive:true});await writeFile(path.join(dir,file),await readFile(file));}
  await verifySDKOutputs(dir);
  for(const file of ['packages/sdk/src/index.js','packages/sdk/dist/index.js','packages/sdk/src/index.d.ts','packages/sdk/dist/build-manifest.json']) {
   const filename=path.join(dir,file),original=await readFile(filename);
   await writeFile(filename,Buffer.concat([original,Buffer.from(file==='packages/sdk/src/index.js'?'\nexport const zge18aIntentionalDrift=1;\n':'\n// intentional drift\n')]));
   // Whitespace in JSON is semantically harmless, so change an actual hash field.
   if(file.endsWith('.json'))await writeFile(filename,original.toString().replace('zge.sdk.build.v1','invalid'));
   await assert.rejects(verifySDKOutputs(dir),undefined,`must reject ${file}`);
   await writeFile(filename,original);
  }
 } finally {await rm(dir,{recursive:true,force:true});}
});
