/* ZekNova AlphaZero-lite engine.
 *
 * This is an inference-only, browser-safe implementation: a small
 * mixture-of-experts policy supplies priors to a PUCT tree search while the
 * ZekNova adapter supplies the forward model and value signals. It does not
 * claim to be a trained AlphaZero neural network.
 */
(function (g) {
  'use strict';

  var AZL = g.AZL || (g.AZL = {});
  var clamp = function (value, min, max) { return Math.max(min, Math.min(max, Number(value) || 0)); };

  function RNG(seed) { this.s = (seed >>> 0) || 1; }
  RNG.prototype.next = function () {
    var x = this.s; x ^= x << 13; x ^= x >>> 17; x ^= x << 5;
    this.s = x >>> 0;
    return this.s / 4294967296;
  };

  function hashState(state) {
    var text = JSON.stringify(state), hash = 2166136261;
    for (var i = 0; i < text.length; i++) hash = Math.imul(hash ^ text.charCodeAt(i), 16777619) >>> 0;
    return hash >>> 0;
  }

  function normalizeWeights(weights) {
    var total = 0, key;
    for (key in weights) total += Math.max(0.01, weights[key]);
    for (key in weights) weights[key] = Math.max(0.01, weights[key]) / total;
    return weights;
  }

  function expertRoute(state) {
    var resources = state.resources || {}, indicators = state.indicators || {}, buildings = state.buildings || {};
    var defenseGap = Math.max(0, Number(state.threat || 0) - Number(indicators.defense || 0));
    var resourcePressure = [resources.iron / 18, resources.minerals / 55, resources.credits / 28, resources.biomass / 30]
      .reduce(function (lowest, value) { return Math.min(lowest, clamp(value, 0, 1)); }, 1);
    var utilityGap = (buildings.power ? 0 : 0.6) + (buildings.water ? 0 : 0.4) + Math.max(0, 45 - Number(indicators.habitability || 0)) / 80;
    return normalizeWeights({
      survival: 0.15 + clamp(defenseGap / 70, 0, 0.85),
      infrastructure: 0.18 + clamp(utilityGap, 0, 0.9),
      economy: 0.15 + (1 - resourcePressure) * 0.75,
      diplomacy: 0.1 + clamp((Number(state.tension || 0) - 35) / 65, 0, 0.9),
      ecology: 0.08 + clamp((65 - Number(indicators.ecology || 0)) / 65, 0, 0.65),
      mission: 0.2 + clamp((100 - Number(state.missionProgress || 0)) / 130, 0, 0.75)
    });
  }

  function expertScores(adapter, state, legal) {
    var keys = adapter.actions.map(function (action) { return action.key; });
    var scores = {};
    function blank() { return new Float64Array(keys.length); }
    scores.survival = blank(); scores.infrastructure = blank(); scores.economy = blank();
    scores.diplomacy = blank(); scores.ecology = blank(); scores.mission = blank();
    function add(expert, key, amount) { var i = keys.indexOf(key); if (i >= 0) scores[expert][i] += amount; }

    add('survival', 'contain_threats', 3.4); add('survival', 'build_defense', 2.8); add('survival', 'build_habitat', 0.5);
    add('infrastructure', 'build_power', state.buildings.power ? 0.7 : 3.8);
    add('infrastructure', 'build_water', state.buildings.water ? 0.8 : 3.3);
    add('infrastructure', 'build_habitat', 2.5); add('infrastructure', 'build_research', 1.6); add('infrastructure', 'build_crossing', 1.1);
    add('economy', 'mine_iron', state.resources.iron < 18 ? 3.8 : 1.2);
    add('economy', 'recover_materials', state.resources.minerals < 55 ? 3.4 : 1.1);
    add('economy', 'harvest_timber', state.resources.timber < 35 ? 2.7 : 0.7);
    add('economy', 'build_research', 0.9); add('economy', 'build_governance', 0.7);
    add('diplomacy', 'stabilize_relations', 4.2); add('diplomacy', 'build_culture', 2.2); add('diplomacy', 'build_governance', 1.5);
    add('ecology', 'build_water', 2.2); add('ecology', 'build_culture', 3.3); add('ecology', 'harvest_timber', -2.8);
    var targets = Array.isArray(state.missionTargets) ? state.missionTargets : [];
    var targetActions = { power: 'build_power', water: 'build_water', habitat: 'build_habitat', defense: 'build_defense', research: 'build_research', culture: 'build_culture', governance: 'build_governance', bridge: 'build_crossing', boat: 'build_crossing' };
    targets.forEach(function (target) { if (targetActions[target]) add('mission', targetActions[target], 4.5); });
    if (!targets.length) { add('mission', 'build_power', 1.5); add('mission', 'build_water', 1.4); add('mission', 'build_habitat', 1.2); }

    var routed = expertRoute(state), base = new Float32Array(keys.length);
    adapter.sim.actionScores(state, base);
    var logits = new Float64Array(keys.length), max = -Infinity;
    for (var i = 0; i < keys.length; i++) {
      if (!legal[i]) { logits[i] = -Infinity; continue; }
      var score = clamp(base[i], -20, 20) * 0.08;
      for (var expert in routed) score += routed[expert] * scores[expert][i];
      logits[i] = score; if (score > max) max = score;
    }
    var priors = new Float64Array(keys.length), total = 0;
    for (var j = 0; j < keys.length; j++) if (legal[j]) { priors[j] = Math.exp(logits[j] - max); total += priors[j]; }
    for (var k = 0; k < keys.length; k++) priors[k] = legal[k] ? priors[k] / Math.max(total, 1e-9) : 0;
    return { priors: priors, weights: routed };
  }

  function legalMask(adapter, state) {
    var mask = new Uint8Array(adapter.actions.length);
    adapter.sim.legalMask(state, mask);
    return mask;
  }

  function makeNode(adapter, state, parent, action, depth, prior) {
    var legal = legalMask(adapter, state), policy = expertScores(adapter, state, legal), unexpanded = [];
    for (var i = 0; i < legal.length; i++) if (legal[i]) unexpanded.push(i);
    unexpanded.sort(function (a, b) { return policy.priors[b] - policy.priors[a]; });
    return { state: state, parent: parent || null, action: action, depth: depth, prior: prior || 0, visits: 0, valueSum: 0, children: [], unexpanded: unexpanded, policy: policy };
  }

  function pickChild(node, cPuct) {
    var best = null, bestScore = -Infinity, root = Math.sqrt(node.visits + 1);
    for (var i = 0; i < node.children.length; i++) {
      var child = node.children[i], q = child.visits ? child.valueSum / child.visits : 0;
      var score = q + cPuct * child.prior * root / (1 + child.visits);
      if (score > bestScore) { bestScore = score; best = child; }
    }
    return best;
  }

  function chooseRolloutAction(adapter, state, rng) {
    var legal = legalMask(adapter, state), policy = expertScores(adapter, state, legal).priors;
    if (rng.next() < 0.86) {
      var best = adapter.safeActionIndex, value = -1;
      for (var i = 0; i < policy.length; i++) if (policy[i] > value) { value = policy[i]; best = i; }
      return best;
    }
    var roll = rng.next(), sum = 0;
    for (var j = 0; j < policy.length; j++) { sum += policy[j]; if (roll <= sum) return j; }
    return adapter.safeActionIndex;
  }

  function leafValue(adapter, state) {
    return clamp(adapter.sim.heuristicValue(state) * 0.72 + adapter.sim.health(state) * 0.28, -1, 1);
  }

  function principalVariation(adapter, root, maxLength) {
    var line = [], node = root;
    while (node.children.length && line.length < maxLength) {
      node = node.children.slice().sort(function (a, b) { return b.visits - a.visits || b.valueSum / Math.max(1, b.visits) - a.valueSum / Math.max(1, a.visits); })[0];
      line.push(adapter.actions[node.action].label);
    }
    return line;
  }

  function search(adapter, rootState, options) {
    options = options || {};
    if (!adapter || !adapter.sim || !Array.isArray(adapter.actions)) throw new Error('A valid AZL adapter is required.');
    var started = (g.performance && g.performance.now ? g.performance.now() : Date.now());
    var simulations = clamp(options.simulations || 320, 64, 1200), maxDepth = clamp(options.depth || 7, 3, 12);
    var timeBudgetMs = clamp(options.timeBudgetMs || 55, 12, 500), minimumSimulations = Math.min(simulations, clamp(options.minimumSimulations || 96, 32, simulations));
    var cPuct = clamp(options.cPuct || 1.45, 0.4, 4), rng = new RNG(options.seed || hashState(rootState));
    var root = makeNode(adapter, adapter.sim.clone(rootState), null, null, 0, 1), completed = 0;

    while (completed < simulations) {
      var now = (g.performance && g.performance.now ? g.performance.now() : Date.now());
      if (completed >= minimumSimulations && now - started >= timeBudgetMs) break;
      var node = root, terminalValue = null;
      while (!node.unexpanded.length && node.children.length && node.depth < maxDepth) node = pickChild(node, cPuct);
      if (node.unexpanded.length && node.depth < maxDepth) {
        var pick = rng.next() < 0.88 ? 0 : Math.floor(rng.next() * Math.min(3, node.unexpanded.length));
        var action = node.unexpanded.splice(pick, 1)[0], next = adapter.sim.clone(node.state);
        var transition = adapter.sim.step(next, action, rng);
        var child = makeNode(adapter, next, node, action, node.depth + 1, node.policy.priors[action]);
        node.children.push(child); node = child;
        if (transition && transition.terminal) terminalValue = transition.terminalValue;
      }
      var rollout = adapter.sim.clone(node.state), depth = node.depth;
      while (terminalValue === null && depth < maxDepth) {
        var rolloutAction = chooseRolloutAction(adapter, rollout, rng);
        var outcome = adapter.sim.step(rollout, rolloutAction, rng); depth++;
        if (outcome && outcome.terminal) terminalValue = outcome.terminalValue;
      }
      var value = terminalValue === null ? leafValue(adapter, rollout) : clamp(terminalValue, -1, 1);
      for (var cursor = node; cursor; cursor = cursor.parent) { cursor.visits++; cursor.valueSum += value; }
      completed++;
    }

    var ranked = root.children.map(function (child) {
      return { index: child.action, key: adapter.actions[child.action].key, label: adapter.actions[child.action].label, visits: child.visits, visitShare: child.visits / Math.max(1, root.visits), value: child.valueSum / Math.max(1, child.visits), prior: child.prior };
    }).sort(function (a, b) { return b.visits - a.visits || b.value - a.value; });
    var elapsed = (g.performance && g.performance.now ? g.performance.now() : Date.now()) - started;
    return { engine: 'AZL-MOE-PUCT', simulations: completed, depth: maxDepth, elapsedMs: elapsed, best: ranked[0] || null, ranked: ranked.slice(0, 5), principalVariation: principalVariation(adapter, root, 4), expertWeights: root.policy.weights, stateSource: rootState && rootState.seed === 0 && rootState.t === 0 ? 'fallback' : 'live' };
  }

  function formatResult(result, state) {
    if (!result || !result.best) return 'AZL could not identify a legal strategic action.';
    var confidence = Math.round(result.best.visitShare * 100), experts = Object.keys(result.expertWeights)
      .sort(function (a, b) { return result.expertWeights[b] - result.expertWeights[a]; }).slice(0, 2)
      .map(function (key) { return key.toUpperCase() + ' ' + Math.round(result.expertWeights[key] * 100) + '%'; }).join(' · ');
    var lines = [
      'AZL MOE + PUCT STRATEGIC SEARCH',
      'Primary action: ' + result.best.label + '.',
      'Confidence: ' + confidence + '% of root visits · dominant experts: ' + experts + '.',
      'Ranked alternatives:'
    ];
    result.ranked.slice(1, 4).forEach(function (item, index) { lines.push((index + 2) + '. ' + item.label + ' — ' + Math.round(item.visitShare * 100) + '% visits'); });
    if (result.principalVariation.length > 1) lines.push('Projected sequence: ' + result.principalVariation.join(' → ') + '.');
    lines.push('Search telemetry: ' + result.simulations + ' simulations · depth ' + result.depth + ' · ' + result.elapsedMs.toFixed(1) + ' ms · ' + result.stateSource + ' colony state.');
    lines.push('Current pressure: ' + Math.round(state.threat || 0) + ' · tension: ' + Math.round(state.tension || 0) + ' · colony score: ' + Math.round(state.score || 0) + '.');
    lines.push('Advisory only: SCOUT-01 will not move, spend resources, or place structures without your command.');
    return lines.join('\n');
  }

  AZL.StrategicEngine = { version: 1, search: search, formatResult: formatResult, expertRoute: expertRoute };
})(typeof self !== 'undefined' ? self : globalThis);
