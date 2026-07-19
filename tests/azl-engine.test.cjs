'use strict';

const fs = require('fs');
const path = require('path');
const assert = require('assert/strict');

function load(file) {
  const source = fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
  (0, eval)(source);
}

load('azl/zeknova-adapter.js');
load('azl/azl-engine.js');

const adapter = globalThis.AZL_ADAPTER;
const engine = globalThis.AZL.StrategicEngine;
assert(adapter, 'adapter registered');
assert(engine, 'engine registered');

const state = adapter.sim.init(17);
state.resources.minerals = 120;
state.resources.iron = 40;
state.resources.biomass = 100;
state.resources.credits = 70;
state.resources.data = 30;
state.missionTargets = ['power'];

const result = engine.search(adapter, state, { simulations: 180, minimumSimulations: 180, depth: 6, timeBudgetMs: 500, seed: 42 });
assert.equal(result.engine, 'AZL-MOE-PUCT');
assert.equal(result.simulations, 180);
assert(result.best && result.best.index >= 0 && result.best.index < adapter.actions.length);
assert(result.ranked.length >= 3);
assert(result.ranked.every((entry) => Number.isFinite(entry.value) && Number.isFinite(entry.visitShare)));
assert(Math.abs(Object.values(result.expertWeights).reduce((sum, value) => sum + value, 0) - 1) < 1e-9);
assert(result.principalVariation.length > 0);

const threatState = adapter.sim.clone(state);
threatState.threat = 120;
threatState.indicators.defense = 5;
const calmRoute = engine.expertRoute(state);
const threatRoute = engine.expertRoute(threatState);
assert(threatRoute.survival > calmRoute.survival, 'survival expert gains routing weight under threat');

const text = engine.formatResult(result, state);
assert.match(text, /AZL MOE \+ PUCT/);
assert.match(text, /Primary action:/);
assert.match(text, /Advisory only:/);

const workerSource = fs.readFileSync(path.join(__dirname, '..', 'azl', 'azl-worker.js'), 'utf8');
assert.match(workerSource, /importScripts\('\.\/zeknova-adapter\.js', '\.\/azl-engine\.js'\)/);

console.log('AZL MoE + PUCT engine checks passed.');
