import { immutableData } from '../../core/src/index.js';
import { ConstructionRuntime } from './ConstructionRuntime.js';

/** Replacement boundary for independent worlds. No legacy code or writer is
 * imported. Live ZekNova cannot opt into this boundary using a feature flag. */
export class ConstructionPort {
  #runtime; #mode; #options; #boundary;
  constructor({ mode = 'ENGINE', boundary = 'source-world', flags = null, ...options } = {}) {
    this.#options = options; this.#boundary = boundary;
    this.#runtime = new ConstructionRuntime(options);
    this.setMode(mode, flags);
  }
  setMode(mode, flags = null) {
    if (!['LEGACY', 'SHADOW', 'ENGINE'].includes(mode)) throw Error('invalid construction authority');
    if (flags && (Object.keys(flags).some(k => !['legacy','shadow','engine'].includes(k)) ||
      Object.values(flags).some(v => typeof v !== 'boolean') ||
      Object.values(flags).filter(Boolean).length !== 1 || flags[mode.toLowerCase()] !== true)) throw Error('conflicting construction flags');
    if (mode === 'ENGINE' && this.#boundary !== 'source-world') throw Error('live construction transfer uncertified');
    this.#mode = mode;
    return this.status();
  }
  status() { return immutableData({ mode: this.#mode, boundary: this.#boundary, writer: this.#mode === 'ENGINE' ? 'source-construction' : null, aid: 'QUARANTINED' }); }
  dispatch(command) {
    if (this.#mode !== 'ENGINE') return immutableData({ ok: false, reason: 'read-only-authority', revision: this.snapshot().revision });
    // Actual legacy benefit implementation is absent. Reject BEFORE spending,
    // rather than reproducing the legacy callback's partial-commit failure.
    if (['aid','repair','relocate'].includes(command.action) || Object.hasOwn(command,'beneficiary') || Object.hasOwn(command,'aidProject'))
      return immutableData({ ok: false, reason: 'legacy-effect-quarantined', revision: this.snapshot().revision });
    return this.#runtime.dispatch(command);
  }
  observe(command) {
    const candidate = new ConstructionPort({ ...this.#options, boundary: 'source-world' });
    try { candidate.restore(this.snapshot()); return immutableData({ result: candidate.dispatch(command), snapshot: candidate.snapshot() }); }
    finally { candidate.dispose(); }
  }
  worldState() { return this.#runtime.worldState(); }
  snapshot() { return this.#runtime.snapshot(); }
  restore(value) { if (this.#mode !== 'ENGINE') throw Error('read-only-authority'); this.#runtime.restore(value); return this; }
  compact(options) { if (this.#mode !== 'ENGINE') throw Error('read-only-authority'); return this.#runtime.compact(options); }
  replay() { return this.#runtime.replay(); }
  subscribe(...args) { return this.#runtime.subscribe(...args); }
  failures() { return this.#runtime.failures(); }
  dispose() { return this.#runtime.dispose(); }
}
