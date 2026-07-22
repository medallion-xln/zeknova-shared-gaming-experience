/* Node test for azl/zeknova-adapter.js.
 *
 * Loads the buildless global-namespace adapter (no AZL engine required -- the
 * adapter ships a self-contained Util fallback), then verifies the sim contract
 * and drives one 400-sim UCT MCTS end-to-end through the adapter's own surface.
 *
 * Run: node tests/azl-zeknova-adapter.test.js   (also wired into run-node-tests.js)
 */
'use strict';
const fs = require('fs');
const path = require('path');

// ----- load the adapter into this global (it attaches to globalThis.AZL_ADAPTER) -----
const src = fs.readFileSync(path.join(__dirname, '..', 'azl', 'zeknova-adapter.js'), 'utf8');
(0, eval)(src);
const adapter = globalThis.AZL_ADAPTER;
const sim = adapter.sim;

let failures = 0;
function ok(name, cond, detail) {
  if (cond) { console.log('  PASS ' + name); }
  else { failures++; console.error('  FAIL ' + name + (detail ? ' -- ' + detail : '')); }
}

// deterministic RNG matching the adapter's fallback (.next/.int) so seeds line up.
function RNG(seed) { this.s = (seed >>> 0) || 1; }
RNG.prototype.next = function () { let x = this.s; x ^= x << 13; x ^= x >>> 17; x ^= x << 5; this.s = x >>> 0; return this.s / 4294967296; };
RNG.prototype.int = function (n) { return Math.floor(this.next() * n); };

function hashState(s) {
  // stable structural hash over the numeric/categorical fields.
  const parts = [s.t, s.score.toFixed(6), s.phase, s.threat.toFixed(6), s.tension.toFixed(6),
    s.missionProgress.toFixed(6), s.diplomacyOutcome, s.currentAO, s.completedAOs.join('|'), s.missionTargets.join('|')];
  for (const k of Object.keys(s.resources).sort()) parts.push(k + ':' + s.resources[k].toFixed(6));
  for (const k of Object.keys(s.indicators).sort()) parts.push(k + ':' + s.indicators[k].toFixed(6));
  for (const k of Object.keys(s.buildings).sort()) parts.push(k + '#' + s.buildings[k]);
  let h = 2166136261;
  const str = parts.join(',');
  for (let i = 0; i < str.length; i++) { h = Math.imul(h ^ str.charCodeAt(i), 16777619) >>> 0; }
  return h >>> 0;
}

const N = adapter.actions.length;
console.log('adapter id=%s version=%d actions=%d features=%d safeIdx=%d',
  adapter.id, adapter.version, N, adapter.baseFeatureSpec.length, adapter.safeActionIndex);

// --- contract sanity ---
ok('has 13 actions with {key,label}', N === 13 && adapter.actions.every(a => a.key && a.label));
ok('baseFeatureSpec well-formed', adapter.baseFeatureSpec.every(f => f.key && f.max > f.min && f.def >= f.min - 1e-9 && f.def <= f.max + 1e-9));
ok('safeActionIndex in range', adapter.safeActionIndex >= 0 && adapter.safeActionIndex < N);
ok('oracleGroups reference valid indices', Object.values(adapter.oracleGroups).flat().every(i => i >= 0 && i < adapter.baseFeatureSpec.length));

// --- 1. 200 random-action steps without throwing ---
(function () {
  let threw = null;
  try {
    const rng = new RNG(12345);
    let s = sim.init(7);
    const mask = new Uint8Array(N);
    for (let i = 0; i < 200; i++) {
      sim.legalMask(s, mask);
      const legal = []; for (let a = 0; a < N; a++) if (mask[a]) legal.push(a);
      const act = legal[rng.int(legal.length)];
      const res = sim.step(s, act, rng);
      if (res.terminal) s = sim.init(7 + i); // restart on terminal, keep stepping
    }
  } catch (e) { threw = e; }
  ok('200 random steps do not throw', threw === null, threw && threw.stack);
})();

// --- 2. clone isolation: mutating a clone leaves the original untouched ---
(function () {
  const s = sim.init(1);
  const before = hashState(s);
  const c = sim.clone(s);
  const rng = new RNG(999);
  const mask = new Uint8Array(N);
  for (let i = 0; i < 25; i++) {
    sim.legalMask(c, mask);
    const preferred = i % N;
    const action = mask[preferred]
      ? preferred
      : Array.from(mask).findIndex(Boolean);
    sim.step(c, action, rng);
  }
  ok('clone isolation (original unchanged after mutating clone)', hashState(s) === before);
  ok('clone diverged from original', hashState(c) !== before);
  // deep-copy proof: nested objects are distinct references
  ok('clone deep-copies nested objects', c.resources !== s.resources && c.buildings !== s.buildings && c.missionTargets !== s.missionTargets);
})();

