import { createWorldState, immutableData } from '../../core/src/index.js';
const copy = value => structuredClone(value);
const finite = value => typeof value === 'number' && Number.isFinite(value);
const fail = reason => ({ ok: false, reason });
const fingerprint = command => JSON.stringify(command, (_key,value) => value && typeof value === 'object' && !Array.isArray(value) ? Object.fromEntries(Object.entries(value).sort(([a],[b])=>a.localeCompare(b))) : value);

/** Pure placement decision. Terrain and game-specific cost policies are injected. */
export function evaluatePlacement({ definitions, state, request, terrain, costFor = d => d.cost ?? {} }) {
  const definition = definitions.find(d => d.type === request.type);
  if (!definition) return fail('unknown-building');
  if (!request.id || !finite(request.x) || !finite(request.z) || (request.rotation != null && !finite(request.rotation))) return fail('invalid-request');
  if (state.buildings.some(b => b.id === request.id)) return fail('duplicate-building');
  if (!terrain.isValid(definition, request.x, request.z)) return fail('terrain');
  const radius = definition.radius ?? 0;
  if (!finite(radius) || radius < 0) return fail('invalid-definition');
  if (state.buildings.some(b => Math.hypot(b.x-request.x,b.z-request.z) < radius+(b.radius ?? 0))) return fail('occupied');
  const cost = copy(costFor(copy(definition), copy(request)));
  const shortfalls = {};
  for (const [key, amount] of Object.entries(cost)) {
    if (!finite(amount) || amount < 0 || !finite(state.inventory[key] ?? 0) || (state.inventory[key] ?? 0) < 0) return fail('invalid-cost-or-inventory');
    const missing = Math.max(0, amount-(state.inventory[key] ?? 0)); if (missing) shortfalls[key] = missing;
  }
  if (Object.keys(shortfalls).length) return { ...fail('resources'), shortfalls };
  const y = terrain.heightAt(definition, request.x, request.z);
  const rotation = request.rotation ?? terrain.rotationAt?.(definition, request.x, request.z) ?? 0;
  if (!finite(y) || !finite(rotation)) return fail('invalid-terrain');
  return { ok: true, cost, building: { id: request.id, type: request.type, x: request.x, y, z: request.z, rotation, level: 1, radius, state: 'complete' } };
}

