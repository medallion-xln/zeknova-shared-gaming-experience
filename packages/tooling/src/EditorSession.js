import { World, plainData, immutableData } from '../../core/src/index.js';

const identifier = value => typeof value === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9_.:-]{0,119}$/.test(value);
const reject = message => { throw new Error(message); };
const boundedData = value => {
  const data = plainData(value);
  if (JSON.stringify(data).length > 4 * 1024 * 1024) reject('tool-data-too-large');
  return data;
};
function validateScene(scene, world) {
  scene = boundedData(scene);
  if (scene.schema !== 'zge.scene.v1' || !identifier(scene.world?.id) || !Number.isSafeInteger(scene.world.revision) || scene.world.revision < 0 || !Array.isArray(scene.world.entities) || scene.world.entities.length > 10000) reject('invalid-scene');
  const ids = new Set();
  for (const entity of scene.world.entities) {
    if (!Number.isSafeInteger(entity.id) || entity.id < 1 || ids.has(entity.id) || typeof entity.label !== 'string' || !entity.components || Array.isArray(entity.components)) reject('invalid-entity');
    ids.add(entity.id);
    for (const type of Object.keys(entity.components)) if (!identifier(type) || !world.componentTypes.has(type)) reject('unregistered-component');
  }
  if (!Number.isSafeInteger(scene.world.nextEntityId) || scene.world.nextEntityId < 1 || [...ids].some(id => id >= scene.world.nextEntityId) || !scene.world.resources || Array.isArray(scene.world.resources)) reject('invalid-scene');
  const candidate = new World();
  for (const [type, validate] of world.componentTypes) candidate.registerComponent(type, validate);
  candidate.restore(scene.world); // Validate completely before touching the current world.
  return candidate.snapshot();
}

export function validateProjectManifest(value) {
  const project = boundedData(value);
  if (project.schema !== 'zge.project.v1' || !identifier(project.id) || !identifier(project.entryScene) || !Array.isArray(project.assets) || project.assets.length > 10000 || !Array.isArray(project.plugins) || project.plugins.some(id => !identifier(id)) || new Set(project.plugins).size !== project.plugins.length) reject('invalid-project');
  const ids = new Set();
  for (const asset of project.assets) {
    if (!identifier(asset.id) || ids.has(asset.id) || !['scene','prefab','model','texture','audio','data'].includes(asset.kind) || !/^[a-f0-9]{64}$/.test(asset.sha256) || typeof asset.path !== 'string' || asset.path.includes('\\') || asset.path.startsWith('/') || asset.path.split('/').some(part => !part || part === '.' || part === '..') || /[:\x00-\x1f]/.test(asset.path)) reject('invalid-asset');
    ids.add(asset.id);
  }
  if (!project.assets.some(asset => asset.id === project.entryScene && asset.kind === 'scene')) reject('missing-entry-scene');
  return immutableData(project);
}

/** In-process SDK boundary only. The embedding developer owns authentication.
 * No HTTP transport, gameplay authority bypass, filesystem access or production
 * command registration is installed. A live-authority session is inspection-only.
 */
export class EditorSession {
  #engine; #authorize; #principal; #sandbox; #project = null;
  constructor({ engine, principal, authorize = () => false, enabled = false, authority = 'inspect' } = {}) {
    if (!enabled || !engine?.world || typeof authorize !== 'function' || !principal || !['inspect','sandbox'].includes(authority)) reject('local-tools-disabled');
    this.#engine = engine; this.#authorize = authorize; this.#principal = immutableData(principal); this.#sandbox = authority === 'sandbox';
    if (this.#sandbox && engine.clock.mode !== 'owned') reject('sandbox-requires-owned-clock');
  }
  #allow(capability, mutate = false, paused = false) {
    if (this.#authorize(this.#principal, capability) !== true) reject('tool-permission-denied');
    if (mutate && (!this.#sandbox || this.#engine.clock.mode !== 'owned')) reject('inspection-only-authority');
    if (paused && !this.#engine.clock.paused) reject('pause-required');
  }
  #worldData() {
    const world=this.#engine.world;
    // Validate before the generic core snapshot's lossy JSON compatibility
    // conversion; authoring must never silently replace callbacks or NaN.
    return boundedData({id:world.id,revision:world.revision,nextEntityId:world.nextEntityId,entities:[...world.entities.values()].map(entity=>({id:entity.id,label:entity.label,components:Object.fromEntries(entity.components)})),resources:Object.fromEntries(world.resources)});
  }
  saveScene() { this.#allow('scene.read'); return immutableData({ schema: 'zge.scene.v1', world: this.#worldData() }); }
  loadScene(scene) { this.#allow('scene.write', true, true); const snapshot = validateScene(scene, this.#engine.world); this.#engine.world.restore(snapshot); return immutableData({ id:snapshot.id, revision:snapshot.revision }); }
  inspectEntity(id) { this.#allow('entity.read'); const entity = this.#engine.world.entities.get(id); return entity ? immutableData({ id, label: entity.label, components: Object.fromEntries(entity.components) }) : null; }
  inspectComponent(id, type) { this.#allow('component.read'); const value = this.#engine.world.getComponent(id, type); return value === undefined ? null : immutableData(value); }
  snapshot() { this.#allow('world.read'); return immutableData(this.#worldData()); }
  metrics() { this.#allow('metrics.read'); return immutableData(boundedData(this.#engine.diagnostics())); }
  serializePrefab(id, assetIds = []) {
    this.#allow('prefab.read'); const entity = this.#engine.world.entities.get(id); if (!entity) reject('missing-entity');
    if (!Array.isArray(assetIds) || new Set(assetIds).size !== assetIds.length || assetIds.some(asset => !this.#project?.assets.some(entry => entry.id === asset))) reject('unknown-asset');
    return immutableData({ schema: 'zge.prefab.v1', label: entity.label, components: Object.fromEntries(entity.components), assetIds });
  }
  instantiatePrefab(prefab) {
    this.#allow('prefab.write', true, true); prefab = boundedData(prefab);
    if (prefab.schema !== 'zge.prefab.v1' || typeof prefab.label !== 'string' || !prefab.components || Array.isArray(prefab.components) || !Array.isArray(prefab.assetIds) || prefab.assetIds.some(asset => !this.#project?.assets.some(entry => entry.id === asset))) reject('invalid-prefab');
    for (const [type, value] of Object.entries(prefab.components)) if (!this.#engine.world.componentTypes.get(type)?.(value)) reject('invalid-component');
    const id = this.#engine.world.createEntity(prefab.label); for (const [type, value] of Object.entries(prefab.components)) this.#engine.world.addComponent(id, type, value); return id;
  }
  setComponent(id, type, value) { this.#allow('debug.write', true, true); value = boundedData(value); if (!this.#engine.world.componentTypes.has(type)) reject('unregistered-component'); this.#engine.world.addComponent(id, type, value); }
  pause() { this.#allow('simulation.control', true); return this.#engine.pause(); }
  resume() { this.#allow('simulation.control', true); return this.#engine.resume(); }
  step(count = 1) { this.#allow('simulation.control', true, true); if (!Number.isSafeInteger(count) || count < 1 || count > 120) reject('invalid-step-count'); return this.#engine.step(count); }
  registerPlugin(plugin) { this.#allow('plugin.register', true); if (!this.#engine.lifecycle.is('created')) reject('register-before-initialize'); this.#engine.use(plugin); }
  setProject(project) { this.#allow('project.write', true); this.#project = validateProjectManifest(project); return this.#project; }
  project() { this.#allow('project.read'); return this.#project; }
}
