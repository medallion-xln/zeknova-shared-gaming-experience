import http from 'node:http';
import path from 'node:path';
import os from 'node:os';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import assert from 'node:assert/strict';

// Requires a runner-provided Playwright module and real Chrome/GPU. No PHP or
// production persistence is started: API responses are isolated test fixtures.
assert.ok(process.env.PLAYWRIGHT_MODULE,'PLAYWRIGHT_MODULE must name the certified runner Playwright ESM entry');
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE);
const root=process.cwd(),output=process.env.ZGE_EVIDENCE_DIR??path.join(os.tmpdir(),'zge18a-browser');
await mkdir(output,{recursive:true});
const mime={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.json':'application/json','.glb':'model/gltf-binary','.wasm':'application/wasm','.png':'image/png','.webp':'image/webp'};
const server=http.createServer(async(req,res)=>{
 try {
  const url=new URL(req.url,'http://localhost'),file=path.resolve(root,'.'+(url.pathname==='/'?'/index.html':decodeURIComponent(url.pathname)));
  assert.ok(file.startsWith(root+path.sep)&&!url.pathname.endsWith('.php'));
  res.setHeader('Content-Type',mime[path.extname(file)]??'application/octet-stream');res.end(await readFile(file));
 }catch{res.writeHead(404);res.end('Not found');}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const base=`http://127.0.0.1:${server.address().port}`;
let browser;const report={schema:'zge18a.browser.v1',persistence:'fixture-only; no PHP/server saves',runs:[]};
try {
 browser=await chromium.launch({executablePath:process.env.CHROME_PATH,channel:process.env.CHROME_PATH?undefined:'chrome',headless:true,args:['--enable-unsafe-webgpu']});
 for(const candidate of [false,true])for(const backend of ['webgpu','webgl2']) {
  const context=await browser.newContext({viewport:{width:1280,height:800},serviceWorkers:'block'}),page=await context.newPage();
  const errors=[],warnings=[],apiRequests=[];
  page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(['warning','error'].includes(m.type()))warnings.push(m.text());});
  const user={id:'zge18a-isolated',displayName:'ZGE18A QA',email:'qa@example.invalid',teamCode:'ZGE18A-ISOLATED',teamName:'Isolated QA',officerClass:'ensign',biome:'highlands',rankXp:0};
  await context.route('**/*',async route=>{
   const request=route.request(),url=new URL(request.url());
   if(url.origin!==base){await route.abort('blockedbyclient');return;}
   if(url.pathname.startsWith('/api/')) {
    apiRequests.push({path:url.pathname,method:request.method()});
    const data=url.pathname.endsWith('/session.php')?{user,environment:'local',auth:{authenticated:true,enrolled:true,enrollment:user,identity:user,mode:'demo'}}:{ok:true,save:null,players:[],buildings:[],room:null,events:[]};
    await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(data)});return;
   }
   if(candidate&&url.pathname==='/assets/index-02987539.js') {
    await route.fulfill({contentType:'text/javascript',body:await readFile('artifacts/runtime-reconstruction/index-reconstructed.js')});return;
   }
   if(candidate&&url.pathname==='/assets/model-runtime-c96327ba.js') {
    await route.fulfill({contentType:'text/javascript',body:await readFile('artifacts/runtime-reconstruction/model-runtime-reconstructed.js')});return;
   }
   await route.continue();
  });
  try {
   await page.goto(base+'/?qaNoBoss=1&legacySave=1'+(backend==='webgl2'?'&webgl=1':''));
   await page.locator('#launch-game').click({timeout:20000});
   await page.waitForFunction(()=>globalThis.ZGE?.engine?.lifecycle.state==='running',null,{timeout:90000});
   const state=await page.evaluate(async()=>{
    const g=globalThis.ZekNovaGame;
    await Promise.race([g.environmentReady,new Promise((_,reject)=>setTimeout(()=>reject(Error('environment readiness exceeded smoke deadline')),30000))]);
    await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
    const {getThreeAssetService}=await import('/packages/assets/src/threeAssetService.js'),assets=getThreeAssetService();
    return {backend:g.renderer.backend.isWebGPUBackend?'webgpu':'webgl2',ready:!!globalThis.ZekNovaStartupDiagnostics,sceneObjects:g.scene.children.length,player:!!g.player,disposed:!!g.disposed,sharedDecoder:assets.loader.ktx2Loader===assets.ktx2,assets:assets.status()};
   });
   assert.equal(state.backend,backend,'actual backend must match requested renderer');assert.equal(state.ready,true);assert.equal(state.player,true);assert.equal(state.disposed,false);assert.equal(state.sharedDecoder,true);assert.equal(errors.length,0,JSON.stringify(errors));
   await page.screenshot({path:path.join(output,`${candidate?'candidate':'shipping'}-${backend}.png`)});
   report.runs.push({candidate,requested:backend,status:'PASS',state,errors,warnings,apiRequests});
  }catch(error){report.runs.push({candidate,requested:backend,status:'FAIL',error:String(error),errors,warnings,apiRequests});}
  finally{await context.close();}
 }
}finally{
 await browser?.close();await new Promise(resolve=>server.close(resolve));
 await writeFile(path.join(output,'report.json'),JSON.stringify(report,null,2)+'\n');
}
console.log(JSON.stringify(report,null,2));
assert.equal(report.runs.length,4);assert.ok(report.runs.every(r=>r.status==='PASS'),'browser certification failed; inspect report');
