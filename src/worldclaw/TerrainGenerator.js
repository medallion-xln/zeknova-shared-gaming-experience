/**
 * ZekNova — WorldClaw terrain generation
 * Location: /src/worldclaw/TerrainGenerator.js
 *
 * Globally coherent, semantically regional terrain.
 *
 * ── THE PROBLEM THIS SOLVES ──────────────────────────────────────────────
 * ZekNova's live terrain is one noise field (`zkT` in the runtime bundle) with
 * five biome *labels* painted across it in vertical bands. The height function
 * has no idea a band boundary exists. That is why the world reads as
 *
 *     desert | highlands | arctic
 *
 * with the label changing but the landform not — and why nowhere on ZekNova is
 * there a canyon that exists *because* it is between two things.
 *
 * The fix is not more noise. It is to make elevation a property of the region
 * graph: every region declares a base elevation, a relief amplitude and a
 * ridged weight, and the height at any point is the influence-weighted blend of
 * whichever regions reach it. A transition region with its own low base and
 * high ridged weight then IS a canyon, everywhere it applies, automatically.
 *
 *     DESERT  ->  CANYON TRANSITION  ->  HIGHLANDS  ->  ALPINE
 *
 * ── COMPATIBILITY WITH THE LIVE RUNTIME ──────────────────────────────────
 * The noise primitives below are deliberately the same *shape* as the ones the
 * shipped bundle uses (`FR` value noise, `zkH` fbm, ridged bands, domain warp,
 * a Gaussian river carve, a radial rim past r=48). A generated region therefore
 * sits flush against handcrafted terrain instead of stepping at the seam, and
 * a WorldSpec that describes today's world reproduces today's landform.
 *
 * ── DETERMINISM ──────────────────────────────────────────────────────────
 * Pure functions of (x, z, seed, spec). No state, no Date, no Math.random.
 * `buildHeightField` over the same spec always returns bit-identical samples,
 * which is what makes the persistence contract in Phase 17 possible.
 *
 * ── PERFORMANCE ──────────────────────────────────────────────────────────
 * `heightAt` is called for every grid sample, every placement probe and every
 * navigation step, so it is written as flat arithmetic with no allocation.
 * Region influence is resolved against a prepared, flattened region array
 * (`prepare()`) rather than re-reading the frozen spec per sample.
 */

import { deriveSeed } from "./WorldSpec.js";
import { biomeBible } from "./ZekNovaWorldBible.js";

/* ── noise primitives (mirroring the live runtime's shape) ─────────────── */

/**
 * Integer hash for the value-noise lattice.
 *
 * Hoisted to module scope rather than defined inside `valueNoise`. As a closure
 * it was allocated on every call — about twenty-five allocations per `heightAt`
 * once the fbm octaves are counted, and several million per generation. Node's
 * escape analysis erased them; Chrome's did not, which is most of why the same
 * deterministic generation took half a second in Node and eight seconds in the
 * editor. The arithmetic is unchanged.
 */
function latticeHash(gx, gz, seed) {
  let h = Math.imul(gx, 374761393) + Math.imul(gz, 668265263) + Math.imul(seed, 69069);
  h = (h ^ (h >>> 13)) >>> 0;
  h = Math.imul(h, 1274126177) >>> 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}

/** Hash-based value noise with smoothstep interpolation. Matches `FR`. */
export function valueNoise(x, z, seed) {
  const ix = Math.floor(x), iz = Math.floor(z);
  const fx = x - ix, fz = z - iz;
  const sx = fx * fx * (3 - 2 * fx), sz = fz * fz * (3 - 2 * fz);
  const n00 = latticeHash(ix, iz, seed), n10 = latticeHash(ix + 1, iz, seed);
  const n01 = latticeHash(ix, iz + 1, seed), n11 = latticeHash(ix + 1, iz + 1, seed);
  const a = n00 + (n10 - n00) * sx;
  const b = n01 + (n11 - n01) * sx;
  return a + (b - a) * sz;
}

/** Signed fbm in [-1, 1]. Matches `zkH`. */
export function fbm(x, z, seed, frequency = 0.02, octaves = 3) {
  let sum = 0, amplitude = 1, norm = 0, freq = frequency;
  for (let i = 0; i < octaves; i += 1) {
    sum += (valueNoise(x * freq, z * freq, seed + i * 1619) * 2 - 1) * amplitude;
    norm += amplitude;
    amplitude *= 0.5;
    freq *= 2.03;
  }
  return sum / norm;
}

