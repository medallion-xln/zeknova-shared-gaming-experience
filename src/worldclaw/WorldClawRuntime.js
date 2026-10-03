/**
 * ZekNova — WorldClaw runtime bridge
 * Location: /src/worldclaw/WorldClawRuntime.js
 *
 * The single, narrow place where a generated WorldSpec can reach the live game.
 *
 * ── WHY THE BRIDGE IS SEPARATE FROM THE DIRECTOR ─────────────────────────
 * `WorldClawDirector` produces data and has no way to touch the scene. This
 * module is the only thing that can, and keeping it separate means the answer
 * to "can generation affect the running game?" is a single file to audit rather
 * than a property of the whole subsystem.
 *
 * ── WHAT IT IS ALLOWED TO DO ─────────────────────────────────────────────
 * Add decorative and structural props to the scene under one parent group, and
 * expose the spec's zones for other systems to read.
 *
 * ── WHAT IT MAY NEVER DO ─────────────────────────────────────────────────
 *   - modify mission state, objectives or the campaign ladder
 *   - modify boss configuration, phases or encounter routing
 *   - modify the terrain heightfield the live game already built
 *   - remove or move anything the live game placed
 *   - modify save state
 *   - run at all without an explicit developer flag
 *
 * Those are enforced by what this file does NOT import: no `Missions.js`, no
 * `BossSystem.js` writes, no save API, no terrain mutation. It reads the live
 * game only to find the scene root and the heightfield sampler.
 *
 * ── ADDITIVE, AND REVERSIBLE ─────────────────────────────────────────────
 * Everything is attached to one group. `detach()` removes that group and
 * disposes what it created. A WorldClaw session that goes wrong is undone by
 * removing one node, not by reloading — which is what makes it safe to try on
 * a running game.
 */

import { allPlacements } from "./WorldSpec.js";
import { partition, plan as planResidency, RESIDENCY, batchChanges } from "./WorldStreaming.js";
import { allowed as editorAllowed } from "./WorldClawEditor.js";

export const RUNTIME_AUTHORITY = Object.freeze({
  tier: "DEVELOPER_TOOLING_ADDITIVE",
  canAddSceneObjects: true,
  canMutateExistingScene: false,
  canModifyMissionState: false,
  canModifyBossConfiguration: false,
  canModifyTerrain: false,
  canModifySaveState: false,
  canModifyMultiplayerSync: false,
});

export class WorldClawRuntime {
  #group = null;
  #three = null;
  #placed = new Map();
  #partitioned = null;
  #lastPlan = null;
  #loader = null;
  /** path -> loaded scene (or the in-flight promise for it). */
  #prototypes = new Map();

  constructor({ game = globalThis.ZekNovaGame, spec = null } = {}) {
    this.game = game;
    this.spec = spec;
    this.installed = false;
  }

  /**
   * Attach to the live scene.
   *
   * Returns false rather than throwing on every refusal path — a dev tool that
   * cannot attach must never be the reason the game fails to start.
   */
  async install() {
    if (!editorAllowed()) return false;
    if (!this.spec) return false;

    const scene = this.#findScene();
    if (!scene) return false;

    const THREE = await loadThree();
    if (!THREE?.Group) return false;
    this.#three = THREE;

    this.#group = new THREE.Group();
    this.#group.name = "worldclaw-generated";
    this.#group.userData.worldclaw = {
      digest: this.spec.digest,
      generatorVersion: this.spec.generatorVersion,
      authority: RUNTIME_AUTHORITY,
    };
    scene.add(this.#group);

    this.#partitioned = partition(this.spec);
    this.installed = true;

    // Zones are published as read-only data for other systems (and for QA) to
    // consult. Published, not applied: nothing here tells the mission system
    // where objectives are, it only makes the generated answer legible.
    globalThis.ZekNovaWorldClawZones = Object.freeze(
      this.spec.regions.flatMap((region) => (region.zones ?? []).map((zone) => Object.freeze({ ...zone, regionId: region.id }))),
    );
    return true;
  }

