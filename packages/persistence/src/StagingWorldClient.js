import { immutableData, validateWorldState, canonicalJSON } from '../../core/src/index.js';

/** Read-only HTTP replica with a persisted logical-command outbox. Access token,
 * persistent session identity and transient browser connection are distinct. */
export class StagingWorldClient {
  #generation = 0;
  constructor({ endpoint = '/staging/world', sessionEndpoint = '/staging/session', historyEndpoint = null, worldId, token,
    fetchFn = (...args) => globalThis.fetch(...args), pending = [], persist = () => {}, eventWindow = 256, onMetrics = () => {} }) {
    if (!Number.isSafeInteger(eventWindow) || eventWindow < 1 || eventWindow > 4096) throw new TypeError('invalid event window');
    Object.assign(this, { endpoint, sessionEndpoint, historyEndpoint, worldId, token, fetchFn, persist, eventWindow, onMetrics });
    this.pending = [...pending]; this.view = null; this.world = null;
    this.cursor = 0; this.serverCursor = 0; this.connected = false; this.events = []; this.runtimeGeneration = 0; this.retryAt = 0;
    this.sessionId = null; this.connectionId = null; this.identity = null;
  }
  async #fetch(url, body, authorization) {
    const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 10000);
    try {
      const response = await this.fetchFn(url, { method: 'POST', headers: { 'content-type': 'application/json', authorization }, body: JSON.stringify(body), signal: controller.signal });
      const data = await response.json();
      if(response.status===429){const delay=data.reason==='rate-limited'?(60-Math.floor(Date.now()/1000)%60)*1000:500;this.retryAt=Date.now()+delay;}
      if (!response.ok || !data.ok) throw Object.assign(Error(data.reason ?? 'server-unavailable'), { status: response.status });
      return data;
    } finally { clearTimeout(timer); }
  }
  async connect() {
    const generation = ++this.#generation;
    const data = await this.#fetch(this.sessionEndpoint, { action: 'connect', worldId: this.worldId }, 'Bearer ' + this.token);
    if (generation !== this.#generation) throw Error('superseded-connection');
    if (data.protocol !== 'zge.session.v1' || data.identity?.worldId !== this.worldId || !data.identity.playerId || !/^[a-f0-9]{32}$/.test(data.connectionId) || !/^[a-f0-9]{32}$/.test(data.sessionId)) throw Error('invalid-session');
    if (this.identity && data.identity.playerId !== this.identity.playerId) throw Error('identity-substitution');
    this.sessionId = data.sessionId; this.connectionId = data.connectionId; this.identity = immutableData(data.identity); this.expires = data.expires;
    return this.identity;
  }
  async reauthenticate(refreshToken, { resume = true } = {}) {
    // No refresh secret is retained in this object or browser storage.
    ++this.#generation; this.connected = false; this.connectionId = null;
    const data = await this.#fetch(this.sessionEndpoint, { action: 'reauthenticate', worldId: this.worldId }, 'Refresh ' + refreshToken);
    if (data.identity?.worldId !== this.worldId || (this.identity && data.identity.playerId !== this.identity.playerId)) throw Error('identity-substitution');
    this.token = data.token; this.connectionId = null;
    await this.connect(); return resume ? this.reconnect() : this.identity;
  }
  async disconnect() {
    const connectionId = this.connectionId; ++this.#generation; this.connected = false; this.connectionId = null;
    if (connectionId) await this.#fetch(this.sessionEndpoint, { action: 'disconnect', worldId: this.worldId, connectionId }, 'Bearer ' + this.token);
  }
  async request(extra = {}) {
    if(Date.now()<this.retryAt)throw Object.assign(Error('server-backpressure'),{status:429});
    const generation = this.#generation, requestedCursor = this.cursor, started = performance.now();let acknowledged = started;
    try {
      const data = await this.#fetch(this.endpoint, { worldId: this.worldId, cursor: requestedCursor, ...(this.connectionId ? { connectionId: this.connectionId } : {}), ...extra }, 'Bearer ' + this.token);
      acknowledged=performance.now();
      if (generation !== this.#generation) throw Error('superseded-connection');
      validateWorldState(data.world);
      if (data.world.id !== this.worldId || data.snapshot.worldId !== this.worldId || data.revision !== data.world.revision || data.revision !== data.snapshot.revision || !Number.isSafeInteger(data.cursor) || data.cursor < 0 || !Array.isArray(data.events)) throw Error('invalid-server-snapshot');
      if (this.connectionId && (data.sessionId !== this.sessionId || data.connectionId !== this.connectionId || data.identity?.playerId !== this.identity.playerId)) throw Error('invalid-server-session');
      if (data.protocol === 'zge.session.v1') {
        if (canonicalJSON(data.world.inventory) !== canonicalJSON(data.snapshot.construction.inventory) || canonicalJSON(data.world.buildings) !== canonicalJSON(data.snapshot.construction.buildings) || (data.snapshot.schema !== 'zge.multiplayer-view.v1' && (canonicalJSON(data.world.events) !== canonicalJSON(data.snapshot.events) || canonicalJSON(data.world.entities.find(e => e.id === data.snapshot.player.id)?.components.player) !== canonicalJSON(data.snapshot.player)))) throw Error('invalid-server-snapshot');
        if (data.snapshot.schema === 'zge.multiplayer-view.v1') {
          if (data.snapshot.player && data.snapshot.player.playerId !== data.identity.playerId) throw Error('private-player-mismatch');
          const fields=['id','playerId','x','y','z','radius','rotation','rank'];
          if (!Array.isArray(data.snapshot.players) || data.snapshot.players.some(p=>Object.keys(p).some(k=>!fields.includes(k)) || canonicalJSON(data.world.entities.find(e=>e.id===p.id)?.components.player)!==canonicalJSON(p))) throw Error('invalid-public-players');
        }
        if (data.acknowledgment?.kind !== 'sqlite-commit' || data.acknowledgment.revision !== data.revision || (extra.command && typeof data.result?.ok !== 'boolean')) throw Error('invalid-server-receipt');
        if ((data.snapshot.checkpoint?.eventSequence ?? 0) + data.snapshot.events.length !== data.cursor) throw Error('invalid-server-snapshot');
        const digest = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(canonicalJSON(data.snapshot)));
        const hex = Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('');
        if (hex !== data.snapshotChecksum) throw Error('snapshot-checksum-mismatch');
        if (data.nextCursor !== (data.events.length ? requestedCursor + data.events.length : requestedCursor) || data.nextCursor > data.cursor) throw Error('event-cursor-gap');
      }
      // Validate the ENTIRE reply before publishing snapshot, cursor or events.
      let cursor = this.cursor, additions = [], previous = null;
      for (const event of data.events) {
        if (!Number.isSafeInteger(event.sequence) || event.worldId !== this.worldId || event.sequence >= data.cursor || (previous !== null && event.sequence !== previous + 1)) throw Error('event-cursor-gap');
        previous = event.sequence;
        if (event.sequence < cursor) continue;
        if (event.sequence !== cursor) throw Error('event-cursor-gap');
        additions.push(immutableData(event)); cursor++;
      }
      if (this.view && data.cursor >= this.serverCursor && data.revision < this.view.revision) throw Error('revision-regression');
      if (generation !== this.#generation) throw Error('superseded-connection');
      if(data.runtime && (!Number.isSafeInteger(data.runtime.generation)||data.runtime.generation<1||data.runtime.generation<this.runtimeGeneration))throw Error('stale-runtime-generation');
      const nextView = immutableData(data.snapshot), nextWorld = immutableData(data.world);
      if (data.cursor >= this.serverCursor) { this.view = nextView; this.world = nextWorld; this.serverCursor = data.cursor; }
      this.events = [...this.events, ...additions].slice(-this.eventWindow); this.cursor = cursor; this.connected = true; if(data.runtime)this.runtimeGeneration=data.runtime.generation;
      this.lastMetrics=immutableData({schema:'zge.client-command-metrics.v1',worldId:this.worldId,commandId:extra.command?.commandId??null,generation:this.runtimeGeneration,httpAcknowledgmentMs:acknowledged-started,reconciliationMs:performance.now()-acknowledged,totalMs:performance.now()-started,server:data.metrics??null});
      try{this.onMetrics(this.lastMetrics);}catch{} // Observational hooks cannot alter durable acknowledgment.
      return data;
    } catch (error) { this.connected = false; throw error; }
  }
  async submit(command) {
    const actorRevision = this.view?.schema === 'zge.multiplayer-view.v1' && ['move','select'].includes(command.action) ? { expectedPlayerRevision: this.view.player?.revision ?? 0 } : {};
    const request = immutableData({ ...actorRevision, ...command, expectedRevision: command.expectedRevision ?? this.view?.revision ?? 0 });
    const prior = this.pending.find(c => c.commandId === request.commandId);
    if (prior && canonicalJSON(prior) !== canonicalJSON(request)) throw Error('pending-command-conflict');
    if(!prior&&this.pending.length)throw Error('pending-recovery-required');
    if(Date.now()<this.retryAt)throw Object.assign(Error('server-backpressure'),{status:429});
    if (!prior) { this.persist([...this.pending, request]); this.pending.push(request); }
    const data = await this.request({ command: request });
    const pending = this.pending.filter(c => c.commandId !== request.commandId);
    this.persist(pending); this.pending = pending;
    return data;
  }
  async downloadEvents() {
    if (!this.historyEndpoint) return;
    const generation = this.#generation, target = this.serverCursor;
    while (this.cursor < target) {
      const start = this.cursor;
      const data = await this.#fetch(this.historyEndpoint, { worldId: this.worldId, cursor: start, throughCursor: target, limit: 256, ...(this.connectionId ? { connectionId: this.connectionId } : {}) }, 'Bearer ' + this.token);
      if (generation !== this.#generation) throw Error('superseded-connection');
      if (data.protocol !== 'zge.events.v1' || data.worldId !== this.worldId || data.cursor !== target || !Array.isArray(data.events) || data.events.length < 1 || data.events.length > 256 || data.nextCursor !== start + data.events.length || data.nextCursor > target) throw Error('event-cursor-gap');
      const events = data.events.map((event, i) => { if (event.sequence !== start + i || event.worldId !== this.worldId) throw Error('event-cursor-gap'); return immutableData(event); });
      // Another poll may have already downloaded part of this page.
      const additions = events.filter(event => event.sequence >= this.cursor);
      if (additions.length && additions[0].sequence !== this.cursor) throw Error('event-cursor-gap');
      this.events = [...this.events, ...additions].slice(-this.eventWindow); this.cursor = Math.max(this.cursor, data.nextCursor);
    }
  }
  async reconnect() {
    if (this.sessionId && !this.connectionId) await this.connect();
    await this.request(); await this.downloadEvents();
    for (const command of [...this.pending]) await this.submit(command);
    return { ok: true, revision: this.view.revision, pending: this.pending.length };
  }
}
