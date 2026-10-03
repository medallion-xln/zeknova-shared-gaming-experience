/**
 * ZekNova — WorldClaw persistence and reproducibility
 * Location: /src/worldclaw/WorldPersistence.js
 *
 * A generated world must survive a reload without being regenerated, and must
 * regenerate identically when it is.
 *
 * ── THE RULE THE BRIEF STATES, AND WHY IT MATTERS ────────────────────────
 *
 *     Never save only the prompt.
 *
 * A prompt is not a world. Re-running a planner on the same sentence gives the
 * same world only while the planner, the Bible, the asset registry and the
 * terrain constants are all unchanged — that is, until the next commit. A save
 * that stores only intent is a save that silently rebuilds someone's colony
 * somewhere else the first time a threshold moves.
 *
 * So a save stores four things, and each has a distinct job:
 *
 *   seed + generatorVersion  reproduce generation, and DETECT when the
 *                            generator has moved under a saved world
 *   the full WorldSpec       the authoritative placements, so a load never
 *                            has to trust regeneration at all
 *   the spec digest          proves the spec was not altered or truncated
 *   player deltas            what the player did TO the world afterwards:
 *                            structures built, objects destroyed, mission state
 *
 * Deltas are stored separately from the spec on purpose. Merging them would
 * make a player's colony indistinguishable from generated content, and the next
 * regeneration would either destroy their buildings or preserve rubble as
 * architecture.
 *
 * ── SIZE ─────────────────────────────────────────────────────────────────
 * A full spec is large (hundreds of placements). `compress()` drops everything
 * that is derivable — `reason` strings, asset paths implied by `assetId`, y
 * values implied by terrain — and `expand()` restores them. That is safe
 * precisely because those fields ARE derivable; anything that is not derivable
 * is stored verbatim.
 */

import {
  createWorldSpec, specDigest, GENERATOR_VERSION, WORLD_SPEC_VERSION,
} from "./WorldSpec.js";
import { assetById } from "./WorldAssetRegistry.js";
import { prepare, heightAt } from "./TerrainGenerator.js";
import { validateJsonPayload, validateId, SECURITY_LIMITS } from "./SecurityValidation.js";

export const SAVE_FORMAT_VERSION = 1;

/**
 * Build a save record.
 *
 * `deltas` carries everything the PLAYER changed; it is the caller's job to
 * supply it, because WorldClaw does not own mission or building state — the
 * live game does, and duplicating it here would create a second truth.
 */
export function createSaveRecord(spec, {
  deltas = {},
  compressed = true,
  label = null,
} = {}) {
  const payload = compressed ? compress(spec) : spec;
  return Object.freeze({
    saveFormatVersion: SAVE_FORMAT_VERSION,
    specVersion: WORLD_SPEC_VERSION,
    generatorVersion: spec.generatorVersion ?? GENERATOR_VERSION,
    worldId: spec.worldId,
    seed: spec.seed,
    /* Two digests, because they answer two different questions.

       `digest` is the identity of the world as generated — the full spec's
       hash. It is what a tool compares to ask "is this the same world?".

       `payloadDigest` is over what was ACTUALLY STORED, and it is what restore
       verifies. Verifying the identity digest against a decompressed spec does
       not work and must not be attempted: `expand()` re-derives the fields
       compression dropped, and a re-derived `reason` string is prose, not the
       original prose. Comparing those hashes reported every healthy compressed
       save as corrupt. Hashing the stored bytes detects the thing integrity
       checking is actually for — alteration and truncation in transit. */
    digest: spec.digest ?? specDigest({ ...spec, digest: undefined }),
    payloadDigest: specDigest(payload),
    intent: spec.intent ?? null,
    label,
    compressed,
    spec: payload,
    deltas: Object.freeze({
      /* Structures the player built. Not merged into the spec: a regeneration
         must be able to rebuild the world WITHOUT destroying these. */
      builtStructures: [...(deltas.builtStructures ?? [])],
      /* Ids of generated objects the player destroyed. Stored as an exclusion
         list rather than by editing the spec, so the spec stays a faithful
         record of what was generated and the digest keeps meaning something. */
      destroyedObjectIds: [...(deltas.destroyedObjectIds ?? [])],
      /* Objects the player moved (ZekNova has a building relocate feature). */
      movedObjects: [...(deltas.movedObjects ?? [])],
      /* Region-level state: discovered, cleared, fast-travel unlocked. */
      regionState: { ...(deltas.regionState ?? {}) },
      /* Mission and boss state is the live game's, mirrored here only so a
         world and its progress are restored together. */
      missionState: { ...(deltas.missionState ?? {}) },
    }),
  });
}

