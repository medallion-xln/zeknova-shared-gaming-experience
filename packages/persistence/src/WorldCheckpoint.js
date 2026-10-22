import { immutableData, canonicalJSON } from '../../core/src/index.js';
export const WORLD_CHECKPOINT_SCHEMA = 'zge.world-checkpoint.v1';

/** Compare-and-swap storage contract for independent world snapshots. The adapter
 * determines durability. This does not alter the production v4 SaveTransport. */
export class WorldCheckpointStore {
  #read; #write;
  constructor({ read = () => null, write = null } = {}) { if (typeof read !== 'function' || typeof write !== 'function' || read.constructor.name === 'AsyncFunction' || write.constructor.name === 'AsyncFunction') throw new TypeError('checkpoint adapter must be synchronous'); this.#read = read; this.#write = write; }
  load() { const state = this.#read(); if (!state) return null; if (state.schema !== WORLD_CHECKPOINT_SCHEMA || !Number.isSafeInteger(state.version) || state.version < 1 || !Array.isArray(state.operations) || new Set(state.operations.map(e => e.operationId)).size !== state.operations.length || !state.snapshot || !Number.isSafeInteger(state.snapshot.revision)) throw new TypeError('invalid world checkpoint envelope'); return immutableData(state); }
  commit({ operationId, expectedVersion, snapshot }) {
    const value = immutableData(snapshot), previous = this.load(), fingerprint = canonicalJSON(value);
    if (!operationId || !Number.isSafeInteger(expectedVersion) || expectedVersion < 0 || !Number.isSafeInteger(value.revision) || value.revision < 0) throw new TypeError('invalid world checkpoint request');
    const prior = previous?.operations.find(e => e.operationId === operationId);
    if (prior) {
      if (prior.fingerprint !== fingerprint) return immutableData({ ok: false, reason: 'idempotency-conflict', version: previous.version });
      return immutableData({ ...prior.ack, duplicate: true });
    }
    if (previous && (previous.snapshot.worldId ?? previous.snapshot.id) !== (value.worldId ?? value.id)) return immutableData({ ok: false, reason: 'world-conflict', version: previous.version });
    if ((previous?.version ?? 0) !== expectedVersion || (previous && value.revision < previous.snapshot.revision)) return immutableData({ ok: false, reason: 'save-conflict', version: previous?.version ?? 0 });
    const version = expectedVersion + 1, ack = { ok: true, operationId, version, revision: value.revision, durability: 'adapter-acknowledged' };
    const envelope = immutableData({ schema: WORLD_CHECKPOINT_SCHEMA, version, snapshot: value, operations: [...(previous?.operations ?? []), { operationId, fingerprint, ack }] });
    const written = this.#write(envelope);
    if (written?.then) { written.catch(() => {}); throw new TypeError('checkpoint adapter must acknowledge synchronously'); }
    // Exceptions mean no acknowledged durability. Adapter must replace atomically.
    return immutableData(ack);
  }
}
export function memoryWorldCheckpoint() {
  let data = null;
  return new WorldCheckpointStore({ read: () => data, write: value => { data = value; } });
}
export function localWorldCheckpoint(storage, key) {
  return new WorldCheckpointStore({ read: () => { const text = storage.getItem(key); return text ? JSON.parse(text) : null; }, write: value => storage.setItem(key, JSON.stringify(value)) });
}
