#!/usr/bin/env node
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '..', 'azl', 'zeknova-identity-contract-v1.js'), 'utf8');
(0, eval)(source);
const Contract = globalThis.ZekNovaIdentityContract;

let checks = 0;
function test(name, fn) {
  try { fn(); checks++; console.log('  PASS ' + name); }
  catch (error) { console.error('  FAIL ' + name); throw error; }
}

const world = Contract.worldId({ teamCode: ' Forest Alpha ', biomeSeed: 5207 });
const human = Contract.humanFactionId({ teamCode: 'forest alpha' });
const settlement0 = Contract.settlementFactionId({ worldId: world, settlementOrdinal: 0 });
const settlement1 = Contract.settlementFactionId({ worldId: world, settlementOrdinal: 1 });

test('contract identity', () => assert.equal(Contract.CONTRACT_ID, 'zeknova-identity-contract-v1'));
test('team codes are canonical and case-insensitive', () => assert.equal(world, Contract.worldId({ teamCode: 'FOREST ALPHA', biomeSeed: 5207 })));
test('world identity includes biome seed', () => assert.notEqual(world, Contract.worldId({ teamCode: 'FOREST ALPHA', biomeSeed: 5208 })));
test('human faction is stable', () => assert.equal(human, Contract.humanFactionId({ teamCode: 'Forest Alpha' })));
test('settlement factions are distinct', () => assert.notEqual(settlement0, settlement1));
test('identities validate', () => [world, human, settlement0, settlement1].forEach(id => assert.equal(Contract.isCanonicalIdentity(id), true)));
test('empty team is rejected', () => assert.throws(() => Contract.worldId({ teamCode: '', biomeSeed: 1 }), /teamCode/));
test('fractional seed is rejected', () => assert.throws(() => Contract.worldId({ teamCode: 'A', biomeSeed: 1.5 }), /safe integer/));
test('malformed encoded identity is rejected', () => assert.equal(Contract.isCanonicalIdentity('zkid:v1:world:%ZZ:1'), false));

test('persistent entity IDs are stable', () => {
  const a = Contract.structureEntityId({ worldId: world, recordId: 'building-42' });
  const b = Contract.structureEntityId({ worldId: world, recordId: 'building-42' });
  assert.equal(a, b);
});

test('human player identity prefers user ID', () => {
  const a = Contract.humanUnitEntityId({ worldId: world, userId: 'user-7', clientId: 'client-a' });
  const b = Contract.humanUnitEntityId({ worldId: world, userId: 'user-7', clientId: 'client-b' });
  assert.equal(a, b);
});

test('remote client identities are distinct', () => {
  const a = Contract.humanUnitEntityId({ worldId: world, clientId: 'client-a' });
  const b = Contract.humanUnitEntityId({ worldId: world, clientId: 'client-b' });
  assert.notEqual(a, b);
});

test('canonical JSON ignores object key order', () => {
  assert.equal(Contract.canonicalStringify({ b: 2, a: 1 }), Contract.canonicalStringify({ a: 1, b: 2 }));
});

test('canonical metadata rejects non-finite values', () => assert.throws(() => Contract.canonicalStringify({ a: Infinity }), /non-finite/));
test('canonical metadata rejects cycles', () => { const x = {}; x.x = x; assert.throws(() => Contract.stableClone(x), /cycles/); });

test('registry registers factions before entities', () => {
  const registry = new Contract.IdentityRegistry({ worldId: world });
  assert.throws(() => registry.registerEntity({ entityId: Contract.settlementEntityId({ worldId: world, settlementOrdinal: 0 }), kind: 'settlement', ownerFactionId: settlement0, sourceKey: 's0' }), /Owner faction/);
});

test('registry snapshot is canonical and deterministic', () => {
  function build() {
    const r = new Contract.IdentityRegistry({ worldId: world });
    r.registerFaction({ factionId: human, kind: 'human_team', sourceKey: 'team' });
    r.registerFaction({ factionId: settlement0, kind: 'zeknovan_settlement', sourceKey: 'settlement:0' });
    r.registerEntity({ entityId: Contract.settlementEntityId({ worldId: world, settlementOrdinal: 0 }), kind: 'settlement', ownerFactionId: settlement0, sourceKey: 'settlement:0' });
    r.registerEntity({ entityId: Contract.structureEntityId({ worldId: world, recordId: 'power-1' }), kind: 'structure', ownerFactionId: human, sourceKey: 'structure:power-1' });
    return r;
  }
  assert.equal(build().snapshotHash(), build().snapshotHash());
});

test('snapshot round-trip is byte-identical', () => {
  const r = new Contract.IdentityRegistry({ worldId: world });
  r.registerFaction({ factionId: human, kind: 'human_team', sourceKey: 'team' });
  r.registerFaction({ factionId: settlement0, kind: 'zeknovan_settlement', sourceKey: 'settlement:0' });
  r.allocateSpawn({ role: 'stalker', ownerFactionId: settlement0 });
  const before = Contract.canonicalStringify(r.snapshot());
  const after = Contract.canonicalStringify(Contract.IdentityRegistry.fromSnapshot(r.snapshot()).snapshot());
  assert.equal(after, before);
});

test('FX-ID-REUSE retired spawn ID cannot return', () => {
  const r = new Contract.IdentityRegistry({ worldId: world });
  r.registerFaction({ factionId: settlement0, kind: 'zeknovan_settlement', sourceKey: 'settlement:0' });
  const first = r.allocateSpawn({ role: 'stalker', ownerFactionId: settlement0 });
  assert.equal(r.retire(first.entityId), true);
  const second = r.allocateSpawn({ role: 'stalker', ownerFactionId: settlement0 });
  assert.notEqual(second.entityId, first.entityId);
  assert.throws(() => r.registerEntity({ ...first }), /Retired entity identity/);
});

test('spawn sequence survives snapshot restore', () => {
  const r = new Contract.IdentityRegistry({ worldId: world });
  r.registerFaction({ factionId: settlement0, kind: 'zeknovan_settlement', sourceKey: 'settlement:0' });
  const first = r.allocateSpawn({ role: 'stalker', ownerFactionId: settlement0 });
  const restored = Contract.IdentityRegistry.fromSnapshot(r.snapshot());
  const second = restored.allocateSpawn({ role: 'stalker', ownerFactionId: settlement0 });
  assert.match(first.entityId, /:spawn:1:/);
  assert.match(second.entityId, /:spawn:2:/);
});

test('FX-ID-COLLISION conflicting source mapping is rejected', () => {
  const r = new Contract.IdentityRegistry({ worldId: world });
  r.registerFaction({ factionId: human, kind: 'human_team', sourceKey: 'team' });
  r.registerEntity({ entityId: Contract.structureEntityId({ worldId: world, recordId: 'a' }), kind: 'structure', ownerFactionId: human, sourceKey: 'same' });
  assert.throws(() => r.registerEntity({ entityId: Contract.structureEntityId({ worldId: world, recordId: 'b' }), kind: 'structure', ownerFactionId: human, sourceKey: 'same' }), /Source key collision/);
});

test('FX-CLONE-ALIAS snapshot mutations cannot alter registry', () => {
  const r = new Contract.IdentityRegistry({ worldId: world });
  r.registerFaction({ factionId: human, kind: 'human_team', sourceKey: 'team', metadata: { nested: { value: 1 } } });
  const snapshot = r.snapshot();
  snapshot.factions[0].metadata.nested.value = 99;
  assert.equal(r.snapshot().factions[0].metadata.nested.value, 1);
});

console.log(`W0-O.0 IDENTITY CONTRACT TESTS PASS (${checks}/${checks})`);