/** Atomic, synchronous placement/removal with an idempotency ledger and explicit undo. */
export class Construction {
  constructor({ definitions, inventory = {}, terrain, costFor, snapshot, beforeCommit = null } = {}) {
    this.beforeCommit = beforeCommit; this.definitions = copy(definitions); this.terrain = terrain; this.costFor = costFor;
    this.data = { version: 2, revision: 0, inventoryRevision: 0, pending: [], inventory: copy(inventory), buildings: [], ledger: [], events: [] };
    this.disposed = false; if (snapshot) this.restore(snapshot);
  }
  evaluate(request) { this._live(); return evaluatePlacement({ definitions: this.definitions, state: copy({ inventory: this.data.inventory, buildings: this.data.buildings }), request: copy(request), terrain: this.terrain, costFor: this.costFor }); }
  execute(command) {
    this._live(); if (this.inTransaction) throw new Error('construction transaction in progress');
    this.inTransaction = true;
    try { return this._execute(command); } finally { this.inTransaction = false; }
  }
  _execute(command) {
    this._live(); if (!command?.commandId) throw new TypeError('commandId required');
    const prior = this.data.ledger.find(e => e.commandId === command.commandId);
    if (prior) return immutableData(prior.fingerprint && prior.fingerprint !== fingerprint(command) ? fail('idempotency-conflict') : prior.result);
    const commandFingerprint = fingerprint(command);
    let result; const before = copy({ revision:this.data.revision, inventoryRevision:this.data.inventoryRevision, inventory:this.data.inventory, buildings:this.data.buildings, events:this.data.events });
    if (command.expectedRevision != null && command.expectedRevision !== this.data.revision) result = fail('stale-world-revision');
    else if (command.expectedInventoryRevision != null && command.expectedInventoryRevision !== this.data.inventoryRevision) result = fail('stale-inventory-revision');
    const next = { ...this.data, ledger: [...this.data.ledger], events: [...this.data.events], buildings: [...this.data.buildings] };
    if (result) { /* rejected before any validation or spending */ }
    else
    if (command.action === 'grant') {
      const amounts = command.amounts;
      result = amounts && typeof amounts === 'object' && !Array.isArray(amounts) && Object.keys(amounts).length && Object.values(amounts).every(v => finite(v) && v >= 0) ? { ok: true, amounts: copy(amounts) } : fail('invalid-grant');
      if (result.ok) { const inventory = copy(this.data.inventory); for (const [key, amount] of Object.entries(amounts)) { inventory[key] = (inventory[key] ?? 0) + amount; if (!finite(inventory[key])) result = fail('invalid-grant'); } if (result.ok) next.inventory = inventory; }
    } else if (command.action === 'remove') {
      const building = this.data.buildings.find(b => b.id === command.id);
      result = building ? { ok: true, building: copy(building) } : fail('missing-building');
      if (building) next.buildings = next.buildings.filter(b => b.id !== command.id);
    } else if (command.action === 'place') {
      result = this.evaluate(command);
      if (result.ok) {
        const inventory = copy(this.data.inventory);
        for (const [key, cost] of Object.entries(result.cost)) inventory[key] = (inventory[key] ?? 0)-cost;
        next.inventory = inventory; next.buildings.push(copy(result.building));
      }
    } else result = fail('unknown-action');
    if (result.ok) { next.revision++; if (['place','grant'].includes(command.action)) next.inventoryRevision++; }
    if (result.ok && command.action === 'grant') next.events.push({ type: 'resources:granted', commandId: command.commandId, amounts: copy(result.amounts) });
    if (result.ok && command.action !== 'grant') next.events.push({ type: command.action === 'place' ? 'construction:placed' : 'construction:removed', commandId: command.commandId, building: copy(result.building) });
    // Before images omit history to avoid exponential snapshot growth.
    next.ledger.push({ fingerprint: commandFingerprint, commandId: command.commandId, command: copy(command), result: copy(result), before: { revision: before.revision, inventoryRevision: before.inventoryRevision, inventory: before.inventory, buildings: before.buildings, events: before.events } });
    if (result.ok) { const validation = this.beforeCommit?.(immutableData(next), immutableData(result)); if (validation?.then) throw new Error('beforeCommit must be synchronous'); }
    this.data = next;
    return immutableData(result);
  }
  rollback(commandId) {
    this._live(); if (this.inTransaction) throw new Error('construction transaction in progress'); const last = this.data.ledger.at(-1);
    if (!last || last.commandId !== commandId) throw new Error('rollback must follow reverse command order');
    this.data.ledger.pop(); Object.assign(this.data, copy(last.before));
  }
  snapshot() { return copy(this.data); }
  restore(snapshot) {
    this._live(); if (this.inTransaction) throw new Error('construction transaction in progress'); snapshot = copy(snapshot);
    if (snapshot.version === 1) { snapshot.version = 2; snapshot.revision = 0; snapshot.inventoryRevision = 0; snapshot.pending = []; for (const entry of snapshot.ledger ?? []) { entry.before.revision = 0; entry.before.inventoryRevision = 0; } }
    if (snapshot.version !== 2 || !Array.isArray(snapshot.buildings) || !Array.isArray(snapshot.ledger) || !Array.isArray(snapshot.events)) throw new TypeError('invalid construction snapshot');
    if (Object.values(snapshot.inventory).some(v => !finite(v) || v < 0) || new Set(snapshot.buildings.map(b => b.id)).size !== snapshot.buildings.length || snapshot.buildings.some(b => !b.id || !finite(b.x) || !finite(b.y) || !finite(b.z))) throw new TypeError('invalid construction state');
    if (![snapshot.revision,snapshot.inventoryRevision].every(v=>Number.isSafeInteger(v)&&v>=0)) throw new TypeError('invalid construction revisions');
    if (new Set(snapshot.ledger.map(e=>e.commandId)).size !== snapshot.ledger.length) throw new TypeError('duplicate transaction ledger id');
    for (const entry of snapshot.ledger) if (entry.fingerprint) entry.fingerprint = fingerprint(JSON.parse(entry.fingerprint));
    this.data = snapshot; this.data.pending ??= []; return this;
  }
  stage(command) {
    this._live(); if (this.inTransaction) throw new Error('construction transaction in progress');
    if (!command?.commandId) throw new TypeError('commandId required');
    const prior=this.data.pending.find(c=>c.commandId===command.commandId);
    if(prior && fingerprint(prior)!==fingerprint(command))throw new Error('staged idempotency conflict');
    if(!prior)this.data.pending.push(copy(command)); return command.commandId;
  }
  recoverPending({ commit = false } = {}) {
    this._live(); if (this.inTransaction) throw new Error('construction transaction in progress');
    if(!commit){const commands=this.data.pending.splice(0);return commands.map(c=>({commandId:c.commandId,ok:false,reason:'interrupted-operation-aborted'}));}
    const results=[];
    while(this.data.pending.length){const command=copy(this.data.pending[0]);results.push(this.execute(command));this.data.pending.shift();}
    return results;
  }
  worldState(authority = {domain:'construction',owner:'fixture',epoch:0}) { return createWorldState({revision:this.data.revision,inventoryRevision:this.data.inventoryRevision,authority,inventory:this.data.inventory,buildings:this.data.buildings,events:this.data.events,entities:this.data.buildings.map(b=>({id:b.id,components:{transform:{x:b.x,y:b.y,z:b.z,rotation:b.rotation},building:{type:b.type}}}))}); }
  replay(commands) { return commands.map(c => this.execute(c)); }
  _live() { if (this.disposed) throw new Error('construction disposed'); }
  dispose() { if (this.inTransaction) throw new Error('construction transaction in progress'); this.disposed = true; }
}

