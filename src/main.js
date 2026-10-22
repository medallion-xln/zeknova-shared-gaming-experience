import {installLegacyInteractionGuards} from './ui/LegacyInteractionGuards.js';
installLegacyInteractionGuards();
import { runLoginPage } from "./ui/LoginPage.js";
import { createEngine } from "../packages/core/src/index.js";
import { installZekNovaCompat, installLeakProbe } from "../packages/zeknova-compat/src/index.js";
import { createPresentationPlugin } from "../packages/neural-rendering/src/plugin.js";

/* ZGE-01: ZekNova now boots through the ZekNova Engine kernel (@zge/core).
   The authoritative minified runtime (assets/index-02987539.js) is untouched and
   still owns time, physics, gameplay, persistence and rendering; the kernel hosts
   it through @zge/zeknova-compat, which wraps the install chain that used to live
   inline in this file as dependency-declared plugins (see
   packages/zeknova-compat/src/directors.js). Rollback: `git checkout src/main.js`. */

const params = new URLSearchParams(location.search);
const zgeFlags = new Set((params.get("zge") || "").split(",").filter(Boolean));
// Leak probe must wrap EventTarget/timers BEFORE the game loads (development only).
if (zgeFlags.has("probe")) installLeakProbe(globalThis);

document.documentElement.dataset.zeknovaSource = "boss-threat1";
document.documentElement.dataset.zgeKernel = "zge-core-0.1.0";

/* Sentinel Grid Stage 2F-Z runtime collector — now OPT-IN. It was two unguarded static
   imports that polled a hard-coded loopback endpoint every 5 s on every page load.
   Enable with ?sentinelCollector=1 or localStorage zeknova.sentinelCollector.v1 = "1". */
const sentinelCollector = params.get("sentinelCollector") === "1" || (() => { try { return localStorage.getItem("zeknova.sentinelCollector.v1") === "1"; } catch { return false; } })();
if (sentinelCollector) {
  document.documentElement.dataset.sentinelCollector = "opt-in";
  Promise.all([import("../sentinel-grid/live-parity/runtime-collector/Stage2FExactProviderBridgeSafe.js"), import("./game/Stage2FRuntimeCollectorBinding.js")])
    .catch((error) => console.warn("[Sentinel Grid] Stage 2F-Z collector unavailable; gameplay is unchanged.", error));
} else document.documentElement.dataset.sentinelCollector = "disabled";

const FULL_PAGE_RESTART_KEY = "zge.compat.autoLaunch.v1";
function consumeRestartMarker() { try { const raw = sessionStorage.getItem(FULL_PAGE_RESTART_KEY); if (!raw) return null; sessionStorage.removeItem(FULL_PAGE_RESTART_KEY); return JSON.parse(raw); } catch { return null; } }
function armAutoLaunch(marker) {
  document.documentElement.dataset.zgeAutoLaunch = marker.reason || "restart";
  const started = Date.now();
  const timer = setInterval(() => { const button = document.getElementById("launch-game"); if (button && !button.disabled) { clearInterval(timer); document.documentElement.dataset.zgeAutoLaunchAt = String(Math.round(performance.now())); button.click(); } else if (Date.now() - started > 15000) clearInterval(timer); }, 100);
}

async function launch() {
  const root = document.getElementById("app");
  const marker = consumeRestartMarker();
  if (marker) armAutoLaunch(marker);
  const { user } = await runLoginPage(root);
  if (!user) throw new Error("An authenticated officer is required to launch ZekNova.");

  const engine = createEngine({
    id: "zeknova", clock: { mode: "delegated" }, scheduler: "auto",
    config: { features: { construction: params.get("construction") === "shadow" ? "SHADOW" : "LEGACY", combat: "LEGACY", missions: "LEGACY", physics: "LEGACY" } },
    log: (level, message, detail) => (level === "warn" ? console.warn : console.info)(`[zge] ${message}`, detail ?? ""),
  });
  const { Game } = await import("./game/Game.js");
  const compat = installZekNovaCompat(engine, { user, Game, importModule: (specifier) => import(specifier), window, document, flags: {
    sentinelCollector,
    constructionAuthority: params.get("construction") === "shadow" ? "SHADOW" : "LEGACY",
    persistenceTransport: params.get("legacySave") !== "1",          // ?legacySave=1 restores the bundle's fire-and-forget keepalive path (diagnostics only)
    assetConsolidation: params.get("assetCache") !== "0",            // ?assetCache=0 disables the fetch-level GLB cache/watchdog (diagnostics only)
    assetCacheBudgetBytes: Number(params.get("assetCacheMB")) * 1024 * 1024 || undefined,
  } });

  const presentMode = (params.get("present") || "native").toUpperCase();          // native | reference | neural
  const neuralBackend = params.get("neural") || "none";                             // none | mock | matrix-game-4
  engine.use(createPresentationPlugin({
    getRenderer: () => globalThis.ZekNovaGame?.renderer ?? null, getScene: () => globalThis.ZekNovaGame?.scene ?? null, getCamera: () => globalThis.ZekNovaGame?.camera ?? null,
    getSimulationTime: () => globalThis.ZekNovaGame?.clock?.elapsedTime ?? 0,
    mode: ["NATIVE", "REFERENCE", "NEURAL"].includes(presentMode) ? presentMode : "NATIVE", neuralBackend, endpoint: params.get("inference"), allowMock: true,
    config: { captureFps: Number(params.get("captureFps")) || 10, mockLatencyMs: Number(params.get("mockLatency")) || 60, captureProfile: params.get("captureProfile") || "native", rerender: params.get("rerender") || "always" },
    optional: ["legacy-runtime"],
  }));

  globalThis.ZGE = Object.freeze({
    version: "zge-01", engine, compat,
    diagnostics: () => engine.diagnostics(), ownership: () => compat.ownership(), inventory: () => compat.inventory(),
    presentation: () => engine.world.getResource("presentation")?.status?.() ?? null,
    persistence: () => engine.world.getResource("persistence")?.status?.() ?? null,
    construction: () => engine.world.getResource("construction.shadow")?.status?.() ?? { mode: "LEGACY" },
    assets: () => engine.world.getResource("assets")?.status?.() ?? null,
    restartDirectorLayer: () => compat.restartDirectorLayer(), requestFullPageRestart: (options) => compat.requestFullPageRestart(options),
  });
  engine.events.on("engine:lifecycle", ({ to }) => { document.documentElement.dataset.zgeLifecycle = to; }, { owner: "main" });
  await engine.start();
  document.documentElement.dataset.zgeLifecycle = engine.lifecycle.state;
  document.documentElement.dataset.zgePresentation = globalThis.ZGE.presentation()?.presentation?.mode ?? "NATIVE";
  if (zgeFlags.has("overlay")) {
    try { const { mountDevPanel } = await import("../packages/devtools/src/DevPanel.js"); mountDevPanel({ engine, compat, document }); }
    catch (error) { console.warn("[zge] dev panel unavailable", error); }
  }
}

launch().catch((error) => {
  console.error("ZekNova failed to start.", error);
  const root = document.getElementById("app");
  if (root) root.innerHTML = '<main class="fatal-error"><h1>ZekNova could not start</h1><p>Reload the page or contact mission control.</p></main>';
});
