import { immutableData, canonicalJSON, validateWorldState, createWorldState } from '../../core/src/index.js';
import { migrateV4Save, validateV4Migration } from './V4Migration.js';
import { EXTENSION_SCHEMA, validateSnapshot } from './schema.js';
export const V4_BRANCH_SCHEMA = 'zge.v4-construction-branch.v1';
const EXT = 'zge.v4-construction-state.v1';
const owner = { domain: 'construction-migration', owner: 'isolated-v4-branch', epoch: 0 };

/** Isolated forward/export boundary. Preserves the original independently of an
 * editable branch; does not install this state into the live legacy runtime. */
export function prepareV4ConstructionMigration(input) {
  if (input?.schema === V4_BRANCH_SCHEMA) { validateV4ConstructionMigration(input); return immutableData(input); }
  const source = migrateV4Save(input);
  for (const field of ['revision','sharedRevision']) { const value=source.original.persistence?.[field];if(value!==undefined&&(!Number.isSafeInteger(value)||value<0))throw Error('invalid legacy revision metadata'); }
  if (source.original.zgeConstruction && source.original.zgeConstruction.schema !== EXT) throw Error('unsupported construction extension');
  let state = createWorldState({ ...source.state, authority: owner });
  if (source.original.zgeConstruction) {
    const saved = source.original.zgeConstruction;
    validateWorldState(saved.state);
    if (saved.state.id !== source.state.id || saved.state.revision !== source.state.revision || canonicalJSON(saved.state.authority) !== canonicalJSON(owner)) throw Error('construction extension mismatch');
    // The exported legacy projection must agree with the embedded source state.
    const projected = project(source.original, saved.state);
    if (canonicalJSON(projected) !== canonicalJSON(source.original)) throw Error('construction extension projection mismatch');
    state = structuredClone(saved.state);
  }
  return immutableData({ schema: V4_BRANCH_SCHEMA, source, state });
}
export function validateV4ConstructionMigration(branch) {
  if (branch?.schema !== V4_BRANCH_SCHEMA) throw Error('unsupported construction migration');
  validateV4Migration(branch.source); validateWorldState(branch.state);
  const { state, source } = branch;
  if (state.id !== source.state.id || state.revision < source.state.revision || state.inventoryRevision < source.state.inventoryRevision || canonicalJSON(state.authority) !== canonicalJSON(owner)) throw Error('migration world or revision mismatch');
  const originalPlayer = source.state.entities.find(e => e.id === 'player:' + source.original.user.id);
  const player = state.entities.find(e => e.id === originalPlayer.id);
  if (!player || canonicalJSON({ ...player.components.identity, officerClass: null }) !== canonicalJSON({ ...originalPlayer.components.identity, officerClass: null })) throw Error('migration player identity changed');
  const p = player.components.progress;
  if (!Number.isFinite(p.xp) || p.xp < 0 || typeof p.rank !== 'string' || (p.rankXp !== null && (!Number.isFinite(p.rankXp) || p.rankXp < 0)) || !Array.isArray(p.engineEvents) || !p.missionStats || !p.bossClaims) throw Error('invalid migrated progress');
  if (canonicalJSON(p.bossClaims) !== canonicalJSON(p.missionStats.bossDefeats ?? {})) throw Error('reward records disagree');
  const baseline = prepareV4ConstructionMigration(source.original).state;
  if (state.revision < baseline.revision || state.inventoryRevision < baseline.inventoryRevision || (canonicalJSON(state.inventory) !== canonicalJSON(baseline.inventory) && state.inventoryRevision <= baseline.inventoryRevision)) throw Error('inventory revision must advance');
  if (![player.components.transform.x,player.components.transform.y,player.components.transform.z,player.components.transform.rotation].every(Number.isFinite)) throw Error('invalid migrated player transform');
  if (state.revision === source.state.revision && canonicalJSON(state) !== canonicalJSON(baseline)) throw Error('edited migration must advance revision');
  return branch;
}
function project(original, state) {
  const output = structuredClone(original), player = state.entities.find(e => e.id === 'player:' + original.user.id), { progress, transform } = player.components;
  output.resources = structuredClone(state.inventory); output.buildings = structuredClone(state.buildings);
  output.player = { ...output.player, ...transform, xp: progress.xp };
  output.user = { ...output.user, officerClass: progress.rank };
  output.missionStats = structuredClone(progress.missionStats);
  // Unknown extension schemas are kept byte-for-byte as JSON data.
  if (!output.zge || output.zge.schema === EXTENSION_SCHEMA) output.zge = { ...output.zge, schema: EXTENSION_SCHEMA, player: { ...output.zge?.player, xp: progress.xp, officerClass: progress.rank, ...(progress.rankXp === null ? {} : { rankXp: progress.rankXp }) } };
  output.persistence = { ...output.persistence, revision: Math.max(output.persistence?.revision ?? 0, state.revision), sharedRevision: state.revision };
  output.zgeConstruction = { schema: EXT, worldId: state.id, revision: state.revision, state: structuredClone(state) };
  output.zgeConstruction.state.entities.find(e => e.id === player.id).components.identity = structuredClone(output.user);
  validateSnapshot(output); return output;
}
export function exportV4ConstructionMigration(branch) { validateV4ConstructionMigration(branch); return immutableData(project(branch.source.original, branch.state)); }
export function rollbackV4ConstructionMigration(branch) { validateV4ConstructionMigration(branch); return immutableData(branch.source.original); }
/** Caller supplies atomic compare-and-swap storage. No non-atomic fallback. */
export function commitV4ConstructionMigration(branch, store, expectedVersion) {
  if (!Number.isSafeInteger(expectedVersion) || expectedVersion < 0) throw Error('invalid migration storage version');
  const snapshot = exportV4ConstructionMigration(branch);
  if (typeof store?.compareAndSwap !== 'function') throw Error('atomic migration store required');
  return store.compareAndSwap(expectedVersion, immutableData({ schema: 'zge.v4-migration-commit.v1', original: branch.source.original, snapshot, branch }));
}
