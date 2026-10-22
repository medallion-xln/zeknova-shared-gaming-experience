/** Strict JSON boundary for simulation consumers. No scene objects or callbacks. */
export function plainData(value) {
  const seen = new Set();
  const check = v => {
    if (v === null || ['string','boolean'].includes(typeof v)) return;
    if (typeof v === 'number' && Number.isFinite(v)) return;
    if (typeof v !== 'object' || (Object.getPrototypeOf(v) !== Object.prototype && !Array.isArray(v)) || seen.has(v)) throw new TypeError('world state must be finite, acyclic plain JSON');
    seen.add(v); for (const item of Object.values(v)) check(item); seen.delete(v);
  };
  check(value); return structuredClone(value);
}
export function immutableData(value) { const data = plainData(value); const freeze = v => { if (v && typeof v === 'object') { Object.values(v).forEach(freeze); Object.freeze(v); } return v; }; return freeze(data); }
export const WORLD_STATE_SCHEMA = 'zge.world-state.v1';
export function createWorldState({ id = 'world', revision = 0, authority = { domain: 'construction', owner: 'fixture', epoch: 0 }, entities = null, buildings = [], inventory = {}, inventoryRevision = 0, events = [] } = {}) {
  entities ??= buildings.map(b=>({id:b.id,components:{transform:{x:b.x,y:b.y,z:b.z,rotation:b.rotation},building:{type:b.type}}}));
  const state = plainData({ schema: WORLD_STATE_SCHEMA, id, revision, authority, entities, buildings, inventory, inventoryRevision, events,
    occupancy: buildings.map(b => ({ entityId: b.id, x: b.x, z: b.z, radius: b.radius ?? 0 })),
  });
  validateWorldState(state); return immutableData(state);
}
export function validateWorldState(state) {
  plainData(state);
  if (state.schema !== WORLD_STATE_SCHEMA || typeof state.id !== 'string' || !Number.isSafeInteger(state.revision) || state.revision < 0 || !Number.isSafeInteger(state.inventoryRevision) || state.inventoryRevision < 0) throw new TypeError('invalid world schema or revisions');
  if (!state.authority?.owner || !state.authority.domain || !Number.isSafeInteger(state.authority.epoch) || state.authority.epoch < 0) throw new TypeError('invalid world authority');
  for (const key of ['entities','buildings','events','occupancy']) if (!Array.isArray(state[key])) throw new TypeError(`invalid world ${key}`);
  for (const collection of [state.entities,state.buildings]) if (new Set(collection.map(e=>e.id)).size !== collection.length || collection.some(e=>!e.id)) throw new TypeError('duplicate or missing entity id');
  for (const b of state.buildings) if (![b.x,b.y,b.z,b.rotation,b.radius??0].every(Number.isFinite) || (b.radius??0)<0) throw new TypeError('invalid world transform');
  if (Object.values(state.inventory).some(v=>!Number.isFinite(v)||v<0)) throw new TypeError('invalid world inventory');
  const expected = state.buildings.map(b=>({entityId:b.id,x:b.x,z:b.z,radius:b.radius??0}));
  if (state.occupancy.length!==expected.length || state.occupancy.some((entry,i)=>Object.keys(expected[i]).some(key=>entry[key]!==expected[i][key]))) throw new TypeError('occupancy must match buildings');
  for (const b of state.buildings) { const entity=state.entities.find(e=>e.id===b.id), transform=entity?.components?.transform; if(!transform||['x','y','z','rotation'].some(key=>transform[key]!==b[key]))throw new TypeError('entity transform must match building'); }
  if(state.events.some(e=>typeof e.type!=='string'||!e.type))throw new TypeError('invalid gameplay event');
  return state;
}
export function serializeWorldState(state) { validateWorldState(state); return JSON.stringify(state); }
export function restoreWorldState(serialized) { const state=JSON.parse(serialized); validateWorldState(state); return immutableData(state); }
