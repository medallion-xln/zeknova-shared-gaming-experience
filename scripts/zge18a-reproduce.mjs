import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {readFile,writeFile,mkdir,mkdtemp,rm,readdir} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {execFileSync} from 'node:child_process';
import {sha256,verifyRuntimeLineage} from './runtime-lineage.mjs';

// Two independent npm-ci environments. No dist/artifact/node_modules outputs are
// copied in, and neither the dirty nested checkout nor untracked data is read.
const root=process.cwd(),base=await mkdtemp(path.join(os.tmpdir(),'zge18a-reproduce-'));
assert.equal(process.versions.node,(await readFile('.node-version','utf8')).trim(),'use the pinned Node build environment');
const toolchain={esbuild:'0.25.11',three:'0.185.0',typescript:'5.9.3'};
const config=JSON.parse(await readFile('src/runtime-reconstructed/runtime-build.json'));
const closure=await build({entryPoints:['packages/sdk/src/index.js','packages/sdk/src/three.js'],outdir:'unused',bundle:true,format:'esm',platform:'browser',external:['three/webgpu'],write:false,metafile:true});
const files=[...new Set([...Object.keys(closure.metafile.inputs),...config.compatibility.segments,config.model.entrypoint,
 'src/runtime-reconstructed/runtime-build.json','src/runtime-reconstructed/provenance.json',
 'scripts/build-reconstructed-runtime.mjs','scripts/zge10-build.mjs',
 'package.json','package-lock.json','packages/sdk/package.json','packages/sdk/README.md','.node-version',
 ...(await readdir('packages/sdk/src')).filter(f=>f.endsWith('.d.ts')).map(f=>'packages/sdk/src/'+f),
 'assets/index-02987539.js','assets/model-runtime-c96327ba.js'] )].sort();
const inputHashes=Object.fromEntries(await Promise.all(files.map(async f=>[f,sha256(await readFile(f))])));
const outputs=[config.compatibility.output,config.model.output,...['index.js','three.js','build-manifest.json',...(await readdir('packages/sdk/src')).filter(f=>f.endsWith('.d.ts'))].map(f=>'packages/sdk/dist/'+f)].sort();
const run=(cmd,args,cwd)=>execFileSync(cmd,args,{cwd,encoding:'utf8',stdio:['ignore','pipe','pipe']});
try {
 const runs=[];
 for(const name of ['first','second']) {
  const dir=path.join(base,name);await mkdir(dir);
  for(const file of files) {
   assert.ok(!file.startsWith('node_modules/')&&!file.startsWith('stable-fast-3d/'));
   await mkdir(path.dirname(path.join(dir,file)),{recursive:true});await writeFile(path.join(dir,file),await readFile(path.join(root,file)));
  }
  run('npm',['ci','--ignore-scripts','--no-audit','--no-fund'],dir);
  for(const [name,version] of Object.entries(toolchain))assert.equal(JSON.parse(await readFile(path.join(dir,'node_modules',name,'package.json'))).version,version,`locked ${name} version`);
  run(process.execPath,['scripts/build-reconstructed-runtime.mjs'],dir);
  run(process.execPath,['scripts/zge10-build.mjs'],dir);
  await verifyRuntimeLineage(dir);
  runs.push(Object.fromEntries(await Promise.all(outputs.map(async f=>[f,sha256(await readFile(path.join(dir,f)))]))));
 }
 assert.deepEqual(runs[0],runs[1],'independent builds differ');
 for(const file of outputs)assert.equal(sha256(await readFile(path.join(root,file))),runs[0][file],`checked-in output drift: ${file}`);
 const result={schema:'zge18a.reproducibility.v1',node:process.version,toolchain,inputHashes,runs,comparison:'All runtime artifacts, SDK JS, copied declarations and manifest bytes; no absolute-path metadata is emitted.',status:'PASS'};
 if(process.env.ZGE18A_REPRO_REPORT)await writeFile(process.env.ZGE18A_REPRO_REPORT,JSON.stringify(result,null,2)+'\n');
 console.log(JSON.stringify(result,null,2));
} finally {await rm(base,{recursive:true,force:true});}
