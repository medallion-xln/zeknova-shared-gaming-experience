import { KTX2Loader } from '../../assets/vendor/KTX2Loader.bundle.js';
import { GLTFLoader } from '../../assets/vendor/GLTFLoader.js';
import { MeshoptDecoder } from '../../assets/vendor/meshopt_decoder.module.js';
import { BoundedWorkerPool } from '../../packages/assets/src/BoundedWorkerPool.js';

const model = './assets/models/captain-mech-walk.low.glb';
const delay = ms => new Promise(r=>setTimeout(r,ms));
async function textureBytes() {
 const buffer=await (await fetch(new URL('../../'+model,import.meta.url))).arrayBuffer(),view=new DataView(buffer);
 const jsonLength=view.getUint32(12,true),json=JSON.parse(new TextDecoder().decode(buffer.slice(20,20+jsonLength)));
 const image=json.images.find(i=>i.mimeType==='image/ktx2'),bv=json.bufferViews[image.bufferView],binaryStart=20+jsonLength+8;
 return buffer.slice(binaryStart+(bv.byteOffset??0),binaryStart+(bv.byteOffset??0)+bv.byteLength);
}
const parse = (loader, buffer) => new Promise((resolve,reject) => loader.parse(buffer,resolve,reject));
function make(renderer,limit=4,bounded=true) {
 const loader=new KTX2Loader().setTranscoderPath(new URL('../../assets/vendor/basis/',import.meta.url).href).setWorkerLimit(limit);
 if(bounded){loader.workerPool.dispose();loader.workerPool=new BoundedWorkerPool({limit,timeoutMs:2000});}
 loader.detectSupport(renderer);return loader;
}
async function settle(promise,ms=5000) {
 let timer; const start=performance.now();
 try { const value=await Promise.race([promise,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('FIXTURE_DEADLINE')),ms);})]);return {ok:true,ms:performance.now()-start,value}; }
 catch(e){return {ok:false,ms:performance.now()-start,error:e.message};}finally{clearTimeout(timer);}
}
function inject(loader,fault) {
 const pool=loader.workerPool,creator=pool.workerCreator; loader.__fixtureCreator = creator;
 pool.setWorkerCreator(()=>{
  const worker=creator(),post=worker.postMessage.bind(worker);
  worker.postMessage=(msg,transfer)=>{
   if(msg.type==='transcode'){
    if(fault==='timeout')return;
    post(msg,transfer);queueMicrotask(()=>worker.terminate());
   }else post(msg,transfer);
  };return worker;
 });
}
export async function runStress(renderer,{mode='WebGL'}={}) {
 const bytes=await textureBytes(),results=[];
 for(const limit of [1,2,4,8]){
  const ktx=make(renderer,limit);await ktx.init();
  const run=await settle(Promise.all(Array.from({length:16},()=>parse(ktx,bytes.slice(0)))));
  const textures=run.value??[];textures.forEach(t=>t.dispose());delete run.value;
  results.push({case:'concurrent-transcodes',limit,...run,workers:ktx.workerPool.status()});ktx.dispose();
 }
 for(const fault of ['death','timeout']){
  const ktx=make(renderer,2);await ktx.init();inject(ktx,fault);
  const result=await settle(parse(ktx,bytes.slice(0)));delete result.value;
  // New worker creator on the same pool; reload bytes because transfer detaches them.
  ktx.workerPool.setWorkerCreator(ktx.__fixtureCreator);
  const retry=await settle(parse(ktx,bytes.slice(0)));retry.value?.dispose();delete retry.value;
  results.push({case:fault,...result,retry,workers:ktx.workerPool.status()});ktx.dispose();
 }
 const original=make(renderer,1,false);await original.init();inject(original,'death');
 const unbounded=await settle(parse(original,bytes.slice(0)),250);delete unbounded.value;results.push({case:'original-worker-death-oracle',...unbounded});original.dispose();
 for(const fault of ['malformed','unsupported','init-failure']){
  const ktx=make(renderer);if(fault==='init-failure')ktx.setTranscoderPath('/__zge_missing_transcoder__/');
  const input=fault==='malformed'?new ArrayBuffer(32):bytes.slice(0);if(fault==='unsupported')new DataView(input).setUint32(12,0xffffffff,true);
  const result=await settle(parse(ktx,input));delete result.value;results.push({case:fault,...result});ktx.dispose();
 }
 for(let cycle=0;cycle<3;cycle++){
  const ktx=make(renderer,2),gltf=new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).setKTX2Loader(ktx);
  const run=await settle(Promise.all(Array.from({length:4},()=>gltf.loadAsync(new URL('../../'+model,import.meta.url).href))));
  for(const g of run.value??[]){g.scene.traverse(o=>{o.geometry?.dispose();for(const m of [o.material].flat().filter(Boolean)){for(const v of Object.values(m))if(v?.isTexture)v.dispose();m.dispose();}});}
  delete run.value;results.push({case:'concurrent-gltf-dispose',cycle,...run,workers:ktx.workerPool.status()});ktx.dispose();await delay(10);
 }
 return {mode,results};
}