/** Ridged band in [0, 1]: 1 along the crest, falling away sharply. */
export function ridged(x, z, seed, frequency, sharpness) {
  return Math.pow(Math.max(0, 1 - Math.abs(fbm(x, z, seed, frequency, 3))), sharpness);
}

/* ── region influence ──────────────────────────────────────────────────── */

/**
 * Flatten a spec into the arrays the sampler reads. Called once per world.
 *
 * `blend` is how far a region's influence reaches past its own bounds. It is
 * taken from the adjacency relationship when one exists, so a designer can say
 * "this border is a hard cliff" (blendWidth 2) or "this one is a long slow
 * rise" (blendWidth 24) and the terrain obeys.
 */
export function prepare(spec) {
  const blendByRegion = new Map();
  for (const rel of spec.relationships ?? []) {
    for (const id of [rel.from, rel.to]) {
      blendByRegion.set(id, Math.max(blendByRegion.get(id) ?? 0, rel.blendWidth));
    }
  }
  const regions = (spec.regions ?? []).map((region, index) => ({
    id: region.id,
    biome: region.biome,
    index,
    minX: region.bounds.minX, maxX: region.bounds.maxX,
    minZ: region.bounds.minZ, maxZ: region.bounds.maxZ,
    base: region.elevation.base,
    relief: region.elevation.relief,
    ridgedWeight: region.elevation.ridged,
    // A region with no declared adjacency still needs SOME falloff or its edge
    // is a vertical wall; 6 is the narrowest border the art reads as a slope.
    blend: Math.max(6, blendByRegion.get(region.id) ?? 8),
    seed: deriveSeed(spec.seed, `region:${region.id}`),
  }));
  return {
    regions,
    seed: spec.seed >>> 0,
    worldSize: spec.world.worldSize,
    waterLevel: spec.world.waterLevel,
    half: spec.world.playableHalfExtent,
    rivers: (spec.traversal?.rivers ?? []).map((river) => ({
      amplitude: Number(river.amplitude ?? 6.4),
      wavelength: Number(river.wavelength ?? 0.052),
      secondaryAmplitude: Number(river.secondaryAmplitude ?? 2.6),
      secondaryWavelength: Number(river.secondaryWavelength ?? 0.018),
      phase: Number(river.phase ?? 1.15),
      width: Number(river.width ?? 8.5),
      depth: Number(river.depth ?? 3.1),
      dry: Boolean(river.dry),
      axis: river.axis === "z" ? "z" : "x",
    })),
  };
}

/**
 * How strongly a region claims a point. 1 well inside, falling smoothly to 0
 * `blend` units outside. Smoothstep rather than linear so blended borders have
 * no visible crease where influence starts.
 */
function influence(region, x, z) {
  const dx = Math.max(region.minX - x, 0, x - region.maxX);
  const dz = Math.max(region.minZ - z, 0, z - region.maxZ);
  const distance = Math.sqrt(dx * dx + dz * dz);
  if (distance <= 0) return 1;
  if (distance >= region.blend) return 0;
  const t = 1 - distance / region.blend;
  return t * t * (3 - 2 * t);
}

/** The region whose influence is strongest at a point (the semantic owner). */
export function regionAt(prepared, x, z) {
  let best = null, bestWeight = -1;
  for (const region of prepared.regions) {
    const weight = influence(region, x, z);
    // `>` not `>=` keeps the earlier-declared region as the tie-break winner,
    // so ownership at a shared border does not depend on iteration order.
    if (weight > bestWeight) { bestWeight = weight; best = region; }
  }
  return bestWeight > 0 ? best : null;
}

/**
 * Every region with non-zero influence, and their normalised weights.
 *
 * This allocates, so it is NOT used by `heightAt` — see the note there. It
 * exists for callers that genuinely need the list (diagnostics, the editor's
 * region readout), which are called once, not a million times.
 */
export function regionWeights(prepared, x, z) {
  const out = [];
  let total = 0;
  for (const region of prepared.regions) {
    const weight = influence(region, x, z);
    if (weight > 0) { out.push({ region, weight }); total += weight; }
  }
  if (total === 0) return [];
  for (const entry of out) entry.weight /= total;
  return out;
}

/* ── river ─────────────────────────────────────────────────────────────── */