  /** Remove everything this bridge added. */
  detach() {
    if (this.#group?.parent) this.#group.parent.remove(this.#group);
    for (const object of this.#placed.values()) disposeObject(object);
    this.#placed.clear();
    this.#group = null;
    this.#partitioned = null;
    this.#lastPlan = null;
    this.#prototypes.clear();
    this.installed = false;
    delete globalThis.ZekNovaWorldClawZones;
  }

  /**
   * Update residency for a viewer position.
   *
   * Returns the batches of work to apply. The CALLER decides when to apply
   * them, because only the caller knows how much frame budget is left — a
   * bridge that applied everything immediately would be the stall this whole
   * streaming design exists to prevent.
   */
  updateResidency(viewer, { tier = "balanced" } = {}) {
    if (!this.installed || !this.#partitioned) return { batches: [], plan: null };
    const next = planResidency(this.#partitioned, viewer, { tier, previous: this.#lastPlan });
    this.#lastPlan = next;
    return { batches: batchChanges(next), plan: next };
  }

  /**
   * Apply one batch of residency changes.
   *
   * Loading is asynchronous and failures are swallowed per object: one missing
   * GLB must not abort the rest of the world.
   */
  async applyBatch(batch) {
    if (!this.installed) return { added: 0, removed: 0, failed: 0 };
    let added = 0, removed = 0, failed = 0;

    for (const cellAssignment of batch) {
      const cell = this.#partitioned.cells.find((entry) => entry.key === cellAssignment.key);
      if (!cell) continue;

      if (cellAssignment.residency === RESIDENCY.UNLOADED) {
        for (const entity of cell.entities) {
          const object = this.#placed.get(entity.id);
          if (!object) continue;
          this.#group.remove(object);
          disposeObject(object);
          this.#placed.delete(entity.id);
          removed += 1;
        }
        continue;
      }

      for (const entity of cell.entities) {
        if (this.#placed.has(entity.id)) continue;
        try {
          const object = await this.#instantiate(entity, cellAssignment.residency);
          if (!object) { failed += 1; continue; }
          this.#group.add(object);
          this.#placed.set(entity.id, object);
          added += 1;
        } catch {
          failed += 1;
        }
      }
    }
    return { added, removed, failed };
  }

  /**
   * Instantiate one placement.
   *
   * A placement with no asset path — or one whose asset fails to load — becomes
   * a low-cost proxy box rather than nothing. Silence would make a missing mesh
   * indistinguishable from a placement bug; a visible proxy is diagnosable.
   */
  async #instantiate(entity, residency) {
    const THREE = this.#three;
    if (!THREE) return null;

    let object = null;
    if (entity.assetPath) {
      const path = residency === RESIDENCY.REDUCED
        ? entity.assetPath.replace(/\.glb$/, ".low.glb")
        : entity.assetPath;
      const prototype = await this.#loadPrototype(path, entity.assetPath);
      object = prototype ? prototype.clone(true) : null;
    }
    if (!object) {
      const size = Math.max(0.6, entity.radius || 1);
      object = new THREE.Mesh(
        new THREE.BoxGeometry(size * 2, entity.height || 2, size * 2),
        new THREE.MeshStandardMaterial({ color: 0xb87532, roughness: 0.9, wireframe: true }),
      );
      object.userData.worldclawProxy = true;
    }

    object.position.set(entity.x, entity.y ?? 0, entity.z);
    object.rotation.y = entity.rotation ?? 0;
    const scale = entity.scale ?? 1;
    object.scale.setScalar(scale);
    object.name = `worldclaw:${entity.id}`;
    // The audit trail travels into the scene graph, so a designer inspecting an
    // object in devtools can read why it is there.
    object.userData.worldclaw = {
      id: entity.id, regionId: entity.regionId, role: entity.role ?? entity.category,
      reason: entity.reason, sourceTier: entity.sourceTier, assetId: entity.assetId,
    };
    object.castShadow = residency === RESIDENCY.FULL && (entity.height ?? 0) >= 4;
    object.receiveShadow = true;
    return object;
  }

  /**
   * Load a mesh ONCE per path and clone it thereafter.
   *
   * A settlement of forty structures uses maybe a dozen distinct meshes; a whole
   * world of 600 objects uses perhaps fifty. Calling `loadAsync` per placement
   * fetched and parsed the same GLB dozens of times — 600 decodes of a 193 MB
   * model library, which hung the tab outright on the first materialise.
   *
   * The in-flight promise is cached, not just the result, so twenty objects
   * asking for the same mesh in the same batch share one load rather than
   * starting twenty.
   */
  async #loadPrototype(path, fallbackPath) {
    const cached = this.#prototypes.get(path);
    if (cached !== undefined) return cached;

    const pending = (async () => {
      const loader = await this.#getLoader();
      if (!loader) return null;
      try {
        const gltf = await loader.loadAsync(path);
        return gltf?.scene ?? null;
      } catch {
        // A missing LOD variant falls back to the source mesh before giving up.
        if (fallbackPath && fallbackPath !== path) {
          try {
            const gltf = await loader.loadAsync(fallbackPath);
            return gltf?.scene ?? null;
          } catch { return null; }
        }
        return null;
      }
    })();

    this.#prototypes.set(path, pending);
    const resolved = await pending;
    this.#prototypes.set(path, resolved);
    return resolved;
  }

  /**
   * A GLTFLoader configured the way ZekNova's own environment loader is.
   *
   * ZekNova's environment meshes are Meshopt-compressed with KTX2/Basis
   * textures — `assets/environment-runtime.js` sets up `MeshoptDecoder` and a
   * `KTX2Loader` pointed at `assets/vendor/basis/` for exactly that reason. A
   * bare GLTFLoader cannot decode them: it throws on every one, and this bridge
   * silently substituted a wireframe proxy box, so a materialised world came out
   * as 15 boxes and 6 meshes instead of 21 buildings.
   *
   * KTX2 additionally needs the live renderer to detect texture-format support,
   * which is why this is resolved lazily rather than at construction.
   */
  async #getLoader() {
    if (this.#loader !== null) return this.#loader;
    try {
      // Prefer the game's own loader if it ever exposes one — a single
      // configured loader is better than a second, parallel one.
      const existing = this.game?.gltfLoader ?? globalThis.ZekNovaGame?.gltfLoader ?? null;
      if (existing) { this.#loader = existing; return existing; }

      const [gltfModule, meshoptModule, ktx2Module] = await Promise.all([
        import("../../assets/vendor/GLTFLoader.js"),
        import("../../assets/vendor/meshopt_decoder.module.js").catch(() => null),
        import("../../assets/vendor/KTX2Loader.bundle.js").catch(() => null),
      ]);
      const loader = new gltfModule.GLTFLoader();
      if (meshoptModule?.MeshoptDecoder) loader.setMeshoptDecoder(meshoptModule.MeshoptDecoder);

      const renderer = this.game?.renderer ?? globalThis.ZekNovaGame?.renderer ?? null;
      if (ktx2Module?.KTX2Loader && renderer) {
        const ktx2 = new ktx2Module.KTX2Loader().setTranscoderPath("./assets/vendor/basis/");
        ktx2.detectSupport(renderer);
        loader.setKTX2Loader(ktx2);
      }
      this.#loader = loader;
    } catch {
      this.#loader = false;
    }
    return this.#loader;
  }

  /**
   * The scene root to attach to.
   *
   * Resolution order matches what `RenderModelRegistry` already does
   * (`game.aoEnvironment?.group ?? game.terrain?.group ?? game.scene`), so this
   * bridge attaches to the same node the shipped graphics registry considers
   * canonical rather than inventing its own idea of where the world lives.
   */
  #findScene() {
    const game = this.game ?? globalThis.ZekNovaGame;
    return game?.aoEnvironment?.group
      ?? game?.terrain?.group
      ?? game?.scene
      ?? null;
  }

  /** What this bridge currently has in the scene. */
  snapshot() {
    return Object.freeze({
      installed: this.installed,
      digest: this.spec?.digest ?? null,
      placed: this.#placed.size,
      proxies: [...this.#placed.values()].filter((object) => object.userData?.worldclawProxy).length,
      cells: this.#partitioned?.cells.length ?? 0,
      residency: this.#lastPlan?.counts ?? null,
      authority: RUNTIME_AUTHORITY,
    });
  }

  /**
   * Read-only comparison against the live game.
   *
   * Reports what a generated world would ADD, without adding it — the safest
   * possible way to evaluate a spec against a running session, and the mode a
   * developer should reach for first.
   */
  dryRun() {
    if (!this.spec) return null;
    const placements = allPlacements(this.spec);
    return Object.freeze({
      wouldAdd: placements.length,
      byRegion: Object.freeze(Object.fromEntries(
        this.spec.regions.map((region) => [
          region.id,
          allPlacements({ ...this.spec, regions: [region] }).length,
        ]),
      )),
      wouldMutateExisting: 0,
      wouldModifyMissions: 0,
      wouldModifyBosses: 0,
      authority: RUNTIME_AUTHORITY,
    });
  }
}

/**
 * Resolve Three.js.
 *
 * From the VENDORED module, not from a global. The runtime bundle keeps its own
 * Three inside its module scope and exposes nothing on `globalThis` — a grep for
 * `window.THREE` across `assets/index-02987539.js` returns zero hits. Reading
 * `globalThis.THREE` therefore made `install()` return false every time, which
 * made this whole bridge dead code that failed silently.
 *
 * `assets/vendor/three.module.min.js` is the same revision (185) the game
 * itself ships, so objects created here are compatible with the live scene.
 */
let threeModule = null;
async function loadThree() {
  if (threeModule !== null) return threeModule;
  try {
    threeModule = await import("../../assets/vendor/three.module.min.js");
  } catch {
    threeModule = false;
  }
  return threeModule;
}

function disposeObject(object) {
  object?.traverse?.((child) => {
    child.geometry?.dispose?.();
    const material = child.material;
    if (Array.isArray(material)) material.forEach((entry) => entry?.dispose?.());
    else material?.dispose?.();
  });
}
