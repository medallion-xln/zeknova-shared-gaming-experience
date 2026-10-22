/**
 * LegacyRuntimeHost — boundary around the authoritative minified runtime.
 * It uses src/game/Game.js unchanged (startup cover, session shim, bridge
 * start, gameplay-ready wait) and records who owns what. It never patches
 * the bundle.
 */
export class LegacyRuntimeHost {
  constructor({ Game, user, window = globalThis.window, bundleUrl = null }) {
    if (typeof Game !== "function") throw new TypeError("LegacyRuntimeHost needs the Game class from src/game/Game.js");
    this.Game = Game; this.user = user; this.window = window; this.bundleUrl = bundleUrl;
    this.instance = null; this.readyDetail = null; this.startedAt = null; this.readyAt = null; this.error = null;
  }
  async start(ctx) {
    if (this.instance) throw new Error("legacy runtime already started in this page; use a full-page restart");
    const now = () => (globalThis.performance?.now?.() ?? Date.now());
    this.startedAt = now();
    const ready = new Promise((resolve) => this.window.addEventListener("zeknova:gameplay-ready", (event) => resolve(event.detail), { once: true }));
    this.instance = new this.Game();
    try { await this.instance.start({ user: this.user }); }
    catch (error) { this.error = error; throw error; }
    this.readyDetail = await ready;
    this.readyAt = now();
    const game = this.current();
    ctx?.metrics.record("compat.legacyRuntime.readyMs", this.readyAt - this.startedAt);
    ctx?.setResource("legacy.game", game);
    ctx?.events.emit("compat:legacy-ready", { detail: this.readyDetail, readyMs: this.readyAt - this.startedAt });
    return { game, bridge: this.bridge(), readyDetail: this.readyDetail, readyMs: this.readyAt - this.startedAt };
  }
  current() { return globalThis.ZekNovaGame ?? null; }
  bridge() { return globalThis.ZekNovaLegacyBridge ?? null; }
  ownership() {
    const game = this.current();
    return Object.freeze({
      runtimeOwner: "legacy-bundle (assets/index-02987539.js)",
      timeOwner: "legacy-bundle animate() — engine clock is in delegated mode",
      physicsOwner: "legacy-bundle (shadow PhysicsWorld is diagnostics only)",
      gameplayOwner: "legacy-bundle", persistenceOwner: "legacy-bundle save client + api/save.php", multiplayerOwner: "legacy-bundle client + api/multiplayer.php",
      renderOwner: "legacy-bundle WebGPURenderer (inline three r185)",
      bundleUrl: this.instance?.runtimeUrl?.href ?? this.bundleUrl, started: !!this.instance, ready: !!this.readyDetail, readyDetail: this.readyDetail,
      bridgePresent: !!this.bridge(), gamePresent: !!game, gameDisposed: game?.disposed ?? null, backend: game?.renderer?.backend?.isWebGPUBackend ? "webgpu" : (game?.renderer ? "webgl2" : null),
    });
  }
}