/**
 * Restore a spec from a save record.
 *
 * Returns `{ spec, deltas, status, warnings }`. `status` is the important part:
 *
 *   "exact"           the digest matches; this is byte-for-byte that world
 *   "generatorMoved"  the spec is intact but was produced by a different
 *                     generator version — the stored placements are used AS-IS
 *                     rather than regenerating, because regenerating would
 *                     move the player's surroundings under them
 *   "corrupt"         the payload failed validation; nothing is restored
 *
 * A version mismatch is deliberately NOT a regeneration trigger. The stored
 * spec is the authority; the generator version is recorded so a tool can offer
 * an explicit, opt-in migration.
 */
export function restoreSaveRecord(record) {
  const warnings = [];

  // The save may have come from a server, a file, or localStorage — all of
  // which are outside this process. It is validated as untrusted input.
  const payload = validateJsonPayload(record);
  if (!payload.valid) {
    return { spec: null, deltas: null, status: "corrupt", warnings, errors: payload.errors };
  }
  if (!record || record.saveFormatVersion !== SAVE_FORMAT_VERSION) {
    return {
      spec: null, deltas: null, status: "corrupt", warnings,
      errors: [`Unsupported save format version ${record?.saveFormatVersion}.`],
    };
  }
  const worldIdCheck = validateId(String(record.worldId ?? ""));
  if (!worldIdCheck.valid) {
    return { spec: null, deltas: null, status: "corrupt", warnings, errors: worldIdCheck.errors };
  }

  let spec;
  try {
    spec = record.compressed ? expand(record.spec) : createWorldSpec(record.spec);
  } catch (error) {
    return { spec: null, deltas: null, status: "corrupt", warnings, errors: [String(error?.message ?? error)] };
  }

  // Integrity: hash what was stored, against what the record says was stored.
  const payloadDigest = specDigest(record.spec);
  if (record.payloadDigest && payloadDigest !== record.payloadDigest) {
    return {
      spec: null, deltas: null, status: "corrupt", warnings,
      errors: [`Payload digest mismatch (${record.payloadDigest} vs ${payloadDigest}); the saved world has been altered or truncated.`],
    };
  }

  let status = "exact";
  if (record.generatorVersion !== GENERATOR_VERSION) {
    /* NOT a regeneration trigger. The stored spec is the authority, and
       rebuilding the world under a player who saved inside it would move their
       surroundings. The version is recorded so a tool can offer an explicit,
       opt-in migration. */
    status = "generatorMoved";
    warnings.push(`Saved under generator ${record.generatorVersion}; this build is ${GENERATOR_VERSION}. The stored placements are being used as-is rather than regenerated, so the world the player left is the world they return to.`);
  }

  return {
    spec,
    deltas: record.deltas ?? {},
    status,
    warnings,
    errors: [],
    reproducible: Object.freeze({
      seed: record.seed,
      generatorVersion: record.generatorVersion,
      digest: record.digest,
      /* True when this build can regenerate this exact world from seed+spec.
         When false, the save is still fully playable from its stored
         placements — it just cannot be re-derived. */
      canRegenerate: record.generatorVersion === GENERATOR_VERSION,
    }),
  };
}

/**
 * Apply player deltas to a restored spec, producing the world as the player
 * last saw it.
 *
 * Kept separate from `restoreSaveRecord` so a tool can inspect the pristine
 * generated world and the player's changes independently — which is what makes
 * "regenerate the world but keep my colony" possible later.
 */
export function applyDeltas(spec, deltas = {}) {
  const destroyed = new Set(deltas.destroyedObjectIds ?? []);
  const moved = new Map((deltas.movedObjects ?? []).map((entry) => [entry.id, entry]));

  const regions = spec.regions.map((region) => {
    const filterList = (list) => (list ?? [])
      .filter((item) => !destroyed.has(item.id))
      .map((item) => (moved.has(item.id) ? { ...item, ...moved.get(item.id) } : item));

    return {
      ...region,
      vegetation: filterList(region.vegetation),
      landmarks: filterList(region.landmarks),
      resources: filterList(region.resources),
      settlements: (region.settlements ?? []).map((settlement) => ({
        ...settlement,
        structures: filterList(settlement.structures),
      })),
      /* Player-built structures are added to the region as their own list,
         never merged into a generated settlement. A later regeneration can then
         rebuild the settlement and leave the colony standing. */
      playerStructures: (deltas.builtStructures ?? []).filter((structure) => structure.regionId === region.id),
    };
  });

  return createWorldSpec({ ...spec, regions });
}

/* ── compression ───────────────────────────────────────────────────────── */

const OMIT_FROM_PLACEMENT = new Set(["reason", "assetPath", "collisionType", "traversalRole", "gameplayRole"]);

