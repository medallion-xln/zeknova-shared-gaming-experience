import { DIRECTORS, DISPOSABLE_DIRECTORS, PAGE_ONLY_DIRECTORS, FALLBACK_WARNINGS } from "./directors.js";
import { LegacyRuntimeHost } from "./legacyRuntime.js";

export const FULL_PAGE_RESTART_KEY = "zge.compat.autoLaunch.v1";

/**
 * Build the plugin set that hosts ZekNova inside the kernel.
 * @param {{ user: any, Game: Function, importModule: (specifier: string) => Promise<any>, window?: any, document?: any, flags?: Record<string, any>, directors?: typeof DIRECTORS }} options
 */
export function createZekNovaCompatPlugins({ user, Game, importModule, window = globalThis.window, document = globalThis.document, flags = {}, directors = DIRECTORS }) {
  if (!user) throw new Error("An authenticated officer is required to host ZekNova.");
  if (typeof importModule !== "function") throw new TypeError("importModule(specifier) must import relative to src/");
  const runtime = new LegacyRuntimeHost({ Game, user, window });
  const legacy = Object.freeze({ user, importModule, modules: new Map(), game: () => runtime.current(), runtime, window, document, flags: Object.freeze({ ...flags }) });
  const withLegacy = (ctx) => Object.assign(Object.create(ctx), { legacy });
  const plugins = directors.map((director) => ({
    id: director.id, version: "compat-0.1.0", requires: director.requires ?? [], optional: director.optional ?? [], failurePolicy: director.failurePolicy ?? "isolate",
    meta: Object.freeze({ phase: director.phase, restart: director.restart, description: director.description }),
    install: async (ctx) => { try { return await director.install(withLegacy(ctx)); } catch (error) { const warning = FALLBACK_WARNINGS[director.id]; if (warning) ctx.log("warn", warning, error); throw error; } },
    ...(director.dispose ? { dispose: (ctx, handle) => director.dispose(withLegacy(ctx), handle) } : {}),
  }));
  return { plugins, legacy, runtime };
}

/** Register all compat plugins on an engine and expose compat diagnostics/restart helpers as a world resource. */
export function installZekNovaCompat(engine, options) {
  const { plugins, legacy, runtime } = createZekNovaCompatPlugins(options);
  for (const plugin of plugins) engine.use(plugin);
  const compat = {
    runtime, legacy, directorIds: plugins.map((p) => p.id),
    inventory: () => plugins.map((p) => ({ id: p.id, phase: p.meta.phase, restart: p.meta.restart, requires: p.requires, optional: p.optional, status: engine.plugins.status(p.id), description: p.meta.description })),
    inPageRestartable: () => engine.plugins.independentSubset(DISPOSABLE_DIRECTORS.filter((id) => engine.plugins.has(id))),
    pageOnly: () => PAGE_ONLY_DIRECTORS.filter((id) => engine.plugins.has(id)),
    /** Dispose + re-create only the directors whose teardown is complete AND that nothing page-only depends on. */
    async restartDirectorLayer() {
      const ids = compat.inPageRestartable();
      const t = engine.metrics.time("compat.restart.directorLayer");
      const result = await engine.plugins.reinstall(ids, engine.context);
      const ms = t.end();
      engine.events.emit("compat:director-layer-restarted", { ...result, ms });
      return { ...result, ms, certified: result.failed.length === 0, scope: "director-layer", legacyRuntimeRestarted: false };
    },
    /** The only lifecycle-safe way to restart the legacy runtime and page-only directors. */
    requestFullPageRestart({ reason = "manual" } = {}) {
      const w = legacy.window; if (!w?.location) throw new Error("full-page restart requires a window");
      try { w.sessionStorage?.setItem(FULL_PAGE_RESTART_KEY, JSON.stringify({ reason, at: Date.now(), user: { id: legacy.user?.id ?? null } })); } catch {}
      engine.events.emit("compat:full-page-restart", { reason });
      w.location.reload();
      return { scope: "full-page", reason };
    },
    consumeFullPageRestartMarker(w = legacy.window) { try { const raw = w?.sessionStorage?.getItem(FULL_PAGE_RESTART_KEY); if (!raw) return null; w.sessionStorage.removeItem(FULL_PAGE_RESTART_KEY); return JSON.parse(raw); } catch { return null; } },
    ownership: () => runtime.ownership(),
  };
  engine.world.setResource("compat", compat);
  return compat;
}

export { DIRECTORS, DISPOSABLE_DIRECTORS, PAGE_ONLY_DIRECTORS };
