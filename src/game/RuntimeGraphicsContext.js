export const GRAPHICS_OWNERSHIP=Object.freeze({canonicalRenderer:'compatibility-runtime',compatibilityThree:'embedded assets/index-02987539.js',vendoredThree:'assets/vendor/three.core.min.js via three.module.min.js',crossRuntimeObjectSharingSafe:false,actorLoader:'model-runtime service / vendored-three',environmentLoader:'environment-runtime service / vendored-three',ktx2Loaders:Object.freeze({count:1,actor:'@zge/assets shared service',environment:'@zge/assets shared service',canonicalPossible:true}),safeBridgeServices:Object.freeze(['renderer-info','scene-root-reference','camera-reference','model-registry','capture']),unsafeBridgeTypes:Object.freeze(['Object3D','Mesh','BufferGeometry','Material','Texture','Loader','WebGLRenderer','KTX2Loader'])});

export class RuntimeGraphicsContext{
  constructor({game,registry,capture}={}){this.game=game;this.registry=registry;this.capture=capture;this.owner='compatibility-runtime';Object.seal(this)}
  rendererInfo(){const info=this.game?.renderer?.info;return Object.freeze({render:Object.freeze({...info?.render}),memory:Object.freeze({...info?.memory})})}
  sceneRoot(){return this.game?.scene??null}
  camera(){return this.game?.camera??null}
  ownership(){return GRAPHICS_OWNERSHIP}
  assertCompatible(object){if(!object)return false;return object===this.game?.scene||object===this.game?.camera||object===this.game?.renderer||object?.parent===this.game?.scene}
  dispose(){this.registry?.dispose?.();this.game=null}
}
