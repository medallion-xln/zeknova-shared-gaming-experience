import {SDKError} from './schema.js';

/**
 * Trusted (first-party) model tier — ZGE-17 AC5-AC8.
 *
 * `inspectGLB` in model.js is the UNTRUSTED tier: a deliberately narrow, hand-written
 * parser that converts a creator-supplied GLB into portable `zge.static-model.v1` JSON.
 * Its narrowness is the security property that player UGC (ZGE-17 §5, Q7) depends on,
 * so it is not widened here.
 *
 * It cannot load ZekNova's own art, and widening it to do so would destroy that property.
 * Surveyed 2026-10-27 over all 211 GLB files in assets/models/: ZERO would pass. They use
 * EXT_meshopt_compression (154), KHR_mesh_quantization (138), EXT_texture_webp (80),
 * KHR_texture_basisu (61), KHR_materials_specular/ior (60 each), interleaved buffer views
 * (64%), JOINTS_0/WEIGHTS_0 skinning (53), and 43% exceed the 512 KiB ceiling.
 *
 * This tier is for assets the project itself ships. It does not re-decode them: decoding
 * belongs to three's GLTFLoader with the meshopt and KTX2 decoders already vendored under
 * assets/vendor/ and already wired in packages/assets/src/threeAssetService.js. What this
 * module does is read the GLB's JSON chunk to produce a MANIFEST — what the file contains
 * and which decoders it needs — so that custody, residency budgets and content drift are
 * checkable without a GPU, a browser, or a full decode.
 *
 * A trusted model is referenced by path and carries sha256 custody; it is never transcoded
 * into portable JSON, because no portable schema here expresses skinned animation.
 */

export const TRUSTED_MODEL_SCHEMA = 'zge.trusted-model.v1';

/** Extensions this project's art pipeline is known to emit, mapped to the decoder each needs. */
export const KNOWN_EXTENSIONS = Object.freeze({
  EXT_meshopt_compression: 'meshopt',
  KHR_mesh_quantization: null,       // handled natively by three once quantized attributes are allowed
  EXT_texture_webp: 'webp',          // browser-native decode
  KHR_texture_basisu: 'ktx2',
  KHR_materials_ior: null,
  KHR_materials_specular: null,
  KHR_texture_transform: null,
});

const check = (ok, message) => { if (!ok) throw new SDKError('MODEL_FORMAT', message); };

/** Reads only the JSON chunk. Never touches BIN, so cost is independent of model size. */
export function readGLBHeader(input) {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  check(bytes.byteLength >= 20, 'GLB too small for a header');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  check(view.getUint32(0, true) === 0x46546c67, 'Not a GLB (bad magic)');
  check(view.getUint32(4, true) === 2, 'Only GLB container version 2 is supported');
  check(view.getUint32(8, true) === bytes.length, 'GLB length field does not match the file');
  const jsonLength = view.getUint32(12, true);
  check(view.getUint32(16, true) === 0x4e4f534a, 'First chunk must be JSON');
  check(jsonLength > 0 && 20 + jsonLength <= bytes.length, 'JSON chunk exceeds the file');
  try { return JSON.parse(new TextDecoder('utf-8', {fatal: true}).decode(bytes.subarray(20, 20 + jsonLength))); }
  catch { throw new SDKError('MODEL_PARSE', 'Invalid GLB JSON chunk'); }
}

export async function sha256Hex(bytes) {
  const digest = await crypto.subtle.digest('SHA-256', bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes));
  return [...new Uint8Array(digest)].map((v) => v.toString(16).padStart(2, '0')).join('');
}

/**
 * Describe a first-party GLB. `path` is how the project references it; `bytes` is read for
 * its header and its digest only. Unknown extensions are reported, not rejected — an
 * unrecognised extension is a content-pipeline change somebody should see, not a parse error.
 */
