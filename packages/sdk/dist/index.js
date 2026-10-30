// packages/sdk/src/schema.js
var SDKError = class extends Error {
  constructor(code, message, path = null) {
    super(message);
    this.name = "SDKError";
    this.code = code;
    this.path = path;
  }
};
var fail = (code, message, path = null) => {
  throw new SDKError(code, message, path);
};
function validateDefinition(def) {
  if (!def || def.schema !== "zge.component.v1" || typeof def.label !== "string" || !def.fields || Array.isArray(def.fields)) fail("COMPONENT_SCHEMA", "Invalid component definition");
  for (const [key, f] of Object.entries(def.fields)) {
    if (!/^[a-zA-Z][\w-]{0,60}$/.test(key) || !f || !["number", "boolean", "string", "enum", "vector", "asset", "entity"].includes(f.type)) fail("COMPONENT_SCHEMA", "Unsupported reflected field", key);
    if (f.type === "enum" && (!Array.isArray(f.values) || !f.values.length || f.values.some((v) => typeof v !== "string"))) fail("COMPONENT_SCHEMA", "Enumeration values required", key);
    if (f.type === "vector" && f.size !== void 0 && ![2, 3, 4].includes(f.size)) fail("COMPONENT_SCHEMA", "Vector size must be 2\u20134", key);
    if (f.min !== void 0 && !Number.isFinite(f.min) || f.max !== void 0 && !Number.isFinite(f.max)) fail("COMPONENT_SCHEMA", "Finite field bounds required", key);
  }
  return structuredClone(def);
}
function validateFields(value, definition, { assets = null, entities = null } = {}) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  for (const [key, f] of Object.entries(definition.fields)) {
    const v = value[key];
    if (v === void 0 && f.optional) continue;
    if (v === null && f.nullable) continue;
    if (f.type === "number" && !(Number.isFinite(v) && (f.min === void 0 || v >= f.min) && (f.max === void 0 || v <= f.max))) return false;
    if (f.type === "boolean" && typeof v !== "boolean") return false;
    if (["string", "enum", "asset", "entity"].includes(f.type) && typeof v !== "string") return false;
    if (f.type === "string" && v.length > (f.maxLength ?? 1e3)) return false;
    if (f.type === "enum" && !f.values.includes(v)) return false;
    if (f.type === "vector" && (!Array.isArray(v) || v.length !== (f.size ?? 3) || v.some((n) => !Number.isFinite(n) || f.min !== void 0 && n < f.min || f.max !== void 0 && n > f.max))) return false;
    if (f.type === "asset" && assets && !assets.has(v)) return false;
    if (f.type === "entity" && entities && !entities.has(v)) return false;
  }
  return definition.additionalProperties !== false || Object.keys(value).every((k) => Object.hasOwn(definition.fields, k));
}
var field = (type, label, extra = {}) => ({ type, label, ...extra });
var builtinDefinitions = {
  transform: { schema: "zge.component.v1", label: "Transform", fields: { position: field("vector", "Position"), rotation: field("vector", "Rotation (radians)"), scale: field("vector", "Scale", { min: 1e-5 }) } },
  mesh: { schema: "zge.component.v1", label: "Primitive", fields: { primitive: field("enum", "Shape", { values: ["box", "sphere", "cylinder"] }), color: field("string", "Color", { maxLength: 7 }) } },
  collider: { schema: "zge.component.v1", label: "Box collider", fields: { halfSize: field("vector", "Half size", { min: 1e-5 }) } },
  state: { schema: "zge.component.v1", label: "Project state", fields: {} },
  asset: { schema: "zge.component.v1", label: "Asset reference", fields: { id: field("asset", "Asset") } },
  editor: { schema: "zge.component.v1", label: "Hierarchy", fields: { parent: field("entity", "Parent", { nullable: true }), hidden: field("boolean", "Hidden"), locked: field("boolean", "Locked"), group: field("string", "Group", { maxLength: 100 }) } }
};
function migrateProject(input) {
  const p = structuredClone(input);
  if (p?.schema === "zge.sdk.project.v1") return { ...p, schema: "zge.sdk.project.v2", sdkCompatibility: { major: 0, minimumPreview: 11 }, components: p.components ?? {}, metadata: p.metadata ?? {}, provenance: [...p.provenance ?? [], { sourceSchema: "zge.sdk.project.v1", migration: "project-v1-to-v2" }] };
  if (p?.schema !== "zge.sdk.project.v2") fail("PROJECT_VERSION", "Unsupported project schema");
  if (p.sdkCompatibility?.major !== 0 || !Number.isInteger(p.sdkCompatibility.minimumPreview) || p.sdkCompatibility.minimumPreview < 0 || p.sdkCompatibility.minimumPreview > 13) fail("SDK_VERSION", "Project requires an unsupported SDK version");
  return p;
}

// packages/sdk/src/model.js
var check = (ok, message) => {
  if (!ok) throw new SDKError("MODEL_FORMAT", message);
};
function inspectGLB(input, { hierarchy = false } = {}) {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  check(bytes.byteLength >= 28 && bytes.byteLength <= 524288, "GLB size must be 28 bytes\u2013512 KiB");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  check(view.getUint32(0, true) === 1179937895 && view.getUint32(4, true) === 2 && view.getUint32(8, true) === bytes.length, "Invalid GLB 2 header");
  let offset = 12, json = null, bin = null;
  while (offset < bytes.length) {
    check(offset + 8 <= bytes.length, "Truncated chunk header");
    const size = view.getUint32(offset, true), type = view.getUint32(offset + 4, true);
    offset += 8;
    check(size % 4 === 0 && offset + size <= bytes.length, "Invalid chunk bounds");
    if (type === 1313821514) {
      check(json === null && offset === 20, "JSON must be the first and only JSON chunk");
      try {
        json = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes.subarray(offset, offset + size)));
      } catch {
        throw new SDKError("MODEL_PARSE", "Invalid GLB JSON");
      }
    } else if (type === 5130562) {
      check(json !== null && bin === null, "One BIN chunk required");
      bin = bytes.subarray(offset, offset + size);
    } else check(false, "Unsupported GLB chunk");
    offset += size;
  }
  check(json?.asset?.version === "2.0" && bin, "GLB 2 JSON and BIN required");
  check(!json.extensionsUsed?.length && !json.extensionsRequired?.length, "Extensions are unsupported");
  check(!json.animations?.length && !json.skins?.length && !json.cameras?.length, "Animations, skins and cameras are unsupported");
  if (!hierarchy && (json.images?.length || json.textures?.length)) check(false, "Images and textures require the hierarchy opt-in");
  check(json.buffers?.length === 1 && !json.buffers[0].uri && Number.isSafeInteger(json.buffers[0].byteLength) && json.buffers[0].byteLength > 0 && json.buffers[0].byteLength <= bin.length && bin.length - json.buffers[0].byteLength <= 3, "Exactly one embedded buffer required");
  check((json.images?.length ?? 0) <= 16 && (json.textures?.length ?? 0) <= 16 && (json.samplers?.length ?? 0) <= 16 && (json.materials?.length ?? 0) <= 64, "Bounded image/texture/material counts required");
  const bufferTotal = json.buffers[0]?.byteLength ?? 0, bufferBytes = () => bin;
  let instances = [];
  if (!hierarchy) {
    check(json.scenes?.length === 1 && json.scenes[0].nodes?.length === 1 && json.nodes?.length === 1 && json.meshes?.length === 1, "Exactly one scene, node and mesh supported");
    const node = json.nodes[json.scenes[0].nodes[0]];
    check(node && node.mesh === 0 && !node.children?.length && !node.matrix && !node.translation && !node.rotation && !node.scale && !node.skin && !node.weights && !node.extensions, "Bake node transforms before import");
    instances = json.meshes[0].primitives;
  } else {
    check(json.scenes?.length === 1 && Array.isArray(json.scenes[0].nodes) && json.nodes?.length <= 64 && json.meshes?.length <= 64, "Bounded static scene required");
    const identity = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1], seen = /* @__PURE__ */ new Set(), multiply = (a, b) => a.map((_, i) => {
      const r = Math.floor(i / 4), c = i % 4;
      return [0, 1, 2, 3].reduce((n, k) => n + a[r * 4 + k] * b[k * 4 + c], 0);
    });
    const walk = (index, parent, depth) => {
      check(Number.isInteger(index) && index >= 0 && index < json.nodes.length && !seen.has(index) && depth <= 16, "Invalid/cyclic node hierarchy");
      seen.add(index);
      const n = json.nodes[index];
      check(!n.matrix && !n.skin && !n.weights && !n.extensions, "Only static TRS nodes supported");
      const t = n.translation ?? [0, 0, 0], q = n.rotation ?? [0, 0, 0, 1], scale = n.scale ?? [1, 1, 1];
      check(t.length === 3 && t.every(Number.isFinite) && q.length === 4 && q.every(Number.isFinite) && Math.abs(Math.hypot(...q) - 1) < 1e-3 && scale.length === 3 && scale.every((x2) => Number.isFinite(x2) && x2 > 0 && x2 <= 100), "Invalid TRS");
      const [x, y, z, w] = q, [sx, sy, sz] = scale;
      const m = multiply(parent, [(1 - 2 * y * y - 2 * z * z) * sx, (2 * x * y - 2 * z * w) * sy, (2 * x * z + 2 * y * w) * sz, t[0], (2 * x * y + 2 * z * w) * sx, (1 - 2 * x * x - 2 * z * z) * sy, (2 * y * z - 2 * x * w) * sz, t[1], (2 * x * z - 2 * y * w) * sx, (2 * y * z + 2 * x * w) * sy, (1 - 2 * x * x - 2 * y * y) * sz, t[2], 0, 0, 0, 1]);
      if (n.mesh !== void 0) {
        check(Number.isInteger(n.mesh) && json.meshes[n.mesh] && Array.isArray(json.meshes[n.mesh].primitives), "Invalid mesh reference");
        for (const part of json.meshes[n.mesh].primitives) instances.push({ ...part, bakedMatrix: m });
      }
      for (const child of n.children ?? []) walk(child, m, depth + 1);
    };
    for (const root of json.scenes[0].nodes) walk(root, identity, 0);
  }
  const access = (index, components, indexed = false) => {
    const a = json.accessors?.[index];
    const typeFor = { 1: "SCALAR", 2: "VEC2", 3: "VEC3" }[components];
    check(a && !a.sparse && !a.normalized && a.type === typeFor && Number.isSafeInteger(a.count) && a.count > 0 && a.count <= 3e4, "Invalid or unsupported accessor");
    const bv = json.bufferViews?.[a.bufferView], width = { 5123: 2, 5125: 4, 5126: 4 }[a.componentType];
    check(width && (indexed ? [5123, 5125].includes(a.componentType) : a.componentType === 5126) && bv && bv.buffer === 0 && !bv.byteStride && !bv.extensions, "Only tightly packed float attributes / uint16 or uint32 indices supported");
    const start = bv.byteOffset ?? 0, length = bv.byteLength, local = a.byteOffset ?? 0;
    check([start, length, local].every(Number.isSafeInteger) && start >= 0 && local >= 0 && length > 0 && start + length <= json.buffers[0].byteLength && local + a.count * components * width <= length && (start + local) % width === 0, "Accessor exceeds buffer bounds");
    const d = new DataView(bin.buffer, bin.byteOffset + start + local, a.count * components * width), values = [];
    for (let i = 0; i < a.count * components; i++) {
      const n = a.componentType === 5126 ? d.getFloat32(i * width, true) : width === 2 ? d.getUint16(i * width, true) : d.getUint32(i * width, true);
      check(Number.isFinite(n) && Math.abs(n) <= 1e5, "Nonfinite or unbounded model value");
      values.push(n);
    }
    return values;
  };
  const images = [];
  for (let i = 0; i < (json.images?.length ?? 0); i++) {
    const img = json.images?.[i];
    check(img && !img.uri && Number.isInteger(img.bufferView), "Only embedded images supported");
    const bv = json.bufferViews?.[img.bufferView];
    check(bv && bv.buffer === 0 && !bv.extensions, "Invalid image buffer view");
    const start = bv.byteOffset ?? 0, length = bv.byteLength;
    check(Number.isSafeInteger(start) && Number.isSafeInteger(length) && start >= 0 && length > 0 && length <= 1048576 && start + length <= bin.length, "Image exceeds bounds or 1 MiB limit");
    const raw = bin.subarray(start, start + length);
    check(i === 0 || i > 0, "embedded image present");
    const mime = img.mimeType ?? detectImageMime(raw);
    check(mime === "image/png" || mime === "image/jpeg", "Only PNG/JPEG images supported");
    if (images.reduce((n, x) => n + x.size, 0) + raw.length > 4194304) check(false, "Total embedded image size exceeds 4 MiB");
    images.push({ mimeType: mime, size: raw.length, bytes: raw });
  }
  const samplerOK = (s) => s === void 0 || (s?.wrapS == null || [33071, 33648, 10497].includes(s.wrapS)) && (s?.wrapT == null || [33071, 33648, 10497].includes(s.wrapT));
  const textures = [];
  for (let i = 0; i < (json.textures?.length ?? 0); i++) {
    const t = json.textures?.[i];
    check(t && Number.isInteger(t.source) && t.source < images.length && !t.extensions, "Invalid texture reference");
    textures.push({ source: t.source, sampler: t.sampler === void 0 ? null : t.sampler });
    check(t.sampler === void 0 || samplerOK(json.samplers?.[t.sampler]), "Unsupported sampler");
  }
  const resolveTexture = (ref) => {
    if (ref === void 0) return null;
    check(Number.isInteger(ref.index) && ref.index < textures.length, "Invalid baseColor/normal texture index");
    return textures[ref.index].source;
  };
  const primitives = instances;
  check(Array.isArray(primitives) && primitives.length > 0 && primitives.length <= (hierarchy ? 64 : 16), "1\u201316 primitives required");
  let vertices = 0;
  const parts = primitives.map((p) => {
    check((p.mode ?? 4) === 4 && !p.targets && !p.extensions && p.attributes && Object.keys(p.attributes).every((k) => ["POSITION", "NORMAL", "TEXCOORD_0"].includes(k)), "Only static triangle POSITION/NORMAL/TEXCOORD_0 attributes supported");
    let positions = access(p.attributes.POSITION, 3), normals = p.attributes.NORMAL === void 0 ? null : access(p.attributes.NORMAL, 3);
    let texcoords = p.attributes.TEXCOORD_0 === void 0 ? null : access(p.attributes.TEXCOORD_0, 2);
    check(!normals || normals.length === positions.length, "Normal count mismatch");
    if (texcoords) {
      check(texcoords.length === positions.length / 3 * 2 && texcoords.every((n, i) => i % 2 === 1 || n >= 0 && n <= 1), "Invalid texture coordinates");
      check(texcoords.every((n, i) => i % 2 === 0 || n >= 0 && n <= 1), "Invalid texture coordinates");
    }
    if (p.bakedMatrix) {
      const m2 = p.bakedMatrix;
      positions = positions.map((_, i) => {
        const row = i % 3, at = i - row;
        return m2[row * 4] * positions[at] + m2[row * 4 + 1] * positions[at + 1] + m2[row * 4 + 2] * positions[at + 2] + m2[row * 4 + 3];
      });
      check(positions.every((n) => Number.isFinite(n) && Math.abs(n) <= 1e5), "Baked geometry bounds");
      normals = null;
    }
    vertices += positions.length / 3;
    check(vertices <= 3e4, "30,000 vertex limit");
    const indices = p.indices === void 0 ? null : access(p.indices, 1, true);
    check(indices ? indices.length % 3 === 0 && indices.every((n) => n < positions.length / 3) : positions.length % 9 === 0, "Invalid triangle indices");
    const m = p.material === void 0 ? {} : json.materials?.[p.material];
    check(m && Object.keys(m).every((k) => ["name", "pbrMetallicRoughness", "doubleSided", "alphaMode", "alphaCutoff"].includes(k)), "Unsupported material");
    const pbr = m.pbrMetallicRoughness ?? {};
    check(Object.keys(pbr).every((k) => ["baseColorFactor", "metallicFactor", "roughnessFactor", "baseColorTexture", "normalTexture"].includes(k)), "Texture or custom material unsupported");
    const color = pbr.baseColorFactor ?? [1, 1, 1, 1];
    check(Array.isArray(color) && color.length === 4 && color.every((n) => Number.isFinite(n) && n >= 0 && n <= 1), "Invalid base color");
    const baseColorTex = resolveTexture(pbr.baseColorTexture), normalTex = resolveTexture(pbr.normalTexture);
    if (baseColorTex !== null) check(!!texcoords, "baseColorTexture requires TEXCOORD_0");
    const alphaMode = m.alphaMode ?? "OPAQUE";
    check(["OPAQUE", "BLEND", "MASK"].includes(alphaMode), "Unsupported alphaMode");
    if (alphaMode === "MASK") {
      check(color[3] < 1 || m.alphaCutoff !== void 0, "MASK requires alphaCutoff or alpha<1");
      check(m.alphaCutoff === void 0 || Number.isFinite(m.alphaCutoff) && m.alphaCutoff >= 0 && m.alphaCutoff <= 1, "Invalid alphaCutoff");
    }
    if (baseColorTex === null && alphaMode !== "OPAQUE" && color[3] === 1) check(false, "Transparency requires alpha<1 or an alpha texture");
    return { positions, normals, indices, color: color.slice(0, 3), doubleSided: !!m.doubleSided, texcoords: texcoords ?? null, map: baseColorTex, normalMap: normalTex, alphaMode, alphaCutoff: m.alphaCutoff ?? null };
  });
  return { schema: "zge.static-model.v1", sourceFormat: "glb2", sourceBytes: bytes.length, hierarchy, vertices, triangles: parts.reduce((n, p) => n + (p.indices?.length ?? p.positions.length / 3) / 3, 0), dependencies: [], images: images.map((im) => ({ mimeType: im.mimeType, size: im.size, data: base64(im.bytes) })), parts };
}
function detectImageMime(bytes) {
  if (bytes.length >= 8 && bytes[0] === 137 && bytes[1] === 80 && bytes[2] === 78 && bytes[3] === 71) return "image/png";
  if (bytes.length >= 3 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) return "image/jpeg";
  return "";
}
function base64(bytes) {
  let s = "";
  for (let i = 0; i < bytes.length; i += 32768) s += String.fromCharCode(...bytes.subarray(i, i + 32768));
  return btoa(s);
}
function validateModel(data) {
  check(data?.schema === "zge.static-model.v1" && data.sourceFormat === "glb2" && Number.isSafeInteger(data.sourceBytes) && data.sourceBytes >= 28 && data.sourceBytes <= 524288 && Array.isArray(data.dependencies) && data.dependencies.length === 0 && (!data.sourceSha256 || /^[a-f0-9]{64}$/.test(data.sourceSha256)) && Array.isArray(data.parts) && data.parts.length > 0 && data.parts.length <= 64, "Invalid static model");
  let vertices = 0;
  const images = data.images ?? [];
  check(Array.isArray(images) && images.length <= 16 && images.every((im) => im && typeof im.mimeType === "string" && Number.isInteger(im.size) && im.size > 0 && im.size <= 1048576 && typeof im.data === "string" && im.data.length > 0 && im.data.length <= 1398102 && /^[A-Za-z0-9+/]*={0,2}$/.test(im.data) && im.data.length % 4 === 0), "Invalid embedded images");
  for (const p of data.parts) {
    check(Array.isArray(p.positions) && p.positions.length > 0 && p.positions.length % 3 === 0 && p.positions.every((n) => Number.isFinite(n) && Math.abs(n) <= 1e5), "Invalid positions");
    vertices += p.positions.length / 3;
    check(vertices <= 3e4, "30,000 vertex limit");
    check(p.normals === null || Array.isArray(p.normals) && p.normals.length === p.positions.length && p.normals.every(Number.isFinite), "Invalid normals");
    check(p.indices === null ? p.positions.length % 9 === 0 : Array.isArray(p.indices) && p.indices.length <= 9e4 && p.indices.length % 3 === 0 && p.indices.every((n) => Number.isSafeInteger(n) && n >= 0 && n < p.positions.length / 3), "Invalid indices");
    check(Array.isArray(p.color) && p.color.length === 3 && p.color.every((n) => Number.isFinite(n) && n >= 0 && n <= 1) && typeof p.doubleSided === "boolean", "Invalid color");
    check(p.texcoords === null || p.texcoords === void 0 || Array.isArray(p.texcoords) && p.texcoords.length === p.positions.length / 3 * 2 && p.texcoords.every((n) => Number.isFinite(n) && n >= 0 && n <= 1), "Invalid texture coordinates");
    const mapOK = (v) => v === null || v === void 0 || Number.isInteger(v) && v >= 0 && v < images.length;
    check(mapOK(p.map) && mapOK(p.normalMap), "Invalid texture reference");
    const alphaMode = p.alphaMode ?? "OPAQUE";
    check(["OPAQUE", "BLEND", "MASK"].includes(alphaMode), "Invalid alphaMode");
    check(p.alphaCutoff === null || p.alphaCutoff === void 0 || Number.isFinite(p.alphaCutoff) && p.alphaCutoff >= 0 && p.alphaCutoff <= 1, "Invalid alphaCutoff");
  }
  check(data.vertices === vertices && data.triangles === data.parts.reduce((n, p) => n + (p.indices?.length ?? p.positions.length / 3) / 3, 0), "Geometry summary mismatch");
  return data;
}

