import { build } from 'esbuild';
import { mkdirSync,writeFileSync,copyFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
mkdirSync('packages/sdk/dist',{recursive:true});for(const entry of ['index','three'])copyFileSync(`packages/sdk/src/${entry}.d.ts`,`packages/sdk/dist/${entry}.d.ts`);const hashes={};
for(const entry of ['index','three']){
 const options={entryPoints:[`packages/sdk/src/${entry}.js`],bundle:true,format:'esm',platform:'browser',external:['three/webgpu'],legalComments:'none',write:false};
 const a=(await build(options)).outputFiles[0].contents,b=(await build(options)).outputFiles[0].contents;
 if(Buffer.compare(a,b))throw Error('nonrepeatable SDK build');writeFileSync(`packages/sdk/dist/${entry}.js`,a);hashes[entry]=createHash('sha256').update(a).digest('hex');
}writeFileSync('packages/sdk/dist/build-manifest.json',JSON.stringify({schema:'zge.sdk.build.v1',hashes},null,2));console.log(JSON.stringify(hashes));
