import { build, version as esbuildVersion } from 'esbuild';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, writeFileSync, copyFileSync, realpathSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const selectedTests=[
 'packages/core/test/kernel.test.mjs','packages/core/test/simulation.test.mjs',
 'packages/gameplay-construction/test/source-runtime.test.mjs','packages/gameplay-construction/test/source-port.test.mjs','packages/gameplay-construction/test/zge08-players.test.mjs',
 'packages/gameplay-missions/test/pipeline.test.mjs','packages/tooling/test/editor.test.mjs',
 'packages/server-php/test/supervised-runtime.test.mjs',
];
const sources=['packages/core/src/index.js','packages/gameplay-construction/src/index.js','packages/gameplay-construction/src/MultiplayerConstructionRuntime.js','packages/gameplay-missions/src/index.js','packages/tooling/src/index.js'];
const digest=data=>createHash('sha256').update(data).digest('hex');
const walk=dir=>existsSync(dir)?readdirSync(dir,{withFileTypes:true}).flatMap(item=>item.isDirectory()?walk(dir+'/'+item.name):[dir+'/'+item.name]):[];
const entry=`export * as core from './packages/core/src/index.js';\nexport * as construction from './packages/gameplay-construction/src/index.js';\nexport { MultiplayerConstructionRuntime } from './packages/gameplay-construction/src/MultiplayerConstructionRuntime.js';\nexport * as missions from './packages/gameplay-missions/src/index.js';\nexport * as tooling from './packages/tooling/src/index.js';\n`;

export async function captureSourceSnapshot(target,{runTests=true}={}){
 target=path.resolve(target);if(!target.startsWith('/tmp/')||existsSync(target)||!existsSync(path.dirname(target)))throw Error('new-private-temporary-target-required');
 const parent=lstatSync(path.dirname(target));if((parent.mode&0o077)!==0||parent.uid!==process.getuid())throw Error('private-parent-required');
 const runtimeEntries=walk(root+'/packages/server-php/runtime').filter(file=>/\.mjs$/.test(file)).map(file=>path.relative(root,file));
 const fixtureEntries=walk(root+'/packages/server-php/test/helpers').filter(file=>/\.mjs$/.test(file)).map(file=>path.relative(root,file));
 const launchers=['scripts/zge08-server.mjs','scripts/zge09-service.mjs'].filter(file=>existsSync(root+'/'+file));
 // esbuild resolves the original import graph. Built-ins remain built-ins. A
 // third-party dependency is a hard failure instead of silently copying bundles.
 const graph=await build({absWorkingDir:root,entryPoints:[...sources,...selectedTests,...runtimeEntries,...fixtureEntries,...launchers],bundle:true,write:false,outdir:'__snapshot_graph',platform:'node',format:'esm',metafile:true,logLevel:'silent'});
 const relative=new Set(Object.keys(graph.metafile.inputs));
 for(const file of walk(root+'/packages/server-php/src'))if(/\.(php|sql)$/.test(file))relative.add(path.relative(root,file));
 // The policy fingerprint includes readable source files even when a given
 // fixture does not import each one. Preserve that exact policy boundary.
 for(const pkg of ['core','gameplay-construction','gameplay-missions'])for(const file of walk(root+'/packages/'+pkg+'/src'))if(/\.(m?js)$/.test(file))relative.add(path.relative(root,file));
 for(const file of ['packages/server-php/src/worker.mjs','examples/construction-world/world.js','src/game/OfficerRank.js','src/game/CampaignPlan.js','src/world/Biomes.js'])relative.add(file);
 mkdirSync(target,{mode:0o700});const files={};
 for(const file of [...relative].sort()){
  const source=path.resolve(root,file);if(!source.startsWith(root+'/')||realpathSync(source)!==source||file.startsWith('assets/')||file.includes('node_modules')||!/^((packages|examples|src|scripts)\/)/.test(file))throw Error('source-custody-boundary-violated');
  const content=readFileSync(source);files[file]=digest(content);mkdirSync(path.dirname(target+'/'+file),{recursive:true,mode:0o700});copyFileSync(source,target+'/'+file);
 }
 for(const [file,sha256]of Object.entries(files))if(digest(readFileSync(root+'/'+file))!==sha256||digest(readFileSync(target+'/'+file))!==sha256)throw Error('source-changed-during-capture');
 writeFileSync(target+'/package.json',JSON.stringify({name:'zge09-source-snapshot',private:true,type:'module'},null,2),{mode:0o600});writeFileSync(target+'/source-engine.mjs',entry,{mode:0o600});
 const buildOne=async()=>{const result=await build({absWorkingDir:target,entryPoints:['source-engine.mjs'],bundle:true,write:false,outfile:'build/engine.mjs',platform:'node',format:'esm',legalComments:'none',logLevel:'silent'});return result.outputFiles[0].contents;};
 const first=await buildOne(),second=await buildOne();if(digest(first)!==digest(second))throw Error('non-reproducible-engine-build');mkdirSync(target+'/build',{mode:0o700});writeFileSync(target+'/build/engine.mjs',first,{mode:0o600});
 const started=performance.now();let tests=null;
 if(runTests){const result=spawnSync(process.execPath,['--test','--test-concurrency=1',...selectedTests],{cwd:target,env:{...process.env,ZGE_EVIDENCE_DIR:target+'/test-evidence'},encoding:'utf8',timeout:240000,maxBuffer:8*1024*1024});writeFileSync(target+'/captured-tests.log',result.stdout+result.stderr,{mode:0o600});tests={exitCode:result.status,pass:Number(result.stdout.match(/# pass (\d+)/)?.[1]??0),fail:Number(result.stdout.match(/# fail (\d+)/)?.[1]??0),durationMs:performance.now()-started};if(result.status!==0)throw Error('captured-source-tests-failed');}
 const phpFiles=[...relative].filter(file=>file.endsWith('.php'));for(const file of phpFiles){const r=spawnSync('php',['-l',file],{cwd:target,encoding:'utf8'});if(r.status!==0)throw Error('captured-php-syntax-failed');}
 const smoke=spawnSync(process.execPath,['--input-type=module','-e',"import * as sdk from './build/engine.mjs';const e=sdk.core.createEngine({scheduler:'manual'});await e.initialize();e.step(2);if(e.clock.stepNumber!==2)throw Error('step');await e.dispose();"],{cwd:target,encoding:'utf8'});if(smoke.status!==0)throw Error('standalone-build-smoke-failed');
 const result={schema:'zge.source-snapshot.v1',scope:'independent source-owned engine and headless private PHP/Node authority runtime; excludes browser presentation, original game bundle and media/models',files,sourceTreeSha256:digest(JSON.stringify(files)),toolchain:{node:process.version,esbuild:esbuildVersion,php:spawnSync('php',['-r','echo PHP_VERSION;'],{encoding:'utf8'}).stdout},build:{format:'esm',bytes:first.byteLength,sha256:digest(first),repeatBuildIdentical:true,standaloneSmoke:true},selectedTests,tests,phpSyntaxFiles:phpFiles.length,legacyAssetsIncluded:false,thirdPartyModulesIncluded:false};
 writeFileSync(target+'/source-manifest.json',JSON.stringify(result,null,2),{mode:0o600});return result;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const target=process.argv[2];if(!target)throw Error('usage: node scripts/zge09-source-snapshot.mjs /tmp/PRIVATE_PARENT/NEW_SNAPSHOT');
 const result=await captureSourceSnapshot(target);console.log(JSON.stringify({...result,files:Object.keys(result.files).length},null,2));
}
