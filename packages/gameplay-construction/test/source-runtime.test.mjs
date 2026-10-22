import test from 'node:test';
import assert from 'node:assert/strict';
import { Construction, ConstructionRuntime, ConstructionServerFixture, ConstructionFixtureClient } from '../src/index.js';
import { memoryWorldCheckpoint, WorldCheckpointStore } from '../../persistence/src/index.js';
import { GameplayEventJournal, canonicalJSON, serializeWorldState, restoreWorldState } from '../../core/src/index.js';

export const options = { worldId: 'tested-world', owner: 'fixture-server', definitions: [{ type: 'shelter', radius: 1, cost: { stone: 4 } }], inventory: { stone: 12 }, terrain: { isValid: (_d, x, z) => Math.abs(x) <= 10 && Math.abs(z) <= 10, heightAt: () => 0 }, canWalk: (x, z) => Math.abs(x) <= 10 && Math.abs(z) <= 10 };
const place = (id = 'one', x = 2, z = 2) => ({ commandId: id, action: 'place', id: 'building-' + id, type: 'shelter', x, z });
const setup = (extra = {}) => {
  const store = extra.store ?? memoryWorldCheckpoint(); const server = new ConstructionServerFixture({ options: extra.options ?? options, store });
  const send = async request => server.handle(request);
  return { store, server, a: new ConstructionFixtureClient({ clientId: 'alice', token: 'fixture-a', send }), b: new ConstructionFixtureClient({ clientId: 'bob', token: 'fixture-b', send }) };
};

