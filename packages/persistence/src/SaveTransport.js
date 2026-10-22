import { validateSnapshot, operationId } from "./schema.js";

/**
 * SaveTransport — acknowledged, coalescing, retrying save channel.
 *
 * Guarantees:
 *  - A save is only reported `saved` after the server acknowledged it (HTTP 200 + JSON ok).
 *  - Only the newest snapshot is ever sent (latest-wins coalescing); at most one request is in flight,
 *    so an older request can never overwrite newer state. `persistence.baseRevision` guards cross-tab.
 *  - Transient failures (network, timeout, 5xx) retry with bounded exponential backoff; after `maxRetries`
 *    the channel is `degraded` but keeps trying at the maximum interval and keeps the pending snapshot.
 *  - 401/403 → `auth-expired` (terminal until resume()); 409 → conflict: refresh revision, retry;
 *    400/413/422 → `rejected` (permanent for that snapshot, surfaced, not retried).
 *  - The pending snapshot is persisted (`pendingStore`) so a reload can restore and re-send it.
 *  - Unload uses a best-effort beacon for the small final snapshot only.
 */
export const SAVE_STATES = Object.freeze(["idle", "saving", "retrying", "degraded", "auth-expired", "rejected", "saved"]);

export class SaveTransport {
  constructor({ endpoint = "./api/save.php", fetchImpl = globalThis.fetch?.bind(globalThis), now = () => Date.now(), setTimeoutImpl = (fn, ms) => setTimeout(fn, ms), clearTimeoutImpl = (h) => clearTimeout(h), beacon = null, pendingStore = null, teamCode, userId, maxRetries = 6, baseBackoffMs = 800, maxBackoffMs = 30000, requestTimeoutMs = 8000, onEvent = null, log = null } = {}) {
    if (typeof fetchImpl !== "function") throw new TypeError("SaveTransport needs fetch");
    if (!teamCode || !userId) throw new TypeError("SaveTransport needs teamCode and userId");
    Object.assign(this, { endpoint, fetchImpl, now, setTimeoutImpl, clearTimeoutImpl, beacon, pendingStore, teamCode, userId, maxRetries, baseBackoffMs, maxBackoffMs, requestTimeoutMs, onEvent, log });
    this.state = "idle"; this.seq = 0; this.pending = null; this.inFlight = null; this.timer = null; this.failures = 0; this.revision = null; this.lastAck = null; this.lastError = null; this.unloading = false; this.disposed = false;
    this.counters = { submitted: 0, coalesced: 0, posted: 0, acked: 0, retried: 0, rejected: 0, conflicts: 0, authExpired: 0, beacons: 0, recoveredFromStore: 0 };
    this.waiters = [];
    this.pendingKey = `zge.persistence.pending.v1.${teamCode}.${userId}`;
    this._recoverPending();
  }

  _emit(type, detail = {}) { try { this.onEvent?.(type, Object.freeze({ state: this.state, ...detail })); } catch {} }
  _setState(state, detail = {}) { if (this.state !== state) { this.state = state; this._emit("persistence:state", detail); } }
  _recoverPending() {
    try { const raw = this.pendingStore?.getItem(this.pendingKey); if (!raw) return; const stored = JSON.parse(raw); if (stored?.body && typeof stored.seq === "number") { this.seq = Math.max(this.seq, stored.seq); this.pending = { seq: stored.seq, body: stored.body, at: stored.at ?? this.now(), source: "recovered", operationId:stored.operationId??operationId(stored.seq,this.teamCode,this.userId) }; this.counters.recoveredFromStore += 1; this.revision = stored.revision ?? null; this._emit("persistence:recovered", { seq: stored.seq }); this._schedule(0); } } catch {}
  }
  _storePending() { try { if (this.pending) this.pendingStore?.setItem(this.pendingKey, JSON.stringify({ seq: this.pending.seq, body: this.pending.body, at: this.pending.at, revision: this.revision, operationId:this.pending.operationId })); else this.pendingStore?.removeItem(this.pendingKey); } catch {} }
  hasPending() { return !!this.pending || !!this.inFlight; }
  pendingSnapshot() { return this.pending?.body ?? this.inFlight?.body ?? null; }

