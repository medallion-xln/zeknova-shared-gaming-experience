/**
 * ZekNova — WorldClaw security validation
 * Location: /src/worldclaw/SecurityValidation.js
 *
 * Everything that arrives from outside the repository is untrusted.
 *
 * ── THE THREAT MODEL ─────────────────────────────────────────────────────
 * A WorldClaw-shaped pipeline ingests, in the worst case: JSON from an LLM,
 * GLB meshes from an image-to-3D service, textures of unknown dimension, file
 * paths chosen by a remote tool, and Blender output produced by a script
 * someone else wrote. Each of those is a way into the process.
 *
 * Concretely, the attacks this file blocks:
 *
 *   path traversal        "../../../../etc/passwd" as an asset path, or a
 *                         Windows-style "..\\" that a naive `startsWith` check
 *                         on a POSIX separator would miss
 *   executable injection  a "mesh" whose path ends in .js/.html/.wasm, which a
 *                         loader configured by extension could execute
 *   remote fetch          an absolute http(s)://, file:// or data: URL smuggled
 *                         in as a local path, turning asset load into exfil
 *   memory exhaustion     a GLB claiming 40M triangles or an 16384² texture,
 *                         which will not crash the validator but will take the
 *                         tab down when it decodes
 *   malformed geometry    NaN/Infinity coordinates, which propagate silently
 *                         through physics and produce an unrecoverable world
 *   shader injection      a material carrying raw GLSL, which must never reach
 *                         a compile call
 *   extension abuse       unknown glTF extensions, which can carry executable
 *                         or loader-specific behaviour
 *
 * ── THE POSTURE ──────────────────────────────────────────────────────────
 * Allow-list, never deny-list. A deny-list of dangerous extensions is a list of
 * the attacks someone already thought of; an allow-list of the four mesh
 * extensions ZekNova actually loads is a list of what is safe. Anything not
 * explicitly permitted is rejected.
 *
 * And: NOTHING here executes, evaluates, compiles or dynamically imports any
 * external content. Validation is string and number inspection only.
 */

/** Hard limits. Exceeding any of them is a rejection, not a warning. */
export const SECURITY_LIMITS = Object.freeze({
  maxAssetBytes: 24 * 1024 * 1024,      // one mesh; the heaviest shipped GLB is well under this
  maxRegionBytes: 96 * 1024 * 1024,     // a whole generated region payload
  maxTriangles: 400000,                 // per mesh; above this a single object dominates the frame
  maxTextureDimension: 4096,            // matches what the shipped KTX2 pipeline emits
  maxTextureCount: 12,
  maxJsonBytes: 4 * 1024 * 1024,
  maxJsonDepth: 24,                     // deep nesting is how a parser is made to blow its stack
  maxObjectsPerRegion: 4000,
  maxPathLength: 256,
  maxIdLength: 128,
  providerTimeoutMs: 20000,
  maxCoordinate: 1e5,                   // beyond the world by orders of magnitude
});

/** The only mesh containers ZekNova loads. Allow-list, not deny-list. */
export const ALLOWED_ASSET_EXTENSIONS = Object.freeze([".glb", ".gltf", ".ktx2", ".webp", ".png", ".jpg"]);

/** The only glTF extensions permitted on ingested meshes. */
export const ALLOWED_GLTF_EXTENSIONS = Object.freeze([
  "KHR_draco_mesh_compression",
  "KHR_mesh_quantization",
  "KHR_texture_basisu",
  "KHR_materials_unlit",
  "KHR_materials_emissive_strength",
  "EXT_meshopt_compression",
  "EXT_texture_webp",
]);

/** Directories an ingested asset may live under. Anything else is rejected. */
export const ALLOWED_BASE_DIRS = Object.freeze([
  "./assets/models/generated",
  "./assets/models/environment",
  "./assets/models",
]);

const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._@#:-]*$/;
const SEGMENT_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
/* Anything that smells like a shader or a script, checked case-insensitively
   across the whole material payload rather than field by field. */
