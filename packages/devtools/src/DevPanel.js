/**
 * DevPanel — lightweight development-only diagnostics. Mounted only when the page
 * is opened with `?zge=overlay`. Reads engine.diagnostics(), compat ownership and
 * presentation status every 500 ms. Mock backends are always labelled MOCK.
 */
export function mountDevPanel({ engine, compat = null, document = globalThis.document, intervalMs = 500 }) {
  if (!document || document.getElementById("zge-devpanel")) return null;
  const panel = document.createElement("pre"); panel.id = "zge-devpanel";
  panel.style.cssText = "position:fixed;right:10px;bottom:10px;z-index:9998;max-width:420px;max-height:46vh;overflow:auto;margin:0;padding:10px 12px;background:#06111acc;color:#9fe8d2;font:11px/1.45 ui-monospace,Menlo,monospace;border:1px solid #1f5c4a;border-radius:6px;pointer-events:auto;white-space:pre-wrap";
  panel.setAttribute("data-testid", "zge-devpanel");
  const fmt = (v, d = 1) => (typeof v === "number" && Number.isFinite(v) ? v.toFixed(d) : "—");
  const render = () => {
    const diag = engine.diagnostics(); const plugins = diag.plugins; const presentation = engine.world.getResource("presentation"); const ps = presentation?.status?.() ?? null;
    const neural = ps?.neural; const native = ps?.native; const own = compat?.ownership?.() ?? null; const frame = diag.metrics.timers["frame.total"]; const delta = diag.metrics.timers["frame.delta"];
    const lines = [
      `ZGE ${engine.id} · lifecycle ${diag.lifecycle.state} · clock ${diag.clock.mode} · frames ${diag.frameCount}`,
      `plugins ${plugins.count}: ${Object.entries(plugins.counts).map(([k, v]) => `${k} ${v}`).join(", ")}${plugins.orderError ? ` · ORDER ERROR ${plugins.orderError}` : ""}`,
      own ? `runtime owner: ${own.runtimeOwner.split(" ")[0]} · time: ${own.timeOwner.split(" ")[0]} · backend ${own.backend ?? "—"} · game ${own.gamePresent ? (own.gameDisposed ? "disposed" : "live") : "none"}` : "runtime owner: kernel (standalone)",
      `frame Δ p50 ${fmt(delta?.p50)} p99 ${fmt(delta?.p99)} ms · kernel frame cost p99 ${fmt(frame?.p99, 3)} ms · errors ${diag.metrics.counters["errors.total"] ?? 0}`,
      ps ? `presentation ${ps.presentation.label}${ps.presentation.fallbackReason ? ` (fallback: ${ps.presentation.fallbackReason})` : ""}` : "presentation: plugin absent",
      native ? `native renderer ${native.backend ?? "—"} · draw calls ${native.drawCalls ?? "—"} · tris ${native.triangles ?? "—"} · shared instance ${native.sharedInstance}` : "native renderer: —",
      neural ? `neural [${neural.backend.mock ? "MOCK" : neural.backend.id}] session ${neural.session.state} (${neural.session.id}) · capture ${fmt(neural.captureFps)} fps · presented ${fmt(neural.presentedFps)} fps · latency ${fmt(neural.lastLatencyMs, 0)} ms · queue ${neural.display.depth}/${neural.display.capacity} · dropped ${neural.counters.staleDropped} · in-flight ${neural.inFlight}${neural.fallbackReason ? ` · FALLBACK: ${neural.fallbackReason}` : ""}` : "neural renderer: none (NATIVE only)",
      ps?.capture ? `reference capture ${ps.capture.width}x${ps.capture.height} · captures ${ps.capture.captures} · last ${fmt(ps.capture.lastCaptureMs)} ms · overlays hidden ${ps.capture.overlaysHiddenLast}` : "",
      (() => { const p = engine.world.getResource("persistence")?.status?.(); return p ? `persistence ${p.state} · rev ${p.revision ?? "—"} · acked ${p.counters.acked} · retried ${p.counters.retried} · rejected ${p.counters.rejected} · coalesced ${p.counters.coalesced}${p.lastError ? ` · last: ${p.lastError.message}` : ""}${p.restoredXp ? ` · xp restored ${p.restoredXp}` : ""}` : "persistence: legacy keepalive (transport disabled)"; })(),
      (() => { const a = engine.world.getResource("assets")?.status?.(); return a ? `assets cache ${a.cache.entries} entries ${Math.round(a.cache.bytes / 1048576)} MB · hits ${a.cache.hits} joined ${a.cache.joined} misses ${a.cache.misses} · dl ${Math.round(a.cache.bytesDownloaded / 1048576)} MB saved ${Math.round(a.cache.bytesServedFromCache / 1048576)} MB · loads ${a.loader.completed} p95 ${fmt(a.loader.loadMs?.p95, 0)} ms stalls ${a.loader.stalls} pending ${a.loader.pending.length} · workers ${a.workers?.live ?? "—"} errors ${a.workers?.errors ?? "—"}` : "assets: no consolidation"; })(),
      `guards: ${Object.entries(diag.guards).map(([k, g]) => `${k}=${g.state}`).join(" ") || "—"}`,
      `events ${diag.events.total} listeners · systems ${diag.systems.map((s) => s.id).join(",") || "—"}`,
      compat ? `in-page restartable: ${compat.inPageRestartable().length} · page-only: ${compat.pageOnly().length} · F8 hides` : "F8 hides",
    ];
    panel.textContent = lines.filter(Boolean).join("\n");
  };
  render(); const timer = setInterval(render, intervalMs);
  const onKey = (e) => { if (e.key === "F8") panel.style.display = panel.style.display === "none" ? "block" : "none"; };
  document.addEventListener("keydown", onKey); document.body.appendChild(panel);
  return { panel, dispose() { clearInterval(timer); document.removeEventListener("keydown", onKey); panel.remove(); } };
}