  /** Queue a snapshot. Resolves with the acknowledgement that covers this submission (or a terminal failure). */
  submit(snapshot, { source = "autosave" } = {}) {
    if (this.disposed) return Promise.resolve({ ok: false, reason: "disposed" });
    this.counters.submitted += 1;
    try { validateSnapshot(snapshot); }
    catch (error) { this.counters.rejected += 1; this.lastError = { kind: "rejected", status: null, message: error.message }; if (!this.pending && !this.inFlight) this._setState("rejected", { message: error.message }); this._emit("persistence:rejected", { seq: null, status: null, message: error.message, stage: "client-validation" }); return Promise.resolve({ ok: false, reason: "rejected", status: null, message: error.message }); }
    const seq = ++this.seq;
    if (this.pending) this.counters.coalesced += 1;
    this.pending = { seq, body: snapshot, at: this.now(), source, operationId:operationId(seq,this.teamCode,this.userId) };
    this._storePending();
    if (this.state === "saved" || this.state === "idle" || this.state === "rejected") this._setState("saving");
    const promise = new Promise((resolve) => this.waiters.push({ seq, resolve }));
    if (this.unloading) this.flushBeacon("submit-during-unload"); else this._schedule(0);
    return promise;
  }

  _schedule(delayMs) { if (this.timer !== null || this.inFlight) return; this.timer = this.setTimeoutImpl(() => { this.timer = null; this.flush(); }, delayMs); }

  async flush() {
    if (this.inFlight || !this.pending || this.disposed) return null;
    if (this.state === "auth-expired") return null;
    const job = this.pending; this.pending = null; this.inFlight = job;
    const body = { ...job.body, persistence: { ...(job.body.persistence ?? {}), operationId: job.operationId, ...(this.revision !== null ? { baseRevision: this.revision } : {}) } };
    this.counters.posted += 1;
    const outcome = await this._post(body);
    this.inFlight = null;
    if (outcome.ok) {
      this.failures = 0; this.revision = outcome.revision ?? this.revision; this.lastAck = { seq: job.seq, revision: this.revision, at: this.now(), duplicate: !!outcome.duplicate }; this.lastError = null; this.counters.acked += 1;
      this._resolveWaiters(job.seq, { ok: true, revision: this.revision, seq: job.seq });
      if (this.pending) { this._setState("saving"); this._schedule(0); } else { this._setState("saved", { revision: this.revision }); this._storePending(); }
      this._emit("persistence:saved", { seq: job.seq, revision: this.revision, source: job.source });
      return outcome;
    }
    this.lastError = outcome;
    switch (outcome.kind) {
      case "auth-expired": this.counters.authExpired += 1; this._requeue(job); this._setState("auth-expired", { status: outcome.status }); this._emit("persistence:auth-expired", { status: outcome.status }); this._resolveWaiters(Infinity, { ok: false, reason: "auth-expired", status: outcome.status }); return outcome;
      case "rejected": this.counters.rejected += 1; this._resolveWaiters(job.seq, { ok: false, reason: "rejected", status: outcome.status, message: outcome.message }); if (this.pending) { this._setState("saving"); this._schedule(0); } else { this._setState("rejected", { status: outcome.status, message: outcome.message }); this._storePending(); } this._emit("persistence:rejected", { seq: job.seq, status: outcome.status, message: outcome.message }); return outcome;
      case "conflict": { this.counters.conflicts += 1; const fresh = await this._refreshRevision(); if (fresh !== null) this.revision = fresh; else this.revision = null; this._requeue(job); this.failures += 1; this.counters.retried += 1; this._setState("retrying", { reason: "conflict" }); this._emit("persistence:conflict", { serverRevision: fresh }); this._schedule(this._backoff()); return outcome; }
      default: { this._requeue(job); this.failures += 1; this.counters.retried += 1; const delay = this._backoff(); this._setState(this.failures > this.maxRetries ? "degraded" : "retrying", { failures: this.failures, delayMs: delay, error: outcome.message }); this._emit("persistence:retry", { failures: this.failures, delayMs: delay, error: outcome.message, degraded: this.failures > this.maxRetries }); this._schedule(delay); return outcome; }
    }
  }