const SHADER_TOKENS = /(gl_FragColor|gl_Position|void\s+main|#version\s+\d|texture2D\s*\(|<script|javascript:|data:text\/html)/i;

/**
 * Validate a file path for an ingested asset.
 *
 * The traversal check is done on SEGMENTS, after normalising backslashes.
 * Checking the whole string for "../" misses "..\\", "%2e%2e%2f", and a path
 * that resolves outside its base without ever containing a literal "..".
 * Segment inspection with a strict character allow-list has none of those
 * holes: a segment that is not `[A-Za-z0-9][A-Za-z0-9._-]*` simply cannot be
 * `..`, cannot be absolute, and cannot contain a scheme.
 */
export function validatePath(rawPath, { baseDir = null } = {}) {
  const errors = [];
  if (typeof rawPath !== "string" || rawPath.length === 0) {
    return { valid: false, errors: ["Path is missing or not a string."] };
  }
  if (rawPath.length > SECURITY_LIMITS.maxPathLength) {
    errors.push(`Path exceeds ${SECURITY_LIMITS.maxPathLength} characters.`);
  }
  if (/[\u0000-\u001f\u007f]/.test(rawPath)) errors.push("Path contains control characters.");
  // Any scheme at all — http, https, file, data, blob, javascript.
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(rawPath)) errors.push("Path carries a URL scheme; only repository-relative paths are permitted.");
  if (rawPath.startsWith("/") || rawPath.startsWith("\\")) errors.push("Path is absolute.");
  if (/^[A-Za-z]:[\\/]/.test(rawPath)) errors.push("Path is an absolute Windows path.");
  if (/%2e|%2f|%5c/i.test(rawPath)) errors.push("Path contains percent-encoded separators.");

  const normalised = rawPath.replace(/\\/g, "/");
  const segments = normalised.split("/").filter((segment) => segment !== "" && segment !== ".");
  for (const segment of segments) {
    if (segment === "..") { errors.push("Path traverses upward."); continue; }
    if (!SEGMENT_PATTERN.test(segment)) errors.push(`Path segment "${segment}" contains characters that are not permitted.`);
  }

  const lower = normalised.toLowerCase();
  const extension = lower.slice(lower.lastIndexOf("."));
  if (!ALLOWED_ASSET_EXTENSIONS.includes(extension)) {
    errors.push(`Extension "${extension}" is not in the allow-list (${ALLOWED_ASSET_EXTENSIONS.join(", ")}).`);
  }

  const dirs = baseDir ? [baseDir, ...ALLOWED_BASE_DIRS] : ALLOWED_BASE_DIRS;
  const withinBase = dirs.some((dir) => normalised.startsWith(dir.replace(/\\/g, "/").replace(/\/$/, "") + "/"));
  if (!withinBase) errors.push(`Path is outside every permitted directory (${dirs.join(", ")}).`);

  return { valid: errors.length === 0, errors, normalised };
}

/** Identifier check: ids end up in DOM attributes, map keys and file names. */
export function validateId(id) {
  if (typeof id !== "string" || !id) return { valid: false, errors: ["Id is missing."] };
  if (id.length > SECURITY_LIMITS.maxIdLength) return { valid: false, errors: [`Id exceeds ${SECURITY_LIMITS.maxIdLength} characters.`] };
  if (!ID_PATTERN.test(id)) return { valid: false, errors: [`Id "${id}" contains characters that are not permitted.`] };
  return { valid: true, errors: [] };
}

/** Finite, in-world number. Rejects NaN, Infinity and absurd magnitudes. */
export function validateNumber(value, label, { min = -SECURITY_LIMITS.maxCoordinate, max = SECURITY_LIMITS.maxCoordinate } = {}) {
  if (typeof value !== "number" || !Number.isFinite(value)) return `${label} is not a finite number.`;
  if (value < min || value > max) return `${label} (${value}) is outside the permitted range [${min}, ${max}].`;
  return null;
}

/**
 * Depth-and-size check for untrusted JSON, run BEFORE anything reads its
 * contents. A deeply nested payload can exhaust the stack in any recursive
 * consumer, including this module's own validators.
 */
export function validateJsonPayload(raw) {
  const errors = [];
  const text = typeof raw === "string" ? raw : JSON.stringify(raw ?? null);
  if (text.length > SECURITY_LIMITS.maxJsonBytes) {
    errors.push(`JSON payload is ${text.length} bytes, over the ${SECURITY_LIMITS.maxJsonBytes} limit.`);
    return { valid: false, errors, value: null };
  }
  let value;
  if (typeof raw === "string") {
    try { value = JSON.parse(raw); } catch (error) { return { valid: false, errors: [`JSON is malformed: ${error.message}`], value: null }; }
  } else {
    value = raw;
  }
  // Iterative depth walk — recursion here would be the very stack overflow the
  // check exists to prevent.
  const stack = [{ node: value, depth: 1 }];
  let maxDepth = 0;
  while (stack.length) {
    const { node, depth } = stack.pop();
    maxDepth = Math.max(maxDepth, depth);
    if (depth > SECURITY_LIMITS.maxJsonDepth) {
      return { valid: false, errors: [`JSON nests deeper than ${SECURITY_LIMITS.maxJsonDepth} levels.`], value: null };
    }
    if (node && typeof node === "object") {
      for (const key of Object.keys(node)) {
        // Prototype pollution: these keys must never be carried into a merge.
        if (key === "__proto__" || key === "constructor" || key === "prototype") {
          return { valid: false, errors: [`JSON contains a prohibited key "${key}".`], value: null };
        }
        stack.push({ node: node[key], depth: depth + 1 });
      }
    }
  }
  return { valid: errors.length === 0, errors, value, depth: maxDepth };
}

