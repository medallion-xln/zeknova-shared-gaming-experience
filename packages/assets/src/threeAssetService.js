import { GLTFLoader } from '../../../assets/vendor/GLTFLoader.js';
import { KTX2Loader } from '../../../assets/vendor/KTX2Loader.bundle.js';
import { MeshoptDecoder } from '../../../assets/vendor/meshopt_decoder.module.js';
import { clone as cloneSkeleton } from '../../../assets/vendor/SkeletonUtils.js';
import { AssetService } from './AssetService.js';
import { BoundedWorkerPool } from './BoundedWorkerPool.js';

/** Detached clones retain legacy disposal semantics. Geometry/material/texture
 * objects are owned per instance until legacy disposal can become lease-aware.
 * Skeletons, transforms, clips and mixers must never be shared between actors. */
export function cloneParsedGLTF(gltf) {
  const geometries = new Map(), materials = new Map(), textures = new Map();
  const scene = cloneSkeleton(gltf.scene);
  const cloneMaterial = m => {
    if (!materials.has(m)) {
      const next = m.clone();
      for (const [key,value] of Object.entries(next)) if (value?.isTexture) { if (!textures.has(value)) textures.set(value,value.clone()); next[key] = textures.get(value); }
      materials.set(m,next);
    }
    return materials.get(m);
  };
  scene.traverse(object => {
    if (object.geometry) { if (!geometries.has(object.geometry)) geometries.set(object.geometry,object.geometry.clone()); object.geometry = geometries.get(object.geometry); }
    if (object.material) object.material = Array.isArray(object.material) ? object.material.map(cloneMaterial) : cloneMaterial(object.material);
  });
  return { ...gltf, scene, scenes: [scene], animations: gltf.animations.map(a => a.clone()) };
}
function disposeParsed(gltf) {
  const seen = new Set(); const dispose = value => { if (value && !seen.has(value)) { seen.add(value); value.dispose?.(); } };
  for (const scene of gltf.scenes ?? [gltf.scene]) scene.traverse(object => {
    dispose(object.geometry);
    for (const m of [object.material].flat().filter(Boolean)) { for (const v of Object.values(m)) if (v?.isTexture) dispose(v); dispose(m); }
  });
}
function sizeOf(gltf) {
  let bytes = 0; const seen = new Set();
  const count = v => { if (!v || seen.has(v)) return; seen.add(v); bytes += v.byteLength ?? 0; };
  gltf.scene.traverse(o => { for (const a of Object.values(o.geometry?.attributes ?? {})) count(a.array); count(o.geometry?.index?.array); for (const m of [o.material].flat().filter(Boolean)) for (const t of Object.values(m)) if (t?.isTexture && !seen.has(t)) { seen.add(t); for (const mip of t.mipmaps ?? []) count(mip.data); if (!t.mipmaps?.length) bytes += (t.image?.width ?? 0)*(t.image?.height ?? 0)*4; } });
  return bytes;
}
/** ZGE-17 AC5: the GLTF+meshopt+KTX2 loader as a registerable AssetService type, so the SDK's
 * own service can load first-party models without reaching for ZekNovaGame. `getRenderer` is a
 * provider rather than a global so a host that is not ZekNova can supply its own renderer;
 * KTX2 transcoder support can only be detected once a renderer exists, so detection stays lazy
 * and a model with no Basis textures still loads before one is available. */
export function createThreeGLTFLoaderType({ getRenderer = () => globalThis.ZekNovaGame?.renderer ?? null } = {}) {
  const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
  const ktx2 = new KTX2Loader().setTranscoderPath(new URL('../../../assets/vendor/basis/',import.meta.url).href);
  ktx2.workerPool.dispose(); ktx2.workerPool = new BoundedWorkerPool();
  let configured = false;
  const type = { load: async url => {
    const renderer = getRenderer();
    if (renderer && !configured) { ktx2.detectSupport(renderer); loader.setKTX2Loader(ktx2); configured = true; }
    return loader.loadAsync(url);
  }, clone: cloneParsedGLTF, dispose: disposeParsed, size: sizeOf };
  return { type, loader, ktx2, get configured() { return configured; }, dispose() { ktx2.dispose(); } };
}

let shared;
export function getThreeAssetService() {
  if (shared) return shared;
  const { type, loader, ktx2, dispose } = createThreeGLTFLoaderType();
  const service = new AssetService({ baseURL: new URL('../../../',import.meta.url).href });
  service.register('gltf', type);
  shared = { service, loader, ktx2, loadAsync: path => service.loadDetached(path, { type: 'gltf', owner: 'legacy-detached' }), status: () => ({ ...service.status(), workers: ktx2.workerPool.status() }), dispose() { service.dispose(); dispose(); shared = null; } };
  return shared;
}
