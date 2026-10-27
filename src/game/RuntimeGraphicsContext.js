/* ZGE-17 AC1 — Three.js unification. There were three copies of r185: inlined in the frozen
 * bundle, duplicated at assets/vendor/, and installed at node_modules/three. The vendored pair
 * are now re-exports of node_modules, and the SDK/Studio import map points at
 * three.webgpu.min.js, which shares the same three.core.min.js — so the vendored stack and the
 * editor stack are ONE module instance (verified by examples/three-identity/).
 * The bundle's inlined copy is untouched and remains a separate instance, so
 * crossRuntimeObjectSharingSafe and unsafeBridgeTypes still describe THAT boundary and stay as
 * they were. Measured live on 2026-10-27: 1,059 of 2,988 scene objects (35.4%) are instanceof
 * the editor stack's Object3D; the rest belong to the bundle. That percentage is the rebuild's
 * progress metric — it reaches 100% when the bundle is replaced. */
export const GRAPHICS_OWNERSHIP=Object.freeze({canonicalRenderer:'compatibility-runtime',compatibilityThree:'embedded assets/index-02987539.js',vendoredThree:'assets/vendor/three.core.min.js via three.module.min.js',canonicalThree:'node_modules/three/build/three.core.min.js — shared by assets/vendor/* and the SDK/Studio stack',vendoredAndEditorStacksUnified:true,threeInstancesReachable:2,crossRuntimeObjectSharingSafe:false,actorLoader:'model-runtime service / vendored-three',environmentLoader:'environment-runtime service / vendored-three',ktx2Loaders:Object.freeze({count:1,actor:'@zge/assets shared service',environment:'@zge/assets shared service',canonicalPossible:true}),safeBridgeServices:Object.freeze(['renderer-info','scene-root-reference','camera-reference','model-registry','capture']),unsafeBridgeTypes:Object.freeze(['Object3D','Mesh','BufferGeometry','Material','Texture','Loader','WebGLRenderer','KTX2Loader'])});

export class RuntimeGraphicsContext{
  constructor({game,registry,capture}={}){this.game=game;this.registry=registry;this.capture=capture;this.owner='compatibility-runtime';Object.seal(this)}
  rendererInfo(){const info=this.game?.renderer?.info;return Object.freeze({render:Object.freeze({...info?.render}),memory:Object.freeze({...info?.memory})})}
  sceneRoot(){return this.game?.scene??null}
  camera(){return this.game?.camera??null}
  ownership(){return GRAPHICS_OWNERSHIP}
  assertCompatible(object){if(!object)return false;return object===this.game?.scene||object===this.game?.camera||object===this.game?.renderer||object?.parent===this.game?.scene}
  dispose(){this.registry?.dispose?.();this.game=null}
}
