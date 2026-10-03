/**
 * ZekNova — WorldClaw developer editor
 * Location: /src/worldclaw/WorldClawEditor.js
 *
 * A development-only interface for generating, inspecting and committing
 * WorldSpecs.
 *
 * ── WHY IT IS DEVELOPER-ONLY, AND HOW THAT IS ENFORCED ───────────────────
 * The brief is explicit: do NOT expose uncontrolled AI world generation to
 * players in this implementation. That is enforced by `allowed()` below rather
 * than by convention — the editor refuses to mount unless a developer flag is
 * present, and the flag lives in the URL and localStorage, both of which are
 * things a developer sets deliberately and a player never encounters.
 *
 * ── WHAT IT IS FOR ───────────────────────────────────────────────────────
 * Inspecting the spec BEFORE committing it. A generated world that scores 94.7
 * is not automatically correct; someone has to be able to read what was
 * generated, see the score breakdown that produced that number, and decide.
 * The "commit" step is therefore separate from the "generate" step, and
 * generation never writes to the live game on its own.
 *
 * ── NO FRAMEWORK ─────────────────────────────────────────────────────────
 * Plain DOM. ZekNova ships no UI framework, and adding one for a dev tool
 * would put a dependency in the bundle that only developers ever execute.
 */

import { WorldClawDirector } from "./WorldClawDirector.js";
import { formatScoreCard } from "./WorldCritic.js";
import { createSaveRecord, saveLocal, loadLocal, listLocal, restoreSaveRecord } from "./WorldPersistence.js";
import { exportManifest } from "./BlenderInterop.js";
import { partition, plan as planResidency } from "./WorldStreaming.js";
import { registrySummary } from "./WorldAssetRegistry.js";
import { HARDWARE_TIERS } from "./PerformanceBudget.js";

const FLAG = "zeknova.worldclaw.dev";

/**
 * Is the editor permitted in this session?
 *
 * `?worldclaw=1` enables it for one session; setting the localStorage key keeps
 * it on across reloads. Both are explicit developer actions. Neither is
 * reachable from any in-game UI, which is what keeps the brief's Phase 16 rule
 * ("do not expose uncontrolled AI world generation to players") structural
 * rather than a matter of nobody having added a button yet.
 */
export function allowed() {
  try {
    if (typeof location !== "undefined" && new URLSearchParams(location.search).get("worldclaw") === "1") return true;
    return globalThis.localStorage?.getItem(FLAG) === "1";
  } catch {
    return false;
  }
}

export class WorldClawEditor {
  #root = null;
  #result = null;
  #seed = 847212;
  #bridge = null;

  constructor({ mount = null, worldId = "zeknova-authored", game = null } = {}) {
    this.mountTarget = mount;
    this.worldId = worldId;
    this.game = game;
  }

  /** Mount the panel. Returns false — without side effects — when not allowed. */
  install() {
    if (!allowed()) return false;
    if (typeof document === "undefined") return false;

    const host = this.mountTarget ?? document.body;
    const root = document.createElement("aside");
    root.id = "worldclaw-editor";
    root.dataset.worldclaw = "developer-tooling";
    root.setAttribute("aria-label", "WorldClaw developer world generation");
    root.innerHTML = TEMPLATE;
    host.appendChild(root);
    this.#root = root;

    this.#bind();
    this.#renderRegistry();
    this.#renderSaves();
    return true;
  }

  #q(selector) { return this.#root?.querySelector(selector); }