// packages/sdk/src/trusted-model.js
var TRUSTED_MODEL_SCHEMA = "zge.trusted-model.v1";
var KNOWN_EXTENSIONS = Object.freeze({
  EXT_meshopt_compression: "meshopt",
  KHR_mesh_quantization: null,
  // handled natively by three once quantized attributes are allowed
  EXT_texture_webp: "webp",
  // browser-native decode
  KHR_texture_basisu: "ktx2",
  KHR_materials_ior: null,
  KHR_materials_specular: null,
  KHR_texture_transform: null
});
var check2 = (ok, message) => {
  if (!ok) throw new SDKError("MODEL_FORMAT", message);
};
function readGLBHeader(input) {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  check2(bytes.byteLength >= 20, "GLB too small for a header");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  check2(view.getUint32(0, true) === 1179937895, "Not a GLB (bad magic)");
  check2(view.getUint32(4, true) === 2, "Only GLB container version 2 is supported");
  check2(view.getUint32(8, true) === bytes.length, "GLB length field does not match the file");
  const jsonLength = view.getUint32(12, true);
  check2(view.getUint32(16, true) === 1313821514, "First chunk must be JSON");
  check2(jsonLength > 0 && 20 + jsonLength <= bytes.length, "JSON chunk exceeds the file");
  try {
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes.subarray(20, 20 + jsonLength)));
  } catch {
    throw new SDKError("MODEL_PARSE", "Invalid GLB JSON chunk");
  }
}
async function sha256Hex(bytes) {
  const digest = await crypto.subtle.digest("SHA-256", bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes));
  return [...new Uint8Array(digest)].map((v) => v.toString(16).padStart(2, "0")).join("");
}
async function describeTrustedModel({ path, bytes, maxBytes = 16 * 1024 * 1024 } = {}) {
  check2(
    typeof path === "string" && path.length > 0 && !path.includes("\\") && !path.startsWith("/") && path.split("/").every((part) => part && part !== "." && part !== "..") && !/[:\x00-\x1f]/.test(path),
    "Trusted model needs a relative, traversal-free path"
  );
  const data = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  check2(data.byteLength > 0 && data.byteLength <= maxBytes, `GLB exceeds the ${Math.round(maxBytes / 1048576)} MiB trusted ceiling`);
  const json = readGLBHeader(data);
  check2(json?.asset?.version === "2.0", "glTF asset version 2.0 required");
  const used = json.extensionsUsed ?? [];
  const required = json.extensionsRequired ?? [];
  check2(required.every((name) => used.includes(name)), "extensionsRequired must be listed in extensionsUsed");
  const unknown = used.filter((name) => !(name in KNOWN_EXTENSIONS));
  const decoders = [...new Set(used.map((name) => KNOWN_EXTENSIONS[name]).filter(Boolean))].sort();
  const attributes = /* @__PURE__ */ new Set();
  let primitives = 0;
  for (const mesh of json.meshes ?? []) for (const part of mesh.primitives ?? []) {
    primitives += 1;
    for (const key of Object.keys(part.attributes ?? {})) attributes.add(key);
  }
  const positionAccessors = /* @__PURE__ */ new Set();
  for (const mesh of json.meshes ?? []) for (const part of mesh.primitives ?? []) {
    if (Number.isInteger(part.attributes?.POSITION)) positionAccessors.add(part.attributes.POSITION);
  }
  const vertices = [...positionAccessors].reduce((n, i) => n + (json.accessors?.[i]?.count ?? 0), 0);
  const meshCount = (json.meshes ?? []).length;
  const clipCount = (json.animations ?? []).length;
  const kind = meshCount > 0 ? "geometry" : clipCount > 0 ? "animation" : "empty";
  check2(kind !== "empty", "GLB has neither meshes nor animations");
  return Object.freeze({
    schema: TRUSTED_MODEL_SCHEMA,
    path,
    kind,
    sourceFormat: "glb2",
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
    vertices
  });
}
function validateTrustedModel(data) {
  check2(data?.schema === TRUSTED_MODEL_SCHEMA && data.sourceFormat === "glb2", "Invalid trusted model");
  check2(typeof data.path === "string" && data.path.length > 0, "Trusted model path required");
  check2(Number.isSafeInteger(data.sourceBytes) && data.sourceBytes > 0, "Invalid source size");
  check2(/^[a-f0-9]{64}$/.test(data.sourceSha256 ?? ""), "sha256 custody required for a trusted model");
  for (const key of ["extensions", "extensionsRequired", "unknownExtensions", "requiresDecoders", "animations", "attributes"]) {
    check2(Array.isArray(data[key]) && data[key].every((v) => typeof v === "string"), `Invalid ${key}`);
  }
  for (const key of ["skins", "nodes", "meshes", "primitives", "materials", "images", "textures", "vertices"]) {
    check2(Number.isSafeInteger(data[key]) && data[key] >= 0, `Invalid ${key}`);
  }
  check2(typeof data.skinned === "boolean" && typeof data.textured === "boolean", "Invalid skinned/textured flags");
  check2(data.skinned === data.skins > 0, "skinned flag disagrees with skin count");
  check2(["geometry", "animation"].includes(data.kind), "Invalid trusted model kind");
  check2(
    data.kind === "geometry" ? data.meshes > 0 : data.meshes === 0 && data.animations.length > 0,
    "kind disagrees with mesh and clip counts"
  );
  return data;
}
function requiredDecoders(manifests) {
  return [...new Set(manifests.flatMap((m) => m.requiresDecoders ?? []))].sort();
}

// packages/sdk/src/rules.js
function validateRules(rules) {
  const id = (v) => typeof v === "string" && /^[a-zA-Z0-9_.:-]{1,100}$/.test(v), num = (v, min, max) => Number.isFinite(v) && v >= min && v <= max;
  if (!Array.isArray(rules) || rules.length > 64) throw Error("At most64 rules required");
  const ids = /* @__PURE__ */ new Set();
  for (const r of rules) {
    if (!r || !id(r.id) || ids.has(r.id) || !id(r.entity) || !["move", "collect", "goal", "build", "interact"].includes(r.kind)) throw Error("Invalid/unsupported rule");
    ids.add(r.id);
    if (r.kind === "move" && (!num(r.speed, 0.01, 100) || r.bounds !== void 0 && (!Array.isArray(r.bounds) || r.bounds.length !== 4 || !r.bounds.every(Number.isFinite) || r.bounds[0] >= r.bounds[1] || r.bounds[2] >= r.bounds[3]))) throw Error("Invalid movement rule");
    if (r.kind === "collect" && (![r.target, r.component, r.counter].every(id) || !num(r.radius, 0.01, 100))) throw Error("Invalid collection rule");
    if (r.kind === "goal" && (![r.component, r.property, r.sourceEntity, r.sourceComponent, r.counter].every(id) || !num(r.threshold, 0, 1e5))) throw Error("Invalid objective rule");
    if (["build", "interact"].includes(r.kind) && (![r.target, r.component, r.counter, r.property].every(id) || !["e", "b"].includes(r.key) || !num(r.radius, 0.01, 100) || !num(r.cost, 0, 1e4) || !id(r.sourceEntity) || !id(r.sourceComponent))) throw Error("Invalid interaction rule");
    if (r.kind === "build" && !id(r.prefab)) throw Error("Prefab required");
  }
  return rules;
}
function installProjectRules(engine, input = /* @__PURE__ */ new Set(), orientation = null) {
  const rules = engine.world?.serialize().rules ?? engine.exportProject().rules ?? [];
  validateRules(rules);
  if (!rules.length) return () => {
  };
  const held = /* @__PURE__ */ new Set();
  const basis = () => {
    if (orientation?.getMovementBasis) {
      const b = orientation.getMovementBasis();
      if (b && Number.isFinite(b.forward?.[0])) return b;
    }
    if (orientation && Array.isArray(orientation.forward) && Number.isFinite(orientation.forward[0]) && Array.isArray(orientation.right)) return { forward: orientation.forward.slice(0, 2), right: orientation.right.slice(0, 2) };
    return { forward: [0, 0, 1], right: [1, 0, 0] };
  };
  return engine.registerSystem({ id: "project:data-rules", run(scene, dt, { events }) {
    const edge = new Set([...input].filter((k) => !held.has(k)));
    held.clear();
    for (const k of input) held.add(k);
    for (const r of rules) {
      const entity = scene.findEntity(r.entity);
      if (!entity) continue;
      let outcome = null;
      if (r.kind === "move") {
        const t = entity.components.transform;
        if (!t) continue;
        let fwd = +(input.has("w") || input.has("ArrowUp")) - +(input.has("s") || input.has("ArrowDown")), strafe = +(input.has("d") || input.has("ArrowRight")) - +(input.has("a") || input.has("ArrowLeft"));
        if (fwd || strafe) {
          const b = basis();
          const l = Math.hypot(fwd, strafe) || 1;
          fwd /= l;
          strafe /= l;
          let x = (b.forward[0] * fwd + b.right[0] * strafe) * dt * r.speed, z = (b.forward[1] * fwd + b.right[1] * strafe) * dt * r.speed;
          if (x || z) {
            const p = [t.position[0] + x, t.position[1], t.position[2] + z], bnd = r.bounds;
            const blocked = bnd && (p[0] < bnd[0] || p[0] > bnd[1] || p[2] < bnd[2] || p[2] > bnd[3]) || scene.entities().some((e) => e.id !== entity.id && e.components.collider && e.components.transform && [0, 2].every((i) => Math.abs(p[i] - e.components.transform.position[i]) < e.components.collider.halfSize[i] * e.components.transform.scale[i] + 0.25));
            if (!blocked) scene.updateTransform(entity.id, { position: p });
          }
        }
      } else if (r.kind === "collect") {
        const target = scene.findEntity(r.target), a = entity.components.transform, b = target?.components.transform, c = entity.components[r.component];
        if (a && b && c && Math.hypot(...a.position.map((v, i) => v - b.position[i])) <= r.radius) {
          scene.commit(scene.changeset([{ type: "DeleteEntity", id: target.id, expectedExists: true }, { type: "UpdateComponent", id: entity.id, component: r.component, expectedExists: true, value: { ...c, [r.counter]: (c[r.counter] ?? 0) + 1 } }]));
          outcome = "collected";
        }
      } else if (r.kind === "goal") {
        const source = scene.findEntity(r.sourceEntity)?.components[r.sourceComponent], c = entity.components[r.component];
        if (c && !c[r.property] && source?.[r.counter] >= r.threshold) {
          scene.setComponent(entity.id, r.component, { ...c, [r.property]: true });
          outcome = "complete";
        }
      } else if (edge.has(r.key)) {
        const source = scene.findEntity(r.sourceEntity), target = scene.findEntity(r.target), a = source?.components.transform, b = target?.components.transform, c = source?.components[r.sourceComponent], state = entity.components[r.component];
        if (!a || !b || !c || !state || state[r.property]) continue;
        if (Math.hypot(...a.position.map((v, i) => v - b.position[i])) > r.radius || c[r.counter] < r.cost) {
          outcome = "condition-not-met";
        } else {
          const operations = [];
          if (r.kind === "build") operations.push({ type: "CreatePrefabInstance", prefab: r.prefab, id: "entity-" + scene.serialize().nextId, expectedExists: false, transform: { position: [...b.position] } });
          operations.push({ type: "UpdateComponent", id: entity.id, component: r.component, expectedExists: true, value: { ...state, [r.property]: true } });
          if (r.kind === "build" && r.cost && source.id === entity.id && r.sourceComponent === r.component) {
            operations[operations.length - 1].value = { ...c, [r.counter]: c[r.counter] - r.cost, [r.property]: true };
          } else if (r.kind === "build" && r.cost) operations.push({ type: "UpdateComponent", id: source.id, component: r.sourceComponent, expectedExists: true, value: { ...c, [r.counter]: c[r.counter] - r.cost } });
          scene.commit(scene.changeset(operations));
          outcome = r.kind === "build" ? "built" : "activated";
        }
      }
      if (outcome) events.emit("game:rule", { entity: entity.id, rule: r.id, kind: r.kind, outcome });
    }
  } });
}

// packages/sdk/src/movement.js
var MOVEMENT_SCHEMA = "zge.movement.v1";
var EVASION_SCHEMA = "zge.evasion.v1";
var MOVEMENT_AUTHORITY = Object.freeze({
  plugin: "movement",
  clientAuthoritative: Object.freeze(["position", "velocity", "facing", "grounded", "jump", "dash-motion"]),
  serverValidated: Object.freeze(["damage-negation"]),
  claims: Object.freeze([EVASION_SCHEMA]),
  note: "The client owns where it is. It does not own whether it was hit."
});
var DEFAULT_MOVEMENT = Object.freeze({
  schema: MOVEMENT_SCHEMA,
  speed: 6,
  // m/s on the ground
  acceleration: 60,
  // reaches full speed in ~0.1 s — weight without sludge
  deceleration: 90,
  // and stops crisply; AC10 requires it reach exactly zero
  airControl: 0.45,
  // Returnal lets you steer in the air; it does not let you fly
  gravity: 24,
  // heavier than earth: landings read as landings
  jumpVelocity: 8.5,
  maxJumps: 2,
  // ground jump + one air jump
  groundY: 0,
  restEpsilon: 1e-6,
  // below this, velocity snaps to zero rather than decaying forever
  dash: Object.freeze({
    speed: 26,
    durationMs: 180,
    cooldownMs: 900,
    invulnerableMs: 140,
    // strictly inside the dash: the tail is committed but vulnerable
    airDashes: 1
  })
});
var check3 = (ok, message) => {
  if (!ok) throw new SDKError("MOVEMENT_CONFIG", message);
};
var finite = (v) => Number.isFinite(v);
function validateMovementConfig(config) {
  const c = { ...DEFAULT_MOVEMENT, ...config, dash: { ...DEFAULT_MOVEMENT.dash, ...config?.dash ?? {} } };
  check3(c.schema === MOVEMENT_SCHEMA, "Invalid movement schema");
  for (const key of ["speed", "acceleration", "deceleration", "gravity", "jumpVelocity"]) {
    check3(finite(c[key]) && c[key] > 0 && c[key] <= 1e3, `movement.${key} must be > 0 and <= 1000`);
  }
  check3(finite(c.airControl) && c.airControl >= 0 && c.airControl <= 1, "movement.airControl must be 0..1");
  check3(Number.isInteger(c.maxJumps) && c.maxJumps >= 1 && c.maxJumps <= 8, "movement.maxJumps must be 1..8");
  check3(finite(c.groundY), "movement.groundY must be finite");
  check3(finite(c.restEpsilon) && c.restEpsilon > 0 && c.restEpsilon < 1, "movement.restEpsilon must be a small positive number");
  check3(finite(c.dash.speed) && c.dash.speed > 0 && c.dash.speed <= 1e3, "dash.speed must be > 0");
  for (const key of ["durationMs", "cooldownMs", "invulnerableMs"]) {
    check3(finite(c.dash[key]) && c.dash[key] >= 0 && c.dash[key] <= 6e4, `dash.${key} must be 0..60000`);
  }
  check3(c.dash.invulnerableMs <= c.dash.durationMs, "dash.invulnerableMs cannot outlast the dash itself");
  check3(c.dash.cooldownMs >= c.dash.durationMs, "dash.cooldownMs must be at least the dash duration");
  check3(Number.isInteger(c.dash.airDashes) && c.dash.airDashes >= 0 && c.dash.airDashes <= 8, "dash.airDashes must be 0..8");
  return Object.freeze({ ...c, dash: Object.freeze({ ...c.dash }) });
}
function createMovementState({ x = 0, y = 0, z = 0, config = DEFAULT_MOVEMENT } = {}) {
  const c = validateMovementConfig(config);
  return {
    x,
    y: Math.max(y, c.groundY),
    z,
    vx: 0,
    vy: 0,
    vz: 0,
    facingX: 0,
    facingZ: 1,
    grounded: y <= c.groundY,
    jumpsUsed: 0,
    airDashesUsed: 0,
    dashUntilMs: -Infinity,
    dashReadyAtMs: -Infinity,
    dashDirX: 0,
    dashDirZ: 0,
    timeMs: 0,
    sequence: 0,
    evasionSequence: 0,
    lastEvasion: null
  };
}
var DEFAULT_BASIS = Object.freeze({ forward: [0, 1], right: [1, 0] });
function stepMovement(state, input, dtSeconds, config = DEFAULT_MOVEMENT) {
  const c = config.schema === MOVEMENT_SCHEMA && Object.isFrozen(config) ? config : validateMovementConfig(config);
  check3(finite(dtSeconds) && dtSeconds > 0 && dtSeconds <= 1, "dt must be a positive number of seconds <= 1");
  const s = { ...state };
  const events = [];
  const basis = input?.basis ?? DEFAULT_BASIS;
  const dtMs = dtSeconds * 1e3;
  s.timeMs += dtMs;
  s.sequence += 1;
  let forward = Math.max(-1, Math.min(1, Number(input?.forward ?? 0)));
  let strafe = Math.max(-1, Math.min(1, Number(input?.strafe ?? 0)));
  const magnitude = Math.hypot(forward, strafe);
  if (magnitude > 1) {
    forward /= magnitude;
    strafe /= magnitude;
  }
  const wishX = basis.forward[0] * forward + basis.right[0] * strafe;
  const wishZ = basis.forward[1] * forward + basis.right[1] * strafe;
  const wishLength = Math.hypot(wishX, wishZ);
  const dashing = s.timeMs < s.dashUntilMs;
  if (input?.dash && !dashing && s.timeMs >= s.dashReadyAtMs && (s.grounded || s.airDashesUsed < c.dash.airDashes)) {
    const dirX = wishLength > 0 ? wishX / wishLength : s.facingX;
    const dirZ = wishLength > 0 ? wishZ / wishLength : s.facingZ;
    s.dashDirX = dirX;
    s.dashDirZ = dirZ;
    s.dashUntilMs = s.timeMs + c.dash.durationMs;
    s.dashReadyAtMs = s.timeMs + c.dash.cooldownMs;
    if (!s.grounded) s.airDashesUsed += 1;
    s.evasionSequence += 1;
    const evasion = Object.freeze({
      schema: EVASION_SCHEMA,
      sequence: s.evasionSequence,
      inputSequence: s.sequence,
      startedAtMs: s.timeMs,
      endsAtMs: s.timeMs + c.dash.invulnerableMs,
      durationMs: c.dash.invulnerableMs,
      earliestNextMs: s.timeMs + c.dash.cooldownMs,
      authority: "client-feel",
      claim: "damage-negation"
    });
    s.lastEvasion = evasion;
    events.push({ type: "movement:dash", direction: [dirX, dirZ], evasion });
    events.push({ type: "movement:evasion-window", evasion });
  }
  if (input?.jump && s.jumpsUsed < c.maxJumps) {
    s.vy = c.jumpVelocity;
    s.jumpsUsed += 1;
    s.grounded = false;
    events.push({ type: "movement:jump", ordinal: s.jumpsUsed, double: s.jumpsUsed > 1 });
  }
  if (s.timeMs < s.dashUntilMs) {
    s.vx = s.dashDirX * c.dash.speed;
    s.vz = s.dashDirZ * c.dash.speed;
  } else {
    const control = s.grounded ? 1 : c.airControl;
    const targetX = wishLength > 0 ? wishX / Math.max(wishLength, 1) * c.speed : 0;
    const targetZ = wishLength > 0 ? wishZ / Math.max(wishLength, 1) * c.speed : 0;
    const rate = (wishLength > 0 ? c.acceleration : c.deceleration) * control * dtSeconds;
    for (const [axis, target] of [["vx", targetX], ["vz", targetZ]]) {
      const delta = target - s[axis];
      s[axis] = Math.abs(delta) <= rate ? target : s[axis] + Math.sign(delta) * rate;
    }
    if (wishLength === 0 && Math.hypot(s.vx, s.vz) < c.restEpsilon) {
      s.vx = 0;
      s.vz = 0;
    }
  }
  if (wishLength > 0) {
    s.facingX = wishX / wishLength;
    s.facingZ = wishZ / wishLength;
  }
  s.vy -= c.gravity * dtSeconds;
  s.x += s.vx * dtSeconds;
  s.y += s.vy * dtSeconds;
  s.z += s.vz * dtSeconds;
  if (s.y <= c.groundY) {
    const wasAirborne = !s.grounded;
    s.y = c.groundY;
    s.vy = 0;
    s.grounded = true;
    s.jumpsUsed = 0;
    s.airDashesUsed = 0;
    if (wasAirborne) events.push({ type: "movement:land", at: [s.x, s.y, s.z] });
  } else s.grounded = false;
  return {
    state: s,
    events,
    dashing: s.timeMs < s.dashUntilMs,
    invulnerable: !!s.lastEvasion && s.timeMs < s.lastEvasion.endsAtMs
  };
}
function validateEvasionWindow(window, { config = DEFAULT_MOVEMENT, previous = null, nowMs = null, toleranceMs = 50 } = {}) {
  const c = config.schema === MOVEMENT_SCHEMA && Object.isFrozen(config) ? config : validateMovementConfig(config);
  const fail2 = (reason, detail = {}) => ({ ok: false, reason, ...detail });
  if (!window || window.schema !== EVASION_SCHEMA) return fail2("schema");
  if (window.claim !== "damage-negation" || window.authority !== "client-feel") return fail2("claim");
  for (const key of ["sequence", "inputSequence"]) {
    if (!Number.isSafeInteger(window[key]) || window[key] < 1) return fail2("sequence-shape", { key });
  }
  for (const key of ["startedAtMs", "endsAtMs", "durationMs", "earliestNextMs"]) {
    if (!finite(window[key]) || window[key] < 0) return fail2("timestamp-shape", { key });
  }
  const EPSILON_MS = 1e-6;
  const off = (actual, expected) => Math.abs(actual - expected) > EPSILON_MS;
  if (off(window.durationMs, c.dash.invulnerableMs)) return fail2("duration-not-configured", { declared: window.durationMs, expected: c.dash.invulnerableMs });
  if (off(window.endsAtMs - window.startedAtMs, window.durationMs)) return fail2("window-inconsistent");
  if (off(window.earliestNextMs - window.startedAtMs, c.dash.cooldownMs)) return fail2("cooldown-not-configured", { declared: window.earliestNextMs - window.startedAtMs, expected: c.dash.cooldownMs });
  if (previous) {
    if (window.sequence !== previous.sequence + 1) return fail2("sequence-gap", { expected: previous.sequence + 1, got: window.sequence });
    if (window.startedAtMs < previous.earliestNextMs) return fail2("cooldown-violated", { earliest: previous.earliestNextMs, got: window.startedAtMs });
  } else if (window.sequence !== 1) return fail2("sequence-gap", { expected: 1, got: window.sequence });
  if (nowMs !== null && window.startedAtMs > nowMs + toleranceMs) return fail2("future-dated", { nowMs, startedAtMs: window.startedAtMs });
  return { ok: true, reason: null, coversMs: [window.startedAtMs, window.endsAtMs] };
}
function evasionCovers(window, atMs) {
  return !!window && finite(atMs) && atMs >= window.startedAtMs && atMs < window.endsAtMs;
}
function installMovement(engine, { entity = "player", input = /* @__PURE__ */ new Set(), orientation = null, config = DEFAULT_MOVEMENT, keys = {} } = {}) {
  const c = validateMovementConfig(config);
  const bind = {
    forward: ["w", "ArrowUp"],
    back: ["s", "ArrowDown"],
    left: ["a", "ArrowLeft"],
    right: ["d", "ArrowRight"],
    jump: [" ", "Spacebar"],
    dash: ["Shift", "shift"],
    ...keys
  };
  const held = /* @__PURE__ */ new Set();
  let state = null;
  const basis = () => {
    const b = orientation?.getMovementBasis?.() ?? orientation;
    return Array.isArray(b?.forward) && finite(b.forward[0]) ? { forward: b.forward.slice(0, 2), right: b.right.slice(0, 2) } : DEFAULT_BASIS;
  };
  const down = (names) => names.some((k) => input.has(k));
  const remove = engine.registerSystem({ id: "movement", phase: "simulate", run(scene, dt, { events }) {
    const target = scene?.findEntity?.(entity);
    if (!target?.components?.transform) return;
    if (!state) {
      const [x, y, z] = target.components.transform.position;
      state = createMovementState({ x, y, z, config: c });
    }
    const edge = (names) => names.some((k) => input.has(k) && !held.has(k));
    const frame = {
      forward: (down(bind.forward) ? 1 : 0) - (down(bind.back) ? 1 : 0),
      strafe: (down(bind.right) ? 1 : 0) - (down(bind.left) ? 1 : 0),
      jump: edge(bind.jump),
      dash: edge(bind.dash),
      basis: basis()
    };
    held.clear();
    for (const k of input) held.add(k);
    const result = stepMovement(state, frame, dt, c);
    state = result.state;
    const [px, py, pz] = target.components.transform.position;
    if (px !== state.x || py !== state.y || pz !== state.z) scene.updateTransform(entity, { position: [state.x, state.y, state.z] });
    for (const event of result.events) events?.emit?.("game:movement", event);
    return result;
  } });
  return {
    config: c,
    authority: MOVEMENT_AUTHORITY,
    get state() {
      return state ? { ...state } : null;
    },
    get lastEvasion() {
      return state?.lastEvasion ?? null;
    },
    dispose() {
      remove?.();
      state = null;
      held.clear();
    }
  };
}

