/**
 * PluginManager — modular capability registration with dependency ordering,
 * failure isolation and disposal ownership.
 *
 * Plugin shape:
 *   { id, version?, requires?: string[], optional?: string[], failurePolicy?: 'isolate'|'fatal',
 *     install(ctx), start?(ctx), stop?(ctx), dispose?(ctx) }
 *
 * Status per plugin: registered → installed | failed | skipped → started → stopped → disposed.
 * - `requires` must be registered; a cycle or a missing requirement is rejected at
 *   resolve time with an error that names the offending path.
 * - `optional` only influences ordering when the optional plugin is registered.
 * - A failing plugin with policy 'isolate' (default) is recorded and its required
 *   dependents are skipped; policy 'fatal' re-throws after recording.
 */
export class PluginError extends Error {
  constructor(message, detail = {}) { super(message); this.name = "PluginError"; Object.assign(this, detail); }
}

export class PluginManager {
  /** @param {{ onError?: (scope: string, error: unknown, detail?: any) => void, now?: () => number, log?: (level: string, message: string, detail?: any) => void }} [options] */
  constructor({ onError = null, now = () => Date.now(), log = null } = {}) {
    /** @type {Map<string, any>} */ this.plugins = new Map();
    /** @type {Map<string, { status: string, order: number, error: any, reason: string|null, timings: Record<string, number>, handle: any }>} */
    this.records = new Map();
    this.onError = onError; this.now = now; this.log = log;
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
    this.plugins.set(id, { ...plugin, requires: [...(plugin.requires ?? [])], optional: [...(plugin.optional ?? [])], failurePolicy: policy });
    this.records.set(id, { status: "registered", order: -1, error: null, reason: null, timings: {}, handle: undefined });
    this.order = null;
    return this;
  }

  has(id) { return this.plugins.has(id); }
  get(id) { return this.plugins.get(id) ?? null; }
  handle(id) { return this.records.get(id)?.handle; }
  status(id) { return this.records.get(id)?.status ?? "unregistered"; }

  /** Topological order by requires/optional. Throws PluginError on missing requires or cycles. */
  resolveOrder() {
    if (this.order) return this.order;
    for (const [id, plugin] of this.plugins) for (const dep of plugin.requires) {
      if (!this.plugins.has(dep)) throw new PluginError(`plugin "${id}" requires "${dep}", which is not registered`, { id, missing: dep });
    }
    const state = new Map(); const order = []; const stack = [];
    const visit = (id) => {
      const mark = state.get(id);
      if (mark === "done") return;
      if (mark === "visiting") {
        const cycle = [...stack.slice(stack.indexOf(id)), id];
        throw new PluginError(`plugin dependency cycle: ${cycle.join(" -> ")}. Break the cycle by removing one of these requires/optional edges.`, { cycle });
      }
      state.set(id, "visiting"); stack.push(id);
      const plugin = this.plugins.get(id);
      const deps = [...plugin.requires, ...plugin.optional.filter((d) => this.plugins.has(d))];
      for (const dep of deps) visit(dep);
      stack.pop(); state.set(id, "done"); order.push(id);
    };
    for (const id of this.plugins.keys()) visit(id);
    order.forEach((id, index) => { this.records.get(id).order = index; });
    this.order = order;
    return order;
  }

  async _run(id, phase, fn, ctx) {
    const record = this.records.get(id);
    const began = this.now();
    try { const result = await fn(ctx); record.timings[phase] = this.now() - began; return { ok: true, result }; }
    catch (error) {
      record.timings[phase] = this.now() - began; record.error = error; record.status = "failed"; record.reason = `${phase} threw: ${error?.message ?? error}`;
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
      const plugin = this.plugins.get(id); const record = this.records.get(id);
      if (record.status !== "registered") { results.push({ id, status: record.status, reused: true }); continue; }
      const failedDeps = plugin.requires.filter((dep) => !["installed", "started", "stopped"].includes(this.records.get(dep).status));
      if (failedDeps.length) { record.status = "skipped"; record.reason = `required dependency unavailable: ${failedDeps.join(", ")}`; results.push({ id, status: "skipped", reason: record.reason }); continue; }
      const outcome = await this._run(id, "install", (c) => plugin.install(c), ctx);
      if (outcome.ok) { record.status = "installed"; record.handle = outcome.result; results.push({ id, status: "installed" }); }
      else { results.push({ id, status: "failed", error: outcome.error }); if (plugin.failurePolicy === "fatal") throw outcome.error; }
    }
    return results;
  }

