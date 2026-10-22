/**
 * World — minimal entity/component/resource store. Plain data only; no
 * rendering objects. Enough to prove the kernel can initialise and tick an
 * empty world, serialise it, and host engine-owned resources. Richer ECS
 * features (archetypes, queries with filters) are ZGE-02+.
 */
export class World {
  constructor({ id = "world" } = {}) {
    this.id = id; this.nextEntityId = 1;
    /** @type {Map<number, { id: number, label: string, components: Map<string, any> }>} */ this.entities = new Map();
    /** @type {Map<string, Set<number>>} */ this.byComponent = new Map();
    /** @type {Map<string, any>} */ this.resources = new Map();
    this.revision = 0; this.componentTypes = new Map();
  }
  registerComponent(type, validate = () => true) { if (this.componentTypes.has(type)) throw new Error(`duplicate component ${type}`); this.componentTypes.set(type, validate); return () => this.componentTypes.delete(type); }
  createEntity(label = "") { const id = this.nextEntityId++; this.entities.set(id, { id, label, components: new Map() }); this.revision += 1; return id; }
  destroyEntity(id) {
    const entity = this.entities.get(id); if (!entity) return false;
    for (const type of entity.components.keys()) this.byComponent.get(type)?.delete(id);
    this.entities.delete(id); this.revision += 1; return true;
  }
  hasEntity(id) { return this.entities.has(id); }
  addComponent(id, type, data = {}) {
    const entity = this.entities.get(id); if (!entity) throw new RangeError(`entity ${id} does not exist`);
    if (typeof type !== "string" || !type) throw new TypeError("component type must be a non-empty string");
    if (this.componentTypes.has(type) && !this.componentTypes.get(type)(data)) throw new TypeError(`invalid component ${type}`);
    entity.components.set(type, data); if (!this.byComponent.has(type)) this.byComponent.set(type, new Set()); this.byComponent.get(type).add(id);
    this.revision += 1; return data;
  }
  getComponent(id, type) { return this.entities.get(id)?.components.get(type); }
  removeComponent(id, type) { const entity = this.entities.get(id); if (!entity?.components.delete(type)) return false; this.byComponent.get(type)?.delete(id); this.revision += 1; return true; }
  *query(...types) {
    if (types.length === 0) { yield* this.entities.keys(); return; }
    const [first, ...rest] = types; const seed = this.byComponent.get(first); if (!seed) return;
    for (const id of seed) { const entity = this.entities.get(id); if (rest.every((t) => entity.components.has(t))) yield id; }
  }
  setResource(name, value) { this.resources.set(name, value); this.revision += 1; return value; }
  getResource(name) { return this.resources.get(name); }
  hasResource(name) { return this.resources.has(name); }
  deleteResource(name) { const ok = this.resources.delete(name); if (ok) this.revision += 1; return ok; }
  get entityCount() { return this.entities.size; }
  snapshot() {
    const entities = [...this.entities.values()].map((e) => ({ id: e.id, label: e.label, components: Object.fromEntries(e.components) }));
    const resources = {}; for (const [k, v] of this.resources) { try { resources[k] = JSON.parse(JSON.stringify(v)); } catch { resources[k] = { unserializable: true }; } }
    return JSON.parse(JSON.stringify({ id: this.id, revision: this.revision, nextEntityId: this.nextEntityId, entities, resources }));
  }
  restore(snapshot) {
    snapshot = structuredClone(snapshot);
    this.clear(); this.id = snapshot.id ?? this.id; this.nextEntityId = snapshot.nextEntityId ?? 1;
    for (const e of snapshot.entities ?? []) { this.entities.set(e.id, { id: e.id, label: e.label ?? "", components: new Map() }); for (const [type, data] of Object.entries(e.components ?? {})) this.addComponent(e.id, type, data); }
    for (const [k, v] of Object.entries(snapshot.resources ?? {})) this.resources.set(k, v);
    this.revision = snapshot.revision ?? this.revision; return this;
  }
  clear() { this.entities.clear(); this.byComponent.clear(); this.resources.clear(); this.revision += 1; }
}