// packages/sdk/src/movement-parity.js
var MOVEMENT_PARITY_CLASSES = Object.freeze([
  "RESPONSE_LATENCY_MISMATCH",
  // frames from input to first motion
  "DISPLACEMENT_MISMATCH",
  // total ground covered over the script
  "REST_DRIFT_MISMATCH",
  // movement after the key came up
  "TRAJECTORY_DIVERGENCE",
  // worst per-sample separation
  "DIRECTION_MISMATCH",
  // ended up somewhere else entirely
  "CAPABILITY_ABSENT",
  // the rebuild has a move the bundle never had
  "EXPECTED_NORMALIZATION"
  // known, accepted difference
]);
var near = (a, b, epsilon) => Math.abs(a - b) <= epsilon;
var distance = (a, b) => Math.hypot(a.x - b.x, (a.y ?? 0) - (b.y ?? 0), a.z - b.z);
function responseFrames(samples, epsilon = 0.01) {
  if (!samples?.length) return null;
  const origin = samples[0];
  for (let i = 1; i < samples.length; i++) if (distance(samples[i], origin) > epsilon) return i;
  return null;
}
function displacement(samples) {
  if (!samples?.length) return 0;
  return Math.hypot(samples.at(-1).x - samples[0].x, samples.at(-1).z - samples[0].z);
}
function compareMovement(observation) {
  const o = observation;
  const differences = [];
  const unobservable = [...o.legacy?.unobservable ?? [], ...o.rebuilt?.unobservable ?? []];
  const add = (classification, detail) => differences.push({ classification, detail });
  const tol = { responseFrames: 2, displacementRatio: 0.35, restDrift: 1e-6, trajectory: 2.5, settleFrames: 20, ...o.tolerances ?? {} };
  const legacy = o.legacy?.samples ?? [];
  const rebuilt = o.rebuilt?.samples ?? [];
  if (!legacy.length || !rebuilt.length) {
    unobservable.push(!legacy.length ? "legacy-trajectory" : "rebuilt-trajectory");
    return report(o, differences, unobservable, tol);
  }
  const legacyResponse = responseFrames(legacy), rebuiltResponse = responseFrames(rebuilt);
  if (legacyResponse === null || rebuiltResponse === null) unobservable.push("response-latency");
  else if (Math.abs(legacyResponse - rebuiltResponse) > tol.responseFrames) {
    add("RESPONSE_LATENCY_MISMATCH", { legacyFrames: legacyResponse, rebuiltFrames: rebuiltResponse, tolerance: tol.responseFrames });
  }
  const legacyDistance = displacement(legacy), rebuiltDistance = displacement(rebuilt);
  if (legacyDistance > 0.01) {
    const ratio = rebuiltDistance / legacyDistance;
    if (ratio < 1 - tol.displacementRatio || ratio > 1 + tol.displacementRatio) {
      add("DISPLACEMENT_MISMATCH", { legacy: +legacyDistance.toFixed(3), rebuilt: +rebuiltDistance.toFixed(3), ratio: +ratio.toFixed(3), tolerance: tol.displacementRatio });
    }
  } else unobservable.push("legacy-displacement-too-small-to-compare");
  const released = o.legacy?.releasedAtFrame ?? null;
  for (const [side, run] of [["legacy", o.legacy], ["rebuilt", o.rebuilt]]) {
    const at = run?.releasedAtFrame ?? released;
    const from = at === null ? null : at + tol.settleFrames;
    if (from === null || from >= run.samples.length - 1) {
      unobservable.push(`${side}-rest-drift`);
      continue;
    }
    const tail = run.samples.slice(from);
    const drift = Math.max(...tail.map((s) => Math.hypot(s.x - tail.at(-1).x, s.z - tail.at(-1).z)));
    if (!near(drift, 0, tol.restDrift)) add("REST_DRIFT_MISMATCH", { side, drift: +drift.toExponential(3), tolerance: tol.restDrift, settleFrames: tol.settleFrames });
  }
  const span = Math.min(legacy.length, rebuilt.length);
  let worst = 0, worstFrame = 0;
  for (let i = 0; i < span; i++) {
    const d = distance(
      { x: legacy[i].x - legacy[0].x, y: 0, z: legacy[i].z - legacy[0].z },
      { x: rebuilt[i].x - rebuilt[0].x, y: 0, z: rebuilt[i].z - rebuilt[0].z }
    );
    if (d > worst) {
      worst = d;
      worstFrame = i;
    }
  }
  if (worst > tol.trajectory) add("TRAJECTORY_DIVERGENCE", { worst: +worst.toFixed(3), atFrame: worstFrame, tolerance: tol.trajectory });
  if (legacyDistance > 0.01 && rebuiltDistance > 0.01) {
    const angle = (run) => Math.atan2(run.at(-1).z - run[0].z, run.at(-1).x - run[0].x);
    let delta = Math.abs(angle(legacy) - angle(rebuilt));
    if (delta > Math.PI) delta = 2 * Math.PI - delta;
    if (delta > Math.PI / 4) add("DIRECTION_MISMATCH", { radians: +delta.toFixed(3) });
  }
  for (const [name, present] of Object.entries(o.capabilities ?? {})) {
    if (present) add("CAPABILITY_ABSENT", {
      capability: name,
      legacy: false,
      rebuilt: true,
      rule: "the rebuild adds this move; the bundle has no equivalent to diverge from"
    });
  }
  return report(o, differences, unobservable, tol);
}
function report(o, differences, unobservable, tolerances) {
  const mismatches = differences.filter((d) => !["EXPECTED_NORMALIZATION", "CAPABILITY_ABSENT"].includes(d.classification));
  return {
    scriptId: o.scriptId ?? null,
    matched: mismatches.length === 0,
    differences,
    mismatches: mismatches.length,
    unobservable: [...new Set(unobservable)],
    fullyObservable: unobservable.length === 0,
    tolerances,
    reproduce: o.reproduce ?? "Replay the scripted input against both runtimes at the same cadence"
  };
}
var MovementParityReport = class {
  constructor({ limit = 100 } = {}) {
    this.limit = limit;
    this.rows = [];
    this.total = 0;
    this.mismatched = 0;
    this.unobservable = 0;
    this.classes = {};
  }
  record(observation) {
    const row = compareMovement(observation);
    this.total++;
    if (!row.matched) this.mismatched++;
    if (row.unobservable.length) this.unobservable++;
    for (const d of row.differences) this.classes[d.classification] = (this.classes[d.classification] ?? 0) + 1;
    this.rows.push(row);
    if (this.rows.length > this.limit) this.rows.shift();
    return row;
  }
  snapshot() {
    return structuredClone({
      schema: "zge.movement-parity.v1",
      total: this.total,
      matched: this.total - this.mismatched,
      mismatched: this.mismatched,
      unobservable: this.unobservable,
      classes: this.classes,
      rows: this.rows
    });
  }
};
function replayScript(script, { config = DEFAULT_MOVEMENT, dtSeconds = 1 / 60, start = { x: 0, y: 0, z: 0 } } = {}) {
  const c = validateMovementConfig(config);
  let state = createMovementState({ ...start, config: c });
  const samples = [{ frame: 0, x: state.x, y: state.y, z: state.z }];
  const events = [];
  let frame = 0, releasedAtFrame = null;
  for (const span of script) {
    for (let i = 0; i < span.frames; i++) {
      const result = stepMovement(state, {
        forward: span.forward ?? 0,
        strafe: span.strafe ?? 0,
        jump: !!span.jump && i === 0,
        dash: !!span.dash && i === 0,
        basis: span.basis
      }, dtSeconds, c);
      state = result.state;
      frame += 1;
      samples.push({ frame, x: state.x, y: state.y, z: state.z });
      for (const e of result.events) events.push({ frame, ...e });
    }
    if (releasedAtFrame === null && !span.forward && !span.strafe && !span.dash) releasedAtFrame = frame - span.frames + 1;
  }
  return {
    samples,
    events,
    releasedAtFrame,
    finalState: state,
    unobservable: []
  };
}