/** Fixture-owned authority switch. LEGACY/SHADOW never writes engine state. */
export function dispatchConstruction({ authority, construction, command, legacy }) {
  const mode = authority.get('construction');
  if (mode === 'ENGINE') return construction.execute(command);
  if (mode === 'SHADOW') {
    const predicted = construction.evaluate(command);
    const actual = legacy(copy(command));
    return { actual, predicted, equivalent: Boolean(actual?.ok) === predicted.ok };
  }
  return legacy(copy(command));
}

/** Installs into the kernel's existing fixed step, without creating a loop. */
export function installConstruction(engine, options) {
  const construction = new Construction(options);
  const unregister = engine.commands.register('construction', 'construction', (_world, command) => {
    const beforeRevision = construction.data.revision, beforeLedger = construction.data.ledger.length;
    const result = construction.execute(command.payload);
    if (construction.data.revision !== beforeRevision || construction.data.ledger.length !== beforeLedger) engine.world.setResource('construction', construction.snapshot());
    if (result.ok && construction.data.revision !== beforeRevision) engine.events.emit('construction:changed', { commandId: command.id, result: copy(result) });
    return result;
  });
  engine.world.setResource('construction', construction.snapshot());
  const offRestore = engine.events.on('engine:restored', () => construction.restore(engine.world.getResource('construction')), { owner: 'construction' });
  const remove = engine.addSystem({ id: 'construction', owner: 'construction', phase: 'post', run: () => {}, dispose: () => { unregister(); offRestore(); construction.dispose(); } });
  return { construction, restore(snapshot) { construction.restore(snapshot); engine.world.setResource('construction', construction.snapshot()); }, dispose: remove };
}
export { utilityStatus } from './UtilityGraph.js';
export { compareConstruction, ConstructionParityReport, PARITY_CLASSES } from './Parity.js';

export { ConstructionRuntime } from './ConstructionRuntime.js';
export { ConstructionServerFixture, ConstructionFixtureClient } from './ConstructionServerFixture.js';

export { ConstructionPort } from './ConstructionPort.js';