// --- 2b. adapter v2 rejects illegal actions instead of mutating state ---
(function () {
  const s = sim.init(2);
  const rng = new RNG(101);
  const buildPower = adapter.actions.findIndex((action) => action.key === 'build_power');
  let rejected = false;
  try { sim.step(s, buildPower, rng); }
  catch (error) { rejected = /Illegal action/.test(String(error?.message)); }
  ok('illegal actions are rejected without fallback mutation', rejected);
})();

// --- 3. determinism: same seed + same action sequence -> same state hash ---
(function () {
  const seq = [];
  const seqRng = new RNG(555);
  for (let i = 0; i < 60; i++) seq.push(seqRng.int(N));
  function run() {
    const rng = new RNG(24680);
    let s = sim.init(3);
    const mask = new Uint8Array(N);
    for (let i = 0; i < seq.length; i++) {
      sim.legalMask(s, mask);
      const a = mask[seq[i]] ? seq[i] : adapter.safeActionIndex;
      sim.step(s, a, rng);
    }
    return hashState(s);
  }
  ok('determinism (same seed + sequence -> identical hash)', run() === run());
})();

// --- 4. legalMask never returns all-zeros ---
(function () {
  const rng = new RNG(4242);
  let allNonEmpty = true, sawSafe = true;
  let s = sim.init(9);
  const mask = new Uint8Array(N);
  for (let i = 0; i < 300; i++) {
    sim.legalMask(s, mask);
    let sum = 0; for (let a = 0; a < N; a++) sum += mask[a];
    if (sum === 0) allNonEmpty = false;
    if (!mask[adapter.safeActionIndex]) sawSafe = false;
    const legal = []; for (let a = 0; a < N; a++) if (mask[a]) legal.push(a);
    const res = sim.step(s, legal[rng.int(legal.length)], rng);
    if (res.terminal) s = sim.init(9 + i);
  }
  ok('legalMask never all-zeros', allNonEmpty);
  ok('safeActionIndex always legal', sawSafe);
})();

// --- 5. health and heuristicValue stay within [-1,1] ---
(function () {
  const rng = new RNG(31415);
  let inRange = true, hvRange = true;
  let s = sim.init(11);
  const mask = new Uint8Array(N);
  const feats = new Float32Array(adapter.baseFeatureSpec.length);
  const scores = new Float32Array(N);
  for (let i = 0; i < 400; i++) {
    const h = sim.health(s), hv = sim.heuristicValue(s);
    if (!(h >= -1 && h <= 1)) inRange = false;
    if (!(hv >= -1 && hv <= 1)) hvRange = false;
    sim.toBaseFeatures(s, feats);      // must not throw / must fill array
    sim.actionScores(s, scores);
    sim.legalMask(s, mask);
    const legal = []; for (let a = 0; a < N; a++) if (mask[a]) legal.push(a);
    const res = sim.step(s, legal[rng.int(legal.length)], rng);
    if (res.terminal) s = sim.init(11 + i);
  }
  ok('health() stays in [-1,1]', inRange);
  ok('heuristicValue() stays in [-1,1]', hvRange);
  const featsFinite = feats.every(v => Number.isFinite(v));
  ok('toBaseFeatures writes finite values', featsFinite);
})();

// --- 5b. terminalValue always in [-1,1] ---
(function () {
  const rng = new RNG(2718);
  let tvRange = true;
  let s = sim.init(13);
  const mask = new Uint8Array(N);
  for (let i = 0; i < SESSION_probe(); i++) {
    sim.legalMask(s, mask);
    const legal = []; for (let a = 0; a < N; a++) if (mask[a]) legal.push(a);
    const res = sim.step(s, legal[rng.int(legal.length)], rng);
    if (!(res.terminalValue >= -1 && res.terminalValue <= 1)) tvRange = false;
    if (res.terminal) s = sim.init(13 + i);
  }
  ok('terminalValue stays in [-1,1]', tvRange);
  function SESSION_probe() { return 500; }
})();

