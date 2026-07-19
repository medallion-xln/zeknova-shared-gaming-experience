/* AZL ZekNovaAdapter -- binds the AZL engine to the real ZekNova colony game.
 *
 * Deployment target: public_html/azl/zeknova-adapter.js  (sibling of the
 * ZekNova app at public_html/zeknova/). It is authored here, versioned with the
 * game it binds to, and served as a classic <script> into the page that also
 * runs the live ZekNova runtime so captureSearchState() can read live state.
 *
 * This implements the SAME contract as azl-ref-adapter.js, over REAL ZekNova
 * state and the game's own 13 strategic macro-actions. The forward model is a
 * faithful port of TWO pieces of the shipped bundle (assets/index-*.js):
 *   1. zkRunStrategicSearch's apply()/legal()/evaluate()  -- macro-action model
 *   2. the Simulation class update()                      -- passive economy +
 *      indicator recomputation + civilizationScore/phase derivation
 * so multi-step lookahead reflects infrastructure compounding, which the coarse
 * in-game planner (apply only) does not model.
 *
 * INTEGRATION HOOK REQUIRED (see docs/AZL_PHASE0_FINDINGS.md section 7):
 * the live game instance is the module-private `_s` in the bundle and is not
 * exposed. ZekNova must publish it for captureSearchState():
 *     // in kR(o): after `_s = new zR(...)`
 *     globalThis.ZekNovaGame = _s;          // and `globalThis.ZekNovaGame = null` on logout/dispose
 * Optionally also expose a telemetry accessor returning the askAdvisor context:
 *     _s.getAdvisorTelemetry = () => ({ ...same object askAdvisor builds... });
 * captureSearchState() prefers that accessor and degrades gracefully without it.
 *
 * No CSRF token exists in ZekNova; all endpoints use same-origin cookie
 * sessions (credentials:"include"). azl-auth-bridge.php must reuse the shared
 * Medallion session via bootstrap.php (zeknova_current_user()), NOT a token.
 */