/**
 * Validate one asset descriptor from an external provider or manifest.
 *
 * Returns a SANITISED copy on success — not the original object. Passing the
 * caller's own object through would let unvalidated extra fields ride along
 * into the spec; rebuilding it field by field means only what was checked
 * survives.
 */
export function validateGeneratedAsset(entry, { baseDir = null } = {}) {
  const errors = [];
  if (!entry || typeof entry !== "object") return { valid: false, errors: ["Asset descriptor is not an object."], asset: null };

  const payload = validateJsonPayload(entry);
  if (!payload.valid) return { valid: false, errors: payload.errors, asset: null };

  const idCheck = validateId(entry.id);
  if (!idCheck.valid) errors.push(...idCheck.errors);

  const pathCheck = validatePath(entry.path, { baseDir });
  if (!pathCheck.valid) errors.push(...pathCheck.errors);

  for (const [field, limit] of [["bytes", SECURITY_LIMITS.maxAssetBytes], ["triangles", SECURITY_LIMITS.maxTriangles]]) {
    if (entry[field] === undefined) continue;
    const problem = validateNumber(entry[field], field, { min: 0, max: limit });
    if (problem) errors.push(problem);
  }

  if (entry.textures !== undefined) {
    if (!Array.isArray(entry.textures)) {
      errors.push("textures must be an array.");
    } else {
      if (entry.textures.length > SECURITY_LIMITS.maxTextureCount) {
        errors.push(`Asset declares ${entry.textures.length} textures, over the ${SECURITY_LIMITS.maxTextureCount} limit.`);
      }
      for (const [index, texture] of entry.textures.entries()) {
        for (const dimension of ["width", "height"]) {
          const problem = validateNumber(texture?.[dimension], `texture[${index}].${dimension}`, { min: 1, max: SECURITY_LIMITS.maxTextureDimension });
          if (problem) errors.push(problem);
        }
      }
    }
  }

  if (entry.extensions !== undefined) {
    if (!Array.isArray(entry.extensions)) {
      errors.push("extensions must be an array.");
    } else {
      for (const extension of entry.extensions) {
        if (!ALLOWED_GLTF_EXTENSIONS.includes(extension)) {
          errors.push(`glTF extension "${extension}" is not in the allow-list.`);
        }
      }
    }
  }

  if (entry.material !== undefined) {
    const materialCheck = validateMaterial(entry.material);
    if (!materialCheck.valid) errors.push(...materialCheck.errors);
  }

  for (const field of ["height", "radius"]) {
    if (entry.dimensions?.[field] === undefined) continue;
    const problem = validateNumber(entry.dimensions[field], `dimensions.${field}`, { min: 0, max: 500 });
    if (problem) errors.push(problem);
  }

  if (errors.length) return { valid: false, errors, asset: null };

  // Rebuilt field by field. Nothing unvalidated crosses this boundary.
  return {
    valid: true,
    errors: [],
    asset: Object.freeze({
      id: entry.id,
      path: pathCheck.normalised,
      type: "structure",
      role: typeof entry.role === "string" && ID_PATTERN.test(entry.role) ? entry.role : "object",
      biomeTags: Object.freeze(sanitiseTagList(entry.biomeTags)),
      civilizationTags: Object.freeze(sanitiseTagList(entry.civilizationTags, ["zeknovan"])),
      dimensions: Object.freeze({
        height: Number(entry.dimensions?.height ?? 3),
        radius: Number(entry.dimensions?.radius ?? 1.4),
        footprint: "medium",
      }),
      collisionType: Number(entry.dimensions?.radius ?? 1.4) > 0 ? "cylinder" : "none",
      collisionRadius: Number(entry.dimensions?.radius ?? 1.4),
      lodLevels: Number.isInteger(entry.lodLevels) && entry.lodLevels > 0 && entry.lodLevels <= 4 ? entry.lodLevels : 1,
      traversalRole: "blocking",
      gameplayRole: "ambience",
      rarity: 0.5,
      generationCost: 3,
      triangles: Number(entry.triangles ?? 0),
      bytes: Number(entry.bytes ?? 0),
      provider: typeof entry.provider === "string" && ID_PATTERN.test(entry.provider) ? entry.provider : "external",
      sourceTier: 5,
    }),
  };
}

