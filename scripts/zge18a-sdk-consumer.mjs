import assert from 'node:assert/strict';
import {mkdtemp,writeFile,readFile,copyFile,rm} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {pathToFileURL,fileURLToPath} from 'node:url';
import path from 'node:path';
import os from 'node:os';
import {createHash} from 'node:crypto';
import {verifySDKOutputs} from './sdk-output-integrity.mjs';

export async function verifySDKRelease(root = process.cwd()) {
  root=path.resolve(root);
  await verifySDKOutputs(root);
  const dir=await mkdtemp(path.join(os.tmpdir(),'zge18a-consumer-'));
  const run=(command,args,cwd=dir)=>execFileSync(command,args,{cwd,encoding:'utf8',stdio:['ignore','pipe','pipe']});
  try {
    const source=await import(pathToFileURL(path.join(root,'packages/sdk/src/index.js')));
    const presentation=await import(pathToFileURL(path.join(root,'packages/sdk/src/three.js')));
    const names=Object.keys(source).sort(), threeNames=Object.keys(presentation).sort();
    const build=JSON.parse(await readFile(path.join(root,'packages/sdk/dist/build-manifest.json')));
    for(const [name,digest] of Object.entries(build.hashes)) {
      const file=name.endsWith('.d.ts')?name:name+'.js';
      assert.equal(createHash('sha256').update(await readFile(path.join(root,'packages/sdk/dist',file))).digest('hex'),digest,`dist manifest ${file}`);
      if(name.endsWith('.d.ts')) assert.deepEqual(await readFile(path.join(root,'packages/sdk/src',file)),await readFile(path.join(root,'packages/sdk/dist',file)),`declaration drift ${file}`);
    }
    const packed=JSON.parse(run('npm',['pack',path.join(root,'packages/sdk'),'--pack-destination',dir,'--ignore-scripts','--json'],root))[0];
    assert.ok(packed.files.every(f=>!f.path.startsWith('src/')&&!f.path.includes('assets/index-')),'private files excluded');
    await writeFile(path.join(dir,'package.json'),JSON.stringify({private:true,type:'module'}));
    run('npm',['install','--ignore-scripts','--no-audit','--no-fund',path.join(dir,packed.filename)]);
    await copyFile(path.join(root,'assets/models/captain-engineer-walk.glb'),path.join(dir,'hero.glb'));
    await writeFile(path.join(dir,'consumer.mjs'),`import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import * as sdk from '@zge/sdk'; import * as view from '@zge/sdk/three';
assert.deepEqual(Object.keys(sdk).sort(),${JSON.stringify(names)});
assert.deepEqual(Object.keys(view).sort(),${JSON.stringify(threeNames)});
const engine=await sdk.createEngine({project:sdk.createProject(),assetBaseURL:'http://localhost/',assetBudgetBytes:1024});
const world=await engine.loadWorld();world.createEntity({id:'player',components:{transform:sdk.transform()}});
const keys=new Set(['w']),movement=sdk.installMovement(engine,{input:keys});
await engine.start();engine.pause();engine.step(30);assert.ok(movement.state.z>0);
const evasion=sdk.stepMovement(sdk.createMovementState(),{dash:true},1/60).state.lastEvasion;
assert.equal(sdk.validateEvasionWindow(evasion).ok,true);
const bytes=new Uint8Array(await readFile('hero.glb'));const manifest=await sdk.describeTrustedModel({path:'hero.glb',bytes});assert.equal(manifest.skinned,true);
await engine.importTrustedModel({id:'hero',path:'hero.glb',bytes});assert.equal(engine.trustedModels().length,1);
assert.ok(engine.requiredDecoders().includes('meshopt'));assert.equal(typeof view.createViewport,'function');
movement.dispose();await engine.dispose();console.log('installed public consumer: PASS');`);
    run(process.execPath,['consumer.mjs']);
    await writeFile(path.join(dir,'consumer.ts'),`import * as sdk from '@zge/sdk';
import {createViewport} from '@zge/sdk/three';
const approved=[${names.map(n=>'sdk.'+n).join(',')}];void approved;void createViewport;
async function check(){
 const e=await sdk.createEngine({assetBaseURL:'http://localhost/',assetBudgetBytes:256*1024*1024});
 const model=await sdk.describeTrustedModel({path:'hero.glb',bytes:new Uint8Array()});
 await e.importTrustedModel({id:'hero',path:'hero.glb',bytes:new Uint8Array()});
 e.registerAssetLoader('fixture',{load:async()=>({ok:true}),clone:v=>({...v})});e.trustedModels();e.requiredDecoders();
 const config=sdk.validateMovementConfig({dash:{cooldownMs:1000}});const s=sdk.createMovementState({config});
 const r=sdk.stepMovement(s,{dash:true},1/60,config);sdk.validateEvasionWindow(r.state.lastEvasion,{config});
 const m=sdk.installMovement(e,{config,input:new Set(['w'])});m.state?.grounded;m.dispose();
 const camera=sdk.createCameraDirector(e);camera.follow('player').setMode('third-person');camera.update();camera.dispose();
 sdk.replayScript([{frames:10,forward:1}],{config});sdk.requiredDecoders([model]);
 // @ts-expect-error movement numbers cannot be strings
 sdk.validateMovementConfig({speed:'fast'});
 // @ts-expect-error trusted bytes cannot be a path string
 e.importTrustedModel({id:'bad',path:'hero.glb',bytes:'bad'});
 await e.dispose();
}void check;`);
    run(process.execPath,[path.join(root,'node_modules/typescript/bin/tsc'),'--noEmit','--strict','--target','ES2022','--module','NodeNext','--moduleResolution','NodeNext','consumer.ts']);
    // Source and distribution must expose precisely the declared runtime values.
    const ts=(await import(pathToFileURL(path.join(root,'node_modules/typescript/lib/typescript.js')))).default;
    for(const [entry,expected] of [['index',names],['three',threeNames]]) {
      const file=path.join(root,`packages/sdk/src/${entry}.d.ts`),program=ts.createProgram([file],{noEmit:true,strict:true,target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.NodeNext,moduleResolution:ts.ModuleResolutionKind.NodeNext,types:[]});
      assert.equal(ts.getPreEmitDiagnostics(program).length,0,`declaration diagnostics: ${entry}`);
      const checker=program.getTypeChecker(),symbol=checker.getSymbolAtLocation(program.getSourceFile(file));
      const values=checker.getExportsOfModule(symbol).filter(s=>{if(s.flags&ts.SymbolFlags.Alias)s=checker.getAliasedSymbol(s);return !!(s.flags&ts.SymbolFlags.Value);}).map(s=>s.name).sort();
      assert.deepEqual(values,expected,`${entry} runtime/declaration export drift`);
    }
    return {status:'PASS',exports:names.length,presentationExports:threeNames.length,installedConsumer:true,typecheck:true,packageFiles:packed.files.map(f=>f.path)};
  } finally { await rm(dir,{recursive:true,force:true}); }
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))console.log(JSON.stringify(await verifySDKRelease(),null,2));
