import { immutableData } from './WorldState.js';
export const GAMEPLAY_EVENT_SCHEMA = 'zge.gameplay-event.v1';
export const canonicalJSON = value => JSON.stringify(value, (_key, v) => v && typeof v === 'object' && !Array.isArray(v) ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => a.localeCompare(b))) : v);

/** Durable records are data. Subscribers are read-only presentation/telemetry.
 * Delivery failures never invalidate a commit; explicit replay is opt-in. */
export class GameplayEventJournal {
  #offset = 0; #records = []; #subscribers = new Map(); #failures = []; #delivering = false;
  static transaction({ worldId, transactionId, revision, authority, events, offset = 0 }) {
    return immutableData(events.map((event, index) => ({ ...event, schema: GAMEPLAY_EVENT_SCHEMA,
      id: JSON.stringify([worldId, transactionId, index]), worldId, transactionId, revision,
      sequence: offset + index, authority, order: index })));
  }
  static validate(records, { offset = 0 } = {}) {
    if (!Number.isSafeInteger(offset) || offset < 0) throw new TypeError('invalid journal offset');
    immutableData(records);
    const ids = new Set(), closed = new Set(); let previous = null;
    for (let i = 0; i < records.length; i++) {
      const e = records[i];
      if (e.schema !== GAMEPLAY_EVENT_SCHEMA || !e.id || ids.has(e.id) || !e.type || !e.worldId || !e.transactionId || e.sequence !== offset + i || !Number.isSafeInteger(e.order) || e.order < 0 || !Number.isSafeInteger(e.revision) || e.revision < 0 || e.authority?.mode !== 'ENGINE' || !e.authority.owner || !Number.isSafeInteger(e.authority.epoch) || e.authority.epoch < 0) throw new TypeError('invalid gameplay event journal');
      if (e.id !== JSON.stringify([e.worldId, e.transactionId, e.order]) || (previous && (e.worldId !== previous.worldId || e.revision < previous.revision)) || (previous?.transactionId === e.transactionId ? e.order !== previous.order + 1 : e.order !== 0 || closed.has(e.transactionId))) throw new TypeError('invalid gameplay event ordering');
      if (previous && previous.transactionId !== e.transactionId) closed.add(previous.transactionId);
      ids.add(e.id); previous = e;
    }
    return records;
  }
  append(records) {
    if (this.#delivering) throw new Error('event delivery in progress');
    const fresh = [];
    for (const record of records) {
      const prior = this.#records.find(e => e.id === record.id);
      if (prior) { if (canonicalJSON(prior) !== canonicalJSON(record)) throw new Error('event id conflict'); }
      else fresh.push(record);
    }
    const next = immutableData([...this.#records, ...fresh]); GameplayEventJournal.validate(next, { offset: this.#offset });
    this.#records = next; this.#deliver(fresh); return fresh.length;
  }
  subscribe(id, consume, { replay = false } = {}) {
    if (this.#subscribers.has(id) || typeof consume !== 'function') throw new Error('duplicate or invalid event subscriber');
    const entry = { consume, seen: new Set() }; this.#subscribers.set(id, entry);
    if (replay) this.#deliver(this.#records, [[id, entry]]);
    return () => this.#subscribers.delete(id);
  }
  #deliver(records, subscribers = [...this.#subscribers]) {
    const wasDelivering = this.#delivering; this.#delivering = true;
    try { for (const [id, entry] of subscribers) for (const event of records) {
      if (entry.seen.has(event.id)) continue;
      entry.seen.add(event.id); // No automatic retry of arbitrary external effects.
      try {
        const result = entry.consume(event);
        if (result?.then) { result.catch(() => {}); throw new Error('event subscriber must be synchronous'); }
      } catch (error) {
        this.#failures.push({ subscriber: id, eventId: event.id, message: String(error.message ?? error) });
        if (this.#failures.length > 100) this.#failures.shift();
      }
    } } finally { this.#delivering = wasDelivering; }
  }
  snapshot() { return immutableData(this.#records); }
  restore(records, { offset = 0 } = {}) {
    if (this.#delivering) throw new Error('event delivery in progress');
    GameplayEventJournal.validate(records, { offset }); this.#offset = offset; this.#records = immutableData(records);
    // Restoring state is not re-emission. New subscribers may request explicit replay.
    for (const entry of this.#subscribers.values()) entry.seen = new Set(records.map(e => e.id));
  }
  failures() { return immutableData(this.#failures); }
  dispose() { this.#subscribers.clear(); }
}