// packages/sdk/src/camera.js
var DEG = Math.PI / 180;
var TWO_PI = Math.PI * 2;
var MODES = Object.freeze(["isometric", "over-shoulder", "third-person"]);
function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}
function lerp(a, b, t) {
  return a + (b - a) * t;
}
function mix(arrA, arrB, t) {
  return arrA.map((a, i) => lerp(a, arrB[i], t));
}
function spherical(yaw, pitch, distance2) {
  const cp = Math.cos(pitch);
  return {
    x: distance2 * cp * Math.sin(yaw),
    y: distance2 * Math.sin(pitch),
    z: distance2 * cp * Math.cos(yaw)
  };
}
function resolveOcclusion(target, cameraPos, entities, targetId, clearance = 0.35) {
  let dirx = cameraPos[0] - target[0];
  let diry = cameraPos[1] - target[1];
  let dirz = cameraPos[2] - target[2];
  const dist = Math.hypot(dirx, diry, dirz);
  if (!(dist > 1e-6)) return { position: cameraPos, hit: false };
  dirx /= dist;
  diry /= dist;
  dirz /= dist;
  let nearest = Infinity;
  for (const e of entities) {
    if (e.id === targetId) continue;
    const c = e.components?.collider;
    const t = e.components?.transform;
    if (!c || !t || !c.halfSize) continue;
    const cx = t.position[0], cy = t.position[1], cz = t.position[2];
    const hsx = c.halfSize[0] * (t.scale?.[0] ?? 1);
    const hsy = c.halfSize[1] * (t.scale?.[1] ?? 1);
    const hsz = c.halfSize[2] * (t.scale?.[2] ?? 1);
    const tmin = (() => {
      let lo = 0, hi = dist;
      const slab = (o, d, hs) => {
        if (Math.abs(d) < 1e-9) {
          if (o < -hs || o > hs) return -1;
          return 0;
        }
        let t1 = (-hs - o) / d, t2 = (hs - o) / d;
        if (t1 > t2) [t1, t2] = [t2, t1];
        return { t1, t2 };
      };
      const sx = slab(target[0] - cx, dirx, hsx);
      if (sx === -1) return -1;
      if (sx) {
        lo = Math.max(lo, sx.t1);
        hi = Math.min(hi, sx.t2);
        if (lo > hi) return -1;
      }
      const sy = slab(target[1] - cy, diry, hsy);
      if (sy === -1) return -1;
      if (sy) {
        lo = Math.max(lo, sy.t1);
        hi = Math.min(hi, sy.t2);
        if (lo > hi) return -1;
      }
      const sz = slab(target[2] - cz, dirz, hsz);
      if (sz === -1) return -1;
      if (sz) {
        lo = Math.max(lo, sz.t1);
        hi = Math.min(hi, sz.t2);
        if (lo > hi) return -1;
      }
      return lo;
    })();
    if (tmin >= 0 && tmin < nearest) nearest = tmin;
  }
  if (!Number.isFinite(nearest)) return { position: cameraPos, hit: false };
  const slide = nearest - clearance;
  if (slide <= 0) return { position: target.slice(), hit: true };
  return {
    position: [target[0] + dirx * slide, target[1] + diry * slide, target[2] + dirz * slide],
    hit: true
  };
}
function resolveRig(mode, targetPos, look, targetTransform) {
  const yaw = look.yaw, pitch = look.pitch, dist = look.distance;
  if (mode === "isometric") {
    const snap = Math.PI / 4;
    const yawIso = Math.round(yaw / snap) * snap;
    const pitchIso = clamp(pitch, 35 * DEG, 50 * DEG);
    const d2 = clamp(dist, 4, 120);
    const off2 = spherical(yawIso, pitchIso, d2);
    return {
      projection: "orthographic",
      position: [targetPos[0] + off2.x, targetPos[1] + off2.y, targetPos[2] + off2.z],
      target: targetPos.slice(),
      fov: void 0,
      distance: d2,
      orthoScale: Math.max(4, d2 * 0.8)
    };
  }
  const perspective = { projection: "perspective", target: targetPos.slice() };
  if (mode === "over-shoulder") {
    const facingYaw = targetTransform ? targetTransform.rotation[1] : yaw;
    const shoulderSide = 0.65;
    const camYaw2 = facingYaw + Math.PI + yaw;
    const camPitch2 = clamp(pitch + 10 * DEG, 5 * DEG, 40 * DEG);
    const d2 = clamp(dist, 1.2, 4);
    const off2 = spherical(camYaw2, camPitch2, d2);
    const sideX = Math.sin(facingYaw + Math.PI / 2) * shoulderSide;
    const sideZ = Math.cos(facingYaw + Math.PI / 2) * shoulderSide;
    return {
      ...perspective,
      position: [targetPos[0] + sideX + off2.x, targetPos[1] + 0.7 + off2.y, targetPos[2] + sideZ + off2.z],
      fov: 58,
      distance: d2
    };
  }
  const camYaw = yaw;
  const camPitch = clamp(pitch, 5 * DEG, 60 * DEG);
  const d = clamp(dist, 2, 25);
  const off = spherical(camYaw, camPitch, d);
  return {
    ...perspective,
    position: [targetPos[0] + off.x, targetPos[1] + off.y, targetPos[2] + off.z],
    fov: 50,
    distance: d
  };
}
var DEFAULT_RIG = Object.freeze({
  isometric: { yaw: 45 * DEG, pitch: 40 * DEG, distance: 13 },
  "over-shoulder": { yaw: 0, pitch: 14 * DEG, distance: 2.2 },
  "third-person": { yaw: 0, pitch: 20 * DEG, distance: 7 }
});
var CAMERA_PRESET_SCHEMA = "zge.camera.presets.v1";
function validateCameraPreset(value) {
  if (value == null) return null;
  const p = { ...value };
  if (p.schema !== CAMERA_PRESET_SCHEMA) throw new Error(`camera preset must be ${CAMERA_PRESET_SCHEMA}`);
  if (p.defaultMode != null && !MODES.includes(p.defaultMode)) throw new Error("invalid camera defaultMode");
  if (p.enabledModes != null) {
    if (!Array.isArray(p.enabledModes) || !p.enabledModes.every((m) => MODES.includes(m))) throw new Error("invalid camera enabledModes");
  }
  for (const key of ["followDistance", "elevation", "offset", "fov", "orthoScale", "sensitivity"]) {
    if (p[key] != null && !Number.isFinite(p[key])) throw new Error(`camera ${key} must be finite`);
  }
  if (p.pitchLimits != null && (!Array.isArray(p.pitchLimits) || p.pitchLimits.length !== 2 || !p.pitchLimits.every(Number.isFinite))) throw new Error("camera pitchLimits must be [min,max]");
  for (const key of ["smoothing", "transitionDuration"]) {
    if (p[key] != null && (!Number.isFinite(p[key]) || p[key] < 0)) throw new Error(`camera ${key} must be non-negative`);
  }
  return p;
}
function createCameraDirector(engine, options = {}) {
  let transitionDuration = Number.isFinite(options.transitionDuration) ? clamp(options.transitionDuration, 0, 2) : 0.35;
  let collision = options.collision !== false;
  const collisionClearance = Number.isFinite(options.collisionClearance) ? clamp(options.collisionClearance, 0.05, 2) : 0.35;
  let mode = "isometric";
  let targetId = null;
  let rigOverrides = {};
  let enabledModes = MODES.slice();
  let presetSensitivity = null;
  let presetPitchLimits = null;
  let presetSmoothing = null;
  let baseLook = { ...DEFAULT_RIG.isometric };
  let pointerYaw = 0;
  let pointerPitch = 0;
  let pointerDistance = null;
  if (options.preset) applyPresetData(options.preset);
  let fromPose = null;
  let toPose = null;
  let transitionStart = -1;
  let lastPose = null;
  let movementBasisHolder = null;
  const listeners = /* @__PURE__ */ new Set();
  const emit = (type, data) => {
    for (const fn of [...listeners]) {
      try {
        fn(type, data);
      } catch {
      }
    }
  };
  function collidableEntities() {
    try {
      return engine.world.entities?.() ?? [];
    } catch {
      return [];
    }
  }
  function applyCollision(pose) {
    if (!collision || !pose) return pose;
    const t = pose.target;
    if (!t) return pose;
    const occ = resolveOcclusion(t, pose.position, collidableEntities(), targetId, collisionClearance);
    if (!occ.hit) return pose;
    return { ...pose, position: occ.position, distance: Math.hypot(occ.position[0] - t[0], occ.position[1] - t[1], occ.position[2] - t[2]) };
  }
  function currentLook() {
    const ov = rigOverrides[mode] ?? {};
    return {
      yaw: (ov.yaw ?? baseLook.yaw) + pointerYaw,
      pitch: (ov.pitch ?? baseLook.pitch) + pointerPitch,
      distance: ov.distance ?? (pointerDistance ?? baseLook.distance)
    };
  }
  function baseRig(nextMode) {
    const d = DEFAULT_RIG[nextMode];
    const ov = rigOverrides[nextMode] ?? {};
    return {
      yaw: ov.yaw ?? d.yaw,
      pitch: ov.pitch ?? d.pitch,
      distance: ov.distance ?? d.distance
    };
  }
  function applyPresetData(preset) {
    if (preset == null) return;
    const p = validateCameraPreset(preset);
    if (!p) return;
    if (p.defaultMode) mode = p.defaultMode;
    if (p.enabledModes) enabledModes = p.enabledModes.slice();
    presetSensitivity = p.sensitivity ?? presetSensitivity;
    presetPitchLimits = p.pitchLimits ?? presetPitchLimits;
    presetSmoothing = p.smoothing ?? presetSmoothing;
    if (p.transitionDuration != null) transitionDuration = clamp(p.transitionDuration, 0, 2);
    for (const m of MODES) {
      const per = p[m] ?? {};
      const override = {};
      if (per.distance != null) override.distance = per.distance;
      else if (per.followDistance != null) override.distance = per.followDistance;
      if (per.pitch != null) override.pitch = per.pitch;
      else if (per.elevation != null) override.pitch = per.elevation;
      if (per.yaw != null) override.yaw = per.yaw;
      if (Object.keys(override).length) rigOverrides[m] = override;
    }
    baseLook = { ...baseRig(mode) };
  }
  function targetTransform() {
    const target = targetId ? engine.world.findEntity(targetId) : null;
    const t = target?.components?.transform;
    return t;
  }
  function computePose(now) {
    const t = targetTransform();
    if (!t) return lastPose;
    const pos = t.position;
    const pose = applyCollision(resolveRig(mode, pos, currentLook(), t));
    if (!fromPose || !toPose) return pose;
    const total = transitionDuration * 1e3;
    const elapsed = now - transitionStart;
    if (elapsed >= total || total <= 0) {
      fromPose = toPose = null;
      return pose;
    }
    const u = clamp(elapsed / total, 0, 1);
    const eased = u < 0.5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2;
    return {
      projection: eased < 0.5 ? fromPose.projection : toPose.projection,
      position: mix(fromPose.position, pose.position, eased),
      target: mix(fromPose.target, pose.target, eased),
      fov: fromPose.fov != null && toPose.fov != null ? lerp(fromPose.fov, toPose.fov, eased) : toPose.fov,
      distance: lerp(fromPose.distance ?? toPose.distance, pose.distance ?? toPose.distance, eased),
      orthoScale: fromPose.orthoScale != null && toPose.orthoScale != null ? lerp(fromPose.orthoScale, toPose.orthoScale, eased) : toPose.orthoScale
    };
  }
  const api = {
    setMode(next) {
      if (!MODES.includes(next)) throw new Error(`unknown camera mode "${next}" (expected ${MODES.join("|")})`);
      if (!enabledModes.includes(next)) throw new Error(`camera mode "${next}" is disabled by the project preset`);
      if (next === mode) return api;
      const old = mode;
      mode = next;
      const t = targetTransform();
      const base = t ? t.position : [0, 0, 0];
      fromPose = lastPose ?? resolveRig(old, base, currentLook(), t);
      baseLook = { ...baseRig(next) };
      pointerYaw = pointerPitch = 0;
      pointerDistance = null;
      toPose = resolveRig(next, base, currentLook(), t);
      transitionStart = performance.now();
      emit("change", { mode: next, from: old });
      return api;
    },
    get mode() {
      return mode;
    },
    follow(entityId) {
      targetId = entityId == null ? null : String(entityId);
      if (targetId != null) {
        baseLook = { ...baseRig(mode) };
        pointerYaw = pointerPitch = 0;
        pointerDistance = null;
        fromPose = toPose = null;
        transitionStart = -1;
      }
      emit("follow", { target: targetId });
      return api;
    },
    get target() {
      return targetId;
    },
    setTransitionDuration(seconds) {
      if (!Number.isFinite(seconds) || seconds < 0 || seconds > 2) throw new Error("transition duration must be 0..2 seconds");
      transitionDuration = seconds;
      return api;
    },
    get transitionDuration() {
      return transitionDuration;
    },
    /** Presentation-safe pointer-look deltas (radians). No scene mutation. */
    setLook(yaw, pitch, distance2) {
      if (Number.isFinite(yaw)) pointerYaw = yaw;
      if (Number.isFinite(pitch)) pointerPitch = pitch;
      if (Number.isFinite(distance2)) pointerDistance = distance2;
      return api;
    },
    /** Compute and commit this frame's desired pose. Returns the pose. */
    update(now = performance.now()) {
      const pose = computePose(now);
      if (pose) lastPose = pose;
      if (movementBasisHolder) {
        const b = api.getMovementBasis();
        movementBasisHolder.forward = b.forward;
        movementBasisHolder.right = b.right;
      }
      return pose;
    },
    on(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    /** Bind a mutable holder ({forward:[fx,fz], right:[rx,rz]}) the director updates each `update()`. */
    bindMovementBasis(holder) {
      if (holder && typeof holder === "object") {
        movementBasisHolder = holder;
        const b = api.getMovementBasis();
        holder.forward = b.forward;
        holder.right = b.right;
      }
      return api;
    },
    /**
     * Camera-relative ground movement basis. `forward` points from the camera
     * toward the target, projected onto the ground (the direction the camera is
     * looking); `right` is its +90° companion (turn right from `forward`).
     * Both are unit-length in the (x,z) plane. This is what WASD should adopt
     * so that W = away from/into screen, D = screen-right. Presentation-only:
     * it reads the last computed pose and mutates nothing.
     */
    getMovementBasis() {
      const t = targetTransform();
      if (!t) return { forward: [0, 1], right: [-1, 0] };
      const pose = lastPose ?? computePose();
      if (!pose) return { forward: [0, 1], right: [-1, 0] };
      let fx = pose.target[0] - pose.position[0];
      let fz = pose.target[2] - pose.position[2];
      const len = Math.hypot(fx, fz) || 1;
      fx /= len;
      fz /= len;
      return { forward: [fx, fz], right: [-fz, fx] };
    },
    /** Toggle occlusion sliding (presentation-only). */
    setCollision(enabled) {
      collision = !!enabled;
      return api;
    },
    get collision() {
      return collision;
    },
    /** Apply a versioned camera preset (data-only) at runtime. */
    applyPreset(preset) {
      applyPresetData(preset);
      baseLook = { ...baseRig(mode) };
      pointerYaw = pointerPitch = 0;
      pointerDistance = null;
      emit("preset", { mode, defaultMode: mode });
      return api;
    },
    get enabledModes() {
      return enabledModes.slice();
    },
    get sensitivity() {
      return presetSensitivity;
    },
    get pitchLimits() {
      return presetPitchLimits;
    },
    get smoothing() {
      return presetSmoothing;
    }
  };
  const system = engine.registerSystem({
    id: "camera:director",
    phase: "render",
    run: () => {
      const pose = api.update();
      emit("frame", pose);
    }
  });
  api.dispose = () => system();
  return api;
}

// packages/core/src/EngineEvents.js
var EngineEvents = class {
  /** @param {{ onError?: (scope: string, error: unknown, detail?: any) => void, now?: () => number }} [options] */
  constructor({ onError = null, now = () => Date.now() } = {}) {
    this.handlers = /* @__PURE__ */ new Map();
    this.onError = onError;
    this.now = now;
    this.disposed = false;
    this.emitted = 0;
    this.delivered = 0;
  }
  /**
   * @param {string} type
   * @param {EventHandler} handler
   * @param {{ owner?: string, once?: boolean }} [options]
   * @returns {() => void} unsubscribe
   */
  on(type, handler, { owner = "anonymous", once = false } = {}) {
    if (this.disposed) throw new Error("EngineEvents is disposed");
    if (typeof type !== "string" || !type) throw new TypeError("event type must be a non-empty string");
    if (typeof handler !== "function") throw new TypeError(`handler for "${type}" must be a function`);
    const entry = { handler, owner, once };
    if (!this.handlers.has(type)) this.handlers.set(type, /* @__PURE__ */ new Set());
    this.handlers.get(type).add(entry);
    let active = true;
    return () => {
      if (!active) return;
      active = false;
      const set = this.handlers.get(type);
      if (set) {
        set.delete(entry);
        if (set.size === 0) this.handlers.delete(type);
      }
    };
  }
  once(type, handler, options = {}) {
    return this.on(type, handler, { ...options, once: true });
  }
  /** Remove every subscription registered by `owner`. Returns the number removed. */
  offOwner(owner) {
    let removed = 0;
    for (const [type, set] of this.handlers) {
      for (const entry of [...set]) if (entry.owner === owner) {
        set.delete(entry);
        removed += 1;
      }
      if (set.size === 0) this.handlers.delete(type);
    }
    return removed;
  }
  /** @returns {number} handlers invoked */
  emit(type, payload) {
    if (this.disposed) return 0;
    this.emitted += 1;
    const set = this.handlers.get(type);
    if (!set || set.size === 0) return 0;
    const meta = Object.freeze({ type, time: this.now() });
    let count = 0;
    for (const entry of [...set]) {
      if (entry.once) {
        set.delete(entry);
        if (set.size === 0) this.handlers.delete(type);
      }
      try {
        entry.handler(payload, meta);
        count += 1;
        this.delivered += 1;
      } catch (error) {
        this.onError?.(`event:${type}`, error, { owner: entry.owner });
      }
    }
    return count;
  }
  listenerCount(type) {
    return this.handlers.get(type)?.size ?? 0;
  }
  diagnostics() {
    const byType = {}, byOwner = {};
    let total = 0;
    for (const [type, set] of this.handlers) {
      byType[type] = set.size;
      total += set.size;
      for (const entry of set) byOwner[entry.owner] = (byOwner[entry.owner] || 0) + 1;
    }
    return Object.freeze({ total, byType, byOwner, emitted: this.emitted, delivered: this.delivered, disposed: this.disposed });
  }
  dispose() {
    this.handlers.clear();
    this.disposed = true;
  }
};
var DisposableGroup = class {
  constructor(owner = "anonymous") {
    this.owner = owner;
    this.items = [];
    this.disposed = false;
  }
  /** @template T extends (() => void) @param {T} dispose @returns {T} */
  add(dispose) {
    if (typeof dispose !== "function") throw new TypeError("DisposableGroup.add expects a function");
    if (this.disposed) {
      dispose();
      return dispose;
    }
    this.items.push(dispose);
    return dispose;
  }
  get size() {
    return this.items.length;
  }
  dispose() {
    this.disposed = true;
    const items = this.items.splice(0).reverse();
    const errors = [];
    for (const item of items) {
      try {
        item();
      } catch (error) {
        errors.push(error);
      }
    }
    if (errors.length) {
      const error = new Error(`${errors.length} disposer(s) of "${this.owner}" failed: ${errors.map((e) => e?.message ?? e).join("; ")}`);
      error.errors = errors;
      throw error;
    }
  }
};

// packages/core/src/EngineClock.js
var defaultTimeSource = { now: () => globalThis.performance?.now?.() ?? Date.now() };
var EngineClock = class {
  /**
   * @param {{ fixedStep?: number, maxSubsteps?: number, maxFrameDelta?: number, mode?: 'owned'|'delegated', timeSource?: { now(): number } }} [options]
   */
  constructor({ fixedStep = 1 / 60, maxSubsteps = 5, maxFrameDelta = 0.1, mode = "owned", timeSource = defaultTimeSource } = {}) {
    if (!(fixedStep > 0)) throw new RangeError("fixedStep must be > 0");
    if (!(maxSubsteps >= 1)) throw new RangeError("maxSubsteps must be >= 1");
    if (!["owned", "delegated"].includes(mode)) throw new RangeError(`unknown clock mode "${mode}"`);
    this.fixedStep = fixedStep;
    this.maxSubsteps = maxSubsteps;
    this.maxFrameDelta = maxFrameDelta;
    this.mode = mode;
    this.timeSource = timeSource;
    this.onStep = null;
    this.reset();
  }
  reset() {
    this.accumulator = 0;
    this.stepNumber = 0;
    this.simulationTime = 0;
    this.alpha = 0;
    this.elapsed = 0;
    this.frames = 0;
    this.clampedFrames = 0;
    this.droppedTime = 0;
    this.paused = false;
    this.lastNow = null;
    this.lastFrameDelta = 0;
  }
  pause() {
    if (this.paused) return false;
    this.paused = true;
    return true;
  }
  resume() {
    if (!this.paused) return false;
    this.paused = false;
    this.lastNow = null;
    return true;
  }
  setMode(mode) {
    if (!["owned", "delegated"].includes(mode)) throw new RangeError(`unknown clock mode "${mode}"`);
    this.mode = mode;
    this.accumulator = 0;
    this.lastNow = null;
  }
  /**
   * Advance by a wall-clock frame delta (seconds). In "owned" mode this runs
   * fixed steps through `onStep`; in "delegated" mode it only records timing.
   */
  advance(frameDeltaSeconds) {
    const raw = Number(frameDeltaSeconds) || 0;
    const delta = Math.min(this.maxFrameDelta, Math.max(0, raw));
    this.frames += 1;
    this.lastFrameDelta = delta;
    this.elapsed += delta;
    if (this.paused) return Object.freeze({ substeps: 0, alpha: this.alpha, paused: true, delegated: this.mode === "delegated" });
    if (this.mode === "delegated") return Object.freeze({ substeps: 0, alpha: 0, paused: false, delegated: true });
    this.accumulator += delta;
    let substeps = 0;
    while (this.accumulator >= this.fixedStep && substeps < this.maxSubsteps) {
      this.stepNumber += 1;
      this.simulationTime += this.fixedStep;
      this.accumulator -= this.fixedStep;
      substeps += 1;
      this.onStep?.(this.fixedStep, this.stepNumber);
    }
    if (this.accumulator >= this.fixedStep) {
      const dropped = this.accumulator - this.accumulator % this.fixedStep;
      this.droppedTime += dropped;
      this.accumulator %= this.fixedStep;
      this.clampedFrames += 1;
    }
    this.alpha = this.accumulator / this.fixedStep;
    return Object.freeze({ substeps, alpha: this.alpha, paused: false, delegated: false });
  }
  /** Advance using the injected time source (ms). First call establishes the baseline. */
  tick(nowMs = this.timeSource.now()) {
    if (this.lastNow === null) {
      this.lastNow = nowMs;
      return this.advance(0);
    }
    const delta = (nowMs - this.lastNow) / 1e3;
    this.lastNow = nowMs;
    return this.advance(delta);
  }
  /** Deterministic stepping for tests and headless runs: exactly `n` fixed steps. */
  step(n = 1) {
    if (this.mode !== "owned") throw new Error("EngineClock.step() requires owned mode");
    if (!Number.isSafeInteger(n) || n < 0) throw new RangeError("step count must be a non-negative integer");
    for (let i = 0; i < n; i += 1) {
      this.stepNumber += 1;
      this.simulationTime += this.fixedStep;
      this.onStep?.(this.fixedStep, this.stepNumber);
    }
    this.alpha = 0;
    return this.stepNumber;
  }
  snapshot() {
    return Object.freeze({ mode: this.mode, fixedStep: this.fixedStep, fixedHz: Math.round(1 / this.fixedStep), maxSubsteps: this.maxSubsteps, stepNumber: this.stepNumber, simulationTime: this.simulationTime, accumulator: this.accumulator, alpha: this.alpha, paused: this.paused, frames: this.frames, elapsed: this.elapsed, clampedFrames: this.clampedFrames, droppedTime: this.droppedTime, lastFrameDelta: this.lastFrameDelta });
  }
};

// packages/core/src/LifecycleManager.js
var LIFECYCLE_STATES = Object.freeze(["created", "initialized", "running", "paused", "stopped", "disposed"]);
var TRANSITIONS = Object.freeze({
  initialize: Object.freeze({ from: ["created", "stopped"], to: "initialized", idempotentIn: ["initialized", "running", "paused"] }),
  start: Object.freeze({ from: ["initialized", "stopped"], to: "running", idempotentIn: ["running"] }),
  pause: Object.freeze({ from: ["running"], to: "paused", idempotentIn: ["paused"] }),
  resume: Object.freeze({ from: ["paused"], to: "running", idempotentIn: ["running"] }),
  stop: Object.freeze({ from: ["running", "paused", "initialized"], to: "stopped", idempotentIn: ["stopped", "created"] }),
  dispose: Object.freeze({ from: ["created", "initialized", "running", "paused", "stopped"], to: "disposed", idempotentIn: ["disposed"] })
});
var LifecycleError = class extends Error {
  constructor(transition, state, allowed) {
    super(`Cannot ${transition}() while "${state}"; allowed from: ${allowed.join(", ")}`);
    this.name = "LifecycleError";
    this.transition = transition;
    this.state = state;
    this.allowed = allowed;
  }
};
var LifecycleManager = class {
  /** @param {{ onTransition?: (from: string, to: string, transition: string) => void, now?: () => number }} [options] */
  constructor({ onTransition = null, now = () => Date.now() } = {}) {
    this.state = "created";
    this.onTransition = onTransition;
    this.now = now;
    this.history = [];
    this.inTransition = null;
  }
  /**
   * Decide a transition. Returns `null` when it is already satisfied (no-op),
   * the target state when it must run, and throws when illegal.
   */
  plan(transition) {
    const rule = TRANSITIONS[transition];
    if (!rule) throw new RangeError(`unknown lifecycle transition "${transition}"`);
    if (this.inTransition) throw new LifecycleError(transition, `${this.state} (during ${this.inTransition})`, rule.from);
    if (rule.idempotentIn.includes(this.state)) return null;
    if (!rule.from.includes(this.state)) throw new LifecycleError(transition, this.state, rule.from);
    return rule.to;
  }
  /**
   * Run `work` for a transition. Guarantees: state changes only after `work`
   * resolves; a throwing `work` leaves the state unchanged and re-throws.
   * @returns {Promise<boolean>} true if work ran, false if already satisfied
   */
  async transition(transition, work = async () => {
  }) {
    const to = this.plan(transition);
    if (to === null) return false;
    const from = this.state;
    this.inTransition = transition;
    try {
      await work(from, to);
    } finally {
      this.inTransition = null;
    }
    this.state = to;
    const record = Object.freeze({ from, to, transition, at: this.now() });
    this.history.push(record);
    if (this.history.length > 200) this.history.shift();
    this.onTransition?.(from, to, transition);
    return true;
  }
  is(...states) {
    return states.includes(this.state);
  }
  get disposed() {
    return this.state === "disposed";
  }
  snapshot() {
    return Object.freeze({ state: this.state, inTransition: this.inTransition, transitions: this.history.length, history: [...this.history] });
  }
};

// packages/core/src/PluginManager.js
var PluginError = class extends Error {
  constructor(message, detail = {}) {
    super(message);
    this.name = "PluginError";
    Object.assign(this, detail);
  }
};
var PluginManager = class {
  /** @param {{ onError?: (scope: string, error: unknown, detail?: any) => void, now?: () => number, log?: (level: string, message: string, detail?: any) => void }} [options] */
  constructor({ onError = null, now = () => Date.now(), log = null } = {}) {
    this.plugins = /* @__PURE__ */ new Map();
    this.records = /* @__PURE__ */ new Map();
    this.onError = onError;
    this.now = now;
    this.log = log;
    this.order = null;
  }
  register(plugin) {
    if (!plugin || typeof plugin !== "object") throw new PluginError("plugin must be an object");
    const { id } = plugin;
    if (typeof id !== "string" || !id) throw new PluginError("plugin.id must be a non-empty string");
    if (typeof plugin.install !== "function") throw new PluginError(`plugin "${id}" must define install(ctx)`, { id });
    if (this.plugins.has(id)) throw new PluginError(`plugin "${id}" is already registered (duplicate install rejected)`, { id, duplicate: true });
    for (const key of ["requires", "optional"]) {
      const list = plugin[key] ?? [];
      if (!Array.isArray(list) || list.some((d) => typeof d !== "string")) throw new PluginError(`plugin "${id}".${key} must be an array of plugin ids`, { id });
    }
    const policy = plugin.failurePolicy ?? "isolate";
    if (!["isolate", "fatal"].includes(policy)) throw new PluginError(`plugin "${id}" has unknown failurePolicy "${policy}"`, { id });
    this.plugins.set(id, { ...plugin, requires: [...plugin.requires ?? []], optional: [...plugin.optional ?? []], failurePolicy: policy });
    this.records.set(id, { status: "registered", order: -1, error: null, reason: null, timings: {}, handle: void 0 });
    this.order = null;
    return this;
  }
  has(id) {
    return this.plugins.has(id);
  }
  get(id) {
    return this.plugins.get(id) ?? null;
  }
  handle(id) {
    return this.records.get(id)?.handle;
  }
  status(id) {
    return this.records.get(id)?.status ?? "unregistered";
  }
  /** Topological order by requires/optional. Throws PluginError on missing requires or cycles. */
  resolveOrder() {
    if (this.order) return this.order;
    for (const [id, plugin] of this.plugins) for (const dep of plugin.requires) {
      if (!this.plugins.has(dep)) throw new PluginError(`plugin "${id}" requires "${dep}", which is not registered`, { id, missing: dep });
    }
    const state = /* @__PURE__ */ new Map();
    const order = [];
    const stack = [];
    const visit = (id) => {
      const mark = state.get(id);
      if (mark === "done") return;
      if (mark === "visiting") {
        const cycle = [...stack.slice(stack.indexOf(id)), id];
        throw new PluginError(`plugin dependency cycle: ${cycle.join(" -> ")}. Break the cycle by removing one of these requires/optional edges.`, { cycle });
      }
      state.set(id, "visiting");
      stack.push(id);
      const plugin = this.plugins.get(id);
      const deps = [...plugin.requires, ...plugin.optional.filter((d) => this.plugins.has(d))];
      for (const dep of deps) visit(dep);
      stack.pop();
      state.set(id, "done");
      order.push(id);
    };
    for (const id of this.plugins.keys()) visit(id);
    order.forEach((id, index) => {
      this.records.get(id).order = index;
    });
    this.order = order;
    return order;
  }
  async _run(id, phase, fn, ctx) {
    const record = this.records.get(id);
    const began = this.now();
    try {
      const result = await fn(ctx);
      record.timings[phase] = this.now() - began;
      return { ok: true, result };
    } catch (error) {
      record.timings[phase] = this.now() - began;
      record.error = error;
      record.status = "failed";
      record.reason = `${phase} threw: ${error?.message ?? error}`;
      this.onError?.(`plugin:${id}:${phase}`, error, { id, phase });
      this.log?.("warn", `plugin "${id}" failed during ${phase}: ${error?.message ?? error}`, { id, phase });
      return { ok: false, error };
    }
  }
  /** Install every registered plugin (idempotent: already-installed plugins are not re-installed). */
  async installAll(ctx) {
    const order = this.resolveOrder();
    const results = [];
    for (const id of order) {
      const plugin = this.plugins.get(id);
      const record = this.records.get(id);
      if (record.status !== "registered") {
        results.push({ id, status: record.status, reused: true });
        continue;
      }
      const failedDeps = plugin.requires.filter((dep) => !["installed", "started", "stopped"].includes(this.records.get(dep).status));
      if (failedDeps.length) {
        record.status = "skipped";
        record.reason = `required dependency unavailable: ${failedDeps.join(", ")}`;
        results.push({ id, status: "skipped", reason: record.reason });
        continue;
      }
      const outcome = await this._run(id, "install", (c) => plugin.install(c), ctx);
      if (outcome.ok) {
        record.status = "installed";
        record.handle = outcome.result;
        results.push({ id, status: "installed" });
      } else {
        results.push({ id, status: "failed", error: outcome.error });
        if (plugin.failurePolicy === "fatal") throw outcome.error;
      }
    }
    return results;
  }
  async startAll(ctx) {
    const order = this.resolveOrder();
    const results = [];
    for (const id of order) {
      const plugin = this.plugins.get(id);
      const record = this.records.get(id);
      if (!["installed", "stopped"].includes(record.status)) continue;
      if (typeof plugin.start !== "function") {
        record.status = "started";
        continue;
      }
      const outcome = await this._run(id, "start", (c) => plugin.start(c, record.handle), ctx);
      if (outcome.ok) record.status = "started";
      else if (plugin.failurePolicy === "fatal") throw outcome.error;
      results.push({ id, status: record.status });
    }
    return results;
  }
  async stopAll(ctx) {
    const order = [...this.resolveOrder()].reverse();
    const results = [];
    for (const id of order) {
      const plugin = this.plugins.get(id);
      const record = this.records.get(id);
      if (record.status !== "started") continue;
      if (typeof plugin.stop === "function") await this._run(id, "stop", (c) => plugin.stop(c, record.handle), ctx);
      if (record.status !== "failed") record.status = "stopped";
      results.push({ id, status: record.status });
    }
    return results;
  }
  /** Dispose in reverse order. Disposal always runs for installed/started/stopped/failed plugins. */
  async disposeAll(ctx) {
    const order = [...this.resolveOrder()].reverse();
    const results = [];
    for (const id of order) {
      const plugin = this.plugins.get(id);
      const record = this.records.get(id);
      if (["disposed", "registered", "skipped"].includes(record.status)) {
        continue;
      }
      if (typeof plugin.dispose === "function") await this._run(id, "dispose", (c) => plugin.dispose(c, record.handle), ctx);
      record.status = "disposed";
      record.handle = void 0;
      results.push({ id, status: "disposed" });
    }
    return results;
  }
  /** Forget every plugin (after disposeAll) so a kernel can be re-populated. */
  clear() {
    this.plugins.clear();
    this.records.clear();
    this.order = null;
  }
  /** Reset records to "registered" so installAll can run again (used by kernel re-initialize after stop/dispose of a cycle). */
  rearm() {
    for (const record of this.records.values()) {
      record.status = "registered";
      record.error = null;
      record.reason = null;
      record.handle = void 0;
      record.timings = {};
    }
  }
  /**
   * Dispose and re-install a subset of plugins in dependency order. Refuses when a
   * plugin outside the subset depends (requires/optional) on a member — that would
   * orphan references, which is exactly the legacy-director defect ZGE-00 found.
   */
  async reinstall(ids, ctx) {
    const subset = new Set(ids);
    for (const id of subset) if (!this.plugins.has(id)) throw new PluginError(`cannot reinstall unknown plugin "${id}"`, { id });
    const order = this.resolveOrder();
    const dependents = [];
    for (const [id, plugin] of this.plugins) if (!subset.has(id)) {
      for (const dep of [...plugin.requires, ...plugin.optional]) if (subset.has(dep)) dependents.push(`${id} -> ${dep}`);
    }
    if (dependents.length) throw new PluginError(`reinstall refused: plugins outside the subset depend on members (${dependents.join(", ")}); include them or restart the page`, { dependents });
    const members = order.filter((id) => subset.has(id));
    const disposed = [];
    for (const id of [...members].reverse()) {
      const plugin = this.plugins.get(id);
      const record = this.records.get(id);
      if (!["installed", "started", "stopped"].includes(record.status)) continue;
      if (typeof plugin.dispose === "function") await this._run(id, "dispose", (c) => plugin.dispose(c, record.handle), ctx);
      record.status = "registered";
      record.handle = void 0;
      record.error = null;
      record.reason = null;
      disposed.push(id);
    }
    const installed = [];
    for (const id of members) {
      const plugin = this.plugins.get(id);
      const record = this.records.get(id);
      if (record.status !== "registered") continue;
      const outcome = await this._run(id, "install", (c) => plugin.install(c), ctx);
      if (outcome.ok) {
        record.status = "installed";
        record.handle = outcome.result;
        installed.push(id);
        if (typeof plugin.start === "function") {
          const s = await this._run(id, "start", (c) => plugin.start(c, record.handle), ctx);
          if (s.ok) record.status = "started";
        } else record.status = "started";
      }
    }
    return { disposed, installed, failed: members.filter((id) => this.records.get(id).status === "failed") };
  }
  /** Ids in `candidates` that no plugin outside `candidates` depends on (transitively safe to reinstall in place). */
  independentSubset(candidates) {
    const set = new Set(candidates);
    let changed = true;
    while (changed) {
      changed = false;
      for (const [id, plugin] of this.plugins) if (!set.has(id)) {
        for (const dep of [...plugin.requires, ...plugin.optional]) if (set.has(dep)) {
          set.delete(dep);
          changed = true;
        }
      }
    }
    return this.resolveOrder().filter((id) => set.has(id));
  }
  diagnostics() {
    let order = null;
    let orderError = null;
    try {
      order = this.resolveOrder();
    } catch (error) {
      orderError = error.message;
    }
    const plugins = [...this.plugins.values()].map((plugin) => {
      const record = this.records.get(plugin.id);
      return Object.freeze({ id: plugin.id, version: plugin.version ?? null, requires: [...plugin.requires], optional: [...plugin.optional], failurePolicy: plugin.failurePolicy, status: record.status, order: record.order, reason: record.reason, error: record.error ? String(record.error?.message ?? record.error) : null, timings: { ...record.timings } });
    }).sort((a, b) => a.order - b.order);
    const counts = {};
    for (const plugin of plugins) counts[plugin.status] = (counts[plugin.status] || 0) + 1;
    return Object.freeze({ count: plugins.length, order, orderError, counts, plugins });
  }
};

// packages/core/src/EngineMetrics.js
var EngineMetrics = class {
  constructor({ now = () => globalThis.performance?.now?.() ?? Date.now(), sampleWindow = 600, maxErrors = 50 } = {}) {
    this.now = now;
    this.sampleWindow = sampleWindow;
    this.maxErrors = maxErrors;
    this.counters = /* @__PURE__ */ new Map();
    this.gauges = /* @__PURE__ */ new Map();
    this.timers = /* @__PURE__ */ new Map();
    this.errors = [];
    this.recoveries = [];
    this.transitions = [];
    this.createdAt = now();
  }
  counter(name, delta = 1) {
    this.counters.set(name, (this.counters.get(name) || 0) + delta);
    return this.counters.get(name);
  }
  gauge(name, value) {
    this.gauges.set(name, value);
    return value;
  }
  /** Record a duration sample (ms) under `name`. */
  record(name, ms) {
    let timer = this.timers.get(name);
    if (!timer) {
      timer = { count: 0, total: 0, min: Infinity, max: -Infinity, last: 0, samples: [] };
      this.timers.set(name, timer);
    }
    timer.count += 1;
    timer.total += ms;
    timer.min = Math.min(timer.min, ms);
    timer.max = Math.max(timer.max, ms);
    timer.last = ms;
    timer.samples.push(ms);
    if (timer.samples.length > this.sampleWindow) timer.samples.shift();
    return timer;
  }
  /** Start a timer; call `.end()` to record. Returns the elapsed ms from end(). */
  time(name) {
    const began = this.now();
    return { end: () => {
      const ms = this.now() - began;
      this.record(name, ms);
      return ms;
    } };
  }
  /** Wrap a sync or async function, recording its duration. */
  async measure(name, fn) {
    const t = this.time(name);
    try {
      return await fn();
    } finally {
      t.end();
    }
  }
  percentile(name, p) {
    const timer = this.timers.get(name);
    if (!timer || timer.samples.length === 0) return null;
    const sorted = [...timer.samples].sort((a, b) => a - b);
    return sorted[Math.min(sorted.length - 1, Math.max(0, Math.floor((sorted.length - 1) * p)))];
  }
  recordError(scope, error, detail = null) {
    const entry = Object.freeze({ at: this.now(), scope, message: String(error?.message ?? error), name: error?.name ?? "Error", detail });
    this.errors.push(entry);
    if (this.errors.length > this.maxErrors) this.errors.shift();
    this.counter("errors.total");
    this.counter(`errors.${scope.split(":")[0]}`);
    return entry;
  }
  recordRecovery(scope, detail = null) {
    const entry = Object.freeze({ at: this.now(), scope, detail });
    this.recoveries.push(entry);
    if (this.recoveries.length > this.maxErrors) this.recoveries.shift();
    this.counter("recoveries.total");
    return entry;
  }
  recordTransition(from, to, transition) {
    this.transitions.push(Object.freeze({ at: this.now(), from, to, transition }));
    if (this.transitions.length > 200) this.transitions.shift();
    this.counter(`lifecycle.${transition}`);
  }
  timerSummary(name) {
    const timer = this.timers.get(name);
    if (!timer) return null;
    return Object.freeze({ count: timer.count, mean: timer.count ? timer.total / timer.count : 0, min: timer.min, max: timer.max, last: timer.last, p50: this.percentile(name, 0.5), p95: this.percentile(name, 0.95), p99: this.percentile(name, 0.99) });
  }
  snapshot() {
    const timers = {};
    for (const name of this.timers.keys()) timers[name] = this.timerSummary(name);
    return Object.freeze({ uptimeMs: this.now() - this.createdAt, counters: Object.fromEntries(this.counters), gauges: Object.fromEntries(this.gauges), timers, errors: [...this.errors], recoveries: [...this.recoveries], transitions: [...this.transitions] });
  }
  reset() {
    this.counters.clear();
    this.gauges.clear();
    this.timers.clear();
    this.errors.length = 0;
    this.recoveries.length = 0;
    this.transitions.length = 0;
    this.createdAt = this.now();
  }
};

// packages/core/src/Authority.js
var AUTHORITY = Object.freeze({ LEGACY: "LEGACY", SHADOW: "SHADOW", ENGINE: "ENGINE" });
var Authority = class {
  constructor(features = {}) {
    this.features = new Map(Object.entries(features));
    for (const [domain, mode] of this.features) this.set(domain, mode);
  }
  get(domain) {
    return this.features.get(domain) ?? AUTHORITY.LEGACY;
  }
  set(domain, mode) {
    if (!Object.values(AUTHORITY).includes(mode)) throw new TypeError(`invalid authority ${mode}`);
    this.features.set(domain, mode);
  }
  assertEngine(domain) {
    if (this.get(domain) !== AUTHORITY.ENGINE) throw new Error(`${domain} is not ENGINE owned`);
  }
  snapshot() {
    return Object.fromEntries(this.features);
  }
};

// packages/core/src/CommandQueue.js
var CommandQueue = class {
  constructor(authority, events) {
    this.authority = authority;
    this.events = events;
    this.handlers = /* @__PURE__ */ new Map();
    this.pending = [];
    this.results = /* @__PURE__ */ new Map();
    this.sequence = 0;
  }
  register(type, domain, handler) {
    if (this.handlers.has(type)) throw new Error(`duplicate command ${type}`);
    this.handlers.set(type, { domain, handler });
    return () => this.handlers.delete(type);
  }
  enqueue(command) {
    if (!command?.id || !this.handlers.has(command.type)) throw new TypeError("command needs id and registered type");
    if (this.results.has(command.id) || this.pending.some((c) => c.id === command.id)) return false;
    this.pending.push(structuredClone({ ...command, sequence: this.sequence++ }));
    return true;
  }
  drain(world, step) {
    const batch = this.pending.splice(0);
    for (const command of batch) {
      const entry = this.handlers.get(command.type);
      let result;
      try {
        if (!entry) throw new Error("command handler removed");
        this.authority.assertEngine(entry.domain);
        result = entry.handler(world, structuredClone(command), step);
        if (result?.then) throw new Error("command handlers must be synchronous");
      } catch (error) {
        result = { ok: false, reason: error.message };
      }
      this.results.set(command.id, structuredClone(result ?? null));
      this.events.emit("gameplay:command", { id: command.id, type: command.type, step, result: structuredClone(result ?? null) });
    }
  }
  snapshot() {
    return structuredClone({ pending: this.pending, results: [...this.results], sequence: this.sequence });
  }
  restore(data = {}) {
    this.pending = structuredClone(data.pending ?? []);
    this.results = new Map(structuredClone(data.results ?? []));
    this.sequence = data.sequence ?? 0;
  }
  dispose() {
    this.handlers.clear();
    this.pending.length = 0;
    this.results.clear();
  }
};

// packages/core/src/World.js
var World = class {
  constructor({ id = "world" } = {}) {
    this.id = id;
    this.nextEntityId = 1;
    this.entities = /* @__PURE__ */ new Map();
    this.byComponent = /* @__PURE__ */ new Map();
    this.resources = /* @__PURE__ */ new Map();
    this.revision = 0;
    this.componentTypes = /* @__PURE__ */ new Map();
  }
  registerComponent(type, validate = () => true) {
    if (this.componentTypes.has(type)) throw new Error(`duplicate component ${type}`);
    this.componentTypes.set(type, validate);
    return () => this.componentTypes.delete(type);
  }
  createEntity(label = "") {
    const id = this.nextEntityId++;
    this.entities.set(id, { id, label, components: /* @__PURE__ */ new Map() });
    this.revision += 1;
    return id;
  }
  destroyEntity(id) {
    const entity = this.entities.get(id);
    if (!entity) return false;
    for (const type of entity.components.keys()) this.byComponent.get(type)?.delete(id);
    this.entities.delete(id);
    this.revision += 1;
    return true;
  }
  hasEntity(id) {
    return this.entities.has(id);
  }
  addComponent(id, type, data = {}) {
    const entity = this.entities.get(id);
    if (!entity) throw new RangeError(`entity ${id} does not exist`);
    if (typeof type !== "string" || !type) throw new TypeError("component type must be a non-empty string");
    if (this.componentTypes.has(type) && !this.componentTypes.get(type)(data)) throw new TypeError(`invalid component ${type}`);
    entity.components.set(type, data);
    if (!this.byComponent.has(type)) this.byComponent.set(type, /* @__PURE__ */ new Set());
    this.byComponent.get(type).add(id);
    this.revision += 1;
    return data;
  }
  getComponent(id, type) {
    return this.entities.get(id)?.components.get(type);
  }
  removeComponent(id, type) {
    const entity = this.entities.get(id);
    if (!entity?.components.delete(type)) return false;
    this.byComponent.get(type)?.delete(id);
    this.revision += 1;
    return true;
  }
  *query(...types) {
    if (types.length === 0) {
      yield* this.entities.keys();
      return;
    }
    const [first, ...rest] = types;
    const seed = this.byComponent.get(first);
    if (!seed) return;
    for (const id of seed) {
      const entity = this.entities.get(id);
      if (rest.every((t) => entity.components.has(t))) yield id;
    }
  }
  setResource(name, value) {
    this.resources.set(name, value);
    this.revision += 1;
    return value;
  }
  getResource(name) {
    return this.resources.get(name);
  }
  hasResource(name) {
    return this.resources.has(name);
  }
  deleteResource(name) {
    const ok = this.resources.delete(name);
    if (ok) this.revision += 1;
    return ok;
  }
  get entityCount() {
    return this.entities.size;
  }
  snapshot() {
    const entities = [...this.entities.values()].map((e) => ({ id: e.id, label: e.label, components: Object.fromEntries(e.components) }));
    const resources = {};
    for (const [k, v] of this.resources) {
      try {
        resources[k] = JSON.parse(JSON.stringify(v));
      } catch {
        resources[k] = { unserializable: true };
      }
    }
    return JSON.parse(JSON.stringify({ id: this.id, revision: this.revision, nextEntityId: this.nextEntityId, entities, resources }));
  }
  restore(snapshot) {
    snapshot = structuredClone(snapshot);
    this.clear();
    this.id = snapshot.id ?? this.id;
    this.nextEntityId = snapshot.nextEntityId ?? 1;
    for (const e of snapshot.entities ?? []) {
      this.entities.set(e.id, { id: e.id, label: e.label ?? "", components: /* @__PURE__ */ new Map() });
      for (const [type, data] of Object.entries(e.components ?? {})) this.addComponent(e.id, type, data);
    }
    for (const [k, v] of Object.entries(snapshot.resources ?? {})) this.resources.set(k, v);
    this.revision = snapshot.revision ?? this.revision;
    return this;
  }
  clear() {
    this.entities.clear();
    this.byComponent.clear();
    this.resources.clear();
    this.revision += 1;
  }
};

// packages/core/src/EngineKernel.js
var SYSTEM_PHASES = Object.freeze(["input", "simulate", "physics", "post", "render"]);
var STEP_PHASES = /* @__PURE__ */ new Set(["simulate", "physics", "post"]);
function autoScheduler() {
  if (typeof globalThis.requestAnimationFrame === "function") {
    return { kind: "raf", requestFrame: (cb) => globalThis.requestAnimationFrame(cb), cancelFrame: (h) => globalThis.cancelAnimationFrame(h) };
  }
  return { kind: "timeout", requestFrame: (cb) => setTimeout(() => cb(defaultTimeSource.now()), 1e3 / 60), cancelFrame: (h) => clearTimeout(h) };
}
var EngineKernel = class {
  /**
   * @param {{ id?: string, clock?: ConstructorParameters<typeof EngineClock>[0], scheduler?: 'auto'|'manual'|{ requestFrame: Function, cancelFrame: Function }, log?: (level: string, message: string, detail?: any) => void, world?: { id?: string }, config?: Record<string, any> }} [options]
   */
  constructor({ id = "zge", clock = {}, scheduler = "auto", log = null, world = {}, config = {} } = {}) {
    this.id = id;
    this.config = Object.freeze({ ...config });
    this.log = log ?? (() => {
    });
    this.metrics = new EngineMetrics();
    const onError = (scope, error, detail) => {
      this.metrics.recordError(scope, error, detail);
      this.log("warn", `[${scope}] ${error?.message ?? error}`, detail);
    };
    this.events = new EngineEvents({ onError });
    this.lifecycle = new LifecycleManager({ onTransition: (from, to, transition) => {
      this.metrics.recordTransition(from, to, transition);
      this.events.emit("engine:lifecycle", { from, to, transition });
    } });
    this.plugins = new PluginManager({ onError, log: this.log });
    this.clock = new EngineClock(clock);
    this.clock.onStep = (dt, stepNumber) => this._runStep(dt, stepNumber);
    this.world = new World(world);
    this.authority = new Authority(config.features);
    this.commands = new CommandQueue(this.authority, this.events);
    this.scheduler = scheduler === "auto" ? autoScheduler() : scheduler === "manual" ? { kind: "manual" } : { kind: "custom", ...scheduler };
    this.systems = [];
    this._systemSeq = 0;
    this.guards = /* @__PURE__ */ new Map();
    this._frameHandle = null;
    this._loopActive = false;
    this.frameCount = 0;
    this._onError = onError;
    this.context = this._createContext();
  }
  _createContext() {
    const engine = this;
    return Object.freeze({
      engine,
      get world() {
        return engine.world;
      },
      get events() {
        return engine.events;
      },
      get metrics() {
        return engine.metrics;
      },
      get clock() {
        return engine.clock;
      },
      get config() {
        return engine.config;
      },
      log: (level, message, detail) => engine.log(level, message, detail),
      guard: (name, factory, options) => engine.guard(name, factory, options),
      addSystem: (system) => engine.addSystem(system),
      setResource: (name, value) => engine.world.setResource(name, value),
      getResource: (name) => engine.world.getResource(name),
      /** Create a disposable group tied to a plugin id; events subscribed through it are owned. */
      own(owner) {
        const group = new DisposableGroup(owner);
        return Object.freeze({ group, on: (type, handler, options = {}) => group.add(engine.events.on(type, handler, { ...options, owner })), add: (dispose) => group.add(dispose), dispose: () => group.dispose(), get size() {
          return group.size;
        } });
      }
    });
  }
  // ───────────────────────── plugins & systems ─────────────────────────
  use(plugin) {
    this.plugins.register(plugin);
    return this;
  }
  /**
   * @param {{ id: string, phase?: string, run: (world: World, dt: number, info: any) => void, owner?: string }} system
   * @returns {() => void} remove
   */
  addSystem(system) {
    if (!system || typeof system.run !== "function" || typeof system.id !== "string") throw new TypeError("system needs { id, run(world, dt, info) }");
    const phase = system.phase ?? "simulate";
    if (!SYSTEM_PHASES.includes(phase)) throw new RangeError(`unknown system phase "${phase}" (expected ${SYSTEM_PHASES.join("|")})`);
    if (this.systems.some((s) => s.id === system.id)) throw new Error(`system "${system.id}" is already registered`);
    const entry = { id: system.id, phase, order: this._systemSeq++, run: system.run, owner: system.owner ?? "anonymous", after: [...system.after ?? []], dispose: system.dispose };
    this.systems.push(entry);
    try {
      this._scheduleSystems();
    } catch (error) {
      this.systems.splice(this.systems.indexOf(entry), 1);
      throw error;
    }
    return () => {
      const i = this.systems.indexOf(entry);
      if (i >= 0) {
        this.systems.splice(i, 1);
        entry.dispose?.();
      }
    };
  }
  _scheduleSystems() {
    const ordered = [], visiting = /* @__PURE__ */ new Set(), done = /* @__PURE__ */ new Set();
    const visit = (s) => {
      if (done.has(s.id)) return;
      if (visiting.has(s.id)) throw new Error(`system dependency cycle at ${s.id}`);
      visiting.add(s.id);
      for (const id of s.after) {
        const dep = this.systems.find((x) => x.id === id);
        if (!dep) throw new Error(`system ${s.id} requires ${id}`);
        if (SYSTEM_PHASES.indexOf(dep.phase) > SYSTEM_PHASES.indexOf(s.phase)) throw new Error("system dependency crosses phases backwards");
        visit(dep);
      }
      visiting.delete(s.id);
      done.add(s.id);
      ordered.push(s);
    };
    [...this.systems].sort((a, b) => SYSTEM_PHASES.indexOf(a.phase) - SYSTEM_PHASES.indexOf(b.phase) || a.order - b.order).forEach(visit);
    this.systems = ordered;
  }
  /**
   * Failure isolation for optional work: resolves to the result, or to `fallback`
   * on timeout/error, recording a status entry. `required:true` rethrows.
   */
  async guard(name, factory, { timeoutMs = 1e4, fallback = void 0, required = false } = {}) {
    const began = this.metrics.now();
    this.guards.set(name, { state: "pending", reason: null, ms: null, required, at: began });
    let timer = null;
    const timeout = new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(`guard "${name}" timed out after ${timeoutMs} ms`)), timeoutMs);
    });
    try {
      const work = typeof factory === "function" ? factory() : factory;
      const result = await Promise.race([Promise.resolve(work), timeout]);
      this.guards.set(name, { state: "ready", reason: null, ms: this.metrics.now() - began, required, at: began });
      this.metrics.counter("guards.ready");
      return result;
    } catch (error) {
      const ms = this.metrics.now() - began;
      this.guards.set(name, { state: required ? "failed" : "degraded", reason: String(error?.message ?? error), ms, required, at: began });
      this.metrics.counter(required ? "guards.failed" : "guards.degraded");
      this._onError(`guard:${name}`, error, { required });
      this.events.emit("engine:guard", { name, state: required ? "failed" : "degraded", reason: String(error?.message ?? error) });
      if (required) throw error;
      return typeof fallback === "function" ? fallback(error) : fallback;
    } finally {
      clearTimeout(timer);
    }
  }
  // ───────────────────────── lifecycle ─────────────────────────
  async initialize() {
    return this.lifecycle.transition("initialize", async (from) => {
      const t = this.metrics.time("lifecycle.initialize");
      if (from === "stopped") this.plugins.rearm();
      this.world.setResource("engine.id", this.id);
      const results = await this.plugins.installAll(this.context);
      const failed = results.filter((r) => r.status === "failed" || r.status === "skipped");
      this.metrics.gauge("plugins.installed", results.filter((r) => r.status === "installed").length);
      this.metrics.gauge("plugins.failedOrSkipped", failed.length);
      t.end();
      this.events.emit("engine:initialized", { plugins: results });
    });
  }
  async start() {
    if (this.lifecycle.state === "created") await this.initialize();
    return this.lifecycle.transition("start", async (from) => {
      if (from === "stopped" && this.plugins.diagnostics().counts.registered) {
        await this.plugins.installAll(this.context);
      }
      await this.plugins.startAll(this.context);
      this.clock.lastNow = null;
      this._startLoop();
      this.events.emit("engine:started", { mode: this.clock.mode });
    });
  }
  pause() {
    if (this.lifecycle.plan("pause") === null) return false;
    this.clock.pause();
    this.lifecycle.state = "paused";
    this.lifecycle.history.push(Object.freeze({ from: "running", to: "paused", transition: "pause", at: Date.now() }));
    this.metrics.recordTransition("running", "paused", "pause");
    this.events.emit("engine:paused", {});
    return true;
  }
  resume() {
    if (this.lifecycle.plan("resume") === null) return false;
    this.clock.resume();
    this.lifecycle.state = "running";
    this.lifecycle.history.push(Object.freeze({ from: "paused", to: "running", transition: "resume", at: Date.now() }));
    this.metrics.recordTransition("paused", "running", "resume");
    this.events.emit("engine:resumed", {});
    return true;
  }
  async stop() {
    return this.lifecycle.transition("stop", async () => {
      this._stopLoop();
      await this.plugins.stopAll(this.context);
      this.clock.resume();
      this.clock.lastNow = null;
      this.events.emit("engine:stopped", {});
    });
  }
  async dispose() {
    if (this.lifecycle.plan("dispose") === null) return false;
    if (this.lifecycle.is("running", "paused")) await this.stop();
    return this.lifecycle.transition("dispose", async () => {
      this._stopLoop();
      await this.plugins.disposeAll(this.context);
      for (const system of this.systems.splice(0).reverse()) {
        try {
          system.dispose?.();
        } catch (error) {
          this._onError(`dispose:${system.id}`, error);
        }
      }
      this.commands.dispose();
      this.guards.clear();
      this.world.clear();
      this.events.emit("engine:disposed", {});
      this.events.dispose();
    });
  }
  // ───────────────────────── frame pipeline ─────────────────────────
  _startLoop() {
    if (this.scheduler.kind === "manual" || this._loopActive) return;
    this._loopActive = true;
    const loop = (nowMs) => {
      if (!this._loopActive) return;
      this.frame(typeof nowMs === "number" ? nowMs : void 0);
      if (this._loopActive) this._frameHandle = this.scheduler.requestFrame(loop);
    };
    this._frameHandle = this.scheduler.requestFrame(loop);
  }
  _stopLoop() {
    this._loopActive = false;
    if (this._frameHandle !== null) {
      this.scheduler.cancelFrame(this._frameHandle);
      this._frameHandle = null;
    }
  }
  _runStep(dt, stepNumber) {
    this.commands.drain(this.world, stepNumber);
    const info = { stepNumber, simulationTime: this.clock.simulationTime };
    for (const system of this.systems) {
      if (!STEP_PHASES.has(system.phase)) continue;
      const t = this.metrics.time(`system.${system.id}`);
      try {
        system.run(this.world, dt, info);
      } catch (error) {
        this._onError(`system:${system.id}`, error, { phase: system.phase, stepNumber });
      }
      t.end();
    }
  }
  /** One frame: input → fixed steps (owned mode) → render observers. Safe to call manually. */
  frame(nowMs) {
    if (!this.lifecycle.is("running", "paused")) return null;
    const total = this.metrics.time("frame.total");
    const t0 = this.metrics.now();
    for (const system of this.systems) if (system.phase === "input") {
      try {
        system.run(this.world, 0, { frame: this.frameCount });
      } catch (error) {
        this._onError(`system:${system.id}`, error);
      }
    }
    const sim = this.metrics.time("frame.simulate");
    const result = this.clock.tick(nowMs);
    sim.end();
    const render = this.metrics.time("frame.render");
    const info = { alpha: result.alpha, frame: this.frameCount, delegated: result.delegated, paused: result.paused, frameDelta: this.clock.lastFrameDelta };
    for (const system of this.systems) if (system.phase === "render") {
      try {
        system.run(this.world, this.clock.lastFrameDelta, info);
      } catch (error) {
        this._onError(`system:${system.id}`, error);
      }
    }
    render.end();
    this.frameCount += 1;
    this.metrics.record("frame.delta", this.clock.lastFrameDelta * 1e3);
    const ms = total.end();
    this.events.emit("engine:frame", { frame: this.frameCount, substeps: result.substeps, alpha: result.alpha, ms, startedAt: t0 });
    return result;
  }
  /** Deterministic stepping for tests/headless: n fixed steps, no scheduler. */
  step(n = 1) {
    if (!this.lifecycle.is("running", "paused", "initialized")) throw new Error(`cannot step while "${this.lifecycle.state}"`);
    return this.clock.step(n);
  }
  snapshot() {
    return { id: this.id, clock: this.clock.snapshot(), world: this.world.snapshot(), frameCount: this.frameCount, commands: this.commands.snapshot() };
  }
  restore(snapshot) {
    if (snapshot.clock.fixedStep !== this.clock.fixedStep) throw new Error("snapshot fixed step does not match engine configuration");
    this.world.restore(structuredClone(snapshot.world));
    this.commands.restore(snapshot.commands);
    for (const key of ["stepNumber", "simulationTime", "accumulator", "alpha", "paused", "frames", "elapsed", "clampedFrames", "droppedTime", "lastFrameDelta"]) {
      if (snapshot.clock[key] !== void 0) this.clock[key] = snapshot.clock[key];
    }
    this.clock.lastNow = null;
    this.frameCount = snapshot.frameCount ?? 0;
    this.events.emit("engine:restored", { world: this.world.snapshot() });
    return this;
  }
  diagnostics() {
    const guards = {};
    for (const [name, g] of this.guards) guards[name] = { ...g };
    return Object.freeze({ id: this.id, lifecycle: this.lifecycle.snapshot(), clock: this.clock.snapshot(), scheduler: this.scheduler.kind, loopActive: this._loopActive, frameCount: this.frameCount, plugins: this.plugins.diagnostics(), systems: this.systems.map((s) => ({ id: s.id, phase: s.phase, owner: s.owner })), guards, events: this.events.diagnostics(), world: { entities: this.world.entityCount, resources: [...this.world.resources.keys()], revision: this.world.revision }, metrics: this.metrics.snapshot() });
  }
};

