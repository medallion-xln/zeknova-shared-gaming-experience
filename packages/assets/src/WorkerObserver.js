/** Counts live Web Workers by script URL and records worker error events (transcoder pools are the leading hang suspect). */
export function installWorkerObserver(win = globalThis, { onEvent = null } = {}) {
  const Original = win.Worker; if (!Original || Original.__zgeObserved) return win.__zgeWorkerObserver ?? null;
  const live = new Map(); const stats = { created: 0, terminated: 0, errors: 0, byScript: {} };
  const key = (url) => { const s = String(url); return s.startsWith("blob:") ? "blob:" : s.split("/").slice(-2).join("/"); };
  function ObservedWorker(url, options) {
    const worker = new Original(url, options); const k = key(url); stats.created += 1; stats.byScript[k] = (stats.byScript[k] || 0) + 1; live.set(worker, k);
    const onError = (event) => { stats.errors += 1; onEvent?.("asset:worker-error", { script: k, message: String(event?.message ?? "worker error") }); };
    worker.addEventListener("error", onError);
    const terminate = worker.terminate.bind(worker); worker.terminate = () => { if (live.delete(worker)) { stats.terminated += 1; stats.byScript[k] = Math.max(0, (stats.byScript[k] || 1) - 1); worker.removeEventListener("error", onError); } return terminate(); };
    return worker;
  }
  ObservedWorker.prototype = Original.prototype; ObservedWorker.__zgeObserved = true; win.Worker = ObservedWorker;
  const observer = { status: () => Object.freeze({ live: live.size, ...stats, byScript: { ...stats.byScript } }), dispose() { if (win.Worker === ObservedWorker) win.Worker = Original; } };
  win.__zgeWorkerObserver = observer; return observer;
}
