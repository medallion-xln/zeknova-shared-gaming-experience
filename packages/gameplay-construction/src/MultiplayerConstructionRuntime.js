import { createWorldState, immutableData, canonicalJSON, GameplayEventJournal } from '../../core/src/index.js';
import { reduceMission } from '../../gameplay-missions/src/index.js';
import { rankFromRecords } from '../../../src/game/OfficerRank.js';
import { Construction } from './index.js';
import { ConstructionRuntime } from './ConstructionRuntime.js';

export const MULTIPLAYER_RUNTIME_SCHEMA = 'zge.multiplayer-construction.v1';
const VIEW_SCHEMA = 'zge.multiplayer-view.v1';
const validId = id => typeof id === 'string' && /^[A-Za-z0-9_.:@-]{1,120}$/.test(id);
const integer = n => Number.isSafeInteger(n) && n >= 0;
const unique = values => Array.isArray(values) && new Set(values).size === values.length;
const logicalId = (playerId, commandId) => JSON.stringify([playerId, commandId]);
const baseState = state => {
  const { events: _events, ledger: _ledger, checkpoint: _checkpoint, ...base } = structuredClone(state);
  return base;
};

/** Independent staged-world authority. The second dispatch argument is a trusted
 * server identity, never part of a client command. The roster authorizes access;
 * reads do not create profiles. A join is an explicit durable transaction.
 *
 * Team completion XP is collective. Personal placement XP follows the observed
 * +14 pointer effect. Personal build-type achievements are sets, with no invented
 * achievement reward. Rank follows the source standing-infrastructure policy for
 * structures whose actor attribution is known. Old shared state is never assigned
 * to the first player who authenticates. */