// packages/core/src/GameplayEventJournal.js
var canonicalJSON = (value) => JSON.stringify(value, (_key, v) => v && typeof v === "object" && !Array.isArray(v) ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => a.localeCompare(b))) : v);

// packages/assets/src/AssetService.js
var AssetService = class {
  constructor({ baseURL = "http://localhost/", budgetBytes = 64 * 1024 * 1024, timeoutMs = 45e3 } = {}) {
    if (!Number.isFinite(budgetBytes) || budgetBytes < 0 || !Number.isFinite(timeoutMs) || timeoutMs <= 0) throw new RangeError("invalid asset limits");
    this.baseURL = baseURL;
    this.budgetBytes = budgetBytes;
    this.timeoutMs = timeoutMs;
    this.loaders = /* @__PURE__ */ new Map();
    this.entries = /* @__PURE__ */ new Map();
    this.pending = /* @__PURE__ */ new Map();
    this.disposed = false;
    this.clock = 0;
    this.metrics = { loads: 0, hits: 0, joined: 0, failures: 0, retries: 0, evictions: 0, cancelled: 0 };
  }
  key(path, variant = "") {
    const url = new URL(path, this.baseURL);
    url.hash = "";
    return `${url.href}|${variant}`;
  }
  register(type, loader) {
    if (this.loaders.has(type) || typeof loader.load !== "function" || typeof loader.clone !== "function") throw new TypeError("unique loader with load and clone required");
    this.loaders.set(type, loader);
  }
  async acquire(path, { type, variant = "", owner = "anonymous", signal, retries = 0, dependencies = [] } = {}) {
    if (this.disposed) throw new Error("asset service disposed");
    if (!Number.isSafeInteger(retries) || retries < 0 || retries > 10) throw new RangeError("retries must be 0..10");
    if (signal?.aborted) throw new Error("asset request cancelled");
    const loader = this.loaders.get(type);
    if (!loader) throw new Error(`unknown asset loader ${type}`);
    const key = `${type}:${this.key(path, variant)}`;
    let entry = this.entries.get(key), pending;
    if (entry) this.metrics.hits++;
    else {
      pending = this.pending.get(key);
      if (pending) this.metrics.joined++;
      else {
        const controller = new AbortController();
        pending = { controller, consumers: 0 };
        const load = async () => {
          for (let attempt = 0; ; attempt++) {
            let timer, abortWork, expired = false;
            try {
              if (controller.signal.aborted || this.disposed) throw new Error("asset load cancelled");
              this.metrics.loads++;
              const work = Promise.resolve().then(() => loader.load(new URL(path, this.baseURL).href, { signal: controller.signal, variant }));
              work.then((value2) => {
                if (expired || controller.signal.aborted || this.disposed) loader.dispose?.(value2);
              }, () => {
              });
              const cancelled = new Promise((_, reject) => {
                abortWork = () => reject(new Error("asset load cancelled"));
                controller.signal.addEventListener("abort", abortWork, { once: true });
              });
              const value = await Promise.race([work, cancelled, new Promise((_, reject) => {
                timer = setTimeout(() => {
                  expired = true;
                  reject(new Error(`asset timeout: ${key}`));
                }, this.timeoutMs);
              })]);
              if (this.disposed || controller.signal.aborted) throw new Error("asset load cancelled");
              const bytes = loader.size?.(value) ?? 0;
              if (!Number.isFinite(bytes) || bytes < 0) {
                loader.dispose?.(value);
                throw new Error("invalid asset size");
              }
              const next = { key, value, loader, bytes, owners: /* @__PURE__ */ new Map(), refs: 0, used: ++this.clock, dependencies: dependencies.map((p) => `${type}:${this.key(p)}`), pins: 0 };
              for (const dep of next.dependencies) {
                const d = this.entries.get(dep);
                if (!d) {
                  loader.dispose?.(value);
                  throw new Error(`dependency not loaded: ${dep}`);
                }
              }
              for (const dep of next.dependencies) this.entries.get(dep).pins++;
              this.entries.set(key, next);
              return next;
            } catch (error) {
              this.metrics.failures++;
              if (attempt >= retries || controller.signal.aborted || this.disposed) throw error;
              this.metrics.retries++;
            } finally {
              clearTimeout(timer);
              if (abortWork) controller.signal.removeEventListener("abort", abortWork);
            }
          }
        };
        pending.promise = load().finally(() => {
          if (this.pending.get(key) === pending) this.pending.delete(key);
        });
        this.pending.set(key, pending);
      }
      pending.consumers++;
      try {
        entry = await new Promise((resolve, reject) => {
          const abort = () => {
            this.metrics.cancelled++;
            cleanup();
            reject(new Error("asset request cancelled"));
          };
          const cleanup = () => signal?.removeEventListener("abort", abort);
          signal?.addEventListener("abort", abort, { once: true });
          pending.promise.then((v) => {
            cleanup();
            resolve(v);
          }, (e) => {
            cleanup();
            reject(e);
          });
        });
      } finally {
        pending.consumers--;
        if (!pending.consumers && signal?.aborted) {
          pending.controller.abort();
          if (this.pending.get(key) === pending) this.pending.delete(key);
        }
      }
    }
    if (signal?.aborted || this.disposed) {
      this._evict();
      throw new Error("asset request cancelled");
    }
    entry.refs++;
    entry.used = ++this.clock;
    entry.owners.set(owner, (entry.owners.get(owner) ?? 0) + 1);
    let released = false;
    this._evict();
    return { id: key, value: entry.value, instantiate: () => {
      if (released || this.disposed) throw new Error("lease released");
      return loader.clone(entry.value);
    }, release: () => {
      if (released) return;
      released = true;
      entry.refs--;
      const count = entry.owners.get(owner) - 1;
      if (count) entry.owners.set(owner, count);
      else entry.owners.delete(owner);
      this._evict();
    } };
  }
  async loadDetached(path, options) {
    const lease = await this.acquire(path, options);
    try {
      return lease.instantiate();
    } finally {
      lease.release();
    }
  }
  invalidate(path, variant = "", type = null) {
    const pathKey = this.key(path, variant), entries = [...this.entries.values()].filter((e) => type ? e.key === `${type}:${pathKey}` : e.key.endsWith(`:${pathKey}`));
    if (entries.some((e) => e.refs || e.pins)) return false;
    for (const e of entries) this._remove(e);
    return true;
  }
  _remove(entry) {
    this.entries.delete(entry.key);
    for (const dep of entry.dependencies) {
      const d = this.entries.get(dep);
      if (d) d.pins--;
    }
    entry.loader.dispose?.(entry.value);
    this.metrics.evictions++;
  }
  _evict() {
    let bytes = [...this.entries.values()].reduce((n, e) => n + e.bytes, 0);
    while (bytes > this.budgetBytes) {
      const candidate = [...this.entries.values()].filter((e) => !e.refs && !e.pins).sort((a, b) => a.used - b.used)[0];
      if (!candidate) break;
      bytes -= candidate.bytes;
      this._remove(candidate);
    }
  }
  status() {
    return { ...this.metrics, entries: this.entries.size, pending: this.pending.size, bytes: [...this.entries.values()].reduce((n, e) => n + e.bytes, 0), references: [...this.entries.values()].reduce((n, e) => n + e.refs, 0), budgetBytes: this.budgetBytes };
  }
  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    for (const p of this.pending.values()) p.controller.abort();
    for (const e of [...this.entries.values()]) this._remove(e);
    this.loaders.clear();
  }
};