  _requeue(job) { if (!this.pending || this.pending.seq < job.seq) this.pending = job; this._storePending(); }
  _backoff() { const exp = Math.min(this.maxBackoffMs, this.baseBackoffMs * 2 ** Math.min(this.failures - 1, 10)); return Math.round(exp * (0.85 + Math.random() * 0.3)); }
  _resolveWaiters(uptoSeq, result) { const keep = []; for (const w of this.waiters) { if (w.seq <= uptoSeq) w.resolve(result); else keep.push(w); } this.waiters = keep; }

  async _post(body) {
    const controller = typeof AbortController === "function" ? new AbortController() : null;
    const timer = controller ? this.setTimeoutImpl(() => controller.abort(), this.requestTimeoutMs) : null;
    try {
      const response = await this.fetchImpl(this.endpoint, { method: "POST", credentials: "include", keepalive: false, headers: { "Content-Type": "application/json", Accept: "application/json" }, body: JSON.stringify(body), signal: controller?.signal });
      const status = response.status; let json = null; try { json = await response.json(); } catch {}
      if (response.ok && json && json.ok !== false) return { ok: true, status, revision: Number.isFinite(json.revision) ? json.revision : null, duplicate: !!json.duplicate };
      if (status === 401 || status === 403) return { ok: false, kind: "auth-expired", status, message: json?.error ?? "authentication required" };
      if (status === 409) return { ok: false, kind: "conflict", status, message: json?.error ?? "stale revision" };
      if (status === 400 || status === 413 || status === 422) return { ok: false, kind: "rejected", status, message: json?.error ?? `rejected (${status})` };
      return { ok: false, kind: "transient", status, message: json?.error ?? `server error (${status})` };
    } catch (error) { return { ok: false, kind: "transient", status: 0, message: error?.name === "AbortError" ? `timeout after ${this.requestTimeoutMs} ms` : String(error?.message ?? error) }; }
    finally { if (timer !== null) this.clearTimeoutImpl(timer); }
  }

  async _refreshRevision() {
    try { const r = await this.fetchImpl(`${this.endpoint}?team=${encodeURIComponent(this.teamCode)}`, { credentials: "include", headers: { Accept: "application/json" } }); if (!r.ok) return null; const j = await r.json(); const rev = j?.save?.persistence?.revision; return Number.isFinite(rev) ? rev : null; } catch { return null; }
  }

  /** Called on pagehide/beforeunload: best-effort beacon for the small final snapshot (never reported as saved). */
  flushBeacon(reason = "unload") {
    this.unloading = true;
    const job = this.pending ?? this.inFlight; if (!job) return false;
    const body = JSON.stringify({ ...job.body, persistence: { ...(job.body.persistence ?? {}), operationId: job.operationId, ...(this.revision !== null ? { baseRevision: this.revision } : {}) } });
    if (body.length > 60000 || typeof this.beacon !== "function") { this._emit("persistence:beacon-skipped", { reason, bytes: body.length }); return false; }
    // text/plain is CORS-safelisted (application/json is not and makes sendBeacon return false); api/bootstrap.php reads php://input regardless of Content-Type.
    let sent = false; try { sent = !!this.beacon(this.endpoint, new Blob([body], { type: "text/plain;charset=UTF-8" })); } catch { sent = false; }
    this.counters.beacons += sent ? 1 : 0; this._emit("persistence:beacon", { reason, sent, bytes: body.length });
    return sent;
  }

  resume() { if (this.state === "auth-expired") { this.failures = 0; this._setState(this.pending ? "saving" : "idle"); if (this.pending) this._schedule(0); return true; } return false; }
  status() { return Object.freeze({ state: this.state, revision: this.revision, lastAck: this.lastAck, lastError: this.lastError ? { kind: this.lastError.kind, status: this.lastError.status, message: this.lastError.message } : null, pendingSeq: this.pending?.seq ?? null, inFlightSeq: this.inFlight?.seq ?? null, failures: this.failures, counters: { ...this.counters }, unloading: this.unloading }); }
  dispose() { this.disposed = true; if (this.timer !== null) { this.clearTimeoutImpl(this.timer); this.timer = null; } this._resolveWaiters(Infinity, { ok: false, reason: "disposed" }); }
}