// --- entities contract ---
(function () {
  const s = sim.init(5);
  const rng = new RNG(77);
  const mask = new Uint8Array(N);
  for (let i = 0; i < 20; i++) {
    sim.legalMask(s, mask);
    const preferred = i % N;
    const action = mask[preferred]
      ? preferred
      : Array.from(mask).findIndex(Boolean);
    sim.step(s, action, rng);
  }
  const ents = sim.entities(s);
  const shapeOk = Array.isArray(ents) && ents.length > 0 && ents.every(e =>
    typeof e.id === 'string' && typeof e.type === 'string' &&
    Number.isFinite(e.x) && Number.isFinite(e.y) &&
    e.threat >= 0 && e.threat <= 1 && typeof e.hostile === 'boolean' &&
    typeof e.critical === 'boolean' && Array.isArray(e.deps));
  ok('entities() returns valid entity records', shapeOk);
  ok('entities() includes a critical colony core', ents.some(e => e.id === 'colony' && e.critical));
})();

// --- 6. one 400-sim UCT MCTS end-to-end through the adapter contract ---
(function () {
  function mctsSearch(rootState, sims, maxDepth) {
    const mask = new Uint8Array(N);
    function makeNode(state, depth) {
      sim.legalMask(state, mask);
      const untried = []; for (let a = 0; a < N; a++) if (mask[a]) untried.push(a);
      return { state, depth, visits: 0, value: 0, children: new Map(), untried };
    }
    const root = makeNode(sim.clone(rootState), 0);
    const rng = new RNG(0xC0FFEE);
    const C = 1.35;
    for (let n = 0; n < sims; n++) {
      let node = root;
      let state = sim.clone(root.state);
      const pathTerminalValue = { v: null };
      // selection
      while (node.untried.length === 0 && node.children.size > 0 && node.depth < maxDepth) {
        let best = null, bestScore = -Infinity;
        node.children.forEach((child) => {
          const q = child.visits ? child.value / child.visits : 0;
          const u = C * Math.sqrt(Math.log(node.visits + 1) / (child.visits + 1));
          const sc = q + u;
          if (sc > bestScore) { bestScore = sc; best = child; }
        });
        const res = sim.step(state, best.actionId, rng);
        node = best;
        if (res.terminal) { pathTerminalValue.v = res.terminalValue; break; }
      }
      // expansion
      if (pathTerminalValue.v === null && node.untried.length > 0 && node.depth < maxDepth) {
        const a = node.untried.splice(rng.int(node.untried.length), 1)[0];
        const res = sim.step(state, a, rng);
        const child = makeNode(state, node.depth + 1);
        child.actionId = a;
        child.parent = node;
        node.children.set(a, child);
        node = child;
        if (res.terminal) pathTerminalValue.v = res.terminalValue;
      }
      // rollout (bounded, hand-policy via actionScores)
      let reward;
      if (pathTerminalValue.v !== null) {
        reward = pathTerminalValue.v;
      } else {
        const scores = new Float32Array(N);
        let d = node.depth;
        let rolloutState = state;
        while (d < maxDepth) {
          sim.legalMask(rolloutState, mask);
          sim.actionScores(rolloutState, scores);
          let bestA = -1, bestS = -Infinity;
          for (let a = 0; a < N; a++) if (mask[a] && scores[a] > bestS) { bestS = scores[a]; bestA = a; }
          if (bestA < 0) bestA = adapter.safeActionIndex;
          const res = sim.step(rolloutState, bestA, rng);
          d++;
          if (res.terminal) { reward = res.terminalValue; break; }
        }
        if (reward === undefined) reward = sim.health(rolloutState);
      }
      // backup (parent links are set at creation; root.parent is undefined)
      for (let c = node; c; c = c.parent) { c.visits++; c.value += reward; }
    }
    // pick most-visited root child
    let best = null, bestVisits = -1;
    root.children.forEach((child, a) => { if (child.visits > bestVisits) { bestVisits = child.visits; best = a; } });
    return { action: best, rootVisits: root.visits, childCount: root.children.size };
  }

  let threw = null, result = null;
  try {
    const root = adapter.sim.init(101);
    // warm the colony a little so the search has non-trivial legal options
    const warm = new RNG(1);
    for (let i = 0; i < 5; i++) adapter.sim.step(root, adapter.safeActionIndex, warm);
    result = mctsSearch(root, 400, 6);
  } catch (e) { threw = e; }
  ok('400-sim MCTS runs end-to-end without throwing', threw === null, threw && threw.stack);
  ok('400-sim MCTS returns a valid action', result && result.action != null && result.action >= 0 && result.action < N,
    result && JSON.stringify(result));
  if (result) console.log('  MCTS -> action %d (%s), rootVisits=%d, children=%d',
    result.action, adapter.actions[result.action].key, result.rootVisits, result.childCount);
})();