  async startAll(ctx) {
    const order = this.resolveOrder(); const results = [];
    for (const id of order) {
      const plugin = this.plugins.get(id); const record = this.records.get(id);
      if (!["installed", "stopped"].includes(record.status)) continue;
      if (typeof plugin.start !== "function") { record.status = "started"; continue; }
      const outcome = await this._run(id, "start", (c) => plugin.start(c, record.handle), ctx);
      if (outcome.ok) record.status = "started";
      else if (plugin.failurePolicy === "fatal") throw outcome.error;
      results.push({ id, status: record.status });
    }
    return results;
  }

  async stopAll(ctx) {
    const order = [...this.resolveOrder()].reverse(); const results = [];
    for (const id of order) {
      const plugin = this.plugins.get(id); const record = this.records.get(id);
      if (record.status !== "started") continue;
      if (typeof plugin.stop === "function") await this._run(id, "stop", (c) => plugin.stop(c, record.handle), ctx);
      if (record.status !== "failed") record.status = "stopped";
      results.push({ id, status: record.status });
    }
    return results;
  }

  /** Dispose in reverse order. Disposal always runs for installed/started/stopped/failed plugins. */
  async disposeAll(ctx) {
    const order = [...this.resolveOrder()].reverse(); const results = [];
    for (const id of order) {
      const plugin = this.plugins.get(id); const record = this.records.get(id);
      if (["disposed", "registered", "skipped"].includes(record.status)) { continue; }
      if (typeof plugin.dispose === "function") await this._run(id, "dispose", (c) => plugin.dispose(c, record.handle), ctx);
      record.status = "disposed"; record.handle = undefined;
      results.push({ id, status: "disposed" });
    }
    return results;
  }

  /** Forget every plugin (after disposeAll) so a kernel can be re-populated. */
  clear() { this.plugins.clear(); this.records.clear(); this.order = null; }

  /** Reset records to "registered" so installAll can run again (used by kernel re-initialize after stop/dispose of a cycle). */
  rearm() { for (const record of this.records.values()) { record.status = "registered"; record.error = null; record.reason = null; record.handle = undefined; record.timings = {}; } }

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
    for (const [id, plugin] of this.plugins) if (!subset.has(id)) for (const dep of [...plugin.requires, ...plugin.optional]) if (subset.has(dep)) dependents.push(`${id} -> ${dep}`);
    if (dependents.length) throw new PluginError(`reinstall refused: plugins outside the subset depend on members (${dependents.join(", ")}); include them or restart the page`, { dependents });
    const members = order.filter((id) => subset.has(id));
    const disposed = [];
    for (const id of [...members].reverse()) {
      const plugin = this.plugins.get(id); const record = this.records.get(id);
      if (!["installed", "started", "stopped"].includes(record.status)) continue;
      if (typeof plugin.dispose === "function") await this._run(id, "dispose", (c) => plugin.dispose(c, record.handle), ctx);
      record.status = "registered"; record.handle = undefined; record.error = null; record.reason = null; disposed.push(id);
    }
    const installed = [];
    for (const id of members) {
      const plugin = this.plugins.get(id); const record = this.records.get(id);
      if (record.status !== "registered") continue;
      const outcome = await this._run(id, "install", (c) => plugin.install(c), ctx);
      if (outcome.ok) { record.status = "installed"; record.handle = outcome.result; installed.push(id); if (typeof plugin.start === "function") { const s = await this._run(id, "start", (c) => plugin.start(c, record.handle), ctx); if (s.ok) record.status = "started"; } else record.status = "started"; }
    }
    return { disposed, installed, failed: members.filter((id) => this.records.get(id).status === "failed") };
  }

  /** Ids in `candidates` that no plugin outside `candidates` depends on (transitively safe to reinstall in place). */
  independentSubset(candidates) {
    const set = new Set(candidates); let changed = true;
    while (changed) {
      changed = false;
      for (const [id, plugin] of this.plugins) if (!set.has(id)) for (const dep of [...plugin.requires, ...plugin.optional]) if (set.has(dep)) { set.delete(dep); changed = true; }
    }
    return this.resolveOrder().filter((id) => set.has(id));
  }

  diagnostics() {
    let order = null; let orderError = null;
    try { order = this.resolveOrder(); } catch (error) { orderError = error.message; }
    const plugins = [...this.plugins.values()].map((plugin) => {
      const record = this.records.get(plugin.id);
      return Object.freeze({ id: plugin.id, version: plugin.version ?? null, requires: [...plugin.requires], optional: [...plugin.optional], failurePolicy: plugin.failurePolicy, status: record.status, order: record.order, reason: record.reason, error: record.error ? String(record.error?.message ?? record.error) : null, timings: { ...record.timings } });
    }).sort((a, b) => a.order - b.order);
    const counts = {};
    for (const plugin of plugins) counts[plugin.status] = (counts[plugin.status] || 0) + 1;
    return Object.freeze({ count: plugins.length, order, orderError, counts, plugins });
  }
}