(function (g) {
  'use strict';

  // AZL.Util is provided by the engine (main thread + worker). Fall back to a
  // self-contained equivalent so this file is testable standalone in Node.
  var AZL = g.AZL || (g.AZL = {});
  function makeUtil() {
    function RNG(seed) { this.s = (seed >>> 0) || 1; }
    RNG.prototype.next = function () { var x = this.s; x ^= x << 13; x ^= x >>> 17; x ^= x << 5; this.s = x >>> 0; return this.s / 4294967296; };
    RNG.prototype.int = function (n) { return Math.floor(this.next() * n); };
    RNG.prototype.state = function () { return this.s >>> 0; };
    return { RNG: RNG, clamp: function (v, a, b) { return Math.max(a, Math.min(b, Number(v) || 0)); } };
  }
  var U = AZL.Util || makeUtil();
  var clamp = U.clamp;
  function num(v) { return Number.isFinite(Number(v)) ? Number(v) : 0; }

  // ----- Tunable constants (documented; safe to adjust in Phase 1) -----
  var PROD_DT = 6;          // seconds of passive economy simulated per macro-action
  var SESSION_TICKS = 180;  // macro-decisions per strategic session before soft terminal
  var THREAT_GROWTH = { force: 2.2, negotiate: 0.4, share: -0.5, none: 0.6 };

  // ----- Public actions: order pins ACTION_SPACE_V. APPEND ONLY. -----
  // Ported verbatim from zkRunStrategicSearch (assets/index-*.js). Building
  // action target keys match countByType() (build-crossing -> 'bridge').
  var ACTIONS = [
    { key: 'mine_iron',          label: 'Mine two iron formations' },
    { key: 'harvest_timber',     label: 'Harvest three alien trees' },
    { key: 'recover_materials',  label: 'Recover field materials' },
    { key: 'contain_threats',    label: 'Contain nearby hostiles' },
    { key: 'stabilize_relations',label: 'Open a joint ZekNovan channel' },
    { key: 'build_power',        label: 'Deploy a Solar Grid' },
    { key: 'build_water',        label: 'Deploy connected Water Works' },
    { key: 'build_habitat',      label: 'Open a connected Habitat' },
    { key: 'build_defense',      label: 'Raise a Defense Beacon' },
    { key: 'build_research',     label: 'Activate an AI Research Lab' },
    { key: 'build_culture',      label: 'Establish a Creator Commons' },
    { key: 'build_governance',   label: 'Commission a Civic Hall' },
    { key: 'build_crossing',     label: 'Secure a river crossing' }
  ];
  // Parallel metadata (kept out of the public actions[] which is {key,label} only).
  var META = [
    { delta: { iron: 10, minerals: 4 } },
    { delta: { timber: 30, credits: 3 }, ecology: -2.4 },
    { delta: { minerals: 20, biomass: 12 } },
    { minThreat: 0.0001, delta: { credits: 2, trust: -1 }, threat: -18 },
    { minTension: 22, cost: { data: 5 }, delta: { trust: 8 }, tension: -12 },
    { build: 'power',      cost: { minerals: 24, iron: 8,  biomass: 8,  credits: 12 }, delta: { energy: 24 } },
    { build: 'water',      requires: { power: 1 }, cost: { minerals: 20, iron: 6, biomass: 12, credits: 10 }, delta: { water: 24 }, ecology: 3 },
    { build: 'habitat',    requires: { power: 1, water: 1 }, cost: { minerals: 28, iron: 10, biomass: 18, credits: 18 } },
    { build: 'defense',    requires: { power: 1 }, cost: { minerals: 34, iron: 14, energy: 10, credits: 20 }, threat: -8 },
    { build: 'research',   requires: { power: 1, water: 1 }, cost: { minerals: 32, iron: 12, energy: 8, credits: 24 }, delta: { data: 18 } },
    { build: 'culture',    requires: { power: 1, water: 1 }, cost: { minerals: 18, iron: 4, biomass: 20, credits: 16 }, delta: { trust: 5 }, ecology: 4 },
    { build: 'governance', requires: { power: 1, water: 1, research: 1 }, cost: { minerals: 30, iron: 10, data: 12, credits: 28 }, delta: { trust: 4 } },
    { build: 'bridge',     cost: { minerals: 20, iron: 8, credits: 5 } }
  ];
  var BUILD_KEYS = ['power', 'water', 'habitat', 'research', 'culture', 'governance', 'defense', 'bridge', 'boat'];
  var AO_KEYS = ['forest', 'desert', 'highlands', 'arctic', 'wetlands'];

  // ----- baseFeatureSpec: RAW ranges; codec normalizes to [-1,1] -----
  function mkSpec() {
    var s = [], push = function (k, mn, mx, df) { s.push({ key: k, min: mn, max: mx, def: df }); };
    // resources (9) -- defaults + realistic ranges from the Simulation class
    push('food_energy', 0, 300, 42); push('water', 0, 300, 38); push('minerals', 0, 400, 95);
    push('iron', 0, 120, 0); push('biomass', 0, 300, 72); push('timber', 0, 300, 0);
    push('data', 0, 200, 18); push('credits', 0, 150, 0); push('trust', 0, 100, 52);
    // indicators (7) -- all 0..100
    push('habitability', 0, 100, 12); push('ecology', 0, 100, 76); push('morale', 0, 100, 44);
    push('governance', 0, 100, 5); push('economy', 0, 100, 18); push('defense', 0, 100, 8); push('resilience', 0, 100, 14);
    // building counts (9) -- each 0..4 (planner caps builds at <4)
    for (var b = 0; b < BUILD_KEYS.length; b++) push('b_' + BUILD_KEYS[b], 0, 4, 0);
    // scalars (7)
    push('score', 0, 100, 8); push('phase', 1, 4, 1); push('threat', 0, 150, 0);
    push('tension', 0, 100, 50); push('missionProgress', 0, 100, 0); push('enemyCount', 0, 12, 0); push('specialGauge', 0, 100, 0);
    // derived rates (4)
    push('energyRate', -8, 12, 0); push('waterRate', -8, 12, 0); push('dataRate', 0, 8, 0); push('biomassRate', 0, 4, 0);
    // derived ratios (3)
    push('threatRatio', 0, 6, 0); push('tensionPressure', 0, 1, 0); push('buildDiversity', 0, 9, 0);
    // diplomacy one-hot (4)
    push('dip_none', 0, 1, 1); push('dip_share', 0, 1, 0); push('dip_negotiate', 0, 1, 0); push('dip_force', 0, 1, 0);
    // currentAO one-hot (5)
    for (var a = 0; a < AO_KEYS.length; a++) push('ao_' + AO_KEYS[a], 0, 1, 0);
    // completed AO count (1) + health scalar (1)
    push('completedAOCount', 0, 5, 0); push('healthC', -1, 1, 0);
    while (s.length < 56) push('pad' + s.length, 0, 1, 0);
    return s;
  }
  var SPEC = mkSpec();
  var IDX = {}; SPEC.forEach(function (f, i) { IDX[f.key] = i; });

  // ----- state factory: shape shared by init() and captureSearchState() -----
  function stateFromContext(ctx) {
    ctx = ctx || {};
    var res = ctx.resources || {}, ind = ctx.indicators || {}, bld = ctx.buildings || {};
    var dip = ctx.diplomacyOutcome || null;
    var enemyCount = num(ctx.enemyCount);
    var threat = ctx.threat != null ? num(ctx.threat) : enemyCount * 8 + (dip === 'force' ? 34 : 0);
    var tension = ctx.diplomacyTension != null ? num(ctx.diplomacyTension)
      : (dip === 'force' ? 85 : dip === 'share' ? 20 : dip === 'negotiate' ? 35 : 50);
    var s = {
      t: 0,
      officerBonus: ctx.officerClass === 'captain' ? 1.1 : 1,
      resources: {
        energy: res.energy != null ? num(res.energy) : 42,
        water: res.water != null ? num(res.water) : 38,
        minerals: res.minerals != null ? num(res.minerals) : 95,
        iron: num(res.iron), biomass: res.biomass != null ? num(res.biomass) : 72,
        timber: num(res.timber), data: res.data != null ? num(res.data) : 18,
        credits: num(res.credits), trust: res.trust != null ? num(res.trust) : 52
      },
      indicators: {
        habitability: ind.habitability != null ? num(ind.habitability) : 12,
        ecology: ind.ecology != null ? num(ind.ecology) : 76,
        morale: ind.morale != null ? num(ind.morale) : 44,
        governance: ind.governance != null ? num(ind.governance) : 5,
        economy: ind.economy != null ? num(ind.economy) : 18,
        defense: ind.defense != null ? num(ind.defense) : 8,
        resilience: ind.resilience != null ? num(ind.resilience) : 14
      },
      buildings: {},
      score: ctx.score != null ? num(ctx.score) : 8,
      phase: Math.max(1, num(ctx.phase) || 1),
      threat: clamp(threat, 0, 150),
      tension: clamp(tension, 0, 100),
      missionProgress: num(ctx.missionProgress != null ? ctx.missionProgress : (ctx.mission && ctx.mission.progress)),
      specialGauge: num(ctx.specialGauge),
      diplomacyOutcome: dip,
      missionTargets: Array.isArray(ctx.missionTargets) ? ctx.missionTargets.slice()
        : (ctx.mission && Array.isArray(ctx.mission.targetTypes)) ? ctx.mission.targetTypes.slice() : [],
      currentAO: ctx.currentAO || null,
      completedAOs: Array.isArray(ctx.completedAOs) ? ctx.completedAOs.slice() : []
    };
    for (var i = 0; i < BUILD_KEYS.length; i++) s.buildings[BUILD_KEYS[i]] = num(bld[BUILD_KEYS[i]]);
    return s;
  }

  function init(seed) {
    var s = stateFromContext(null);
    s.seed = (seed >>> 0) || 0;
    return s;
  }

  function clone(s) {
    var c = {
      t: s.t, seed: s.seed, officerBonus: s.officerBonus,
      resources: {}, indicators: {}, buildings: {},
      score: s.score, phase: s.phase, threat: s.threat, tension: s.tension,
      missionProgress: s.missionProgress, specialGauge: s.specialGauge,
      diplomacyOutcome: s.diplomacyOutcome, currentAO: s.currentAO,
      missionTargets: s.missionTargets.slice(), completedAOs: s.completedAOs.slice()
    };
    var k;
    for (k in s.resources) c.resources[k] = s.resources[k];
    for (k in s.indicators) c.indicators[k] = s.indicators[k];
    for (k in s.buildings) c.buildings[k] = s.buildings[k];
    return c;
  }

  // ----- legality: port of zkRunStrategicSearch legal() -----
  function canAfford(s, cost) { if (!cost) return true; for (var k in cost) if (num(s.resources[k]) < num(cost[k])) return false; return true; }
  function isLegal(s, i) {
    var m = META[i];
    if (!canAfford(s, m.cost)) return false;
    if (m.requires) for (var k in m.requires) if (num(s.buildings[k]) < num(m.requires[k])) return false;
    if (m.minThreat != null && !(s.threat > 0)) return false;
    if (m.minTension != null && !(s.tension > m.minTension)) return false;
    if (m.build && num(s.buildings[m.build]) >= 4) return false;
    return true;
  }
  function legalMask(s, out) {
    for (var i = 0; i < ACTIONS.length; i++) out[i] = isLegal(s, i) ? 1 : 0;
    if (out.length > ACTIONS.length) for (var j = ACTIONS.length; j < out.length; j++) out[j] = 0;
    // safeActionIndex (recover_materials) has no cost/guard: guarantees non-empty mask.
    out[2] = 1;
  }

  // ----- passive economy + indicator recomputation (port of Simulation.update) -----
  function recompute(s) {
    var b = s.buildings, r = s.resources, ind = s.indicators, i = s.officerBonus;
    var n = b.power, w = b.water, a = b.habitat, l = b.research, c = b.culture, u = b.governance, h = b.defense, d = b.bridge, p = b.boat;
    r.energy = clamp(r.energy + (n * 1.6 - (a + l) * 0.45) * PROD_DT * i, 0, 999);
    r.water = clamp(r.water + (w * 1.5 - a * 0.38) * PROD_DT * i, 0, 999);
    r.data = clamp(r.data + l * 0.55 * PROD_DT * i, 0, 999);
    r.biomass = clamp(r.biomass + Math.max(0, ind.ecology - 45) * 0.002 * PROD_DT, 0, 999);
    var f = r.energy > 2, m = r.water > 2, gg = Math.min(12, d * 3 + p * 6);
    ind.habitability = clamp(8 + a * 12 + w * 6 + n * 5 + gg + (f && m ? 8 : -10), 0, 100);
    ind.morale = clamp(24 + a * 7 + c * 12 + r.trust * 0.2 + gg * 0.35, 0, 100);
    ind.governance = clamp(5 + u * 21 + l * 3, 0, 100);
    ind.economy = clamp(12 + a * 5 + l * 8 + u * 7 + d * 2 + p * 5, 0, 100);
    ind.defense = clamp(5 + h * 22 + n * 2, 0, 100);
    ind.resilience = clamp((ind.habitability + ind.ecology + ind.governance + ind.defense) / 4, 0, 100);
    // civilizationScore + phase (Simulation.update formula; y-array is 7 indicators + trust)
    var y = [ind.habitability, ind.ecology, ind.morale, ind.governance, ind.economy, ind.defense, ind.resilience, r.trust];
    var mn = Infinity, mx = -Infinity, sum = 0;
    for (var q = 0; q < y.length; q++) { sum += y[q]; if (y[q] < mn) mn = y[q]; if (y[q] > mx) mx = y[q]; }
    var diversity = 0; for (var bk in b) if (b[bk] > 0) diversity++;
    s.score = clamp(sum / y.length + diversity * 2.5 - (mx - mn) * 0.12, 0, 100);
    s.phase = s.score >= 72 ? 4 : s.score >= 48 ? 3 : s.score >= 24 ? 2 : 1;
  }

  function step(s, a, rng) {
    var noise = function (k) { return (rng.next() - 0.5) * k; };
    var m = META[a] || META[2], k, v;
    // 1-2. costs then resource deltas (port of apply())
    if (m.cost) for (k in m.cost) s.resources[k] = Math.max(0, num(s.resources[k]) - num(m.cost[k]));
    if (m.delta) for (k in m.delta) { v = num(s.resources[k]) + num(m.delta[k]); s.resources[k] = clamp(v, 0, k === 'trust' ? 100 : 9999); }
    // 3. ecology delta (ecology is an accumulator; not recomputed from buildings)
    if (m.ecology) s.indicators.ecology = clamp(s.indicators.ecology + m.ecology, 0, 100);
    // 4. build increment + mission progress (matched vs. missionTargets)
    if (m.build) { s.buildings[m.build] = num(s.buildings[m.build]) + 1; s.missionProgress = clamp(s.missionProgress + (s.missionTargets.indexOf(m.build) >= 0 ? 14 : 5), 0, 100); }
    // 5-7. passive economy + indicator/score recompute
    recompute(s);
    // 8. threat + tension evolution (seeded rng only)
    var grow = THREAT_GROWTH[s.diplomacyOutcome || 'none'];
    s.threat = clamp(s.threat + num(m.threat) + grow + noise(0.6), 0, 150);
    s.tension = clamp(s.tension + num(m.tension) + (s.diplomacyOutcome === 'force' ? 0.5 : 0) + noise(0.3), 0, 100);
    // raids when threat overwhelms defense indicator
    if (s.threat > s.indicators.defense + 40) { s.indicators.morale = clamp(s.indicators.morale - 2, 0, 100); s.threat *= 0.85; }
    s.t++;
    // 10. terminal policy (ZekNova has no hard colony game-over; see findings section 5)
    var terminal = false, tv = 0;
    var builtDiverse = 0; for (var bk in s.buildings) if (s.buildings[bk] > 0) builtDiverse++;
    if (s.phase >= 4 && s.score >= 90 && builtDiverse >= 6) { terminal = true; tv = 1; }
    else if (s.t > 12 && s.score <= 8 && s.diplomacyOutcome === 'force' && s.buildings.defense === 0 && s.threat > 50) { terminal = true; tv = -1; }
    else if (s.t >= SESSION_TICKS) { terminal = true; tv = health(s); }
    return { terminal: terminal, terminalValue: tv };
  }

  // ----- signals -----
  function health(s) {
    var h = (s.score / 50) - 1
      + (s.missionProgress / 100) * 0.20
      - Math.min(s.threat / 100, 1) * 0.40
      - Math.max(0, s.tension - 50) / 50 * 0.20
      + (s.resources.trust - 50) / 50 * 0.10;
    return clamp(h, -1, 1);
  }
  // heuristicValue: port of zkRunStrategicSearch evaluate(), squashed to [-1,1].
  function evaluate(s) {
    var ind = s.indicators, r = s.resources;
    var vals = [ind.habitability, ind.ecology, ind.morale, ind.governance, ind.economy, ind.defense, ind.resilience];
    var sum = 0, weakest = Infinity; for (var q = 0; q < vals.length; q++) { sum += vals[q]; if (vals[q] < weakest) weakest = vals[q]; }
    var average = sum / vals.length;
    var diversity = 0; for (var bk in s.buildings) if (s.buildings[bk] > 0) diversity++;
    var resources = Math.min(r.iron / 18, 1) * 5 + Math.min(r.credits / 28, 1) * 5 + Math.min(r.minerals / 55, 1) * 3
      + Math.min(r.energy / 45, 1) * 2 + Math.min(r.water / 45, 1) * 2 + Math.min(r.timber / 35, 1) * 1.5;
    var trust = (r.trust - 40) * 0.12;
    var tensionPenalty = Math.max(0, s.tension - 45) * 0.13;
    var threatPenalty = s.threat * 0.32;
    return average * 0.58 + weakest * 0.2 + diversity * 2.5 + resources + trust + s.missionProgress * 0.24 - threatPenalty - tensionPenalty;
  }
  function heuristicValue(s) { return clamp(Math.tanh((evaluate(s) - 40) / 40), -1, 1); }

  // actionScores: hand-authored desirability, Level-3 fallback (index == action id).
  function actionScores(s, out) {
    out.fill(0);
    var r = s.resources, b = s.buildings, ind = s.indicators;
    out[0] = r.iron < 8 ? 1 : r.iron < 18 ? 0.4 : -0.2;
    out[1] = r.credits < 12 ? 0.8 : 0.1;
    out[2] = (r.minerals < 40 || r.biomass < 30) ? 0.7 : 0.2;
    out[3] = s.threat > 0 ? clamp(s.threat / 40, 0, 1) : -1;
    out[4] = s.tension > 45 ? 0.8 : s.tension > 22 ? 0.3 : -1;
    out[5] = b.power < 1 ? 1 : b.power < 2 ? 0.3 : -0.2;
    out[6] = (b.power >= 1 && b.water < 1) ? 0.9 : -0.2;
    out[7] = (b.power >= 1 && b.water >= 1 && b.habitat < 2) ? 0.8 : -0.2;
    out[8] = (s.threat > (5 + b.defense * 22)) ? 0.8 : b.defense < 1 ? 0.3 : -0.1;
    out[9] = (b.power >= 1 && b.water >= 1 && b.research < 1) ? 0.7 : -0.1;
    out[10] = (b.power >= 1 && b.water >= 1 && ind.morale < 40) ? 0.6 : 0;
    out[11] = (b.research >= 1 && ind.governance < 40) ? 0.6 : -0.1;
    out[12] = b.bridge < 1 ? 0.3 : -0.3;
  }

  // ----- features (RAW; codec normalizes) -----
  function toBaseFeatures(s, out) {
    var r = s.resources, ind = s.indicators, b = s.buildings, i = s.officerBonus;
    out[IDX.food_energy] = r.energy; out[IDX.water] = r.water; out[IDX.minerals] = r.minerals; out[IDX.iron] = r.iron;
    out[IDX.biomass] = r.biomass; out[IDX.timber] = r.timber; out[IDX.data] = r.data; out[IDX.credits] = r.credits; out[IDX.trust] = r.trust;
    out[IDX.habitability] = ind.habitability; out[IDX.ecology] = ind.ecology; out[IDX.morale] = ind.morale;
    out[IDX.governance] = ind.governance; out[IDX.economy] = ind.economy; out[IDX.defense] = ind.defense; out[IDX.resilience] = ind.resilience;
    for (var bi = 0; bi < BUILD_KEYS.length; bi++) out[IDX['b_' + BUILD_KEYS[bi]]] = b[BUILD_KEYS[bi]];
    out[IDX.score] = s.score; out[IDX.phase] = s.phase; out[IDX.threat] = s.threat; out[IDX.tension] = s.tension;
    out[IDX.missionProgress] = s.missionProgress;
    out[IDX.enemyCount] = Math.max(0, Math.round((s.threat - (s.diplomacyOutcome === 'force' ? 34 : 0)) / 8));
    out[IDX.specialGauge] = s.specialGauge;
    out[IDX.energyRate] = (b.power * 1.6 - (b.habitat + b.research) * 0.45) * i;
    out[IDX.waterRate] = (b.water * 1.5 - b.habitat * 0.38) * i;
    out[IDX.dataRate] = b.research * 0.55 * i;
    out[IDX.biomassRate] = Math.max(0, ind.ecology - 45) * 0.002;
    out[IDX.threatRatio] = ind.defense > 0 ? s.threat / ind.defense : 5;
    out[IDX.tensionPressure] = Math.max(0, s.tension - 50) / 50;
    var diversity = 0; for (var bk in b) if (b[bk] > 0) diversity++; out[IDX.buildDiversity] = diversity;
    out[IDX.dip_none] = s.diplomacyOutcome ? 0 : 1;
    out[IDX.dip_share] = s.diplomacyOutcome === 'share' ? 1 : 0;
    out[IDX.dip_negotiate] = s.diplomacyOutcome === 'negotiate' ? 1 : 0;
    out[IDX.dip_force] = s.diplomacyOutcome === 'force' ? 1 : 0;
    for (var ai = 0; ai < AO_KEYS.length; ai++) out[IDX['ao_' + AO_KEYS[ai]]] = s.currentAO === AO_KEYS[ai] ? 1 : 0;
    out[IDX.completedAOCount] = s.completedAOs.length;
    out[IDX.healthC] = health(s);
    for (var pi = IDX.healthC + 1; pi < SPEC.length; pi++) out[pi] = 0;
  }

  // ----- entities: synthesized from abstract state (worker-safe, no live game) -----
  function entities(s) {
    var e = [{ id: 'colony', type: 'core', x: 0, y: 0, threat: clamp((s.threat - s.indicators.defense) / 60, 0, 1), hostile: false, critical: true, deps: [] }];
    for (var r = 0; r < AO_KEYS.length; r++) {
      var completed = s.completedAOs.indexOf(AO_KEYS[r]) >= 0, current = s.currentAO === AO_KEYS[r];
      e.push({ id: 'ao_' + AO_KEYS[r], type: 'region', x: (r + 1) * 6, y: 0,
        threat: clamp(s.threat / 100, 0, 1), hostile: false, critical: current,
        deps: (completed || current) ? ['colony'] : [] });
    }
    var hostiles = Math.max(0, Math.round((s.threat - (s.diplomacyOutcome === 'force' ? 34 : 0)) / 8));
    for (var h = 0; h < Math.min(hostiles, 6); h++) {
      e.push({ id: 'hostile_' + h, type: 'hostile', x: 3 + h * 4, y: 3, threat: clamp(s.threat / 100, 0.1, 1), hostile: true, critical: false, deps: [] });
    }
    return e;
  }

  // ----- MAIN THREAD: snapshot the live ZekNova game into a sim-state -----
  function captureSearchState() {
    var game = g.ZekNovaGame || (g.window && g.window.ZekNovaGame) || null;
    if (!game || !game.simulation || !game.buildings) return init(0);
    // Prefer an explicit telemetry accessor if ZekNova exposes one.
    if (typeof game.getAdvisorTelemetry === 'function') {
      try { return stateFromContext(game.getAdvisorTelemetry()); } catch (err) { /* fall through */ }
    }
    var enemies = Array.isArray(game.enemies) ? game.enemies : [];
    var enemyCount = 0;
    for (var i = 0; i < enemies.length; i++) {
      var ud = enemies[i] && enemies[i].userData; if (ud && !ud.guardian && Number(ud.health) > 0) enemyCount++;
    }
    var counts = typeof game.buildings.countByType === 'function' ? game.buildings.countByType() : {};
    return stateFromContext({
      resources: game.simulation.resources,
      indicators: game.simulation.indicators,
      buildings: counts,
      score: game.simulation.civilizationScore,
      phase: game.simulation.phase,
      diplomacyOutcome: game.diplomacyOutcome || null,
      diplomacyTension: game.diplomacyTension != null ? game.diplomacyTension : 50,
      enemyCount: enemyCount,
      specialGauge: game.specialAttackGauge,
      currentAO: game.currentAO && game.currentAO.id,
      completedAOs: game.completedAOs ? Array.prototype.slice.call(game.completedAOs) : [],
      officerClass: game.user && game.user.officerClass,
      // missionProgress/targets: precise values need a game accessor; approximate
      // from build diversity until getAdvisorTelemetry() is wired.
      missionProgress: Math.min(100, (function () { var d = 0, c = counts || {}; for (var k in c) if (c[k] > 0) d++; return d * 8; })())
    });
  }

  var adapter = {
    id: 'zeknova', version: 1, safeActionIndex: 2,
    isReferenceSimulator: false,
    actions: ACTIONS, baseFeatureSpec: SPEC,
    oracleGroups: {
      resources: [IDX.food_energy, IDX.water, IDX.minerals, IDX.iron, IDX.biomass, IDX.timber, IDX.data, IDX.credits, IDX.energyRate, IDX.waterRate],
      threat: [IDX.threat, IDX.tension, IDX.enemyCount, IDX.threatRatio, IDX.defense],
      population: [IDX.habitability, IDX.morale, IDX.ecology],
      construction: [IDX.b_power, IDX.b_water, IDX.b_habitat, IDX.b_research, IDX.b_culture, IDX.b_governance, IDX.b_defense, IDX.b_bridge, IDX.b_boat, IDX.missionProgress, IDX.economy, IDX.buildDiversity],
      mobility: [IDX.b_bridge, IDX.b_boat, IDX.completedAOCount],
      health: [IDX.healthC, IDX.score, IDX.resilience]
    },
    relational: { distThresh: 7 },
    relationalActionBias: function (aux, out) {
      out.fill(0);
      if (aux && aux.threatened && aux.threatened.length) { out[3] += 0.6; out[8] += 0.6; }
      if (aux && ((aux.depFailures && aux.depFailures.length) || (aux.isolated && aux.isolated.length))) { out[12] += 0.5; out[5] += 0.3; }
      if (aux && aux.bottlenecks && aux.bottlenecks.length) { out[9] += 0.4; out[5] += 0.3; }
    },
    captureSearchState: captureSearchState,
    sim: {
      init: init, clone: clone, step: step, legalMask: legalMask,
      toBaseFeatures: toBaseFeatures, heuristicValue: heuristicValue,
      actionScores: actionScores, entities: entities, health: health,
      tick: function (s) { return s.t; }
    }
  };

  g.AZL_ADAPTER = adapter;         // primary registration (per DEPLOYMENT contract)
  AZL.ZekNovaAdapter = adapter;    // discovery parity with AZL.ReferenceAdapter
})(typeof self !== 'undefined' ? self : globalThis);