test('source-owned lifecycle atomically commits cost, building, progress, reward and revision', () => {
  const runtime = new ConstructionRuntime(options), a = runtime.dispatch(place()), b = runtime.dispatch(place('two', 5));
  assert.equal(a.ok, true); assert.equal(b.ok, true);
  const state = runtime.snapshot(); assert.equal(state.construction.inventory.stone, 4); assert.equal(state.mission.status, 'complete'); assert.equal(state.player.xp, 25);
  assert.deepEqual(state.rewardIds, ['first-colony']);
  assert.deepEqual(state.events.filter(e => e.transactionId === 'one').map(e => e.type), ['ConstructionRequested', 'ConstructionCommitted', 'ResourcesChanged', 'BuildingCreated', 'MissionProgressChanged', 'WorldRevisionCommitted']);
  assert.equal(runtime.dispatch(place('three', -5)).ok, true); assert.equal(runtime.snapshot().player.xp, 25);
  assert.ok(Object.isFrozen(a)); assert.ok(Object.isFrozen(runtime.worldState().entities));
});
test('rejected terrain, occupied site and resources have no gameplay effects', () => {
  const runtime = new ConstructionRuntime({ ...options, inventory: { stone: 4 } }); runtime.dispatch(place());
  for (const [command, reason] of [[place('overlap'), 'occupied'], [place('outside', 40), 'terrain'], [place('poor', 5), 'resources']]) {
    const before = runtime.snapshot(), result = runtime.dispatch(command), after = runtime.snapshot();
    assert.equal(result.reason, reason); assert.equal(after.revision, before.revision); assert.deepEqual(after.construction, before.construction); assert.deepEqual(after.mission, before.mission);
    assert.deepEqual(after.events.slice(before.events.length).map(e => e.type), ['ConstructionRequested', 'ConstructionRejected']);
  }
});
test('duplicate/conflicting commands and stale revisions never charge or reward twice', () => {
  const runtime = new ConstructionRuntime(options), command = place(); const accepted = runtime.dispatch(command), before = runtime.snapshot();
  assert.deepEqual(runtime.dispatch(command), accepted); assert.equal(runtime.snapshot(), before);
  assert.equal(runtime.dispatch({ ...command, x: 8 }).reason, 'idempotency-conflict');
  assert.equal(runtime.dispatch({ ...place('stale', 5), expectedRevision: 0 }).reason, 'stale-world-revision');
  assert.equal(runtime.snapshot().construction.inventory.stone, 8);
});
test('validation throw rolls back entire candidate including mission/rewards and events', () => {
  const runtime = new ConstructionRuntime({ ...options, beforeCommit: () => { throw Error('injected policy failure'); } }), before = runtime.snapshot();
  assert.throws(() => runtime.dispatch(place()), /injected/); assert.equal(runtime.snapshot(), before); assert.equal(runtime.failures().length, 0);
});
test('presentation failures, frozen inputs and reentry cannot retry authoritative mutations', () => {
  const runtime = new ConstructionRuntime(options); let calls = 0;
  runtime.subscribe('broken-audio', event => { calls++; assert.ok(Object.isFrozen(event)); throw Error('speaker unavailable'); });
  runtime.subscribe('reentrant', () => runtime.dispatch(place('nested', 6)));
  assert.equal(runtime.dispatch(place()).ok, true); const count = calls; runtime.dispatch(place());
  assert.equal(calls, count); assert.equal(runtime.snapshot().construction.inventory.stone, 8); assert.equal(runtime.snapshot().construction.buildings.length, 1); assert.ok(runtime.failures().length > 0);
});
test('movement and building collision consume one plain authoritative state; removal clears collision', () => {
  const runtime = new ConstructionRuntime(options); runtime.dispatch(place('at-player', 0, -4));
  assert.equal(runtime.dispatch({ commandId: 'walk', action: 'move', dx: 0, dz: .25 }).reason, 'collision');
  runtime.dispatch({ commandId: 'remove', action: 'remove', id: 'building-at-player' });
  assert.equal(runtime.dispatch({ commandId: 'walk-again', action: 'move', dx: 0, dz: .25 }).ok, true);
  assert.equal(runtime.worldState().entities.find(e => e.id === 'player').components.transform.z, -4.75);
  assert.equal(runtime.snapshot().construction.inventory.stone, 8);
});
test('grant and selection travel through same boundary; invalid grant stays atomic', () => {
  const runtime = new ConstructionRuntime(options);
  assert.equal(runtime.dispatch({ commandId: 'grant', action: 'grant', amounts: { stone: 7 } }).ok, true);
  assert.equal(runtime.snapshot().construction.inventory.stone, 19);
  assert.equal(runtime.dispatch({ commandId: 'bad-grant', action: 'grant', amounts: { stone: -8 } }).ok, false);
  assert.equal(runtime.dispatch({ commandId: 'select', action: 'select', type: 'shelter' }).ok, true);
  assert.equal(runtime.dispatch({ commandId: 'select-bad', action: 'select', type: 'unknown' }).ok, false);
});
test('snapshot restore retains IDs, ledger, mission and reward; deterministic branch replay', () => {
  const runtime = new ConstructionRuntime(options); runtime.dispatch(place()); runtime.dispatch(place('two', 5)); runtime.dispatch({ commandId: 'remove', action: 'remove', id: 'building-one' });
  const restored = new ConstructionRuntime(options); restored.restore(JSON.parse(JSON.stringify(runtime.snapshot())));
  assert.deepEqual(restored.snapshot(), runtime.snapshot()); assert.equal(restored.replay().deterministic, true);
  assert.deepEqual(restored.dispatch(place()), runtime.dispatch(place())); assert.equal(restored.snapshot().player.xp, 25);
  assert.deepEqual(restoreWorldState(serializeWorldState(restored.worldState())), restored.worldState());
});
test('malformed restore is rejected before replacing current state', () => {
  const runtime = new ConstructionRuntime(options); runtime.dispatch(place()); const saved = runtime.snapshot(); const bad = structuredClone(saved); bad.events[0].id = bad.events[1].id;
  assert.throws(() => runtime.restore(bad)); assert.equal(runtime.snapshot(), saved);
  assert.throws(() => runtime.restore({ ...saved, player: { ...saved.player, x: Infinity } }));
});
test('event replay is read-only, stable and idempotent; changed IDs and order reject', () => {
  const runtime = new ConstructionRuntime(options); runtime.dispatch(place()); const records = runtime.snapshot().events, journal = new GameplayEventJournal(); let calls = 0;
  journal.subscribe('view', () => calls++); journal.append(records); journal.append(records); assert.equal(calls, records.length);
  const changed = structuredClone(records); changed[0].type = 'forged'; assert.throws(() => journal.append(changed), /conflict/);
  assert.throws(() => new GameplayEventJournal().restore([...records].reverse()));
  const second = new GameplayEventJournal(); second.restore(records); second.subscribe('replay', () => calls++, { replay: true }); assert.equal(calls, records.length * 2);
});
test('checkpoint acknowledges CAS storage; rejected conflict preserves confirmed snapshot', () => {
  const store = memoryWorldCheckpoint(), runtime = new ConstructionRuntime(options); runtime.dispatch(place());
  const request = { operationId: 'save-a', expectedVersion: 0, snapshot: runtime.snapshot() }, ack = store.commit(request);
  assert.equal(ack.ok, true); assert.equal(store.commit(request).duplicate, true);
  assert.equal(store.commit({ ...request, operationId: 'save-b' }).reason, 'save-conflict');
  assert.equal(store.commit({ ...request, snapshot: { ...request.snapshot, revision: 2 } }).reason, 'idempotency-conflict');
  const saved = store.load(); assert.equal(saved.snapshot.construction.buildings[0].id, 'building-one'); assert.ok(Object.isFrozen(saved));
});
test('checkpoint adapter failure has no false durable acknowledgment', () => {
  const store = new WorldCheckpointStore({ write: () => { throw Error('disk unavailable'); } });
  assert.throws(() => store.commit({ operationId: 'save', expectedVersion: 0, snapshot: new ConstructionRuntime(options).snapshot() }), /disk/); assert.equal(store.load(), null);
});
test('two simultaneous clients: first arrival wins, stale client reconciles then overlap rejects', async () => {
  const { a, b, server } = setup(); await Promise.all([a.reconcile(), b.reconcile()]);
  const results = await Promise.all([a.submit(place('a')), b.submit(place('b'))]);
  assert.equal(results.filter(r => r.ok).length, 1); assert.equal(results[1].reason, 'stale-world-revision');
  await b.reconcile(); assert.equal((await b.submit(place('overlap'))).reason, 'occupied');
  assert.equal(server.snapshot().construction.buildings.length, 1); assert.equal(server.snapshot().construction.inventory.stone, 8);
});
test('shared funds are not overspent by independent clients', async () => {
  const { a, b, server } = setup({ options: { ...options, inventory: { stone: 4 } } });
  await a.reconcile(); await b.reconcile(); await a.submit(place('a')); await b.reconcile();
  assert.equal((await b.submit(place('b', 6))).reason, 'resources'); assert.equal(server.snapshot().construction.inventory.stone, 0);
});
test('duplicate server request and server restart retain accepted receipt and exact charge', async () => {
  const { server, store } = setup(); const request = { clientId: 'alice', token: 'fixture-a', command: { ...place(), expectedRevision: 0 } };
  const first = server.handle(request); assert.equal(first.ok, true);
  const restarted = new ConstructionServerFixture({ options, store }); assert.deepEqual(restarted.handle(request), first);
  assert.equal(restarted.snapshot().construction.inventory.stone, 8);
  assert.equal(restarted.handle({ ...request, command: { ...request.command, x: 8 } }).reason, 'idempotency-conflict');
});
test('disconnect after server commit preserves exact outbox request; reconnect cannot double-spend', async () => {
  const { server } = setup(); let drop = true, persisted = [];
  const send = async request => { const response = server.handle(request); if (request.command && drop) { drop = false; throw Error('ack lost'); } return response; };
  const a = new ConstructionFixtureClient({ clientId: 'alice', token: 'fixture-a', send, persist: data => { persisted = data; } });
  await a.reconcile(); await assert.rejects(a.submit(place()), /ack lost/); assert.equal(persisted.length, 1);
  const restartedClient = new ConstructionFixtureClient({ clientId: 'alice', token: 'fixture-a', send, pending: persisted });
  assert.equal((await restartedClient.reconnect())[0].ok, true); assert.equal(restartedClient.pending().length, 0);
  assert.equal(server.snapshot().construction.inventory.stone, 8); assert.equal(server.snapshot().construction.buildings.length, 1);
});
test('disconnect before receipt, delayed/out-of-order responses and stale rejects reconcile', async () => {
  const { server } = setup(); const pending = [];
  const send = request => new Promise(resolve => pending.push({ request, resolve }));
  const a = new ConstructionFixtureClient({ clientId: 'alice', token: 'fixture-a', send });
  const first = a.submit({ ...place('first'), expectedRevision: 0 }); const second = a.submit({ ...place('second', 6), expectedRevision: 0 });
  const old = server.handle(pending[1].request); const newer = server.handle(pending[0].request);
  pending[0].resolve(newer); await first; pending[1].resolve(old); await second;
  assert.equal(a.view.construction.buildings[0].id, 'building-second'); assert.equal(a.version, newer.acknowledgment.version); assert.equal(a.view.events.length, newer.snapshot.events.length);
});
test('unauthorized clients and client-side grants never mutate server; persisted rejections are explicit', () => {
  const { server } = setup(); const before = server.snapshot();
  assert.equal(server.handle({ clientId: 'alice', token: 'wrong', command: place() }).reason, 'unauthorized');
  assert.equal(server.handle({ clientId: 'alice', token: 'fixture-a', command: { commandId: 'rich', action: 'grant', amounts: { stone: 999 } } }).reason, 'forbidden-action'); assert.equal(server.snapshot(), before);
});
test('interrupted server storage operation is retryable with original transaction ID', async () => {
  let data = null, fail = true;
  const store = new WorldCheckpointStore({ read: () => data, write: value => { if (fail) throw Error('interruption'); data = value; } });
  const { server } = setup({ store }), a = new ConstructionFixtureClient({ clientId: 'alice', token: 'fixture-a', send: async req => server.handle(req) });
  await a.reconcile(); assert.equal((await a.submit(place())).reason, 'storage-or-validation-failure'); assert.equal(server.snapshot().revision, 0); assert.equal(a.pending().length, 1);
  fail = false; await a.reconnect(); assert.equal(a.pending().length, 0); assert.equal(server.snapshot().construction.inventory.stone, 8);
});
test('disconnect before server receipt persists intention and commits once on reconnect', async () => {
  const { server } = setup(); let offline = true;
  const a = new ConstructionFixtureClient({ clientId: 'alice', token: 'fixture-a', send: async request => { if (offline) throw Error('offline'); return server.handle(request); } });
  await assert.rejects(a.submit(place()), /offline/); assert.equal(server.snapshot().revision, 0); assert.equal(a.pending().length, 1);
  offline = false; await a.reconnect(); assert.equal(a.pending().length, 0); assert.equal(server.snapshot().construction.inventory.stone, 8);
});
test('server CAS conflict refreshes confirmed state instead of merging stale resources', async () => {
  const store = memoryWorldCheckpoint(), first = new ConstructionServerFixture({ options, store }), second = new ConstructionServerFixture({ options, store });
  const request = { clientId: 'alice', token: 'fixture-a', command: { ...place(), expectedRevision: 0 } };
  assert.equal(first.handle(request).ok, true);
  const response = second.handle({ clientId: 'bob', token: 'fixture-b', command: { ...place('bob', 8), expectedRevision: 0 } });
  assert.equal(response.reason, 'save-conflict'); assert.equal(response.snapshot.construction.inventory.stone, 8); assert.equal(response.snapshot.construction.buildings[0].id, 'building-one'); assert.equal(response.commandAcknowledged, undefined);
});
test('checkpoint cannot overwrite another world; malformed envelopes reject', () => {
  const store = memoryWorldCheckpoint(), snapshot = new ConstructionRuntime(options).snapshot(); store.commit({ operationId: 'first', expectedVersion: 0, snapshot });
  assert.equal(store.commit({ operationId: 'second', expectedVersion: 1, snapshot: { ...snapshot, worldId: 'another' } }).reason, 'world-conflict');
  assert.throws(() => new WorldCheckpointStore({ read: () => ({ schema: 'unknown' }), write: () => {} }).load(), /invalid/);
});
test('restore rejects inconsistent world receipt, revision, or reordered events atomically', () => {
  const runtime = new ConstructionRuntime(options); runtime.dispatch(place()); const before = runtime.snapshot();
  for (const mutate of [s => s.revision++, s => s.ledger[0].result.eventIds.pop(), s => { [s.events[0], s.events[1]] = [s.events[1], s.events[0]]; s.events.forEach((e, i) => e.sequence = i); }]) {
    const bad = structuredClone(before); mutate(bad); assert.throws(() => runtime.restore(bad)); assert.equal(runtime.snapshot(), before);
  }
});
test('asynchronous storage adapters cannot issue an early durable acknowledgment', () => {
  assert.throws(() => new WorldCheckpointStore({ write: async () => {} }), /synchronous/);
  const store = new WorldCheckpointStore({ write: () => Promise.resolve() });
  assert.throws(() => store.commit({ operationId: 'save', expectedVersion: 0, snapshot: new ConstructionRuntime(options).snapshot() }), /synchronously/);
});
test('storage commits but loses acknowledgment; retry recovers durable receipt without a second charge', () => {
  let data = null, loseAck = true;
  const store = new WorldCheckpointStore({ read: () => data, write: value => { data = value; if (loseAck) { loseAck = false; throw Error('ack interrupted after replace'); } } });
  const { server } = setup({ store }), request = { clientId: 'alice', token: 'fixture-a', command: { ...place(), expectedRevision: 0 } };
  assert.equal(server.handle(request).reason, 'storage-or-validation-failure'); assert.equal(server.snapshot().revision, 0);
  assert.equal(server.handle(request).ok, true); assert.equal(server.snapshot().construction.inventory.stone, 8); assert.equal(store.load().version, 1);
});

test('overflowing grants cannot publish invalid inventory in the reusable Construction boundary', () => {
  const construction = new Construction({ ...options, inventory: {stone: Number.MAX_VALUE} });
  const before = construction.snapshot(); const result = construction.execute({commandId: 'overflow', action: 'grant', amounts: {stone: Number.MAX_VALUE}});
  assert.equal(result.reason, 'invalid-grant'); assert.deepEqual(construction.snapshot().inventory, before.inventory); assert.equal(construction.snapshot().revision, before.revision);
  assert.deepEqual(construction.snapshot().events, before.events); assert.ok(Object.isFrozen(result));
});
