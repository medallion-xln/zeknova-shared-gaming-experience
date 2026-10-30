import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {Vector3, MathUtils} from '../../assets/vendor/three.module.min.js';

export const deferred = () => {
  let resolve, reject;
  const promise = new Promise((a, b) => { resolve = a; reject = b; });
  return {promise, resolve, reject};
};
export const flush = () => new Promise(resolve => setImmediate(resolve));

// Executes verbatim implementation slices. Only collaborators (assets, world, clock)
// are fixtures. Unique markers fail closed if source boundaries change.
export function slice(source, start, end) {
  const at = source.indexOf(start);
  assert.ok(at >= 0 && source.indexOf(start, at + 1) < 0, `unique start: ${start}`);
  const stop = source.indexOf(end, at + start.length);
  assert.ok(stop > at, `end: ${end}`);
  return source.slice(at, stop);
}
export async function runtimeText() {
  return readFile(new URL('../../artifacts/runtime-reconstruction/index-reconstructed.js', import.meta.url), 'utf8');
}

// `realClass` replaces the zkAODispose fixture with the verbatim class `dispose()` method and the
// verbatim `disposed=!1` field initializer from segment 03, run inside a minimal class shell. The
// full zR constructor (renderer, DOM, WebGL) is NOT instantiated; its browser globals are stubs.
// `installProductionChain()` then layers the verbatim segment 04 staged wrapper and segment 06
// outer wrappers so initialize()/loadAOEnvironment()/dispose() run the same chain as the artifact.
export async function startupHarness({hq = Promise.resolve(), ready = Promise.resolve(), importing = null, importError = null, initializeError = null, realClass = false} = {}) {
  const source = await runtimeText();
  const timers = new Map(); let time = 0, next = 0;
  const scheduled = [], logs = [];
  const stats = {imports: 0, created: 0, added: 0, disposed: 0, updates: 0, warnings: 0, playerDisposed: 0, rebuilds: 0, initializes: 0, monitorStarts: 0};
  class Runtime {}
  const children = new Set();
  const newGame = (Class = context.zR) => {
    const instance = new Class();
    Object.assign(instance, {
      terrain: {worldVillageObstacles: [], rebuildWorldObstacleIndexes() { stats.rebuilds++; }},
      scene: {add(group) { children.add(group); stats.added++; }, traverse() {}},
      player: {hqReady: hq, group: {position: new Vector3()}, dispose() { stats.playerDisposed++; }},
      startGraphicsQualityMonitor() { stats.monitorStarts++; },
    });
    return instance;
  };
  const context = vm.createContext({
    zR: Runtime, zkAreasOfOperation: [], zkAOPlacements: [], zkAOAt: () => null,
    zkAOInitialize: async () => { stats.initializes++; if (initializeError) throw initializeError; return 'initialized'; },
    zkAODispose() { this.disposed = true; children.clear(); }, zkLoadAOState() {},
    console: {info(message) { logs.push(String(message)); }, warn() { stats.warnings++; }},
    setTimeout(fn, ms) { const id = ++next; scheduled.push({ms, at: time}); timers.set(id, {at: time + ms, fn}); return id; },
    cancelAnimationFrame() {}, window: {clearInterval() {}, clearTimeout() {}, removeEventListener() {}},
    document: {removeEventListener() {}}, R: class {},
  });
  if (realClass) {
    const fields = slice(source, 'lastHudUpdate=0;disposed=!1;', 'harvestedTreeIds').slice('lastHudUpdate=0;'.length);
    const method = slice(source, 'dispose(){this.disposed=!0,', '\n');
    context.zR = new vm.Script(`(class zR{${fields}${method}})`).runInContext(context);
    context.zkAODispose = context.zR.prototype.dispose;
  }
  const game = newGame();
  const module = new vm.SyntheticModule(['createAreaEnvironment'], function() {
    this.setExport('createAreaEnvironment', () => {
      stats.created++;
      const group = {};
      return {group, ready, update() { stats.updates++; }, dispose() { stats.disposed++; children.delete(group); }};
    });
  }, {context});
  await module.link(() => { throw Error('unexpected environment dependency'); });
  await module.evaluate();
  const importModuleDynamically = async specifier => {
    assert.equal(specifier, './environment-runtime.js?v=wetlands-village2'); stats.imports++;
    if (importing) await importing;
    if (importError) throw importError;
    return module;
  };
  const load = slice(source, 'zR.prototype.loadAOEnvironment=async function(hqWaitComplete=', '\n');
  const init = slice(source, 'zR.prototype.initialize=async function(){let e;', ';zR.prototype.dispose=function');
  const dispose = slice(source, 'zR.prototype.dispose=function(){this.aoEnvironmentLoadToken=', '\n');
  new vm.Script(load + '\n' + init + ';\n' + dispose, {importModuleDynamically}).runInContext(context);
  return {
    game, stats, children, scheduled, logs, newGame, now: () => time,
    installProductionChain() {
      context.zkDisableEnvironment = false;
      new vm.Script(slice(source, 'function zkAssetPause(', '\n')).runInContext(context);
      new vm.Script(slice(source, 'const zkImmediateAOEnvironmentLoad=zR.prototype.loadAOEnvironment;', '\n'), {importModuleDynamically}).runInContext(context);
      const tail = 'return zkAdaptiveDispose.call(this)};';
      new vm.Script(slice(source, 'const zkQualityEnvironmentLoad=zR.prototype.loadAOEnvironment;', tail) + tail).runInContext(context);
    },
    installStagedWrapper() {
      context.zkDisableEnvironment = false;
      context.zkAssetPause = ms => new Promise(resolve => context.setTimeout(resolve, ms));
      new vm.Script(slice(source, 'const zkImmediateAOEnvironmentLoad=zR.prototype.loadAOEnvironment;', '\n'), {importModuleDynamically}).runInContext(context);
    },
    async advance(ms) {
      time += ms;
      for (const [id, timer] of timers) if (timer.at <= time) { timers.delete(id); timer.fn(); }
      await flush();
    },
  };
}

export async function juggernautHarness() {
  const source = await runtimeText();
  const stats = {impacts: 0, disposed: 0, removed: 0};
  const context = vm.createContext({
    w: Vector3, Kt: MathUtils, performance: {now: () => 0},
    zkJuggernautSetRing() {}, zkInterruptMarine() {}, zkJuggernautSiegeImpact() {}, eo: [],
  });
  for (const name of ['zkJuggernautCrash', 'zkJuggernautChargeCollision', 'zkUpdateHostileJuggernaut', 'zkDisposeJuggernautModel']) {
    new vm.Script(slice(source, `function ${name}(`, '\n')).runInContext(context);
  }
  const actor = () => ({position: new Vector3(), userData: {
    health: 100, juggernautState: 'charge', stateTimer: 1.55, chargeDirection: new Vector3(0, 0, 1),
  }});
  const enemy = actor();
  const game = {
    player: {group: {position: new Vector3(100, 0, 100)}}, buildings: {records: []}, enemies: [enemy],
    terrain: {heightAt: () => 0, nearby: () => [], isWaterAt: () => false, isObstacleAt: () => false},
    ui: {showToast() {}}, spawnImpactPulse() { stats.impacts++; },
  };
  return {game, enemy, actor, stats,
    step: dt => context.zkUpdateHostileJuggernaut(game, enemy, dt),
    cleanup: () => context.zkDisposeJuggernautModel(enemy),
    model() { return {root: {scale: new Vector3(1, 1, 1), position: new Vector3(), removeFromParent() { stats.removed++; }}, dispose() { stats.disposed++; }}; },
  };
}