/** Centreline of a river at a coordinate along its axis. */
export function riverCenterAt(river, along) {
  return Math.sin(along * river.wavelength) * river.amplitude
       + Math.sin(along * river.secondaryWavelength + river.phase) * river.secondaryAmplitude;
}

/** Distance to the nearest river centreline. Infinity when there are none. */
export function riverDistanceAt(prepared, x, z) {
  const rivers = prepared.rivers;
  if (rivers.length === 0) return Infinity;
  let nearest = Infinity;
  for (const river of rivers) {
    const along = river.axis === "x" ? x : z;
    const across = river.axis === "x" ? z : x;
    nearest = Math.min(nearest, Math.abs(across - riverCenterAt(river, along)));
  }
  return nearest;
}

/* ── height ────────────────────────────────────────────────────────────── */

/**
 * Terrain height at a point, as the influence-weighted blend of every region
 * that reaches it.
 *
 * The blend is over the region *parameters*, not over separately-computed
 * heights. Blending finished heights produces a visible ghost of both landforms
 * across the border; blending the parameters that generate them produces one
 * landform that changes character, which is what a real transition looks like.
 */
export function heightAt(prepared, x, z) {
  /* Region blending is inlined and ALLOCATION-FREE.
     This is the hottest function in the subsystem — every grid sample, every
     placement probe, every slope test and every navigation step goes through it,
     and `slopeAt` calls it four more times. It used to call `regionWeights`,
     which allocates an array plus one object per overlapping region on every
     call: at roughly 700k allocations per 100k samples that made terrain
     sampling thirty times slower in Chrome than in Node, and turned a
     half-second generation into fifteen seconds in the editor. The arithmetic
     below is identical; only the garbage is gone. */
  const regions = prepared.regions;
  let total = 0, base = 0, relief = 0, ridgedWeight = 0;
  let dominantWeight = -1, regionSeed = prepared.seed;

  for (let i = 0; i < regions.length; i += 1) {
    const region = regions[i];
    const dx = region.minX - x > 0 ? region.minX - x : (x - region.maxX > 0 ? x - region.maxX : 0);
    const dz = region.minZ - z > 0 ? region.minZ - z : (z - region.maxZ > 0 ? z - region.maxZ : 0);
    let weight;
    if (dx === 0 && dz === 0) {
      weight = 1;
    } else {
      const distance = Math.sqrt(dx * dx + dz * dz);
      if (distance >= region.blend) continue;
      const t = 1 - distance / region.blend;
      weight = t * t * (3 - 2 * t);
      if (weight <= 0) continue;
    }
    total += weight;
    base += region.base * weight;
    relief += region.relief * weight;
    ridgedWeight += region.ridgedWeight * weight;
    if (weight > dominantWeight) { dominantWeight = weight; regionSeed = region.seed; }
  }

  if (total > 0) {
    base /= total; relief /= total; ridgedWeight /= total;
  } else {
    // Outside every region's reach: the world's neutral profile.
    base = 3.15; relief = 3.7; ridgedWeight = 0.5;
  }

  /* Domain warp. One shared warp field across the whole planet — NOT per
     region — because a warp that changed at a border would tear the noise
     there, which is the exact seam this system exists to remove. */
  const warpX = fbm(x + 311, z - 197, prepared.seed + 17, 0.008, 2) * 13;
  const warpZ = fbm(x - 149, z + 263, prepared.seed + 29, 0.008, 2) * 13;
  const wx = x + warpX, wz = z + warpZ;

  const body = fbm(wx, wz, regionSeed + 43, 0.011, 3);
  const mountains = ridged(wx + 73, wz - 51, regionSeed + 71, 0.024, 6);
  const valleys = ridged(wx - 181, wz + 109, regionSeed + 101, 0.018, 9);
  const detail = fbm(wx, wz, regionSeed + 137, 0.072, 3);
  // Detail is suppressed inside ridge crests: real ridgelines are smooth stone,
  // and leaving detail on them reads as noise rather than rock.
  const detailMask = 1 - Math.min(1, mountains * 1.45);

  let height = base
    + body * relief
    + mountains * ridgedWeight * (5.1 + Math.max(0, body) * 3.2)
    - valleys * ridgedWeight * 1.15
    + detail * (0.42 + detailMask * 0.55);

  // Radial rim past r=48 — keeps the playable area bowled in, matching the live
  // world so the player cannot walk off the terrain into the void.
  const radius = Math.sqrt(x * x + z * z);
  height += Math.max(0, radius - 48) * 0.035;

  // River carve.
  const distance = riverDistanceAt(prepared, x, z);
  if (Number.isFinite(distance)) {
    const carve = Math.exp(-Math.pow(distance / 8.5, 2)) * 3.1;
    height -= carve;
    const anyWet = prepared.rivers.some((river) => !river.dry);
    if (anyWet && distance <= 3.2) {
      // Flat, submerged bed rather than a V-notch, so boats and bridges work.
      height = Math.min(height, prepared.waterLevel - 2.35 + Math.min(distance, 3.2) * 0.08);
    }
  }

  return height;
}