export async function describeTrustedModel({path, bytes, maxBytes = 16 * 1024 * 1024} = {}) {
  check(typeof path === 'string' && path.length > 0 && !path.includes('\\') && !path.startsWith('/')
    && path.split('/').every((part) => part && part !== '.' && part !== '..') && !/[:\x00-\x1f]/.test(path),
    'Trusted model needs a relative, traversal-free path');
  const data = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  check(data.byteLength > 0 && data.byteLength <= maxBytes, `GLB exceeds the ${Math.round(maxBytes / 1048576)} MiB trusted ceiling`);
  const json = readGLBHeader(data);
  check(json?.asset?.version === '2.0', 'glTF asset version 2.0 required');

  const used = json.extensionsUsed ?? [];
  const required = json.extensionsRequired ?? [];
  check(required.every((name) => used.includes(name)), 'extensionsRequired must be listed in extensionsUsed');
  const unknown = used.filter((name) => !(name in KNOWN_EXTENSIONS));
  const decoders = [...new Set(used.map((name) => KNOWN_EXTENSIONS[name]).filter(Boolean))].sort();

  const attributes = new Set();
  let primitives = 0;
  for (const mesh of json.meshes ?? []) for (const part of mesh.primitives ?? []) {
    primitives += 1;
    for (const key of Object.keys(part.attributes ?? {})) attributes.add(key);
  }
  // Vertex count is the max POSITION accessor count; exact totals need the BIN chunk.
  const positionAccessors = new Set();
  for (const mesh of json.meshes ?? []) for (const part of mesh.primitives ?? []) {
    if (Number.isInteger(part.attributes?.POSITION)) positionAccessors.add(part.attributes.POSITION);
  }
  const vertices = [...positionAccessors].reduce((n, i) => n + (json.accessors?.[i]?.count ?? 0), 0);

  /* This pipeline ships animation separately from geometry: all 48 *.anim.glb files carry
   * clips and a node hierarchy but no meshes and no skins, to be retargeted onto the base
   * model's skeleton (e.g. boss-archive-shade.glb holds mesh + skin + one clip, and
   * boss-archive-shade-slash.anim.glb holds only the slash). A rebuild therefore needs clip
   * retargeting, not just embedded animation — so the manifest records which kind this is. */
  const meshCount = (json.meshes ?? []).length;
  const clipCount = (json.animations ?? []).length;
  const kind = meshCount > 0 ? 'geometry' : clipCount > 0 ? 'animation' : 'empty';
  check(kind !== 'empty', 'GLB has neither meshes nor animations');

  return Object.freeze({
    schema: TRUSTED_MODEL_SCHEMA,
    path,
    kind,
    sourceFormat: 'glb2',
    sourceBytes: data.byteLength,
    sourceSha256: await sha256Hex(data),
    extensions: Object.freeze([...used].sort()),
    extensionsRequired: Object.freeze([...required].sort()),
    unknownExtensions: Object.freeze(unknown.sort()),
    requiresDecoders: Object.freeze(decoders),
    skinned: (json.skins ?? []).length > 0,
    skins: (json.skins ?? []).length,
    animations: Object.freeze((json.animations ?? []).map((a, i) => a.name ?? `clip-${i}`)),
    textured: (json.textures ?? []).length > 0,
    nodes: (json.nodes ?? []).length,
    meshes: (json.meshes ?? []).length,
    primitives,
    materials: (json.materials ?? []).length,
    images: (json.images ?? []).length,
    textures: (json.textures ?? []).length,
    attributes: Object.freeze([...attributes].sort()),
    vertices,
  });
}

export function validateTrustedModel(data) {
  check(data?.schema === TRUSTED_MODEL_SCHEMA && data.sourceFormat === 'glb2', 'Invalid trusted model');
  check(typeof data.path === 'string' && data.path.length > 0, 'Trusted model path required');
  check(Number.isSafeInteger(data.sourceBytes) && data.sourceBytes > 0, 'Invalid source size');
  check(/^[a-f0-9]{64}$/.test(data.sourceSha256 ?? ''), 'sha256 custody required for a trusted model');
  for (const key of ['extensions', 'extensionsRequired', 'unknownExtensions', 'requiresDecoders', 'animations', 'attributes']) {
    check(Array.isArray(data[key]) && data[key].every((v) => typeof v === 'string'), `Invalid ${key}`);
  }
  for (const key of ['skins', 'nodes', 'meshes', 'primitives', 'materials', 'images', 'textures', 'vertices']) {
    check(Number.isSafeInteger(data[key]) && data[key] >= 0, `Invalid ${key}`);
  }
  check(typeof data.skinned === 'boolean' && typeof data.textured === 'boolean', 'Invalid skinned/textured flags');
  check(data.skinned === data.skins > 0, 'skinned flag disagrees with skin count');
  check(['geometry', 'animation'].includes(data.kind), 'Invalid trusted model kind');
  check(data.kind === 'geometry' ? data.meshes > 0 : data.meshes === 0 && data.animations.length > 0,
    'kind disagrees with mesh and clip counts');
  return data;
}

/** Which decoders a set of manifests collectively needs — what a host must wire up once. */
export function requiredDecoders(manifests) {
  return [...new Set(manifests.flatMap((m) => m.requiresDecoders ?? []))].sort();
}
