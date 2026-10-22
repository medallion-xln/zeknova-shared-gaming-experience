/**
 * leakProbe — development instrumentation that counts live event listeners, intervals and
 * animation-frame loops so restart paths can prove they do not leak. Install BEFORE the game
 * loads. Never ships enabled; main.js only installs it behind `?zge=probe`.
 *
 * ZGE-02: listener targets are held by WeakRef. A listener counts as LIVE when its target is
 * window/document, or an element that is still connected to the DOM. Listeners on elements that
 * a director removed from the DOM are reported separately as `detached` (released with the node
 * unless something else retains it) instead of being counted as leaks.
 */
export function installLeakProbe(target = globalThis) {
  if (target.__zgeLeakProbe) return target.__zgeLeakProbe;
  const entries = []; // { ref: WeakRef(target), kind, type, listener }
  const counts = { intervals: new Set(), rafPending: 0, rafTotal: 0 };
  const kindOf = (obj) => (obj === target ? "window" : obj === target.document ? "document" : (obj?.constructor?.name ?? "object"));
  const patchListener = (proto) => {
    const add = proto.addEventListener, remove = proto.removeEventListener;
    proto.addEventListener = function (type, listener, options) {
      const entry = { ref: new WeakRef(this), kind: kindOf(this), type, listener, once: !!(options && typeof options === "object" && options.once) };
      entries.push(entry); if (entries.length > 20000) entries.splice(0, 5000);
      if (entry.once && typeof listener === "function") { const wrapped = function (...a) { entry.removed = true; return listener.apply(this, a); }; entry.wrapped = wrapped; return add.call(this, type, wrapped, options); }
      return add.call(this, type, listener, options);
    };
    proto.removeEventListener = function (type, listener, options) { for (let i = entries.length - 1; i >= 0; i -= 1) { const e = entries[i]; if (!e.removed && e.type === type && (e.listener === listener || e.wrapped === listener) && e.ref.deref() === this) { e.removed = true; break; } } return remove.call(this, type, listener, options); };
  };
  if (target.EventTarget?.prototype) patchListener(target.EventTarget.prototype);
  const setInterval0 = target.setInterval, clearInterval0 = target.clearInterval, raf0 = target.requestAnimationFrame, caf0 = target.cancelAnimationFrame;
  target.setInterval = function (...args) { const id = setInterval0.apply(this, args); counts.intervals.add(id); return id; };
  target.clearInterval = function (id) { counts.intervals.delete(id); return clearInterval0.call(this, id); };
  if (raf0) {
    target.requestAnimationFrame = function (cb) { counts.rafPending += 1; counts.rafTotal += 1; return raf0.call(this, (t) => { counts.rafPending = Math.max(0, counts.rafPending - 1); return cb(t); }); };
    target.cancelAnimationFrame = function (id) { counts.rafPending = Math.max(0, counts.rafPending - 1); return caf0.call(this, id); };
  }
  const probe = {
    snapshot() {
      const listeners = {}, detached = {}; let live = 0, detachedTotal = 0, collected = 0;
      for (const e of entries) {
        if (e.removed) continue; const t = e.ref.deref(); if (!t) { collected += 1; continue; }
        const key = `${e.kind}:${e.type}`;
        const isLive = t === target || t === target.document || t.isConnected === true || (t.isConnected === undefined);
        if (isLive) { listeners[key] = (listeners[key] || 0) + 1; live += 1; } else { detached[key] = (detached[key] || 0) + 1; detachedTotal += 1; }
      }
      return { listeners, listenerTotal: live, detached, detachedTotal, collected, intervals: counts.intervals.size, rafPending: counts.rafPending, rafTotal: counts.rafTotal, at: Date.now() };
    },
    diff(a, b) { const keys = new Set([...Object.keys(a.listeners), ...Object.keys(b.listeners)]); const listeners = {}; for (const k of keys) { const d = (b.listeners[k] || 0) - (a.listeners[k] || 0); if (d !== 0) listeners[k] = d; } return { listeners, listenerTotal: b.listenerTotal - a.listenerTotal, detachedTotal: b.detachedTotal - a.detachedTotal, intervals: b.intervals - a.intervals, rafPending: b.rafPending - a.rafPending }; },
  };
  target.__zgeLeakProbe = probe;
  return probe;
}
