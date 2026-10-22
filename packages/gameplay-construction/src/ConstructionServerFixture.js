import { immutableData, canonicalJSON } from '../../core/src/index.js';
import { ConstructionRuntime } from './ConstructionRuntime.js';
import { memoryWorldCheckpoint } from '../../persistence/src/WorldCheckpoint.js';

/** Isolated in-process server. Synchronous CAS commit serializes arrivals. Tokens
 * are test identities, not a production authentication scheme. Never PHP/live. */
export class ConstructionServerFixture {
  #runtime; #options; #store; #version; #identities;
  constructor({ options, store = memoryWorldCheckpoint(), identities = { alice: 'fixture-a', bob: 'fixture-b' } }) {
    this.#options = options; this.#store = store; this.#identities = { ...identities };
    this.#runtime = new ConstructionRuntime(options);
    const saved = store.load(); this.#version = saved?.version ?? 0;
    if (saved) this.#runtime.restore(saved.snapshot);
  }
  handle({ clientId, token, command = null }) {
    if (!Object.hasOwn(this.#identities, clientId) || this.#identities[clientId] !== token) return immutableData({ ok: false, reason: 'unauthorized' });
    if (!command) return this.#response({ ok: true });
    if (!['place', 'remove'].includes(command.action)) return this.#response({ ok: false, reason: 'forbidden-action' });
    // Namespace logical IDs by authenticated identity; cannot steal another client's receipt.
    const transactionId = JSON.stringify([clientId, command.commandId]);
    if (typeof command.commandId !== 'string' || !command.commandId || !Number.isSafeInteger(command.expectedRevision)) return this.#response({ ok: false, reason: 'invalid-command' });
    const request = { ...command, commandId: transactionId };
    const candidate = new ConstructionRuntime(this.#options); candidate.restore(this.#runtime.snapshot());
    let result;
    try {
      result = candidate.dispatch(request);
      if (canonicalJSON(candidate.snapshot()) !== canonicalJSON(this.#runtime.snapshot())) {
        const ack = this.#store.commit({ operationId: 'transaction:' + transactionId, expectedVersion: this.#version, snapshot: candidate.snapshot() });
        if (!ack.ok) { const confirmed = this.#store.load(); if (confirmed) { this.#runtime.restore(confirmed.snapshot); this.#version = confirmed.version; } return this.#response({ ok: false, reason: ack.reason }); }
        this.#version = ack.version; this.#runtime.restore(candidate.snapshot());
      }
      return this.#response({ ...result, commandAcknowledged: true });
    } catch (error) { return this.#response({ ok: false, reason: 'storage-or-validation-failure', message: error.message }); }
    finally { candidate.dispose(); }
  }
  #response(result) { return immutableData({ ...result, acknowledgment: { kind: 'server-fixture-checkpoint', version: this.#version, revision: this.#runtime.snapshot().revision, durability: 'adapter-acknowledged' }, snapshot: this.#runtime.snapshot() }); }
  snapshot() { return this.#runtime.snapshot(); }
}

/** A replicated view with a durable-outbox-shaped contract. Network failures keep
 * the exact request (including expected revision); retry never invents a new ID. */
export class ConstructionFixtureClient {
  #send; #pending; #persist;
  constructor({ clientId, token, send, pending = [], persist = () => {} }) {
    this.clientId = clientId; this.token = token; this.#send = send; this.#pending = immutableData(pending); this.#persist = persist;
    this.view = null; this.version = -1; this.connected = true;
  }
  async reconcile() { return this.#receive(await this.#send({ clientId: this.clientId, token: this.token })); }
  #receive(response) {
    // A delayed response cannot rewind a newer confirmed checkpoint, including rejected audit records.
    if (response.snapshot && response.acknowledgment.version >= this.version) { this.view = immutableData(response.snapshot); this.version = response.acknowledgment.version; }
    return response;
  }
  async submit(command) {
    const request = immutableData({ ...command, expectedRevision: command.expectedRevision ?? this.view?.revision ?? 0 });
    const prior = this.#pending.find(c => c.commandId === request.commandId);
    if (prior && canonicalJSON(prior) !== canonicalJSON(request)) throw new Error('pending idempotency conflict');
    if (!prior) { const pending = immutableData([...this.#pending, request]); this.#persist(pending); this.#pending = pending; }
    try {
      const response = this.#receive(await this.#send({ clientId: this.clientId, token: this.token, command: request }));
      if (response.commandAcknowledged) { const pending = immutableData(this.#pending.filter(c => c.commandId !== request.commandId)); this.#persist(pending); this.#pending = pending; }
      return response;
    } catch (error) { this.connected = false; throw error; }
  }
  async reconnect() { this.connected = true; await this.reconcile(); const results = []; for (const command of [...this.#pending]) results.push(await this.submit(command)); return results; }
  pending() { return immutableData(this.#pending); }
}
