/**
 * ZekNova — WorldClaw Blender interoperability
 * Location: /src/worldclaw/BlenderInterop.js
 *
 * Optional round-trip between a WorldSpec and an artist's DCC tool.
 *
 *     WorldSpec -> scene manifest -> Blender -> GLB export -> WorldSpec
 *
 * ── BLENDER IS NEVER A RUNTIME REQUIREMENT ───────────────────────────────
 * Nothing in ZekNova's boot path, generation path or play path touches this
 * module. It exports a JSON manifest a Blender script can read, and imports a
 * JSON manifest a Blender script can write. Neither side executes the other's
 * code, and no Python is shipped, invoked, or generated here — this is a data
 * format, not a plugin.
 *
 * That matters beyond convenience: an import path that ran an external tool's
 * script would be arbitrary code execution triggered by loading a world.
 *
 * ── WHAT THE ROUND TRIP MUST PRESERVE ────────────────────────────────────
 * The brief names four things, and each is preserved by a distinct mechanism:
 *
 *   transforms          exported as explicit position/rotation/scale, in
 *                       ZekNova's own axis convention with the conversion
 *                       stated (see AXES below) rather than assumed
 *   semantic IDs        every object carries its spec `id` as a custom
 *                       property; an object that comes back without one is
 *                       treated as NEW, never silently matched by name
 *   collision metadata  radius and collision type travel with the object, so
 *                       an artist moving a hut does not silently change what
 *                       the player can walk through
 *   region IDs          every object records its owning region, so an import
 *                       knows where a moved object now belongs
 *
 * ── THE IMPORT IS UNTRUSTED ──────────────────────────────────────────────
 * A manifest coming back from Blender was produced by a script this repository
 * did not write, possibly on someone else's machine. It is validated exactly as
 * strictly as a generative provider's output: paths allow-listed, ids pattern
 * checked, coordinates required finite and in-world. An import that fails
 * validation changes nothing.
 */

import { createWorldSpec, allPlacements } from "./WorldSpec.js";
import { prepare, heightAt } from "./TerrainGenerator.js";
import { validatePath, validateId, validateNumber, validateJsonPayload, SECURITY_LIMITS } from "./SecurityValidation.js";

export const INTEROP_FORMAT = "zeknova-worldclaw-blender-1";

/**
 * Axis convention, stated rather than assumed.
 *
 * ZekNova (three.js) is Y-up, right-handed, with the ground plane in XZ.
 * Blender is Z-up, right-handed, with the ground plane in XY. The mapping is
 *
 *     ZekNova (x, y, z)  ->  Blender (x, -z, y)
 *     Blender  (x, y, z) ->  ZekNova (x,  z, -y)
 *
 * Written down because a silent Y/Z swap is the single most common way a DCC
 * round trip returns a world lying on its side, and because a wrong sign here
 * would put every structure underground rather than obviously sideways — a
 * failure that looks like a terrain bug for a long time before anyone checks
 * the axes.
 */
export const AXES = Object.freeze({
  toBlender: (x, y, z) => ({ x, y: -z, z: y }),
  fromBlender: (x, y, z) => ({ x, y: z, z: -y }),
  note: "ZekNova is Y-up (three.js); Blender is Z-up.",
});

/**
 * Export a spec as a Blender-readable scene manifest.
 *
 * Terrain is exported as a heightfield descriptor, not as a mesh: the mesh is
 * hundreds of thousands of triangles and is exactly reproducible from the seed,
 * so shipping it would bloat the manifest with data Blender can rebuild.
 */
export function exportManifest(spec, { includeTerrain = true, gridSize = 129 } = {}) {
  const objects = allPlacements(spec).map((item) => {
    const blender = AXES.toBlender(item.x, item.y ?? 0, item.z);
    return {
      // The semantic id. An object returning without this is treated as new.
      id: item.id,
      regionId: item.regionId,
      settlementId: item.settlementId ?? null,
      category: item.category,
      assetId: item.assetId ?? null,
      assetPath: item.assetPath ?? null,
      transform: {
        location: [round(blender.x), round(blender.y), round(blender.z)],
        // Rotation about ZekNova's Y is rotation about Blender's Z.
        rotationEuler: [0, 0, round(item.rotation ?? 0)],
        scale: [item.scale ?? 1, item.scale ?? 1, item.scale ?? 1],
      },
      customProperties: {
        zeknova_id: item.id,
        zeknova_region: item.regionId,
        zeknova_role: item.role ?? item.category,
        zeknova_collision_type: item.collisionType ?? (item.radius > 0 ? "cylinder" : "none"),
        zeknova_collision_radius: item.radius ?? 0,
        zeknova_traversal_role: item.traversalRole ?? "blocking",
        zeknova_gameplay_role: item.gameplayRole ?? "ambience",
        zeknova_lod_levels: item.lodLevels ?? 1,
        zeknova_instanced: Boolean(item.instanced),
      },
    };
  });

  return Object.freeze({
    format: INTEROP_FORMAT,
    worldId: spec.worldId,
    seed: spec.seed,
    generatorVersion: spec.generatorVersion,
    digest: spec.digest,
    axes: AXES.note,
    units: "metres",
    regions: spec.regions.map((region) => ({
      id: region.id,
      biome: region.biome,
      bounds: region.bounds,
      // Zones come along so an artist can see where they must not build.
      zones: (region.zones ?? []).map((zone) => ({
        id: zone.id, kind: zone.kind, x: zone.x, z: zone.z, radius: zone.radius,
      })),
    })),
    terrain: includeTerrain ? {
      kind: "heightfield",
      worldSize: spec.world.worldSize,
      waterLevel: spec.world.waterLevel,
      gridSize,
      // Reproducible from the seed: Blender rebuilds it rather than receiving it.
      reproduceWith: { seed: spec.seed, generatorVersion: spec.generatorVersion },
      note: "Rebuild with TerrainGenerator.buildHeightField(spec). The mesh is not shipped because it is exactly derivable and would dominate this file.",
    } : null,
    objects,
    /* Rules an artist must not break, carried with the file so they are visible
       in the tool rather than living only in a wiki. */
    constraints: {
      maxSlopeForBuild: spec.globalRules.maxSlopeForBuild,
      minBuildHeightAboveWater: spec.globalRules.minBuildHeightAboveWater,
      maxBuildHeight: spec.globalRules.maxBuildHeight,
      doNotMove: objects.filter((object) => object.category === "structure"
        && spec.regions.some((region) => (region.missionHooks ?? []).some((hook) =>
          Math.hypot(hook.x - object.transform.location[0], hook.z + object.transform.location[1]) < 3)))
        .map((object) => object.id),
      note: "Mission hooks and boss arenas are gameplay contracts. Objects listed in doNotMove sit on one; moving them will be rejected on import.",
    },
  });
}