  #bind() {
    this.#q("[data-action='generate-region']").addEventListener("click", () => this.generate({ scope: "region" }));
    this.#q("[data-action='generate-planet']").addEventListener("click", () => this.generate({ scope: "planet" }));
    this.#q("[data-action='reseed']").addEventListener("click", () => {
      // A deliberate, visible reroll. Never automatic: the seed IS the world's
      // identity, and changing it silently would make results irreproducible.
      this.#seed = (this.#seed * 1103515245 + 12345) >>> 0;
      this.#q("[data-field='seed']").value = String(this.#seed);
    });
    this.#q("[data-action='commit']").addEventListener("click", () => this.commit());
    this.#q("[data-action='export-blender']").addEventListener("click", () => this.exportForBlender());
    this.#q("[data-action='inspect']").addEventListener("click", () => this.toggleSpecView());
    this.#q("[data-action='load']").addEventListener("click", () => this.load());
    this.#q("[data-action='show']").addEventListener("click", () => this.showInWorld());
    this.#q("[data-action='hide']").addEventListener("click", () => this.removeFromWorld());
  }

  /**
   * Materialise the current spec into the live scene.
   *
   * ADDITIVE. Everything lands under one `worldclaw-generated` group and nothing
   * the live game placed is touched, so `removeFromWorld()` is a complete undo.
   * The authored Desert village is still standing underneath — that is expected
   * and is why the two can be compared side by side rather than one replacing
   * the other on a developer's say-so.
   *
   * Objects are applied in the streaming system's own batches, nearest to the
   * player first, so a 650-object world does not arrive in one frame.
   */
  async showInWorld() {
    if (!this.#result?.spec) { this.#status("Generate a world first.", "fail"); return null; }
    const game = this.game ?? globalThis.ZekNovaGame;
    if (!game) { this.#status("No running game to attach to — launch into the world first.", "fail"); return null; }

    await this.removeFromWorld();
    this.#status("Attaching to the live scene…");

    const { WorldClawRuntime } = await import("./WorldClawRuntime.js");
    const bridge = new WorldClawRuntime({ game, spec: this.#result.spec });
    if (!(await bridge.install())) {
      this.#status("Could not attach: no scene root, or Three.js is unavailable.", "fail");
      return null;
    }
    this.#bridge = bridge;

    const viewer = this.#viewerPosition(game);
    const { batches, plan } = bridge.updateResidency(viewer, { tier: this.#q("[data-field='tier']").value });

    let added = 0, failed = 0;
    for (const [index, batch] of batches.entries()) {
      const outcome = await bridge.applyBatch(batch);
      added += outcome.added;
      failed += outcome.failed;
      this.#status(`Materialising… ${added} objects (batch ${index + 1}/${batches.length})`);
      // Yield between batches so the game keeps rendering while this streams in.
      await new Promise((resolve) => requestAnimationFrame(resolve));
    }

    this.#q("[data-action='hide']").disabled = false;
    const proxies = bridge.snapshot().proxies;
    this.#status(
      `In world: ${added} objects around (${viewer.x.toFixed(0)}, ${viewer.z.toFixed(0)})`
      + `${proxies ? `, ${proxies} as proxy boxes (mesh load failed)` : ""}`
      + `${failed ? `, ${failed} failed` : ""}. Remove undoes it completely.`,
      failed ? "fail" : "pass",
    );
    return { added, failed, plan };
  }

  /** Remove everything the bridge added. */
  async removeFromWorld() {
    if (!this.#bridge) return false;
    this.#bridge.detach();
    this.#bridge = null;
    this.#q("[data-action='hide']").disabled = true;
    this.#status("Removed from the live scene; the authored world is untouched.", "pass");
    return true;
  }

  /** Where the player is, so residency loads around them rather than the origin. */
  #viewerPosition(game) {
    const source = game?.player?.group?.position ?? game?.player?.position ?? game?.camera?.position;
    return {
      x: Number(source?.x ?? 0) || 0,
      z: Number(source?.z ?? 0) || 0,
    };
  }

  /** The live bridge, for console inspection. */
  get bridge() { return this.#bridge; }

  /** Generate a world from the panel's current settings. */
  generate({ scope = "region" } = {}) {
    const prompt = this.#q("[data-field='prompt']").value.trim();
    const seed = Number(this.#q("[data-field='seed']").value) >>> 0;
    const biome = this.#q("[data-field='biome']").value;
    const tier = this.#q("[data-field='tier']").value;
    const externalAI = this.#q("[data-field='ai']").checked;

    this.#status("Generating…");
    // Synchronous by design: generation is sub-second and a spinner that never
    // resolves is worse than a brief block in a developer tool.
    const director = new WorldClawDirector({ seed, worldId: this.worldId, tier, externalAI });
    let result;
    try {
      result = director.generate({
        intent: prompt || null,
        focusRegion: scope === "region" ? biome : null,
      });
    } catch (error) {
      this.#status(`Generation threw: ${error?.message ?? error}`, "fail");
      return null;
    }

    this.#result = result;
    this.#renderResult(result);
    return result;
  }

  #renderResult(result) {
    if (!result?.spec) {
      this.#status(`Planning failed at "${result?.stage}".`, "fail");
      this.#q("[data-slot='scorecard']").textContent = (result?.errors ?? []).map((error) => `${error.code}: ${error.message}`).join("\n");
      return;
    }

    this.#q("[data-slot='scorecard']").textContent = formatScoreCard(result.report);

    const gates = [
      ["Terrain", result.report.scores.terrainCoherence >= 70],
      ["Navigation", result.report.scores.traversal >= 70],
      ["Physics", result.report.counts.floating + result.report.counts.buried + result.report.counts.intersecting === 0],
      ["Missions", result.campaign.failures.length === 0],
      ["Performance", result.report.measurement.withinBudget],
    ];
    this.#q("[data-slot='gates']").innerHTML = gates
      .map(([label, ok]) => `<li class="${ok ? "pass" : "fail"}"><span>${label}</span><b>${ok ? "PASS" : "FAIL"}</b></li>`)
      .join("");

    const residency = planResidency(partition(result.spec), { x: 0, z: 0 }, { tier: result.generation.tier });
    this.#q("[data-slot='summary']").innerHTML = `
      <dl>
        <dt>Digest</dt><dd><code>${escapeHtml(result.spec.digest)}</code></dd>
        <dt>Regions</dt><dd>${result.spec.regions.length}</dd>
        <dt>Objects</dt><dd>${result.report.counts.objects}</dd>
        <dt>Structures</dt><dd>${result.spec.regions.reduce((n, region) => n + region.settlements.reduce((m, s) => m + s.structures.length, 0), 0)}</dd>
        <dt>Boss arenas</dt><dd>${result.spec.regions.reduce((n, region) => n + region.bossHooks.length, 0)} / 12</dd>
        <dt>Streaming cells</dt><dd>${residency.cells.length} (${residency.counts.full} resident at origin)</dd>
        <dt>Generation</dt><dd>${result.generation.elapsedMs} ms</dd>
        <dt>External AI</dt><dd>${result.generation.externalAIUsed ? "USED" : "not used"}</dd>
        <dt>Refinement passes</dt><dd>${result.refinements.length}</dd>
      </dl>`;

    const errors = result.report.findings.filter((finding) => finding.severity === "error");
    const warnings = result.report.findings.filter((finding) => finding.severity === "warning");
    this.#q("[data-slot='findings']").innerHTML = [...errors, ...warnings].slice(0, 40)
      .map((finding) => `<li class="${finding.severity}"><code>${escapeHtml(finding.code)}</code> ${escapeHtml(finding.message)}</li>`)
      .join("") || "<li>No findings.</li>";

    this.#q("[data-action='commit']").disabled = !result.playable;
    this.#status(
      result.playable
        ? `World quality ${result.report.overall} — campaign intact, ready to commit.`
        : `World quality ${result.report.overall} — NOT COMMITTABLE: ${result.campaign.failures.length} campaign failure(s).`,
      result.playable ? "pass" : "fail",
    );
  }

  /** Persist the current spec. Refuses anything the campaign gate rejected. */
  commit() {
    if (!this.#result?.playable) {
      this.#status("Refusing to commit: this world fails the campaign gate.", "fail");
      return null;
    }
    const record = createSaveRecord(this.#result.spec, { label: `editor ${new Date().toISOString().slice(0, 16)}` });
    const outcome = saveLocal(record);
    this.#status(outcome.ok ? `Committed to ${outcome.key}.` : `Commit failed: ${outcome.error}`, outcome.ok ? "pass" : "fail");
    this.#renderSaves();
    return record;
  }

  load() {
    const { record, errors } = loadLocal(this.worldId);
    if (!record) {
      this.#status(errors.length ? `Load failed: ${errors.join(" ")}` : "No saved world for this id.", "fail");
      return null;
    }
    const restored = restoreSaveRecord(record);
    if (!restored.spec) {
      this.#status(`Load failed: ${restored.errors.join(" ")}`, "fail");
      return null;
    }
    this.#status(`Loaded (${restored.status})${restored.warnings.length ? ` — ${restored.warnings[0]}` : ""}.`, "pass");
    return restored;
  }

  exportForBlender() {
    if (!this.#result?.spec) { this.#status("Generate a world first.", "fail"); return null; }
    const manifest = exportManifest(this.#result.spec);
    const text = JSON.stringify(manifest, null, 2);
    this.#q("[data-slot='spec']").hidden = false;
    this.#q("[data-slot='spec']").textContent = text;
    this.#status(`Blender manifest ready — ${manifest.objects.length} objects, ${text.length} bytes. Copy it from the panel below.`, "pass");
    return manifest;
  }

  toggleSpecView() {
    const slot = this.#q("[data-slot='spec']");
    slot.hidden = !slot.hidden;
    if (!slot.hidden && this.#result?.spec) slot.textContent = JSON.stringify(this.#result.spec, null, 1);
  }

  #renderRegistry() {
    const summary = registrySummary();
    this.#q("[data-slot='registry']").textContent =
      `${summary.total} authored assets · ${Object.keys(summary.byRole).length} roles · ${Object.keys(summary.byBiome).length} biomes`;
  }

  #renderSaves() {
    const saves = listLocal();
    this.#q("[data-slot='saves']").textContent = saves.length ? saves.join(", ") : "none";
  }

  #status(message, kind = "") {
    const node = this.#q("[data-slot='status']");
    node.textContent = message;
    node.dataset.kind = kind;
  }

  /** Current result, for console-driven inspection. */
  get result() { return this.#result; }
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]
  ));
}

const TIER_OPTIONS = Object.keys(HARDWARE_TIERS)
  .map((tier) => `<option value="${tier}"${tier === "balanced" ? " selected" : ""}>${tier}</option>`)
  .join("");

/* Styles are inlined rather than added to `assets/`, so the dev tool cannot
   affect the shipped stylesheet load order or the game's own cascade. */
const TEMPLATE = `
<style>
#worldclaw-editor{position:fixed;top:12px;right:12px;width:380px;max-height:88vh;overflow:auto;z-index:99999;
  background:#0b1a24ee;color:#cfe6f2;font:12px/1.5 ui-monospace,SFMono-Regular,Menlo,monospace;
  border:1px solid #1d4a63;border-radius:10px;padding:14px;box-shadow:0 10px 40px #0009;backdrop-filter:blur(6px)}
#worldclaw-editor h2{margin:0 0 2px;font-size:13px;letter-spacing:.14em;color:#6fd3ff;text-transform:uppercase}
#worldclaw-editor .sub{margin:0 0 12px;color:#6d8c9c;font-size:10px;letter-spacing:.08em}
#worldclaw-editor label{display:block;margin:9px 0 3px;color:#8fb4c6;font-size:10px;letter-spacing:.1em;text-transform:uppercase}
#worldclaw-editor input,#worldclaw-editor select,#worldclaw-editor textarea{width:100%;box-sizing:border-box;
  background:#04131d;color:#cfe6f2;border:1px solid #1d4a63;border-radius:5px;padding:6px 8px;font:inherit}
#worldclaw-editor textarea{min-height:64px;resize:vertical}
#worldclaw-editor .row{display:flex;gap:6px;margin-top:10px;flex-wrap:wrap}
#worldclaw-editor button{flex:1;min-width:96px;background:#0f3348;color:#9fe0ff;border:1px solid #2a6d8f;
  border-radius:5px;padding:7px 6px;font:inherit;cursor:pointer}
#worldclaw-editor button:hover:not(:disabled){background:#16506f}
#worldclaw-editor button:disabled{opacity:.4;cursor:not-allowed}
#worldclaw-editor .check{display:flex;align-items:center;gap:6px;margin-top:10px}
#worldclaw-editor .check input{width:auto}
#worldclaw-editor pre{background:#04131d;border:1px solid #123448;border-radius:5px;padding:8px;
  overflow:auto;max-height:220px;font-size:11px;white-space:pre-wrap;word-break:break-word}
#worldclaw-editor ul{list-style:none;margin:6px 0 0;padding:0}
#worldclaw-editor [data-slot='gates'] li{display:flex;justify-content:space-between;padding:2px 0;border-bottom:1px solid #10303f}
#worldclaw-editor .pass b{color:#5ff0a8}#worldclaw-editor .fail b{color:#ff7a7a}
#worldclaw-editor [data-slot='findings'] li{padding:3px 0;border-bottom:1px solid #10303f;font-size:11px}
#worldclaw-editor [data-slot='findings'] .error{color:#ffb3b3}
#worldclaw-editor [data-slot='findings'] .warning{color:#e6cf90}
#worldclaw-editor dl{display:grid;grid-template-columns:auto 1fr;gap:1px 10px;margin:6px 0 0}
#worldclaw-editor dt{color:#6d8c9c}#worldclaw-editor dd{margin:0;text-align:right}
#worldclaw-editor [data-slot='status']{margin-top:10px;padding:6px 8px;border-radius:5px;background:#04131d;font-size:11px}
#worldclaw-editor [data-slot='status'][data-kind='pass']{color:#5ff0a8;border:1px solid #1d5f3f}
#worldclaw-editor [data-slot='status'][data-kind='fail']{color:#ff7a7a;border:1px solid #5f1d1d}
#worldclaw-editor .meta{color:#5d7b8a;font-size:10px;margin-top:8px}
</style>
<h2>WorldClaw</h2>
<p class="sub">Developer tooling · no live-scene authority</p>

<label for="wc-prompt">Prompt</label>
<textarea id="wc-prompt" data-field="prompt" placeholder="Generate an unexplored ZekNovan desert civilization surrounding an ancient dry river basin with approximately 40 structures, a central water-processing facility, trade routes, ruins, wildlife, hostile patrol zones and open traversal space for vehicle combat."></textarea>

<label for="wc-seed">Seed</label>
<input id="wc-seed" data-field="seed" value="847212" inputmode="numeric">

<label for="wc-biome">Focus biome</label>
<select id="wc-biome" data-field="biome">
  <option value="desert" selected>desert</option>
  <option value="forest">forest</option>
  <option value="highlands">highlands</option>
  <option value="arctic">arctic</option>
  <option value="wetlands">wetlands</option>
</select>

<label for="wc-tier">Hardware tier</label>
<select id="wc-tier" data-field="tier">${TIER_OPTIONS}</select>

<div class="check">
  <input type="checkbox" id="wc-ai" data-field="ai">
  <label for="wc-ai" style="margin:0">External AI generation (OFF by default)</label>
</div>

<div class="row">
  <button type="button" data-action="generate-region">Generate Region</button>
  <button type="button" data-action="generate-planet">Generate Planet</button>
</div>
<div class="row">
  <button type="button" data-action="reseed">Reseed</button>
  <button type="button" data-action="inspect">Inspect Spec</button>
</div>

<pre data-slot="scorecard">Not generated yet.</pre>
<ul data-slot="gates"></ul>
<div data-slot="summary"></div>

<label>Findings</label>
<ul data-slot="findings"></ul>

<div class="row">
  <button type="button" data-action="show">Show in World</button>
  <button type="button" data-action="hide" disabled>Remove</button>
</div>
<div class="row">
  <button type="button" data-action="commit" disabled>Commit</button>
  <button type="button" data-action="load">Load</button>
  <button type="button" data-action="export-blender">Blender</button>
</div>

<div data-slot="status">Idle.</div>
<pre data-slot="spec" hidden></pre>
<p class="meta">Registry: <span data-slot="registry"></span></p>
<p class="meta">Saved worlds: <span data-slot="saves"></span></p>
`;
