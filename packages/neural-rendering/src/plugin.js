import { NativeRenderer } from "../../rendering/src/NativeRenderer.js";
import { ReferenceRenderer } from "../../rendering/src/ReferenceRenderer.js";
import { PresentationController, PRESENTATION_MODES } from "./PresentationController.js";
import { NeuralRenderer } from "./NeuralRenderer.js";
import { MockNeuralBackend } from "./MockNeuralBackend.js";
import { MatrixGame4Adapter } from "./MatrixGame4Adapter.js";
import { CanvasPresenter } from "./CanvasPresenter.js";
import { detectLocalCapabilities } from "./capabilities.js";

/**
 * Engine plugin "presentation": native backend over the shared legacy renderer,
 * optional clean reference capture, optional neural renderer (mock or Matrix-Game 4
 * adapter). Absence or failure of anything neural leaves NATIVE presentation intact.
 */
export function createPresentationPlugin({ getRenderer, getScene, getCamera, getSimulationTime = () => 0, mode = "NATIVE", neuralBackend = "none", endpoint = null, allowMock = true, config = {}, sceneId = "zeknova", requires = [], optional = ["legacy-runtime"] } = {}) {
  return {
    id: "presentation", version: "0.1.0", requires, optional,
    async install(ctx) {
      const native = new NativeRenderer({ getRenderer, getScene, getCamera });
      const presentation = new PresentationController({ allowMock, onChange: (from, to, reason) => ctx.events.emit("presentation:mode", { from, to, reason }) });
      const capture = new ReferenceRenderer({ getRenderer, getScene, getCamera, sceneId, getSimulationTime, profile: config.captureProfile ?? "native", rerender: config.rerender ?? "auto", readback: config.readback ?? "eager", modelWidth: config.modelWidth ?? 864, modelHeight: config.modelHeight ?? 480 });
      const handle = { native, presentation, capture, neural: null, presenter: null, capabilities: null, removeSystem: null };
      await ctx.guard("presentation.native", () => native.initialize(), { timeoutMs: 5000, fallback: null });
      handle.capabilities = await ctx.guard("presentation.capabilities", () => detectLocalCapabilities(), { timeoutMs: 3000, fallback: null });
      ctx.setResource("presentation", handle);
      let backend = null;
      if (neuralBackend === "mock") backend = new MockNeuralBackend({ latencyMs: config.mockLatencyMs ?? 60 });
      else if (neuralBackend === "matrix-game-4") { try { backend = new MatrixGame4Adapter({ baseUrl: endpoint ?? undefined, mode: config.serviceMode ?? "reference" }); } catch (error) { ctx.log("warn", `Matrix-Game 4 adapter unavailable: ${error.message}`); } }
      if (backend) {
        handle.presenter = new CanvasPresenter({ document: ctx.legacy?.document ?? globalThis.document, label: backend.mock ? "NEURAL (MOCK — not model inference)" : "NEURAL" });
        handle.neural = new NeuralRenderer({ capture, backend, presenter: handle.presenter, events: ctx.events, config });
        const started = await ctx.guard("presentation.neural", () => handle.neural.start(), { timeoutMs: config.startTimeoutMs ?? 8000, fallback: false });
        if (started !== false && mode === "NEURAL") { try { presentation.setMode("NEURAL", { backendMock: !!backend.mock, reason: "requested" }); } catch (error) { presentation.fallback(error.message); } }
        handle.removeSystem = ctx.addSystem({ id: "presentation.neural.tick", phase: "render", owner: "presentation", run: (_world, _dt, info) => { if (presentation.mode === "NEURAL" || presentation.mode === "REFERENCE") handle.neural.tick(ctx.metrics.now(), { simulationTime: getSimulationTime() }); } });
        ctx.own("presentation").on("neural:fallback", ({ reason }) => { if (presentation.mode === "NEURAL") presentation.fallback(reason); });
        ctx.own("presentation").on("neural:recovered", () => { if (presentation.mode === "NATIVE" && presentation.fallbackReason && mode === "NEURAL") { try { presentation.setMode("NEURAL", { backendMock: !!backend.mock, reason: "recovered" }); } catch {} } });
      } else if (mode === "NEURAL") presentation.fallback("no neural backend configured");
      if (mode === "REFERENCE") presentation.setMode("REFERENCE", { reason: "requested" });
      handle.status = () => Object.freeze({ presentation: presentation.status(), native: native.status(), capture: capture.status(), neural: handle.neural?.status() ?? null, capabilities: handle.capabilities });
      return handle;
    },
    async dispose(ctx, handle) { handle?.removeSystem?.(); await handle?.neural?.dispose(); handle?.presenter?.dispose(); await handle?.native?.dispose(); ctx.world.deleteResource("presentation"); },
  };
}
export { PRESENTATION_MODES };
