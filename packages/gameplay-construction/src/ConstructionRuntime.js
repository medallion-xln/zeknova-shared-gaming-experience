import { createWorldState, immutableData, canonicalJSON, GameplayEventJournal } from '../../core/src/index.js';
import { reduceMission } from '../../gameplay-missions/src/index.js';
import { Construction } from './index.js';

/** One source-owned gameplay boundary. Candidate construction + mission + player
 * state are validated together before any committed events reach presentation.
 * This is independent-world authority; it never registers a live legacy writer. */
export class ConstructionRuntime {
  #state; #events = new GameplayEventJournal(); #busy = false; #disposed = false; #options;
  constructor({ worldId = 'source-world', owner = 'local-engine', epoch = 0, definitions, inventory = {}, terrain,
    costFor, mission = { id: 'first-colony', objectives: [{ id: 'shelters', key: 'built', target: 2 }], rewards: [{ xp: 25 }] },
    player = { id: 'player', x: 0, y: 0, z: -5, radius: 0.4, xp: 0 }, canWalk = () => true, beforeCommit = null } = {}) {
    this.#options = { worldId, owner, epoch, definitions: immutableData(definitions), inventory: immutableData(inventory), terrain, costFor, mission: immutableData(mission), player: immutableData(player), canWalk, beforeCommit };
    const construction = new Construction({ definitions, inventory, terrain, costFor });
    this.#state = immutableData({ schema: 'zge.construction-runtime.v1', worldId, revision: 0, construction: construction.snapshot(),
      player, selectedType: definitions[0]?.type ?? null, mission: { status: 'active', commands: [] }, built: 0, rewardIds: [], ledger: [], events: [] });
    this.worldState();
  }
  dispatch(input) {
    if (this.#disposed || this.#busy) throw new Error('runtime unavailable during transaction or disposed');
    const command = immutableData(input);
    if (typeof command.commandId !== 'string' || !command.commandId) throw new TypeError('commandId required');
    const fingerprint = canonicalJSON(command), prior = this.#state.ledger.find(e => e.command.commandId === command.commandId);
    if (prior) return prior.fingerprint === fingerprint ? prior.result : immutableData({ ok: false, reason: 'idempotency-conflict', revision: this.#state.revision });
    this.#busy = true;
    try {
      const before = this.#state, next = structuredClone(before), events = [{ type: 'ConstructionRequested', action: command.action }];
      let result;
      if (command.expectedRevision != null && command.expectedRevision !== before.revision) result = { ok: false, reason: 'stale-world-revision' };
      else if (command.action === 'select') {
        result = this.#options.definitions.some(d => d.type === command.type) ? { ok: true } : { ok: false, reason: 'unknown-building' };
        if (result.ok) { next.selectedType = command.type; events.push({ type: 'BuildingSelected', buildingType: command.type }); }
      } else if (command.action === 'move') {
        const dx = command.dx, dz = command.dz, p = before.player;
        if (![dx, dz].every(Number.isFinite) || Math.hypot(dx, dz) > 0.51) result = { ok: false, reason: 'invalid-movement' };
        else {
          const x = p.x + dx, z = p.z + dz;
          const occupied = before.construction.buildings.some(b => Math.hypot(b.x - x, b.z - z) < p.radius + b.radius);
          const y = this.#options.terrain.heightAt({ type: 'player' }, x, z);
          result = !Number.isFinite(y) || occupied || !this.#options.canWalk(x, z) ? { ok: false, reason: 'collision' } : { ok: true };
          if (result.ok) { next.player = { ...p, x, y, z }; events.push({ type: 'PlayerMoved', player: next.player }); }
        }
      } else if (['place', 'remove', 'grant'].includes(command.action)) {
        const candidate = new Construction({ ...this.#options, beforeCommit: null, snapshot: before.construction });
        // World revisions are owned here; construction has its separate domain revision.
        const inner = { ...command }; delete inner.expectedRevision;
        result = candidate.execute(inner);
        if (result.ok) {
          next.construction = candidate.snapshot();
          events.push({ type: 'ConstructionCommitted', action: command.action });
          if (command.action !== 'remove') events.push({ type: 'ResourcesChanged', inventory: next.construction.inventory, inventoryRevision: next.construction.inventoryRevision });
          if (command.action === 'place') {
            next.built++;
            events.push({ type: 'BuildingCreated', building: result.building });
            const mission = reduceMission(this.#options.mission, before.mission, { id: command.commandId, facts: { values: { built: next.built } } });
            next.mission = mission.state;
            events.push(...mission.events.map(e => ({ type: 'MissionProgressChanged', detail: e })));
            // A bounded, explicit reward policy, committed in the same candidate state.
            const rewardId = this.#options.mission.id;
            if (mission.rewards.length && !before.rewardIds.includes(rewardId)) {
              const xp = mission.rewards.reduce((sum, reward) => sum + Number(reward.xp ?? 0), 0);
              if (!Number.isFinite(xp) || xp < 0) throw new TypeError('invalid mission reward');
              next.player.xp += xp; next.rewardIds.push(rewardId);
              events.push({ type: 'MissionRewardApplied', rewardId, xp });
            }
          } else if (command.action === 'remove') events.push({ type: 'BuildingRemoved', building: result.building });
        }
        candidate.dispose();
      } else result = { ok: false, reason: 'unknown-action' };
      if (result.ok) { next.revision++; events.push({ type: 'WorldRevisionCommitted' }); }
      else events.push({ type: 'ConstructionRejected', reason: result.reason });
      const records = GameplayEventJournal.transaction({ worldId: before.worldId, transactionId: command.commandId, revision: next.revision,
        authority: { mode: 'ENGINE', domain: 'construction-world', owner: this.#options.owner, epoch: this.#options.epoch }, events, offset: (before.checkpoint?.eventSequence ?? 0) + before.events.length });
      result = immutableData({ ...result, transactionId: command.commandId, revision: next.revision, eventIds: records.map(e => e.id) });
      next.events.push(...records); next.ledger.push({ command, fingerprint, result });
      // Validate all data and optional policy before publishing any part of the transaction.
      this.#worldState(next); GameplayEventJournal.validate(next.events, { offset: next.checkpoint?.eventSequence ?? 0 });
      const validation = this.#options.beforeCommit?.(immutableData(next), result);
      if (validation?.then) throw new Error('beforeCommit must be synchronous');
      this.#state = immutableData(next);
      this.#events.append(records); // Read-only effects run after authoritative publication.
      return result;
    } finally { this.#busy = false; }
  }
  #worldState(state) {
    const buildings = state.construction.buildings;
    return createWorldState({ id: state.worldId, revision: state.revision, inventoryRevision: state.construction.inventoryRevision,
      authority: { domain: 'construction-world', owner: this.#options.owner, epoch: this.#options.epoch }, buildings, inventory: state.construction.inventory, events: state.events,
      entities: [...buildings.map(b => ({ id: b.id, components: { transform: { x: b.x, y: b.y, z: b.z, rotation: b.rotation }, building: { type: b.type } } })),
        { id: state.player.id, components: { transform: { x: state.player.x, y: state.player.y, z: state.player.z, rotation: 0 }, player: state.player, mission: state.mission, rewardIds: state.rewardIds, selection: { type: state.selectedType } } }] });
  }
  worldState() { return this.#worldState(this.#state); }
  snapshot() { return this.#state; }
  restore(input) {
    if (this.#disposed || this.#busy) throw new Error('runtime unavailable');
    const state = immutableData(input);
    if (!['zge.construction-runtime.v1','zge.construction-runtime.v2'].includes(state.schema) || state.worldId !== this.#options.worldId || !Array.isArray(state.ledger) || new Set(state.ledger.map(e => e.command.commandId)).size !== state.ledger.length || !Array.isArray(state.rewardIds) || new Set(state.rewardIds).size !== state.rewardIds.length || !Number.isSafeInteger(state.built) || state.built < 0 || ![state.player.x, state.player.y, state.player.z, state.player.xp, state.player.radius].every(Number.isFinite) || state.player.xp < 0 || state.player.radius < 0) throw new TypeError('invalid runtime snapshot');
    const candidate = new Construction({ ...this.#options, beforeCommit: null, snapshot: state.construction }); candidate.dispose();
    for (const entry of state.ledger) if (entry.fingerprint !== canonicalJSON(entry.command) || !entry.result || entry.result.transactionId !== entry.command.commandId) throw new TypeError('invalid runtime transaction journal');
    if (state.schema === 'zge.construction-runtime.v2') {
      const cp = state.checkpoint;
      if (!cp || !Number.isSafeInteger(cp.eventSequence) || cp.eventSequence < 0 || cp.state.worldId !== state.worldId || cp.revision !== cp.state.revision || cp.built !== cp.state.built || !Number.isSafeInteger(cp.revision) || cp.revision < 0 || !Number.isSafeInteger(cp.built) || cp.built < 0) throw new TypeError('invalid runtime checkpoint');
      this.#worldState({ ...cp.state, events: [] });
    } else if (state.checkpoint) throw new TypeError('checkpoint requires runtime v2');
    this.#worldState(state); GameplayEventJournal.validate(state.events, { offset: state.checkpoint?.eventSequence ?? 0 });
    let revision = state.checkpoint?.revision ?? 0, built = state.checkpoint?.built ?? 0;
    for (const entry of state.ledger) {
      if (entry.result.ok) { revision++; if (entry.command.action === 'place') built++; }
      const eventIds = state.events.filter(e => e.transactionId === entry.command.commandId).map(e => e.id);
      if (entry.result.revision !== revision || canonicalJSON(eventIds) !== canonicalJSON(entry.result.eventIds)) throw new TypeError('inconsistent runtime receipt');
    }
    if (state.revision !== revision || state.built !== built || state.construction.revision > state.revision) throw new TypeError('inconsistent runtime revision');
    if (state.events.some(e => e.worldId !== state.worldId || !state.ledger.some(l => l.command.commandId === e.transactionId))) throw new TypeError('orphan event');
    this.#events.restore(state.events, { offset: state.checkpoint?.eventSequence ?? 0 }); this.#state = state; return this;
  }
  replay() {
    const replay = new ConstructionRuntime(this.#options);
    if (this.#state.checkpoint) {
      const cp = this.#state.checkpoint; replay.restore({ ...cp.state, schema: 'zge.construction-runtime.v2', checkpoint: cp, events: [], ledger: [] });
    }
    for (const { command } of this.#state.ledger) replay.dispatch(command);
    const deterministic = canonicalJSON(replay.snapshot()) === canonicalJSON(this.#state);
    replay.dispose(); return { deterministic, transactions: this.#state.ledger.length };
  }
  /** Only call after all commands/events are archived by the durable writer.
   * Old receipts must be checked in that archive before dispatch after compaction. */
  compact({ receiptsArchived = false } = {}) {
    if (this.#disposed || this.#busy || !receiptsArchived) throw new Error('durable receipt archive required before compaction');
    const old = this.#state, construction = structuredClone(old.construction), mission = structuredClone(old.mission);
    construction.ledger = []; construction.events = []; mission.commands = [];
    const state = { worldId: old.worldId, revision: old.revision, construction, player: old.player, selectedType: old.selectedType, mission, built: old.built, rewardIds: old.rewardIds };
    const checkpoint = { revision: old.revision, built: old.built, eventSequence: (old.checkpoint?.eventSequence ?? 0) + old.events.length, state };
    this.restore({ ...state, schema: 'zge.construction-runtime.v2', checkpoint, events: [], ledger: [] });
    return this.snapshot();
  }
  subscribe(id, consume, options) { return this.#events.subscribe(id, consume, options); }
  failures() { return this.#events.failures(); }
  dispose() { if (this.#busy) throw new Error('runtime in transaction'); this.#disposed = true; this.#events.dispose(); }
}