/** Slope magnitude used by every buildability test. Matches the live rule. */
export function slopeAt(prepared, x, z, probe = 1.5) {
  const dx = Math.abs(heightAt(prepared, x + probe, z) - heightAt(prepared, x - probe, z));
  const dz = Math.abs(heightAt(prepared, x, z + probe) - heightAt(prepared, x, z - probe));
  return dx + dz;
}

export function isWaterAt(prepared, x, z, margin = 0.18) {
  return heightAt(prepared, x, z) <= prepared.waterLevel + margin;
}

/**
 * Sampled height grid, in the same layout the live runtime uses
 * (`Float32Array`, row-major, `gridSize²`), so it can be handed straight to
 * `sampleHeightGrid` in `src/world/Terrain.js` or to the bundle's own sampler.
 */
export function buildHeightField(spec, { gridSize = spec.world.heightGridSize } = {}) {
  const prepared = prepare(spec);
  const size = Math.max(2, Math.floor(gridSize));
  const heights = new Float32Array(size * size);
  const half = spec.world.worldSize / 2;
  const step = spec.world.worldSize / (size - 1);
  let min = Infinity, max = -Infinity;
  for (let row = 0; row < size; row += 1) {
    const z = -half + row * step;
    for (let col = 0; col < size; col += 1) {
      const height = heightAt(prepared, -half + col * step, z);
      heights[row * size + col] = height;
      if (height < min) min = height;
      if (height > max) max = height;
    }
  }
  return { heights, gridSize: size, worldSize: spec.world.worldSize, step, min, max, prepared };
}

/**
 * Landform classification at a point — what the terrain IS here, not merely how
 * tall it is. The critic and the placement solver both read this: a "cliff" is
 * never a settlement site and a "plain" is never a landmark.
 */
export function landformAt(prepared, x, z) {
  const height = heightAt(prepared, x, z);
  const slope = slopeAt(prepared, x, z);
  const waterline = prepared.waterLevel;
  if (height <= waterline + 0.18) return "water";
  if (riverDistanceAt(prepared, x, z) < 6) return "riverbank";
  if (slope > 6) return "cliff";
  if (slope > 3.3) return "slope";
  if (height > 14) return "peak";
  if (height > 8) return "highland";
  if (height < waterline + 1.6) return "basin";
  return "plain";
}

/**
 * Terrain statistics for a region. Used by the critic (coherence, gaps) and by
 * the editor's readout. Sampled on a fixed lattice so the numbers are stable.
 */
export function regionTerrainStats(spec, regionId, { samples = 24 } = {}) {
  const prepared = prepare(spec);
  const region = prepared.regions.find((entry) => entry.id === regionId);
  if (!region) return null;
  const counts = Object.create(null);
  let min = Infinity, max = -Infinity, sum = 0, steepest = 0, n = 0;
  for (let i = 0; i < samples; i += 1) {
    for (let j = 0; j < samples; j += 1) {
      const x = region.minX + (region.maxX - region.minX) * (i / (samples - 1));
      const z = region.minZ + (region.maxZ - region.minZ) * (j / (samples - 1));
      const height = heightAt(prepared, x, z);
      const slope = slopeAt(prepared, x, z);
      const form = landformAt(prepared, x, z);
      counts[form] = (counts[form] ?? 0) + 1;
      min = Math.min(min, height); max = Math.max(max, height);
      sum += height; steepest = Math.max(steepest, slope); n += 1;
    }
  }
  return {
    regionId, biome: region.biome, samples: n,
    minHeight: min, maxHeight: max, meanHeight: sum / n, steepestSlope: steepest,
    landforms: counts,
    bible: biomeBible(region.biome).geology,
  };
}