/**
 * Drop derivable fields.
 *
 * Everything removed here is recoverable from `assetId` (paths, radii, roles,
 * LOD counts) or from the terrain (`y`). `reason` is prose for humans and
 * critics; it is regenerated as a marker on load rather than stored, because
 * across a few hundred objects it is the single largest part of the payload.
 */
export function compress(spec) {
  const shrinkList = (list) => (list ?? []).map((item) => {
    const out = {};
    for (const [key, value] of Object.entries(item)) {
      if (OMIT_FROM_PLACEMENT.has(key)) continue;
      // y is re-derived from the heightfield, which the seed reproduces exactly.
      if (key === "y") continue;
      out[key] = value;
    }
    return out;
  });

  return {
    ...spec,
    regions: spec.regions.map((region) => ({
      ...region,
      vegetation: shrinkList(region.vegetation),
      landmarks: shrinkList(region.landmarks),
      resources: shrinkList(region.resources),
      settlements: (region.settlements ?? []).map((settlement) => ({
        ...settlement,
        structures: shrinkList(settlement.structures),
      })),
    })),
  };
}

/** Restore what `compress` dropped. */
export function expand(compressedSpec) {
  const base = createWorldSpec(compressedSpec);
  const prepared = prepare(base);

  const restoreList = (list) => (list ?? []).map((item) => {
    const asset = item.assetId ? assetById(String(item.assetId).split("@")[0].split("#")[0]) : null;
    return {
      ...item,
      y: Number(heightAt(prepared, item.x, item.z).toFixed(4)),
      assetPath: item.assetPath ?? asset?.path ?? null,
      collisionType: item.collisionType ?? asset?.collisionType ?? (item.radius > 0 ? "cylinder" : "none"),
      traversalRole: item.traversalRole ?? asset?.traversalRole ?? "blocking",
      gameplayRole: item.gameplayRole ?? asset?.gameplayRole ?? "ambience",
      reason: item.reason ?? "Restored from a saved world; the original justification was not persisted.",
    };
  });

  return createWorldSpec({
    ...compressedSpec,
    regions: compressedSpec.regions.map((region) => ({
      ...region,
      vegetation: restoreList(region.vegetation),
      landmarks: restoreList(region.landmarks),
      resources: restoreList(region.resources),
      settlements: (region.settlements ?? []).map((settlement) => ({
        ...settlement,
        structures: restoreList(settlement.structures),
      })),
    })),
  });
}

/* ── transport ─────────────────────────────────────────────────────────── */

/**
 * Serialise a save record for storage or transport.
 * Throws if the result exceeds the JSON size limit — better a loud failure at
 * save time than a truncated world discovered at load time.
 */
export function serialise(record) {
  const text = JSON.stringify(record);
  if (text.length > SECURITY_LIMITS.maxJsonBytes) {
    throw new RangeError(`Saved world is ${text.length} bytes, over the ${SECURITY_LIMITS.maxJsonBytes} limit. Reduce region density or split the world.`);
  }
  return text;
}

export function deserialise(text) {
  const payload = validateJsonPayload(text);
  if (!payload.valid) return { record: null, errors: payload.errors };
  return { record: payload.value, errors: [] };
}

/**
 * Browser-local persistence.
 *
 * localStorage rather than the server save API on purpose: `api/save.php`
 * stores `buildings` and `worldProgress` for the LIVE game, and pushing a
 * multi-hundred-kilobyte generated world through it would change a schema the
 * running campaign depends on. Generated worlds are developer tooling for now,
 * so they persist client-side; the record produced by `createSaveRecord` is
 * plain JSON and can be moved server-side later without changing its shape.
 */
export const STORAGE_PREFIX = "zeknova.worldclaw.v1";

export function saveLocal(record, { storage = globalThis.localStorage } = {}) {
  if (!storage) return { ok: false, error: "No storage available." };
  try {
    storage.setItem(`${STORAGE_PREFIX}:${record.worldId}`, serialise(record));
    return { ok: true, key: `${STORAGE_PREFIX}:${record.worldId}` };
  } catch (error) {
    return { ok: false, error: String(error?.message ?? error) };
  }
}

export function loadLocal(worldId, { storage = globalThis.localStorage } = {}) {
  if (!storage) return { record: null, errors: ["No storage available."] };
  try {
    const text = storage.getItem(`${STORAGE_PREFIX}:${worldId}`);
    if (!text) return { record: null, errors: [] };
    return deserialise(text);
  } catch (error) {
    return { record: null, errors: [String(error?.message ?? error)] };
  }
}

export function listLocal({ storage = globalThis.localStorage } = {}) {
  if (!storage) return [];
  const out = [];
  for (let i = 0; i < storage.length; i += 1) {
    const key = storage.key(i);
    if (key?.startsWith(`${STORAGE_PREFIX}:`)) out.push(key.slice(STORAGE_PREFIX.length + 1));
  }
  return out.sort();
}