export class MultiplayerConstructionRuntime {
  #state; #options; #roster; #busy = false; #disposed = false; #journal = new GameplayEventJournal();
  constructor({ multiPlayer = false, players = [], worldId = 'source-world', owner = 'php-staging-server', epoch = 0,
    definitions, inventory = {}, terrain, costFor, canWalk = () => true, beforeCommit = null,
    player = { id: 'player', x: 0, y: 0, z: -5, radius: .4, xp: 0 },
    mission = { id: 'first-colony', objectives: [{ id: 'shelters', key: 'built', target: 2 }], rewards: [{ xp: 25 }] } } = {}) {
    if (multiPlayer !== true) throw new Error('multiplayer runtime requires explicit server opt-in');
    if (!unique(players.map(p => p.id)) || players.some(p => !validId(p.id) || !['builder', 'viewer'].includes(p.role))) throw new TypeError('invalid trusted membership roster');
    this.#roster = new Map(players.map(p => [p.id, p.role]));
    this.#options = { multiPlayer, players: immutableData(players), worldId, owner, epoch, definitions: immutableData(definitions), inventory: immutableData(inventory), terrain, costFor, canWalk, beforeCommit, player: immutableData(player), mission: immutableData(mission) };
    const construction = new Construction({ definitions, inventory, terrain, costFor });
    const initial = { schema: MULTIPLAYER_RUNTIME_SCHEMA, worldId, revision: 0, construction: construction.snapshot(),
      team: { xp: player.xp ?? 0, built: 0, mission: { status: 'active', commands: [] }, rewardIds: [] }, players: [],
      provenance: { policy: 'no-historical-player-attribution', source: null }, events: [], ledger: [] };
    construction.dispose();
    initial.checkpoint = { eventSequence: 0, revision: 0, state: baseState(initial) };
    this.#validate(initial); this.#state = immutableData(initial);
  }
  #live() { if (this.#disposed || this.#busy) throw new Error('runtime unavailable during transaction or disposed'); }
  #authorized(id) { if (!validId(id) || !this.#roster.has(id)) throw new Error('unauthorized-player'); return this.#roster.get(id); }
  setPlayers(players) {
    this.#live();
    if (!unique(players.map(p => p.id)) || players.some(p => !validId(p.id) || !['builder', 'viewer'].includes(p.role))) throw new TypeError('invalid trusted membership roster');
    this.#roster = new Map(players.map(p => [p.id, p.role]));
    this.#options = { ...this.#options, players: immutableData(players) }; return this;
  }
  #profile(state, id) { return state.players.find(p => p.id === id); }
  #publicPlayer(p) {
    return { id: p.entityId, playerId: p.id, x: p.pose.x, y: p.pose.y, z: p.pose.z, radius: p.pose.radius, rotation: p.pose.rotation, rank: p.rank };
  }
  #safeSpawn(state) {
    const seed = this.#options.player, radius = seed.radius;
    for (let i = 0; i < 1024; i++) {
      // A fixed grid, independent of wall-clock, connection IDs or random input.
      const ring = Math.ceil(Math.sqrt(i)), side = ring * 2 + 1;
      const x = seed.x + (i === 0 ? 0 : ((i % side) - ring) * 1.25);
      const z = seed.z + (i === 0 ? 0 : (Math.floor(i / side) - ring) * 1.25);
      const y = this.#options.terrain.heightAt({ type: 'player' }, x, z);
      if ([x, y, z, radius].every(Number.isFinite) && radius >= 0 && this.#walkable(state, null, x, z, radius)) return { x, y, z, radius, rotation: 0 };
    }
    return null;
  }
  #walkable(state, playerId, x, z, radius) {
    return this.#options.canWalk(x, z, radius) &&
      !state.construction.buildings.some(b => Math.hypot(b.x - x, b.z - z) < radius + b.radius) &&
      !state.players.some(p => p.id !== playerId && Math.hypot(p.pose.x - x, p.pose.z - z) < radius + p.pose.radius);
  }
  dispatch(input, { playerId } = {}) {
    this.#live(); const role = this.#authorized(playerId), command = immutableData(input);
    if (!validId(command.commandId)) throw new TypeError('commandId required');
    const allowed = new Set(['commandId', 'action', 'expectedRevision', 'expectedPlayerRevision', 'expectedInventoryRevision', 'id', 'type', 'x', 'z', 'rotation', 'dx', 'dz']);
    if (Object.keys(command).some(k => !allowed.has(k))) return immutableData({ ok: false, reason: 'invalid-command-fields', revision: this.#state.revision });
    const transactionId = logicalId(playerId, command.commandId), fingerprint = canonicalJSON(command);
    const prior = this.#state.ledger.find(entry => entry.transactionId === transactionId);
    if (prior) return prior.fingerprint === fingerprint ? prior.result : immutableData({ ok: false, reason: 'idempotency-conflict', revision: this.#state.revision });
    this.#busy = true;
    try {
      const before = this.#state, next = structuredClone(before), actor = this.#profile(next, playerId);
      const events = [{ type: 'ConstructionRequested', action: command.action, actorId: playerId }];
      let result, changed = false;
      if (['aid', 'repair', 'relocate'].includes(command.action)) result = { ok: false, reason: 'legacy-effect-quarantined' };
      else if (command.action !== 'join' && role !== 'builder') result = { ok: false, reason: 'read-only-membership' };
      else if (command.action !== 'join' && !actor) result = { ok: false, reason: 'player-not-joined' };
      else if (['move', 'select'].includes(command.action) && !integer(command.expectedPlayerRevision)) result = { ok: false, reason: 'invalid-player-revision' };
      else if (command.expectedPlayerRevision != null && command.expectedPlayerRevision !== actor?.revision) result = { ok: false, reason: 'stale-player-revision' };
      else if (!['move', 'select', 'join'].includes(command.action) && command.expectedRevision != null && command.expectedRevision !== before.revision) result = { ok: false, reason: 'stale-world-revision' };
      else if (command.action === 'join') {
        if (actor) result = { ok: true, alreadyJoined: true };
        else {
          const pose = this.#safeSpawn(next);
          if (!pose) result = { ok: false, reason: 'no-safe-spawn' };
          else {
            const profile = { id: playerId, entityId: JSON.stringify(['player', playerId]), revision: 0, pose, xp: 0, rank: 'ensign',
              selectedType: this.#options.definitions[0]?.type ?? null,
              personalMission: { id: 'construction-types', successfulPlacements: 0, completedTypes: [] }, achievementIds: [], rewardIds: [],
              inventory: { schema: 'zge.private-inventory.v1', items: {}, equipment: {}, metadata: {} } };
            next.players.push(profile); changed = true; result = { ok: true };
            events.push({ type: 'PlayerJoined', actorId: playerId, player: this.#publicPlayer(profile) });
          }
        }
      } else if (command.action === 'select') {
        result = this.#options.definitions.some(d => d.type === command.type) ? { ok: true } : { ok: false, reason: 'unknown-building' };
        if (result.ok) { actor.selectedType = command.type; changed = true; events.push({ type: 'BuildingSelected', visibility: 'private', playerId, buildingType: command.type }); }
      } else if (command.action === 'move') {
        const { dx, dz } = command;
        if (![dx, dz].every(Number.isFinite) || Math.hypot(dx, dz) > .51) result = { ok: false, reason: 'invalid-movement' };
        else {
          const x = actor.pose.x + dx, z = actor.pose.z + dz, y = this.#options.terrain.heightAt({ type: 'player' }, x, z);
          result = Number.isFinite(y) && this.#walkable(next, playerId, x, z, actor.pose.radius) ? { ok: true } : { ok: false, reason: 'collision' };
          if (result.ok) { actor.pose = { ...actor.pose, x, y, z }; changed = true; events.push({ type: 'PlayerMoved', actorId: playerId, player: this.#publicPlayer(actor) }); }
        }
      } else if (['place', 'remove'].includes(command.action)) {
        const candidate = new Construction({ ...this.#options, beforeCommit: null, snapshot: before.construction });
        try {
          const inner = { ...command, commandId: transactionId }; delete inner.expectedRevision; delete inner.expectedPlayerRevision;
          result = candidate.execute(inner);
          if (result.ok) {
            changed = true; next.construction = structuredClone(candidate.snapshot()); events.push({ type: 'ConstructionCommitted', action: command.action, actorId: playerId });
            if (command.action === 'place') {
              const building = next.construction.buildings.find(b => b.id === command.id); building.ownerPlayerId = playerId;
              result = { ...result, building }; next.team.built++;
              events.push({ type: 'ResourcesChanged', inventory: next.construction.inventory, inventoryRevision: next.construction.inventoryRevision }, { type: 'BuildingCreated', building });
              const mission = reduceMission(this.#options.mission, before.team.mission, { id: transactionId, facts: { values: { built: next.team.built } } });
              next.team.mission = mission.state;
              events.push(...mission.events.map(detail => ({ type: 'MissionProgressChanged', detail, scope: 'team' })));
              if (mission.rewards.length && !before.team.rewardIds.includes(this.#options.mission.id)) {
                const xp = mission.rewards.reduce((sum, reward) => sum + Number(reward.xp ?? 0), 0);
                if (!integer(xp)) throw new TypeError('invalid team reward');
                next.team.xp += xp; next.team.rewardIds.push(this.#options.mission.id);
                events.push({ type: 'MissionRewardApplied', rewardId: this.#options.mission.id, xp, scope: 'team' });
              }
              actor.xp += 14; actor.personalMission.successfulPlacements++;
              const achievementId = 'build-' + command.type;
              if (!actor.achievementIds.includes(achievementId)) {
                actor.achievementIds.push(achievementId); actor.personalMission.completedTypes.push(command.type);
                events.push({ type: 'PersonalAchievementClaimed', visibility: 'private', playerId, claimId: achievementId });
              }
              events.push({ type: 'PersonalProgressChanged', visibility: 'private', playerId, xp: actor.xp, placementXP: 14, personalMission: actor.personalMission, achievementIds: actor.achievementIds });
            } else events.push({ type: 'BuildingRemoved', building: result.building });
            for (const p of next.players) {
              const rank = rankFromRecords(next.construction.buildings.filter(b => b.ownerPlayerId === p.id)).rank;
              if (rank !== p.rank) { p.rank = rank; events.push({ type: 'PlayerRankChanged', actorId: p.id, rank }); }
            }
          }
        } finally { candidate.dispose(); }
      } else result = { ok: false, reason: 'unknown-action' };
      if (changed) { next.revision++; if (actor) actor.revision++; events.push({ type: 'WorldRevisionCommitted' }); }
      if (!result.ok) events.push({ type: 'ConstructionRejected', reason: result.reason, actorId: playerId });
      const records = GameplayEventJournal.transaction({ worldId: before.worldId, transactionId, revision: next.revision,
        authority: { mode: 'ENGINE', domain: 'construction-world', owner: this.#options.owner, epoch: this.#options.epoch }, events,
        offset: before.checkpoint.eventSequence + before.events.length });
      result = immutableData({ ...result, transactionId, revision: next.revision, playerRevision: this.#profile(next, playerId)?.revision ?? null, eventIds: records.map(e => e.id) });
      next.events.push(...records); next.ledger.push({ actorId: playerId, transactionId, command, fingerprint, result, changed });
      this.#validate(next);
      const validation = this.#options.beforeCommit?.(immutableData(next), result);
      if (validation?.then) throw new Error('beforeCommit must be synchronous');
      this.#state = immutableData(next); this.#journal.append(records); return result;
    } finally { this.#busy = false; }
  }
  #validate(state) {
    immutableData(state);
    if (state.schema !== MULTIPLAYER_RUNTIME_SCHEMA || state.worldId !== this.#options.worldId || !integer(state.revision) || !unique(state.players?.map(p => p.id)) || !unique(state.team?.rewardIds) || !integer(state.team?.xp) || !integer(state.team?.built)) throw new TypeError('invalid multiplayer snapshot');
    const c = new Construction({ ...this.#options, beforeCommit: null, snapshot: state.construction }); c.dispose();
    for (const p of state.players) {
      if (!validId(p.id) || p.entityId !== JSON.stringify(['player', p.id]) || !integer(p.revision) || !integer(p.xp) || !['ensign', 'lieutenant', 'captain'].includes(p.rank) || ![p.pose?.x, p.pose?.y, p.pose?.z, p.pose?.rotation, p.pose?.radius].every(Number.isFinite) || p.pose.radius < 0 || !unique(p.achievementIds) || !unique(p.rewardIds) || !unique(p.personalMission?.completedTypes) || !integer(p.personalMission?.successfulPlacements) || p.inventory?.schema !== 'zge.private-inventory.v1') throw new TypeError('invalid private player state');
      if (p.achievementIds.some(id => typeof id !== 'string' || !id.startsWith('build-')) || canonicalJSON(p.personalMission.completedTypes.map(type => 'build-' + type)) !== canonicalJSON(p.achievementIds)) throw new TypeError('inconsistent personal achievements');
      if (p.rank !== rankFromRecords(state.construction.buildings.filter(b => b.ownerPlayerId === p.id)).rank) throw new TypeError('inconsistent infrastructure rank');
    }
    if (!state.checkpoint || !integer(state.checkpoint.eventSequence) || !integer(state.checkpoint.revision) || state.checkpoint.revision !== state.checkpoint.state?.revision || state.checkpoint.state?.worldId !== state.worldId || state.checkpoint.revision > state.revision) throw new TypeError('invalid multiplayer checkpoint');
    if (!unique(state.ledger?.map(e => e.transactionId))) throw new TypeError('invalid actor receipt ledger');
    GameplayEventJournal.validate(state.events, { offset: state.checkpoint.eventSequence });
    let revision = state.checkpoint.revision;
    for (const entry of state.ledger) {
      if (!validId(entry.actorId) || entry.transactionId !== logicalId(entry.actorId, entry.command?.commandId) || entry.fingerprint !== canonicalJSON(entry.command) || typeof entry.changed !== 'boolean') throw new TypeError('invalid actor receipt');
      if (entry.changed) revision++;
      const events = state.events.filter(e => e.transactionId === entry.transactionId);
      if (entry.result?.transactionId !== entry.transactionId || entry.result.revision !== revision || canonicalJSON(entry.result.eventIds) !== canonicalJSON(events.map(e => e.id)) || !events.length) throw new TypeError('inconsistent actor receipt');
    }
    if (revision !== state.revision || state.events.some(e => e.worldId !== state.worldId || e.authority.owner !== this.#options.owner || e.authority.epoch !== this.#options.epoch || !state.ledger.some(l => l.transactionId === e.transactionId))) throw new TypeError('inconsistent multiplayer events');
    this.#world(state);
  }
  #world(state) {
    const buildings = state.construction.buildings;
    return createWorldState({ id: state.worldId, revision: state.revision,
      inventoryRevision: state.construction.inventoryRevision, inventory: state.construction.inventory, buildings,
      authority: { domain: 'construction-world', owner: this.#options.owner, epoch: this.#options.epoch },
      entities: [...buildings.map(b => ({ id: b.id, components: { transform: { x: b.x, y: b.y, z: b.z, rotation: b.rotation }, building: { type: b.type } } })),
        ...state.players.map(p => ({ id: p.entityId, components: { transform: { x: p.pose.x, y: p.pose.y, z: p.pose.z, rotation: p.pose.rotation }, player: this.#publicPlayer(p) } }))],
      events: this.eventsFor(null, state.events) });
  }
  worldState() { return this.#world(this.#state); }
  publicWorld() { return this.worldState(); }
  eventsFor(playerId, events = this.#state.events) {
    if (playerId != null) this.#authorized(playerId);
    return immutableData(events.map(event => {
      const { schema, worldId, revision, sequence, authority, order } = event;
      const transactionId = JSON.stringify(['projection', worldId, sequence - order]);
      const identity = { schema, id: JSON.stringify([worldId, transactionId, order]), worldId, transactionId, revision, sequence, authority, order };
      if (event.visibility !== 'private' || event.playerId === playerId) return { ...event, ...identity };
      return { ...identity, type: 'EventRedacted' };
    }));
  }
  snapshotFor(playerId) {
    this.#authorized(playerId); const state = this.#state, p = this.#profile(state, playerId);
    const player = p ? { ...this.#publicPlayer(p), xp: p.xp, revision: p.revision, inventory: p.inventory, personalMission: p.personalMission, achievementIds: p.achievementIds, rewardIds: p.rewardIds } : null;
    // No internal commands, checkpoint state, provenance, or another actor's
    // private inventory/mission/XP ever crosses this projection boundary.
    return immutableData({ schema: VIEW_SCHEMA, worldId: state.worldId, revision: state.revision,
      construction: { inventory: state.construction.inventory, inventoryRevision: state.construction.inventoryRevision, buildings: state.construction.buildings },
      player, players: state.players.map(p => this.#publicPlayer(p)), selectedType: p?.selectedType ?? null,
      team: { xp: state.team.xp, built: state.team.built, mission: { status: state.team.mission.status, progress: state.team.mission.progress ?? [] }, rewardIds: state.team.rewardIds },
      mission: p?.personalMission ?? null, built: p?.personalMission.successfulPlacements ?? 0, rewardIds: p?.rewardIds ?? [],
      events: this.eventsFor(playerId), checkpoint: { eventSequence: state.checkpoint.eventSequence },
      progressionPolicy: { placementXP: 14, rank: 'actor-standing-infrastructure', achievement: 'once-per-build-type', collectiveMissionXP: 'team-only' } });
  }
  viewerProjection(playerId) { return this.snapshotFor(playerId); }
  snapshot() { return this.#state; }
  restore(input) {
    this.#live(); let state = immutableData(input);
    if (['zge.construction-runtime.v1', 'zge.construction-runtime.v2'].includes(state.schema)) {
      const old = new ConstructionRuntime(this.#options);
      try { old.restore(state); } finally { old.dispose(); }
      const initial = { schema: MULTIPLAYER_RUNTIME_SCHEMA, worldId: state.worldId, revision: state.revision,
        construction: structuredClone(state.construction), team: { xp: state.player.xp, built: state.built, mission: structuredClone(state.mission), rewardIds: [...state.rewardIds] },
        players: [], provenance: { policy: 'no-historical-player-attribution', source: structuredClone(state) }, events: [], ledger: [] };
      // Prior actor ownership is absent. Keep the exact source for rollback and
      // preserve the cursor, but start a new validated runtime checkpoint.
      initial.checkpoint = { eventSequence: (state.checkpoint?.eventSequence ?? 0) + state.events.length, revision: state.revision, state: baseState(initial) };
      state = immutableData(initial);
    }
    this.#validate(state);
    // Re-execute the complete active tail to reject edited balances, player XP,
    // receipts and state that otherwise pass structural validation.
    const replay = this.#replayRuntime(state);
    try { if (canonicalJSON(replay.snapshot()) !== canonicalJSON(state)) throw new TypeError('multiplayer snapshot replay mismatch'); }
    finally { replay.dispose(); }
    this.#journal.restore(state.events, { offset: state.checkpoint.eventSequence }); this.#state = state; return this;
  }
  #replayRuntime(state) {
    const historicalActors = state.ledger.map(e => e.actorId);
    const roster = [...this.#options.players];
    for (const id of historicalActors) if (!roster.some(p => p.id === id)) roster.push({ id, role: 'builder' });
    const replay = new MultiplayerConstructionRuntime({ ...this.#options, players: roster, beforeCommit: null });
    replay.#state = immutableData({ ...structuredClone(state.checkpoint.state), checkpoint: structuredClone(state.checkpoint), events: [], ledger: [] });
    replay.#journal.restore([], { offset: state.checkpoint.eventSequence });
    // Historical authorization is recorded with receipts so membership changes
    // cannot change replay semantics or authorize a new dispatch.
    for (const entry of state.ledger) {
      replay.#roster.set(entry.actorId, entry.command.action === 'join' || entry.result.reason === 'read-only-membership' ? (entry.result.reason === 'read-only-membership' ? 'viewer' : 'builder') : 'builder');
      replay.dispatch(entry.command, { playerId: entry.actorId });
    }
    return replay;
  }
  replay() {
    const replay = this.#replayRuntime(this.#state);
    try { return { deterministic: canonicalJSON(replay.snapshot()) === canonicalJSON(this.#state), transactions: this.#state.ledger.length }; }
    finally { replay.dispose(); }
  }
  compact({ receiptsArchived = false } = {}) {
    this.#live(); if (!receiptsArchived) throw new Error('durable receipt archive required before compaction');
    const state = structuredClone(this.#state); state.construction.ledger = []; state.construction.events = []; state.team.mission.commands = [];
    state.checkpoint = { revision: state.revision, eventSequence: state.checkpoint.eventSequence + state.events.length, state: baseState(state) };
    state.events = []; state.ledger = []; this.restore(state); return this.snapshot();
  }
  subscribe(...args) { return this.#journal.subscribe(...args); }
  failures() { return this.#journal.failures(); }
  dispose() { if (this.#busy) throw new Error('runtime in transaction'); this.#disposed = true; this.#journal.dispose(); }
}