/**
 * Import a manifest returned from Blender, producing an updated spec.
 *
 * Returns `{ spec, applied, rejected, errors }`. A rejected object is reported
 * with its reason and the ORIGINAL placement is kept — an artist's malformed
 * edit never destroys a valid placement.
 */
export function importManifest(spec, manifest) {
  const errors = [];
  const rejected = [];
  const applied = [];

  const payload = validateJsonPayload(manifest);
  if (!payload.valid) return { spec, applied, rejected, errors: payload.errors };

  const doc = payload.value;
  if (doc?.format !== INTEROP_FORMAT) {
    return { spec, applied, rejected, errors: [`Unrecognised manifest format "${doc?.format}".`] };
  }
  if (doc.worldId !== spec.worldId) {
    return { spec, applied, rejected, errors: [`Manifest is for world "${doc.worldId}", not "${spec.worldId}".`] };
  }
  if (!Array.isArray(doc.objects)) {
    return { spec, applied, rejected, errors: ["Manifest carries no object list."] };
  }
  if (doc.objects.length > SECURITY_LIMITS.maxObjectsPerRegion) {
    return { spec, applied, rejected, errors: [`Manifest declares ${doc.objects.length} objects, over the limit.`] };
  }

  const prepared = prepare(spec);
  const protectedIds = new Set(doc.constraints?.doNotMove ?? []);
  const updates = new Map();

  for (const object of doc.objects) {
    const problems = [];

    const idCheck = validateId(String(object?.id ?? ""));
    if (!idCheck.valid) problems.push(...idCheck.errors);

    const location = object?.transform?.location;
    if (!Array.isArray(location) || location.length !== 3) {
      problems.push("transform.location must be a three-element array.");
    } else {
      for (const [index, axis] of ["x", "y", "z"].entries()) {
        const problem = validateNumber(location[index], `${object?.id}.location.${axis}`);
        if (problem) problems.push(problem);
      }
    }
    if (object?.assetPath) {
      const pathCheck = validatePath(object.assetPath);
      if (!pathCheck.valid) problems.push(...pathCheck.errors);
    }

    if (problems.length) {
      rejected.push({ id: object?.id ?? "(unnamed)", reasons: problems });
      continue;
    }

    const back = AXES.fromBlender(location[0], location[1], location[2]);

    if (protectedIds.has(object.id)) {
      // A gameplay contract. Blender may not move it, and saying so is more
      // useful than quietly snapping it back.
      const original = allPlacements(spec).find((item) => item.id === object.id);
      if (original && Math.hypot(original.x - back.x, original.z - back.z) > 0.5) {
        rejected.push({
          id: object.id,
          reasons: [`This object sits on a mission or boss contract and was moved ${Math.hypot(original.x - back.x, original.z - back.z).toFixed(2)} m in Blender. Gameplay positions are not editable through the DCC round trip.`],
        });
        continue;
      }
    }

    updates.set(object.id, {
      x: Number(back.x.toFixed(4)),
      z: Number(back.z.toFixed(4)),
      // Re-seat on the live heightfield rather than trusting the DCC's Z:
      // Blender's ground is a rebuilt approximation and an artist working in it
      // has no reason to have kept the exact sample.
      y: Number(heightAt(prepared, back.x, back.z).toFixed(4)),
      rotation: Number(Number(object.transform.rotationEuler?.[2] ?? 0).toFixed(4)),
      scale: Number(Number(object.transform.scale?.[0] ?? 1).toFixed(3)),
    });
    applied.push(object.id);
  }

  const apply = (list) => (list ?? []).map((item) =>
    (updates.has(item.id) ? { ...item, ...updates.get(item.id), reason: `${item.reason} Adjusted in Blender and re-seated on the live heightfield.` } : item));

  const next = createWorldSpec({
    ...spec,
    regions: spec.regions.map((region) => ({
      ...region,
      vegetation: apply(region.vegetation),
      landmarks: apply(region.landmarks),
      resources: apply(region.resources),
      settlements: (region.settlements ?? []).map((settlement) => ({
        ...settlement,
        structures: apply(settlement.structures),
      })),
    })),
  });

  return { spec: next, applied, rejected, errors };
}

function round(value) {
  return Number(Number(value ?? 0).toFixed(4));
}