// packages/sdk/src/index.js
var SDK_VERSION = "0.1.0-preview.13";
var copy = (value) => structuredClone(value);
var idOK = (v) => typeof v === "string" && /^[a-zA-Z0-9_.:-]{1,100}$/.test(v);
function requireOK(ok, message) {
  if (!ok) throw new SDKError(message.includes("stale revision") ? "REVISION_CONFLICT" : message.includes("precondition") ? "PRECONDITION" : message.includes("component") ? "COMPONENT_VALIDATION" : message.includes("disposed") ? "DISPOSED" : "VALIDATION", message);
}
function plain(value) {
  const visit = (v, depth = 0) => {
    requireOK(depth < 40, "data nesting limit");
    if (v === null || typeof v === "boolean" || typeof v === "string") return;
    if (typeof v === "number") {
      requireOK(Number.isFinite(v), "finite numbers required");
      return;
    }
    requireOK(v && typeof v === "object" && (Array.isArray(v) || Object.getPrototypeOf(v) === Object.prototype || Object.getPrototypeOf(v) === null), "plain JSON required");
    for (const [k, x] of Object.entries(v)) {
      requireOK(!["__proto__", "constructor", "prototype"].includes(k), "unsafe key");
      visit(x, depth + 1);
    }
  };
  visit(value);
  requireOK(JSON.stringify(value).length <= 4 * 1024 * 1024, "scene size limit");
  return JSON.parse(JSON.stringify(value));
}
var vector = (v, positive = false) => Array.isArray(v) && v.length === 3 && v.every((n) => Number.isFinite(n) && Math.abs(n) <= 1e5 && (!positive || n > 0));
var transform = (value = {}) => ({ position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1], ...plain(value) });
var defaults = () => /* @__PURE__ */ new Map([
  ["transform", (v) => v && vector(v.position) && vector(v.rotation) && vector(v.scale, true)],
  ["mesh", (v) => v && ["box", "sphere", "cylinder"].includes(v.primitive) && /^#[0-9a-f]{6}$/i.test(v.color)],
  ["collider", (v) => v && vector(v.halfSize, true)],
  ["state", (v) => v && typeof v === "object" && !Array.isArray(v)],
  ["asset", (v) => v && idOK(v.id)],
  ["editor", (v) => validateFields(v, builtinDefinitions.editor)]
]);
var Scene = class {
  #data;
  #types;
  #prefabs;
  #assetIds;
  #definitions;
  #undo = [];
  #redo = [];
  #listeners = /* @__PURE__ */ new Set();
  #history = [];
  constructor({ id = "main", types = defaults(), prefabs = {}, assetIds = [], definitions = new Map(Object.entries(builtinDefinitions)) } = {}) {
    requireOK(idOK(id), "invalid scene id");
    this.#types = types;
    this.#prefabs = prefabs;
    this.#assetIds = assetIds instanceof Set ? assetIds : new Set(assetIds);
    this.#definitions = definitions;
    this.#data = { schema: "zge.sdk.scene.v1", id, revision: 0, nextId: 1, entities: [] };
  }
  get revision() {
    return this.#data.revision;
  }
  get id() {
    return this.#data.id;
  }
  entities() {
    return copy(this.#data.entities);
  }
  findEntity(id) {
    return copy(this.#data.entities.find((e) => e.id === id) ?? null);
  }
  serialize() {
    return copy(this.#data);
  }
  history() {
    return copy(this.#history);
  }
  subscribe(fn) {
    this.#listeners.add(fn);
    return () => this.#listeners.delete(fn);
  }
  #publish(event) {
    for (const fn of this.#listeners) {
      try {
        fn(copy(event));
      } catch {
      }
    }
  }
  validate(value) {
    const s = plain(value);
    requireOK(s.schema === "zge.sdk.scene.v1" && idOK(s.id) && Number.isSafeInteger(s.revision) && s.revision >= 0 && Number.isSafeInteger(s.nextId) && s.nextId > 0 && Array.isArray(s.entities) && s.entities.length <= 1e4, "invalid scene envelope");
    if (s.rules !== void 0) {
      try {
        validateRules(s.rules);
      } catch (e) {
        throw new SDKError("RULE_VALIDATION", e.message);
      }
    }
    const ids = /* @__PURE__ */ new Set(), byId = new Map(s.entities.map((e) => [e.id, e]));
    for (const e of s.entities) {
      requireOK(idOK(e.id) && !ids.has(e.id) && typeof e.name === "string" && e.name.length <= 200 && e.components && typeof e.components === "object" && !Array.isArray(e.components), "invalid entity");
      ids.add(e.id);
      if (e.prefabId !== void 0) requireOK(idOK(e.prefabId) && Object.hasOwn(this.#prefabs, e.prefabId), "unknown prefab reference");
      for (const [type, v] of Object.entries(e.components)) {
        requireOK(this.#types.has(type) && this.#types.get(type)(v) === true, `invalid component ${type}`);
        if (type === "asset") requireOK(this.#assetIds.has(v.id), "unknown public asset id");
      }
    }
    for (const e of s.entities) {
      for (const [type, value2] of Object.entries(e.components)) {
        const definition = this.#definitions.get(type);
        if (definition) requireOK(validateFields(value2, definition, { assets: this.#assetIds, entities: ids }), `invalid component references ${type}`);
      }
      const visited = /* @__PURE__ */ new Set([e.id]);
      let parent = e.components.editor?.parent;
      while (parent) {
        requireOK(!visited.has(parent), "hierarchy cycle");
        visited.add(parent);
        parent = byId.get(parent)?.components.editor?.parent;
      }
    }
    for (const id of ids) {
      const m = /^entity-(\d+)$/.exec(id);
      if (m) requireOK(Number(m[1]) < s.nextId, "nextId must exceed generated IDs");
    }
    return s;
  }
  restore(value) {
    const valid = this.validate(value);
    this.#data = valid;
    this.#undo = [];
    this.#redo = [];
    this.#history = [];
    this.#publish({ type: "scene:restore", revision: this.revision });
    return this;
  }
  preview(changeset) {
    const before = this.serialize(), after = this.#apply(changeset), old = new Map(before.entities.map((e) => [e.id, e])), next = new Map(after.entities.map((e) => [e.id, e]));
    return { schema: "zge.sdk.diff.v1", baseRevision: this.revision, add: after.entities.filter((e) => !old.has(e.id)), rules: canonicalJSON(before.rules ?? []) === canonicalJSON(after.rules ?? []) ? null : { before: before.rules ?? [], after: after.rules ?? [] }, remove: before.entities.filter((e) => !next.has(e.id)), change: after.entities.filter((e) => old.has(e.id) && canonicalJSON(old.get(e.id)) !== canonicalJSON(e)).map((e) => ({ before: old.get(e.id), after: e })) };
  }
  #apply(changeset) {
    const c = plain(changeset);
    requireOK(c.schema === "zge.sdk.changeset.v1" && c.baseRevision === this.revision && Array.isArray(c.operations) && c.operations.length > 0 && c.operations.length <= 100, "invalid changeset or stale revision");
    const s = this.serialize();
    for (const op of c.operations) {
      if (op?.type === "SetRules") {
        requireOK(op.id === this.id && op.expectedExists === false, "invalid rule document precondition");
        try {
          validateRules(op.value);
        } catch (e) {
          throw new SDKError("RULE_VALIDATION", e.message);
        }
        for (const r of op.value) {
          for (const id of [r.entity, r.target, r.sourceEntity].filter(Boolean)) requireOK(s.entities.some((e2) => e2.id === id), "rule entity reference missing");
          if (r.prefab) requireOK(Object.hasOwn(this.#prefabs, r.prefab), "rule prefab reference missing");
          const e = s.entities.find((e2) => e2.id === r.entity), source = s.entities.find((e2) => e2.id === r.sourceEntity), target = s.entities.find((e2) => e2.id === r.target);
          if (r.kind === "move") requireOK(e.components.transform, "movement needs transform");
          if (r.kind === "collect") requireOK(e.components.transform && target.components.transform && Number.isFinite(e.components[r.component]?.[r.counter]), "collection needs transforms and numeric counter");
          if (r.kind === "goal") requireOK(typeof e.components[r.component]?.[r.property] === "boolean" && ["number", "boolean"].includes(typeof source.components[r.sourceComponent]?.[r.counter]), "objective needs boolean state and numeric/boolean counter");
          if (["build", "interact"].includes(r.kind)) requireOK(source.components.transform && target.components.transform && typeof e.components[r.component]?.[r.property] === "boolean" && ["number", "boolean"].includes(typeof source.components[r.sourceComponent]?.[r.counter]), "interaction needs transforms and typed state");
        }
        s.rules = copy(op.value);
        continue;
      }
      requireOK(op && typeof op === "object", "invalid operation");
      const entity = s.entities.find((e) => e.id === op.id);
      const exists = !!entity;
      requireOK(op.expectedExists === exists, `entity precondition failed: ${op.id}`);
      if (op.type === "CreateEntity" || op.type === "CreatePrefabInstance") {
        requireOK(!exists && idOK(op.id), "duplicate/invalid entity");
        let e;
        if (op.type === "CreatePrefabInstance") {
          requireOK(Object.hasOwn(this.#prefabs, op.prefab), "unknown prefab");
          e = { ...copy(this.#prefabs[op.prefab]), id: op.id, prefabId: op.prefab };
          if (op.overrides) e.components = { ...e.components, ...plain(op.overrides) };
          if (op.transform) e.components.transform = transform({ ...e.components.transform, ...op.transform });
        } else e = { id: op.id, name: op.name ?? op.id, components: copy(op.components ?? {}) };
        if (e.components.transform) e.components.transform = transform(e.components.transform);
        s.entities.push(e);
      } else {
        requireOK(exists, `entity deleted: ${op.id}`);
        if (op.type === "DeleteEntity") s.entities = s.entities.filter((e) => e.id !== op.id);
        else if (op.type === "RenameEntity") {
          requireOK(typeof op.name === "string" && op.name.trim().length > 0, "entity name required");
          entity.name = op.name.trim();
        } else if (op.type === "UpdateTransform") {
          requireOK(Object.hasOwn(entity.components, "transform"), "missing transform");
          entity.components.transform = { ...entity.components.transform, ...plain(op.value) };
        } else if (["AddComponent", "RemoveComponent", "UpdateComponent"].includes(op.type)) {
          requireOK(idOK(op.component), "invalid component key");
          const has = Object.hasOwn(entity.components, op.component);
          requireOK(op.type === "AddComponent" ? !has : has, "component precondition failed");
          if (op.type === "RemoveComponent") delete entity.components[op.component];
          else entity.components[op.component] = plain(op.value);
        } else throw new SDKError("OPERATION_UNSUPPORTED", `unsupported operation ${op.type}`);
      }
      const match = /^entity-(\d+)$/.exec(op.id);
      if (match) s.nextId = Math.max(s.nextId, Number(match[1]) + 1);
    }
    s.revision = this.revision + 1;
    return this.validate(s);
  }
  commit(changeset, { actor = "local-author", source = "human" } = {}) {
    const next = this.#apply(changeset);
    if (canonicalJSON({ ...next, revision: 0 }) === canonicalJSON({ ...this.#data, revision: 0 })) return this.revision;
    this.#undo.push(this.serialize());
    if (this.#undo.length > 100) this.#undo.shift();
    this.#redo = [];
    this.#data = next;
    const record = { schema: "zge.sdk.commit.v1", revision: this.revision, actor: String(actor), source: String(source), changeset: plain(changeset) };
    this.#history.push(record);
    if (this.#history.length > 200) this.#history.shift();
    this.#publish({ type: "scene:commit", ...record });
    return this.revision;
  }
  changeset(operations) {
    return { schema: "zge.sdk.changeset.v1", baseRevision: this.revision, operations: plain(operations) };
  }
  createEntity({ id = `entity-${this.#data.nextId}`, name = id, components = {} } = {}) {
    this.commit(this.changeset([{ type: "CreateEntity", id, name, components, expectedExists: false }]));
    return this.findEntity(id);
  }
  batchTransform(ids, offset, { baseRevision = this.revision } = {}) {
    requireOK(Array.isArray(ids) && ids.length > 0 && ids.length <= 100 && new Set(ids).size === ids.length && vector(offset), "1\u2013100 unique IDs and finite local offset required");
    const operations = ids.map((id) => {
      const e = this.findEntity(id);
      requireOK(e?.components.transform && !e.components.editor?.locked, "all selected entities need unlocked transforms");
      return { type: "UpdateTransform", id, expectedExists: true, value: { position: e.components.transform.position.map((n, i) => n + offset[i]) } };
    });
    return this.commit({ schema: "zge.sdk.changeset.v1", baseRevision, operations });
  }
  setRules(rules, { baseRevision = this.revision, source = "human" } = {}) {
    return this.commit({ schema: "zge.sdk.changeset.v1", baseRevision, operations: [{ type: "SetRules", id: this.id, expectedExists: false, value: rules }] }, { source });
  }
  updateTransform(id, value) {
    return this.commit(this.changeset([{ type: "UpdateTransform", id, value, expectedExists: true }]));
  }
  setComponent(id, component, value) {
    return this.commit(this.changeset([{ type: Object.hasOwn(this.findEntity(id)?.components ?? {}, component) ? "UpdateComponent" : "AddComponent", id, component, value, expectedExists: true }]));
  }
  createPrefabInstance(prefab, id = `entity-${this.#data.nextId}`, value) {
    this.commit(this.changeset([{ type: "CreatePrefabInstance", id, prefab, expectedExists: false, ...value ? { transform: value } : {} }]));
    return this.findEntity(id);
  }
  renameEntity(id, name) {
    return this.commit(this.changeset([{ type: "RenameEntity", id, name, expectedExists: true }]));
  }
  duplicateEntity(id) {
    const original = this.findEntity(id);
    requireOK(original, "entity does not exist");
    return this.createEntity({ name: original.name + " copy", components: original.components });
  }
  diagnostics() {
    return { listeners: this.#listeners.size, undo: this.#undo.length, redo: this.#redo.length, history: this.#history.length, entities: this.#data.entities.length };
  }
  instantiatePrefab({ prefab, id = `entity-${this.#data.nextId}`, overrides = {} }) {
    this.commit(this.changeset([{ type: "CreatePrefabInstance", id, prefab, overrides, expectedExists: false }]));
    return this.findEntity(id);
  }
  deleteEntity(id) {
    return this.commit(this.changeset([{ type: "DeleteEntity", id, expectedExists: true }]));
  }
  #travel(from, to, type) {
    requireOK(from.length > 0, `nothing to ${type}`);
    const target = from.at(-1);
    this.validate(target);
    to.push(this.serialize());
    from.pop();
    const revision = this.revision + 1, nextId = Math.max(this.#data.nextId, target.nextId);
    this.#data = { ...copy(target), revision, nextId };
    this.#publish({ type: `scene:${type}`, revision });
    return revision;
  }
  undo() {
    return this.#travel(this.#undo, this.#redo, "undo");
  }
  redo() {
    return this.#travel(this.#redo, this.#undo, "redo");
  }
  get canUndo() {
    return this.#undo.length > 0;
  }
  get canRedo() {
    return this.#redo.length > 0;
  }
  clearListeners() {
    this.#listeners.clear();
  }
};
function validateProject(value) {
  const p = plain(value);
  requireOK(["zge.sdk.project.v1", "zge.sdk.project.v2"].includes(p.schema) && idOK(p.id) && typeof p.name === "string" && idOK(p.entryWorld) && p.worlds && Object.hasOwn(p.worlds, p.entryWorld), "invalid project");
  requireOK(Array.isArray(p.assets) && Array.isArray(p.plugins), "assets/plugins required");
  requireOK(p.plugins.every(idOK) && new Set(p.plugins).size === p.plugins.length && typeof p.worlds === "object" && !Array.isArray(p.worlds) && Object.keys(p.worlds).every(idOK), "invalid project registries");
  const ids = /* @__PURE__ */ new Set(), paths = /* @__PURE__ */ new Set();
  for (const a of p.assets) {
    requireOK(idOK(a.id) && !ids.has(a.id) && !paths.has(a.path) && typeof a.path === "string" && a.path.trim() === a.path && !a.path.includes("%") && !a.path.includes("//") && !a.path.endsWith("/") && !a.path.split("/").includes(".") && !a.path.includes("..") && !/[\\:?#]/.test(a.path) && !a.path.startsWith("/") && /^[a-f0-9]{64}$/.test(a.sha256), "invalid asset");
    ids.add(a.id);
    paths.add(a.path);
    if (a.type === "static-model") {
      requireOK(p.schema === "zge.sdk.project.v2" && p.sdkCompatibility?.minimumPreview >= 12, "static models require preview12 compatibility");
      requireOK(a.data, "embedded model required");
      requireOK(!a.data.hierarchy || p.sdkCompatibility?.minimumPreview >= 13, "hierarchical models require preview13 compatibility");
      validateModel(a.data);
    }
  }
  const needs13 = Object.values(p.worlds).some((w) => w?.rules !== void 0) || (p.rules ?? []).some((r) => ["build", "interact"].includes(r.kind) || r.bounds !== void 0);
  requireOK(!needs13 || p.schema === "zge.sdk.project.v2" && p.sdkCompatibility?.minimumPreview >= 13, "authored scene rules and interactions require preview13 compatibility");
  if (p.rules !== void 0) {
    try {
      validateRules(p.rules);
    } catch (e) {
      throw new SDKError("RULE_VALIDATION", e.message);
    }
  }
  if (p.schema === "zge.sdk.project.v2") {
    migrateProject(p);
    requireOK(p.components && typeof p.components === "object" && !Array.isArray(p.components), "component definitions required");
    for (const def of Object.values(p.components)) validateDefinition(def);
  }
  return p;
}
function createProject({ id = "my-project", name = "My project" } = {}) {
  return validateProject({ schema: "zge.sdk.project.v2", sdkCompatibility: { major: 0, minimumPreview: 13 }, id, name, entryWorld: "main", worlds: { main: null }, components: {}, assets: [], prefabs: {}, plugins: [], metadata: {}, provenance: [] });
}
function parseProject(text) {
  try {
    return validateProject(migrateProject(JSON.parse(text)));
  } catch (error) {
    if (error instanceof SDKError) throw error;
    throw new SDKError("PROJECT_PARSE", "Invalid project JSON");
  }
}
async function fetchAssetJSON(url) {
  const response = await fetch(url);
  requireOK(response.ok, "asset fetch failed");
  const reader = response.body.getReader(), chunks = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > 1048576) {
      await reader.cancel();
      throw new SDKError("ASSET_SIZE", "asset size limit 1MiB");
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const c of chunks) {
    bytes.set(c, offset);
    offset += c.length;
  }
  try {
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    throw new SDKError("ASSET_PARSE", "Invalid JSON asset");
  }
}
async function createEngine2({ project = null, renderer = "none", scheduler = "manual", authorize = () => false, assetBaseURL = null, assetBudgetBytes = null } = {}) {
  requireOK(["none", "auto", "webgpu", "webgl"].includes(renderer), "invalid renderer");
  requireOK(assetBaseURL === null || typeof assetBaseURL === "string", "assetBaseURL must be a string");
  requireOK(assetBudgetBytes === null || Number.isFinite(assetBudgetBytes) && assetBudgetBytes >= 0, "assetBudgetBytes must be a non-negative number");
  if (typeof project === "string") {
    let url = project.endsWith(".json") ? project : project.replace(/\/$/, "") + "/project.json";
    const r = await fetch(url);
    requireOK(r.ok, "project fetch failed");
    project = await r.json();
  }
  project = project ? validateProject(project) : { schema: "zge.sdk.project.v1", id: "untitled", name: "Untitled", entryWorld: "main", worlds: { main: null }, assets: [], plugins: [], prefabs: {} };
  project = validateProject(migrateProject(project));
  const kernel = new EngineKernel({ id: project.id, scheduler }), types = defaults(), definitions = new Map(Object.entries(builtinDefinitions)), worlds = /* @__PURE__ */ new Map(), assetIds = new Set(project.assets.map((a) => a.id)), assets = new AssetService({ baseURL: assetBaseURL ?? globalThis.location?.href ?? "http://localhost/", ...assetBudgetBytes === null ? {} : { budgetBytes: assetBudgetBytes } });
  for (const [type, definition] of Object.entries(project.components ?? {})) {
    requireOK(idOK(type) && !types.has(type), "duplicate component schema");
    const def = validateDefinition(definition);
    definitions.set(type, def);
    types.set(type, (value) => validateFields(value, def));
  }
  let active = null, disposed = false, presentation = null, disposePending = null;
  const alive = () => requireOK(!disposed, "engine disposed");
  assets.register("project-json", { load: async (url) => {
    const ref = project.assets.find((a) => new URL(a.path, assets.baseURL).href === url);
    requireOK(ref, "unknown project asset");
    const data = ref.data ?? await fetchAssetJSON(url);
    if (ref.type === "static-model") validateModel(data);
    const bytes = new TextEncoder().encode(JSON.stringify(plain(data)));
    requireOK(bytes.length <= 1048576, "asset size limit");
    const digest = [...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))].map((v) => v.toString(16).padStart(2, "0")).join("");
    requireOK(digest === ref.sha256, "asset hash mismatch");
    return plain(data);
  }, clone: copy, size: (v) => JSON.stringify(v).length });
  const api = {
    version: SDK_VERSION,
    renderer,
    project: copy(project),
    assets,
    componentSchemas() {
      alive();
      return Object.fromEntries([...definitions].map(([k, v]) => [k, copy(v)]));
    },
    registerComponent(type, validate, metadata = null) {
      alive();
      requireOK(idOK(type) && !types.has(type), "invalid/duplicate component");
      if (typeof validate === "object") {
        const def = validateDefinition(plain(validate));
        definitions.set(type, def);
        project.components[type] = def;
        validate = (value) => validateFields(value, def);
      } else if (metadata) {
        const def = validateDefinition(plain(metadata));
        definitions.set(type, def);
        project.components[type] = def;
      }
      requireOK(typeof validate === "function", "component validator required");
      types.set(type, validate);
      return api;
    },
    createWorld(id = "main") {
      alive();
      requireOK(!worlds.has(id), "duplicate world");
      const world = new Scene({ id, types, prefabs: project.prefabs ?? {}, assetIds, definitions });
      worlds.set(id, world);
      world.subscribe((e) => kernel.events.emit("scene", e));
      active = world;
      return world;
    },
    async loadWorld(id = project.entryWorld) {
      alive();
      if (worlds.has(id)) {
        active = worlds.get(id);
        return active;
      }
      requireOK(Object.hasOwn(project.worlds, id), "unknown world");
      const world = new Scene({ id, types, prefabs: project.prefabs ?? {}, assetIds, definitions });
      if (project.worlds[id]) world.restore(project.worlds[id]);
      worlds.set(id, world);
      world.subscribe((e) => kernel.events.emit("scene", e));
      active = world;
      return world;
    },
    get world() {
      return active;
    },
    editProperties(id, type, patch, { principal = null } = {}) {
      alive();
      const def = definitions.get(type), entity = active?.findEntity(id);
      requireOK(def && entity?.components[type], "reflected component required");
      for (const key of Object.keys(patch)) {
        const field2 = def.fields[key];
        requireOK(field2 && !field2.readOnly, "field is read-only or unsupported");
        requireOK((!field2.permission || authorize({ principal, capability: field2.permission, entityId: id }) === true) && (!def.permission || authorize({ principal, capability: def.permission, entityId: id }) === true), "field permission denied");
      }
      return active.setComponent(id, type, { ...entity.components[type], ...plain(patch) });
    },
    exportProject() {
      alive();
      const result = copy(project);
      for (const [id, w] of worlds) result.worlds[id] = w.serialize();
      if (Object.values(result.worlds).some((w) => w?.rules !== void 0)) {
        result.sdkCompatibility.minimumPreview = 13;
        result.rules = result.worlds[result.entryWorld]?.rules ?? result.rules ?? [];
      }
      return validateProject(result);
    },
    prefabStatus(entityId) {
      alive();
      const e = active?.findEntity(entityId), template = project.prefabs?.[e?.prefabId];
      return template ? { id: e.prefabId, overrides: Object.keys(e.components).filter((k) => canonicalJSON(e.components[k]) !== canonicalJSON(template.components[k])) } : null;
    },
    createPrefab(id, entityId) {
      alive();
      requireOK(idOK(id) && !Object.hasOwn(project.prefabs ?? {}, id), "prefab ID must be new");
      const e = active?.findEntity(entityId);
      requireOK(e, "entity does not exist");
      project.prefabs ??= {};
      if (e.components.editor) e.components.editor.parent = null;
      project.prefabs[id] = { name: e.name, components: e.components };
      kernel.events.emit("project:changed", { kind: "prefab", id });
      return copy(project.prefabs[id]);
    },
    assetReferences(id) {
      alive();
      return { entities: [...worlds.values()].flatMap((w) => w.entities().filter((e) => Object.entries(e.components).some(([type, c]) => Object.entries(definitions.get(type)?.fields ?? {}).some(([key, f]) => f.type === "asset" && c[key] === id))).map((e) => ({ world: w.id, entity: e.id }))), prefabs: Object.entries(project.prefabs ?? {}).filter(([, p]) => Object.entries(p.components ?? {}).some(([type, c]) => Object.entries(definitions.get(type)?.fields ?? {}).some(([key, f]) => f.type === "asset" && c[key] === id))).map(([name]) => name) };
    },
    async importAsset({ id, name = id, path = `imports/${id}.json`, data, type = "json", license = { redistribution: "unknown" } }) {
      alive();
      requireOK(["json", "static-model", "trusted-model"].includes(type) && idOK(id) && !assetIds.has(id), "unique supported asset ID required");
      data = plain(data);
      if (type === "static-model") validateModel(data);
      if (type === "trusted-model") validateTrustedModel(data);
      const bytes = new TextEncoder().encode(JSON.stringify(data));
      requireOK(bytes.length <= 1048576, "asset size limit 1MiB");
      const hash = [...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))].map((v) => v.toString(16).padStart(2, "0")).join("");
      alive();
      requireOK(!assetIds.has(id), "duplicate asset after asynchronous import");
      const asset = { id, name, path, type, data, sha256: hash, license: plain(license) };
      const compatibility = { ...project.sdkCompatibility, minimumPreview: Math.max(project.sdkCompatibility.minimumPreview, type === "static-model" ? data.hierarchy ? 13 : 12 : 0) };
      validateProject({ ...project, sdkCompatibility: compatibility, assets: [...project.assets, asset] });
      project.sdkCompatibility = compatibility;
      project.assets.push(asset);
      assetIds.add(id);
      kernel.events.emit("project:changed", { kind: "asset", id });
      return copy(asset);
    },
    async importModel({ id, name = id, bytes, hierarchy = false, license = { redistribution: "unknown" } }) {
      alive();
      const data = inspectGLB(bytes, { hierarchy });
      const sourceSha256 = [...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))].map((v) => v.toString(16).padStart(2, "0")).join("");
      return api.importAsset({ id, name, type: "static-model", path: `imports/${id}.model.json`, data: { ...data, sourceSha256 }, license });
    },
    /* ZGE-17 AC5-AC7 — first-party model tier. The project REFERENCES the .glb by path and keeps a
     * manifest plus sha256 custody; the file is never transcoded, because no portable schema here
     * expresses skinned animation. Decoding is the host's GLTFLoader (see registerAssetLoader).
     * Stays at minimumPreview 13: raising the ceiling is a release decision, and zge12.test.mjs
     * deliberately asserts that 14 is rejected as a future version. */
    async importTrustedModel({ id, name = id, path, bytes, license = { redistribution: "unknown" } }) {
      alive();
      const data = await describeTrustedModel({ path, bytes });
      requireOK(!data.unknownExtensions.length, `unrecognised glTF extensions: ${data.unknownExtensions.join(", ")}`);
      return api.importAsset({ id, name, type: "trusted-model", path, data, license });
    },
    /* The SDK never decides what a GLTF decoder is — the host supplies one, exactly as it supplies
     * the Three namespace to createViewport. packages/assets/src/threeAssetService.js exports
     * createThreeGLTFLoaderType() for this, already wired for meshopt and KTX2/Basis. Keeping it
     * out of the SDK is what lets dist/index.js stay free of external imports. */
    registerAssetLoader(type, loader) {
      alive();
      requireOK(idOK(type) && loader && typeof loader.load === "function" && typeof loader.clone === "function", "asset loader needs load and clone");
      assets.register(type, loader);
      return type;
    },
    trustedModels() {
      alive();
      return project.assets.filter((a) => a.type === "trusted-model").map((a) => copy(a));
    },
    requiredDecoders() {
      alive();
      return requiredDecoders(project.assets.filter((a) => a.type === "trusted-model").map((a) => a.data));
    },
    assetReference(id) {
      alive();
      const ref = project.assets.find((a) => a.id === id);
      requireOK(ref, "unknown public asset id");
      return copy(ref);
    },
    acquireAsset(id, options = { type: "project-json" }) {
      const ref = api.assetReference(id);
      return assets.acquire(ref.path, options);
    },
    attachRenderer(backend) {
      alive();
      requireOK(!presentation && backend && typeof backend.render === "function" && typeof backend.dispose === "function", "one owned presentation backend required");
      presentation = backend;
      return api;
    },
    registerSystem({ id, phase = "simulate", run, dispose }) {
      alive();
      requireOK(typeof run === "function", "system callback required");
      return kernel.addSystem({ id, phase, run: (_world, dt, info) => run(active, dt, { ...info, events: api.events }), dispose });
    },
    use(plugin) {
      alive();
      requireOK(kernel.lifecycle.state === "created", "plugins register before start");
      kernel.use({ ...plugin, install: () => plugin.install(api), start: plugin.start ? () => plugin.start(api) : void 0, stop: plugin.stop ? () => plugin.stop(api) : void 0, dispose: plugin.dispose ? () => plugin.dispose(api) : void 0 });
      return api;
    },
    events: { on: (type, fn) => {
      alive();
      return kernel.events.on(type, fn);
    }, emit: (type, data, channel = "authoritative") => {
      alive();
      requireOK(["authoritative", "visualization"].includes(channel), "invalid event channel");
      kernel.events.emit(type, { data: plain(data), channel, revision: active?.revision ?? 0 });
    } },
    async start() {
      alive();
      if (!active) await api.loadWorld();
      await kernel.start();
      return api;
    },
    pause() {
      alive();
      return kernel.pause();
    },
    resume() {
      alive();
      return kernel.resume();
    },
    step(count = 1) {
      alive();
      requireOK(kernel.lifecycle.state === "paused" && Number.isInteger(count) && count > 0 && count <= 120, "step requires pause and 1..120 steps");
      return kernel.step(count);
    },
    frame(time) {
      alive();
      const result = kernel.frame(time);
      presentation?.sync?.(active?.entities() ?? []);
      presentation?.render();
      return result;
    },
    metrics() {
      alive();
      const diagnostics = kernel.diagnostics();
      return { ...diagnostics, world: { ...diagnostics.world, id: active?.id ?? null, entities: active?.entities().length ?? 0, revision: active?.revision ?? 0 } };
    },
    inspectEntity(id, { principal = null, includePrivate = false } = {}) {
      alive();
      const entity = active?.findEntity(id);
      if (!entity) return null;
      for (const key of ["player", "team", "ai"]) if (Object.hasOwn(entity.components, key) && (!includePrivate || authorize({ principal, capability: `inspect.${key}`, entityId: id }) !== true)) delete entity.components[key];
      for (const [type, def] of definitions) if (def.permission && Object.hasOwn(entity.components, type) && authorize({ principal, capability: def.permission, entityId: id }) !== true) delete entity.components[type];
      for (const [type, def] of definitions) if (entity.components[type]) {
        for (const [key, field2] of Object.entries(def.fields)) if (field2.permission && authorize({ principal, capability: field2.permission, entityId: id }) !== true) delete entity.components[type][key];
      }
      return entity;
    },
    async dispose() {
      if (disposed) return;
      if (disposePending) return disposePending;
      disposePending = (async () => {
        try {
          await kernel.dispose();
        } finally {
          for (const w of worlds.values()) w.clearListeners();
          worlds.clear();
          assets.dispose();
          presentation?.dispose();
          presentation = null;
          disposed = true;
        }
      })();
      return disposePending;
    }
  };
  return Object.freeze(api);
}
function mockProposal(scene, { request = "Add a supply crate", kind = "add", entityId = null } = {}) {
  const id = `entity-${scene.serialize().nextId}`;
  let operations;
  if (kind === "objective") {
    requireOK(scene.findEntity("objective") && scene.findEntity("console"), "Objective fixture requires the Haven project");
    operations = [{ type: "SetRules", id: scene.id, expectedExists: false, value: [...(scene.serialize().rules ?? []).filter((r) => r.id !== "objective"), { id: "objective", kind: "goal", entity: "objective", component: "state", property: "complete", sourceEntity: "console", sourceComponent: "state", counter: "online", threshold: 1 }] }];
  } else if (kind === "remove") operations = [{ type: "DeleteEntity", id: entityId, expectedExists: true }];
  else if (kind === "move") operations = [{ type: "UpdateTransform", id: entityId, expectedExists: true, value: { position: [3, 0.5, 2] } }];
  else {
    requireOK(kind === "add", "unknown mock fixture");
    operations = [{ type: "CreateEntity", id, name: "Proposed supply crate", expectedExists: false, components: { transform: transform({ position: [3, 0.5, 2] }), mesh: { primitive: "box", color: "#e2ab55" } } }];
  }
  return { schema: "zge.sdk.proposal.v1", provider: "deterministic-mock-v1", request: String(request), plan: [`${kind} fixture; explicit approval required`], changeset: scene.changeset(operations) };
}
var ProposalReview = class {
  #scene;
  #proposal;
  #status = "pending";
  constructor(scene, proposal) {
    requireOK(proposal?.schema === "zge.sdk.proposal.v1" && proposal.provider === "deterministic-mock-v1" && typeof proposal.request === "string" && Array.isArray(proposal.plan), "invalid proposal");
    this.#scene = scene;
    this.#proposal = plain(proposal);
  }
  get status() {
    return this.#status;
  }
  get proposal() {
    return copy(this.#proposal);
  }
  preview() {
    requireOK(this.#status === "pending", "proposal closed");
    return this.#scene.preview(this.#proposal.changeset);
  }
  reject() {
    requireOK(this.#status === "pending", "proposal closed");
    this.#status = "rejected";
  }
  approve({ approved = false, actor = "local-author" } = {}) {
    requireOK(approved === true && this.#status === "pending", "explicit approval required");
    const revision = this.#scene.commit(this.#proposal.changeset, { actor, source: this.#proposal.provider });
    this.#status = "approved";
    return revision;
  }
};
export {
  AssetService,
  CAMERA_PRESET_SCHEMA,
  DEFAULT_MOVEMENT,
  EVASION_SCHEMA,
  KNOWN_EXTENSIONS,
  MODES,
  MOVEMENT_AUTHORITY,
  MOVEMENT_PARITY_CLASSES,
  MOVEMENT_SCHEMA,
  MovementParityReport,
  ProposalReview,
  SDKError,
  SDK_VERSION,
  Scene,
  TRUSTED_MODEL_SCHEMA,
  builtinDefinitions,
  compareMovement,
  createCameraDirector,
  createEngine2 as createEngine,
  createMovementState,
  createProject,
  describeTrustedModel,
  displacement,
  evasionCovers,
  inspectGLB,
  installMovement,
  installProjectRules,
  migrateProject,
  mockProposal,
  parseProject,
  plain,
  readGLBHeader,
  replayScript,
  requiredDecoders,
  resolveOcclusion,
  responseFrames,
  stepMovement,
  transform,
  validateCameraPreset,
  validateDefinition,
  validateEvasionWindow,
  validateMovementConfig,
  validateProject,
  validateRules,
  validateTrustedModel
};