// --- 7. captureSearchState() reads a live-shaped game (the globalThis.ZekNovaGame hook) ---
(function () {
  // Mock the live zR instance exactly as the bundle exposes it via
  // `globalThis.ZekNovaGame = _s`, using the real field names captureSearchState reads.
  globalThis.ZekNovaGame = {
    simulation: {
      resources: { energy: 120, water: 90, minerals: 30, iron: 22, biomass: 60, timber: 40, data: 55, credits: 44, trust: 68 },
      indicators: { habitability: 55, ecology: 70, morale: 61, governance: 40, economy: 48, defense: 52, resilience: 54 },
      civilizationScore: 51, phase: 3
    },
    buildings: { countByType: function () { return { power: 2, water: 1, habitat: 1, research: 1, culture: 0, governance: 0, defense: 2, bridge: 1, boat: 0 }; } },
    enemies: [
      { userData: { guardian: false, health: 30 } },
      { userData: { guardian: false, health: 0 } },   // dead -> excluded
      { userData: { guardian: true, health: 40 } },    // guardian -> excluded
      { userData: { guardian: false, health: 12 } }
    ],
    diplomacyOutcome: 'negotiate', diplomacyTension: 33, specialAttackGauge: 40,
    currentAO: { id: 'highlands' }, completedAOs: ['forest', 'desert'],
    user: { officerClass: 'captain' },
    getAdvisorTelemetry: function () {
      const liveEnemies = this.enemies.filter((enemy) => !enemy.userData.guardian && enemy.userData.health > 0);
      return {
        version: 1,
        tick: 42,
        resources: { ...this.simulation.resources },
        indicators: { ...this.simulation.indicators },
        buildings: this.buildings.countByType(),
        score: this.simulation.civilizationScore,
        phase: this.simulation.phase,
        threat: liveEnemies.length * 8,
        diplomacyOutcome: this.diplomacyOutcome,
        diplomacyTension: this.diplomacyTension,
        enemyCount: liveEnemies.length,
        specialGauge: this.specialAttackGauge,
        currentAO: this.currentAO.id,
        completedAOs: [...this.completedAOs],
        officerClass: this.user.officerClass,
        officerBonus: 1.1,
        missionProgress: 25,
        missionTargets: ['power'],
        missionComplete: false,
        activeModifiers: {}
      };
    }
  };

  const s = adapter.captureSearchState();
  ok('captureSearchState maps live resources', s.resources.iron === 22 && s.resources.trust === 68);
  ok('captureSearchState maps live building counts', s.buildings.power === 2 && s.buildings.defense === 2 && s.buildings.bridge === 1);
  ok('captureSearchState counts only live hostile enemies (2 of 4)', s.threat === 2 * 8, 'threat=' + s.threat);
  ok('captureSearchState maps diplomacy + tension', s.diplomacyOutcome === 'negotiate' && s.tension === 33);
  ok('captureSearchState maps AO + completed', s.currentAO === 'highlands' && s.completedAOs.length === 2);
  ok('captureSearchState applies captain officer bonus', s.officerBonus === 1.1);
  ok('captureSearchState marks versioned live telemetry valid', s.telemetryValid === true);

  // the captured state must be a valid, steppable sim-state
  let stepThrew = null;
  try {
    const rng = new RNG(1234);
    const mask = new Uint8Array(N);
    for (let i = 0; i < 50; i++) {
      adapter.sim.legalMask(s, mask);
      const legal = []; for (let a = 0; a < N; a++) if (mask[a]) legal.push(a);
      adapter.sim.step(s, legal[rng.int(legal.length)], rng);
    }
  } catch (e) { stepThrew = e; }
  ok('captured live state is steppable', stepThrew === null, stepThrew && stepThrew.stack);

  // Player-facing adapter v2 fails closed when no live telemetry is available.
  globalThis.ZekNovaGame = null;
  let missingGameRejected = false;
  try { adapter.captureSearchState(); }
  catch (error) { missingGameRejected = /live game state is unavailable/.test(String(error?.message)); }
  ok('captureSearchState rejects missing live telemetry', missingGameRejected);
})();

console.log(failures === 0 ? '\nALL ZEKNOVA ADAPTER TESTS PASSED' : '\n' + failures + ' TEST(S) FAILED');
process.exit(failures === 0 ? 0 : 1);
