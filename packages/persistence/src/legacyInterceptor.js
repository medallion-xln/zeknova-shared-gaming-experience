import { installAuthRecoveryUI } from './AuthRecoveryUI.js';
import { SaveTransport } from "./SaveTransport.js";
import { attachExtension, readExtension } from "./schema.js";

const isSaveUrl = (url) => /\/save\.php(?:\?|$)/.test(url);
const urlOf = (input) => (typeof input === "string" ? input : input instanceof URL ? input.href : input?.url ?? String(input));

/**
 * Installs a fetch-boundary interceptor so the legacy bundle's fire-and-forget keepalive
 * autosave (`fetch(save.php, {keepalive:true})` inside `catch{}`) becomes an acknowledged,
 * retried, coalesced save without touching the bundle:
 *  - POST save.php  → body captured, extension attached (player XP…), queued on SaveTransport;
 *                     the bundle receives a synthetic 202 (it ignores the response anyway).
 *  - GET  save.php  → passed through; if a newer unacknowledged snapshot survived a reload it is
 *                     merged over the server copy so the client restores the newest state; the
 *                     extension block is remembered for post-ready restoration (XP).
 */
export function installLegacySaveInterceptor({ window: win = globalThis.window, teamCode, userId, getGame = () => globalThis.ZekNovaGame ?? null, transportOptions = {}, onEvent = null, log = null }) {
  if (!win || typeof win.fetch !== "function") throw new Error("legacy save interceptor needs a window with fetch");
  const originalFetch = win.fetch; const nativeFetch = (...args) => originalFetch.apply(win, args);
  let recoveryUI;
  const transport = new SaveTransport({ fetchImpl: nativeFetch, teamCode, userId, pendingStore: win.localStorage ?? null, beacon: win.navigator?.sendBeacon ? (u, b) => win.navigator.sendBeacon(u, b) : null, onEvent:(...args)=>{onEvent?.(...args);recoveryUI?.refresh();}, log, ...transportOptions });
  recoveryUI=installAuthRecoveryUI({window:win,transport,nativeFetch,teamCode,userId});
  const state = { loadedExtension: null, serverSave: null, lastGetAt: null, restoredXp: null, interceptedPosts: 0, interceptedGets: 0 };

  const extensionFromGame = () => { const g = getGame(); return g?.player ? { xp: Number(g.player.xp), officerClass: g.user?.officerClass ?? null, rankXp: Number.isFinite(Number(g.user?.rankXp)) ? Number(g.user.rankXp) : null } : {}; };

  const wrapped = async function zgeSaveFetch(input, init = {}) {
    const url = urlOf(input);
    if (!isSaveUrl(url)) return nativeFetch(input, init);
    const method = String(init.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase();
    if (method === "POST") {
      state.interceptedPosts += 1;
      let body = null; try { body = JSON.parse(typeof init.body === "string" ? init.body : await new Response(init.body).text()); } catch { body = null; }
      if (!body) return nativeFetch(input, init);
      const snapshot = attachExtension(body, extensionFromGame());
      transport.submit(snapshot, { source: init.keepalive ? "legacy-keepalive" : "legacy" }).catch(() => {});
      return new Response(JSON.stringify({ ok: true, deferred: true, transport: "zge-save-transport" }), { status: 202, headers: { "Content-Type": "application/json" } });
    }
    if (method === "GET") {
      state.interceptedGets += 1; state.lastGetAt = Date.now();
      const response = await nativeFetch(input, init);
      if (!response.ok) return response;
      let json = null; try { json = await response.clone().json(); } catch { return response; }
      const serverSave = json?.save ?? null; state.serverSave = serverSave;
      const pending = transport.pendingSnapshot();
      let save = serverSave;
      // A pending snapshot is newer than anything THIS client had acknowledged (sequence order). Only
      // prefer the server copy when its revision is ahead of our last ack (another client/tab wrote).
      const serverRevision = serverSave?.persistence?.revision; const ourRevision = transport.revision;
      const serverIsAhead = Number.isFinite(serverRevision) && Number.isFinite(ourRevision) && serverRevision > ourRevision;
      if (pending && !serverIsAhead) { save = { ...(serverSave ?? {}), ...pending, buildings: pending.buildings ?? serverSave?.buildings ?? [], persistence: serverSave?.persistence ?? pending.persistence }; onEvent?.("persistence:restored-from-pending", { pendingUpdatedAt: pending.updatedAt ?? null, serverUpdatedAt: serverSave?.updatedAt ?? null }); }
      state.loadedExtension = readExtension(save);
      if (Number.isFinite(serverSave?.persistence?.revision) && transport.revision === null) transport.revision = serverSave.persistence.revision;
      return new Response(JSON.stringify({ ...json, save }), { status: 200, headers: { "Content-Type": "application/json" } });
    }
    return nativeFetch(input, init);
  };
  wrapped.__zgeSaveInterceptor = true;
  win.fetch = wrapped;

  const onUnload = () => { if (transport.hasPending()) transport.flushBeacon("pagehide"); else transport.unloading = true; };
  win.addEventListener("pagehide", onUnload); win.addEventListener("beforeunload", onUnload);

  const restoreProgression = () => {
    const g = getGame(); const ext = state.loadedExtension; if (!g?.player || !ext) return null;
    if (Number.isFinite(ext.player.xp) && ext.player.xp > Number(g.player.xp || 0)) { g.player.xp = ext.player.xp; state.restoredXp = ext.player.xp; onEvent?.("persistence:xp-restored", { xp: ext.player.xp }); return ext.player.xp; }
    return null;
  };
  const onReady = () => { restoreProgression(); };
  win.addEventListener("zeknova:gameplay-ready", onReady, { once: true });

  return Object.freeze({
    transport, state, restoreProgression,
    status: () => Object.freeze({ ...transport.status(), interceptedPosts: state.interceptedPosts, interceptedGets: state.interceptedGets, loadedExtension: state.loadedExtension, restoredXp: state.restoredXp }),
    dispose() { recoveryUI.dispose(); if (win.fetch === wrapped) win.fetch = originalFetch; win.removeEventListener("pagehide", onUnload); win.removeEventListener("beforeunload", onUnload); win.removeEventListener("zeknova:gameplay-ready", onReady); transport.dispose(); },
  });
}