/** Materials must be parameter sets, never code. */
export function validateMaterial(material) {
  const errors = [];
  if (!material || typeof material !== "object") return { valid: false, errors: ["Material is not an object."] };
  const serialised = JSON.stringify(material);
  if (SHADER_TOKENS.test(serialised)) {
    errors.push("Material payload contains shader or script source; only parameter values are permitted.");
  }
  for (const key of ["vertexShader", "fragmentShader", "shader", "glsl", "wgsl", "onBeforeCompile"]) {
    if (key in material) errors.push(`Material carries a "${key}" field, which is never accepted from an external source.`);
  }
  for (const [key, value] of Object.entries(material)) {
    if (typeof value === "function") errors.push(`Material field "${key}" is a function.`);
    if (typeof value === "string" && value.length > 512) errors.push(`Material field "${key}" is suspiciously long.`);
  }
  return { valid: errors.length === 0, errors };
}

/**
 * Validate a whole region payload from an external provider.
 * Object count and coordinate finiteness are the two checks that matter most:
 * the first bounds memory, the second stops NaN entering physics.
 */
export function validateGeneratedRegion(region) {
  const errors = [];
  if (!region || typeof region !== "object") return { valid: false, errors: ["Region payload is not an object."], region: null };

  const payload = validateJsonPayload(region);
  if (!payload.valid) return { valid: false, errors: payload.errors, region: null };

  const idCheck = validateId(region.id);
  if (!idCheck.valid) errors.push(...idCheck.errors);

  const objects = Array.isArray(region.objects) ? region.objects : [];
  if (objects.length > SECURITY_LIMITS.maxObjectsPerRegion) {
    errors.push(`Region declares ${objects.length} objects, over the ${SECURITY_LIMITS.maxObjectsPerRegion} limit.`);
  }

  const clean = [];
  for (const [index, object] of objects.entries()) {
    const problems = [];
    for (const axis of ["x", "y", "z"]) {
      const problem = validateNumber(object?.[axis], `objects[${index}].${axis}`);
      if (problem) problems.push(problem);
    }
    const objectPath = object?.assetPath ? validatePath(object.assetPath) : { valid: true, errors: [], normalised: null };
    if (!objectPath.valid) problems.push(...objectPath.errors);
    if (problems.length) { errors.push(...problems); continue; }
    clean.push(Object.freeze({
      id: typeof object.id === "string" && ID_PATTERN.test(object.id) ? object.id : `object-${index}`,
      x: object.x, y: object.y, z: object.z,
      rotation: Number.isFinite(object.rotation) ? object.rotation : 0,
      assetPath: objectPath.normalised,
    }));
  }

  if (errors.length) return { valid: false, errors, region: null };
  return { valid: true, errors: [], region: Object.freeze({ id: region.id, objects: Object.freeze(clean) }) };
}

function sanitiseTagList(list, fallback = []) {
  if (!Array.isArray(list)) return [...fallback];
  return list.filter((tag) => typeof tag === "string" && ID_PATTERN.test(tag) && tag.length <= 48).slice(0, 16);
}

/**
 * Validate an LLM-proposed world specification before the planner touches it.
 *
 * This is the boundary the brief's "never permit an LLM to directly manipulate
 * the live game scene" rule lives on. A proposal is JSON — data — and it is
 * checked as untrusted JSON with no privileged fields, no code, and no paths,
 * before the deterministic planner is allowed to read a single value from it.
 */
export function validateProposal(proposal) {
  const errors = [];
  const payload = validateJsonPayload(proposal);
  if (!payload.valid) return { valid: false, errors: payload.errors, proposal: null };

  const value = payload.value;
  if (!value || typeof value !== "object") return { valid: false, errors: ["Proposal is not an object."], proposal: null };

  /* Only these fields are read. A proposal that tries to set `digest`,
     `generatorVersion`, or anything the runtime treats as authoritative is
     stripped rather than rejected — the planner recomputes them all anyway,
     and stripping keeps a well-meaning-but-verbose model usable. */
  const allowed = ["intent", "regions", "relationships", "traversal", "atmosphere", "notes"];
  const cleaned = {};
  for (const key of allowed) if (value[key] !== undefined) cleaned[key] = value[key];

  if (cleaned.regions !== undefined && !Array.isArray(cleaned.regions)) {
    errors.push("Proposal `regions` must be an array.");
  }
  for (const region of cleaned.regions ?? []) {
    const idCheck = validateId(region?.id ?? "");
    if (!idCheck.valid) errors.push(`Proposed region id: ${idCheck.errors.join(" ")}`);
    for (const axis of ["minX", "maxX", "minZ", "maxZ"]) {
      if (region?.bounds?.[axis] === undefined) continue;
      const problem = validateNumber(region.bounds[axis], `region "${region.id}" bounds.${axis}`);
      if (problem) errors.push(problem);
    }
  }
  if (typeof cleaned.intent === "string" && cleaned.intent.length > 4000) {
    errors.push("Proposal intent exceeds 4000 characters.");
  }

  return { valid: errors.length === 0, errors, proposal: errors.length === 0 ? cleaned : null };
}
