import { createEngine, immutableData } from '../../packages/core/src/index.js';
import { ConstructionPort } from '../../packages/gameplay-construction/src/index.js';
import { localWorldCheckpoint, memoryWorldCheckpoint } from '../../packages/persistence/src/index.js';
import { worldOptions } from './world.js';
export const SAVE_KEY = 'zge.independent-world.v3';

export async function createGameplaySession({ storage = null } = {}) {
  const runtime = new ConstructionPort(worldOptions);
  const engine = createEngine({ id: 'source-gameplay', scheduler: 'manual', config: { features: { construction: 'ENGINE' } } });
  const store = storage ? localWorldCheckpoint(storage, SAVE_KEY) : memoryWorldCheckpoint();
  let nextId = 1, version = 0, lastResult = null;
  const sync = () => engine.world.setResource('source-world', runtime.worldState());
  const off = engine.commands.register('source-gameplay', 'construction', (_world, command) => { const result = runtime.dispatch(command.payload); sync(); return result; });
  engine.addSystem({ id: 'source-world', phase: 'post', run: () => {}, dispose: () => { off(); runtime.dispose(); } });
  await engine.start(); sync();
  const session = {
    engine,
    execute(command) {
      const commandId = command.commandId ?? 'local-' + nextId++;
      // Unique outer delivery IDs do not replace runtime logical transaction IDs.
      const id = 'delivery-' + nextId++;
      engine.commands.enqueue({ id, type: 'source-gameplay', payload: { ...command, commandId } }); engine.step();
      lastResult = engine.commands.results.get(id); return lastResult;
    },
    place(x, z, type = runtime.snapshot().selectedType, client = 'local') { const id = client + '-' + nextId++; return session.execute({ commandId: id, action: 'place', id: 'building-' + id, type, x, z, rotation: 0 }); },
    move(dx, dz) { return session.execute({ action: 'move', dx, dz }); },
    select(type) { return session.execute({ action: 'select', type }); },
    grant() { return session.execute({ action: 'grant', amounts: { stone: 8 } }); },
    remove(id) { return session.execute({ action: 'remove', id }); },
    inspect() { const snapshot = runtime.snapshot(); return immutableData({ world: runtime.worldState(), construction: snapshot.construction, player: snapshot.player, mission: snapshot.mission, rewardIds: snapshot.rewardIds, selectedType: snapshot.selectedType, built: snapshot.built, events: snapshot.events, failures: runtime.failures(), lastResult, step: engine.clock.stepNumber }); },
    snapshot() { return runtime.snapshot(); },
    save() { const ack = store.commit({ operationId: 'checkpoint-' + runtime.snapshot().ledger.length, expectedVersion: version, snapshot: runtime.snapshot() }); if (ack.ok) version = ack.version; return ack; },
    restore() { const saved = store.load(); if (!saved) return { ok: false, reason: 'no-save' }; runtime.restore(saved.snapshot); version = saved.version; nextId = Math.max(nextId, ...saved.snapshot.ledger.map(e => Number(e.command.commandId.split('-').at(-1)) + 2).filter(Number.isFinite)); sync(); return { ok: true, version, revision: runtime.snapshot().revision }; },
    replay() { return runtime.replay(); },
    subscribe: (...args) => runtime.subscribe(...args),
    async dispose() { await engine.dispose(); },
  };
  try { session.restore(); } catch (error) { lastResult = { ok: false, reason: 'restore-failed', message: error.message }; }
  return session;
}
