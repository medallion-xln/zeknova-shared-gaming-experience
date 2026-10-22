import {createEngine,createProject,inspectGLB,Scene,SDK_VERSION} from '@zge/sdk';import type {Viewport} from '@zge/sdk/three';const scene=new Scene();scene.batchTransform(['a'],[1,2,3]);inspectGLB(new Uint8Array());async function check(){const e=await createEngine({project:createProject()});await e.importModel({id:'mesh',bytes:new Uint8Array()});await e.dispose();}let view:Viewport|null=null;console.log(SDK_VERSION,view,check);
// @ts-expect-error offsets must be a 3-vector
scene.batchTransform(['a'],[1,2]);
// @ts-expect-error binary import requires bytes
createEngine().then(e=>e.importModel({id:'bad',bytes:'not bytes'}));
