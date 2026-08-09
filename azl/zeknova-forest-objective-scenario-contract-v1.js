/*
 * ZekNova Forest Objective & Scenario Contract v1
 * Stage 1A-Z: canonical defensive objective declaration and deterministic,
 * failure-possible scenario certification harness.
 *
 * Universal module. Exact same bytes install in ZekNova and Sentinel Grid.
 * Requires W0-O.0 identity, W0-AF Forest actions, and W0-P.3 parity closure.
 * Evaluation only: no live-world reads, action execution, DOM, network, storage,
 * wall clock, or Sentinel authority.
 */
(function (root, factory) {
  var api = factory(
    root.ZekNovaIdentityContract,
    root.ZekNovaForestDefensiveActionContract,
    root.ZekNovaLiveParityClosureContract
  );
  root.ZekNovaForestObjectiveScenarioContract = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (Identity, Forest, Closure) {
  'use strict';

  if (!Identity || Identity.CONTRACT_ID !== 'zeknova-identity-contract-v1') throw new Error('Stage 1A-Z requires zeknova-identity-contract-v1.');
  if (!Forest || Forest.CONTRACT_ID !== 'zeknova-forest-defensive-action-contract-v1') throw new Error('Stage 1A-Z requires zeknova-forest-defensive-action-contract-v1.');
  if (!Closure || Closure.CONTRACT_ID !== 'zeknova-live-parity-closure-contract-v1') throw new Error('Stage 1A-Z requires zeknova-live-parity-closure-contract-v1.');
  if (Forest.ACTION_COUNT !== 13 || Closure.BINDINGS.length !== 13) throw new Error('Stage 1A-Z requires thirteen exact Forest command bindings.');

  var SCHEMA_VERSION = 1;
  var CONTRACT_ID = 'zeknova-forest-objective-scenario-contract-v1';
  var REGISTRY_ID = 'zeknova-forest-objective-scenarios-v1-development';
  var OBJECTIVE_PROFILE_ID = 'zeknova-forest-defensive-objective-v1';
  var CERTIFICATION_ID = 'zeknova-forest-defensive-scenario-certification-v1';
  var MODE = 'evaluation-only-no-live-command-execution';
  var AUTHORITY = 'none-no-live-command-execution';
  var STATE_PREFIX = 'zksz:v1:';
  var RUN_PREFIX = 'zksr:v1:';
  var CERT_PREFIX = 'zksc:v1:';
  var DEFAULT_SEED_COUNT = 16;
  var MAX_SEED_COUNT = 64;

  function invariant(ok, message) { if (!ok) throw new Error(message); }
  function integer(v, name, min, max) {
    invariant(Number.isInteger(v), name + ' must be an integer.');
    invariant(v >= min && v <= max, name + ' is out of range.');
    return v;
  }
  function exactKeys(value, keys, name) {
    invariant(value && typeof value === 'object' && !Array.isArray(value), name + ' must be an object.');
    var actual = Object.keys(value).sort();
    var expected = keys.slice().sort();
    invariant(Identity.canonicalStringify(actual) === Identity.canonicalStringify(expected), name + ' has unexpected fields.');
  }
  function clone(value) { return JSON.parse(JSON.stringify(value)); }
  function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }
  function hashBody(prefix, body) { return prefix + Identity.hash64x2(body); }
  function actionByKey(key) {
    for (var i = 0; i < Forest.ACTIONS.length; i++) if (Forest.ACTIONS[i].key === key) return Forest.ACTIONS[i];
    throw new Error('Unknown Forest action key: ' + key);
  }

  var OBJECTIVE_PROFILE = Object.freeze(Identity.canonicalize({
    id: OBJECTIVE_PROFILE_ID,
    rootStance: 'defensive',
    comparison: 'lexicographic-no-weighted-tradeoff',
    terminalFailure: 'settlement_destroyed',
    priorities: [
      { rank:0, key:'settlement_survival', direction:'maximize', rationale:'No lower objective may justify settlement destruction.' },
      { rank:1, key:'critical_structure_integrity', direction:'maximize', rationale:'Preserve the settlement core and other mission-critical structures.' },
      { rank:2, key:'settlement_security', direction:'maximize', rationale:'Keep the civilian defensive perimeter viable.' },
      { rank:3, key:'infrastructure_reliability', direction:'maximize', rationale:'Keep essential infrastructure operational.' },
      { rank:4, key:'route_security', direction:'maximize', rationale:'Maintain usable movement and logistics routes.' },
      { rank:5, key:'force_preservation', direction:'maximize', rationale:'Preserve patrol capacity before optional gains.' },
      { rank:6, key:'recovery_capacity', direction:'maximize', rationale:'Retain readiness, materials, and repair capability.' },
      { rank:7, key:'resource_security', direction:'maximize', rationale:'Protect known resources after survival needs are met.' },
      { rank:8, key:'deescalation', direction:'maximize', rationale:'Reduce tension and improve trust without sacrificing higher priorities.' }
    ]
  }));

  function scenario(raw) {
    return Object.freeze(Identity.canonicalize(raw));
  }

  var SCENARIOS = Object.freeze([
    scenario({
      id:'perimeter-breach', version:1, title:'Perimeter Breach', horizonQuanta:6,
      objective:'Keep the settlement alive while reducing immediate hostile pressure and preserving a viable perimeter.',
      requiredActions:['intercept_hostile_contact','screen_combat_alert'], criticalActions:['intercept_hostile_contact','screen_combat_alert'],
      initial:{materials:20,readiness:42,patrolSlots:1,repairCrewSlots:1,hostilePressure:72,informationReach:20,infrastructureReliability:65,resourceSecurity:55,routeSecurity:48,settlementSecurity:42,structureSupport:60,tension:48,trust:44,criticalStructureHealth:88,patrolIntegrity:85},
      flags:{settlementAlive:true,structureDamaged:false,routeDamaged:false,infrastructureDegraded:false,resourceKnown:false,resourceSecured:false,contactFresh:true,combatAlertActive:true,directIntelligence:true,patrolExposed:false},
      successPlan:['intercept_hostile_contact','screen_combat_alert','hold_settlement_perimeter'],
      failurePlan:['open_defensive_channel','hold_settlement_perimeter','hold_settlement_perimeter'],
      successCondition:'alive_perimeter_pressure_controlled', hazardModel:'perimeter-pressure-v1'
    }),
    scenario({
      id:'damaged-core', version:1, title:'Damaged Core Under Pressure', horizonQuanta:6,
      objective:'Repair the critical settlement structure before continuing pressure destroys it.',
      requiredActions:['repair_known_structure'], criticalActions:['repair_known_structure'],
      initial:{materials:20,readiness:34,patrolSlots:1,repairCrewSlots:1,hostilePressure:50,informationReach:18,infrastructureReliability:55,resourceSecurity:50,routeSecurity:45,settlementSecurity:48,structureSupport:25,tension:52,trust:40,criticalStructureHealth:46,patrolIntegrity:80},
      flags:{settlementAlive:true,structureDamaged:true,routeDamaged:false,infrastructureDegraded:false,resourceKnown:false,resourceSecured:false,contactFresh:false,combatAlertActive:true,directIntelligence:true,patrolExposed:false},
      successPlan:['repair_known_structure'],
      failurePlan:['reinforce_threatened_structure','hold_settlement_perimeter','hold_settlement_perimeter'],
      successCondition:'alive_core_repaired', hazardModel:'core-decay-v1'
    }),
    scenario({
      id:'route-infrastructure-cascade', version:1, title:'Route and Infrastructure Cascade', horizonQuanta:8,
      objective:'Stabilize degraded infrastructure and restore the damaged logistics route before the cascade reaches the settlement.',
      requiredActions:['stabilize_known_infrastructure','fortify_known_route'], criticalActions:['stabilize_known_infrastructure','fortify_known_route'],
      initial:{materials:30,readiness:46,patrolSlots:1,repairCrewSlots:1,hostilePressure:34,informationReach:24,infrastructureReliability:34,resourceSecurity:55,routeSecurity:26,settlementSecurity:58,structureSupport:54,tension:45,trust:48,criticalStructureHealth:82,patrolIntegrity:84},
      flags:{settlementAlive:true,structureDamaged:false,routeDamaged:true,infrastructureDegraded:true,resourceKnown:false,resourceSecured:false,contactFresh:false,combatAlertActive:false,directIntelligence:true,patrolExposed:false},
      successPlan:['stabilize_known_infrastructure','fortify_known_route'],
      failurePlan:['patrol_known_route','hold_settlement_perimeter','hold_settlement_perimeter'],
      successCondition:'alive_infrastructure_and_route_restored', hazardModel:'cascade-v1'
    }),
    scenario({
      id:'resource-corridor', version:1, title:'Exposed Resource Corridor', horizonQuanta:6,
      objective:'Secure a known resource before hostile pressure permanently cuts off the site.',
      requiredActions:['secure_known_resource'], criticalActions:['secure_known_resource'],
      initial:{materials:18,readiness:36,patrolSlots:1,repairCrewSlots:1,hostilePressure:38,informationReach:26,infrastructureReliability:60,resourceSecurity:20,routeSecurity:40,settlementSecurity:56,structureSupport:55,tension:46,trust:46,criticalStructureHealth:86,patrolIntegrity:82},
      flags:{settlementAlive:true,structureDamaged:false,routeDamaged:false,infrastructureDegraded:false,resourceKnown:true,resourceSecured:false,contactFresh:false,combatAlertActive:false,directIntelligence:true,patrolExposed:false},
      successPlan:['secure_known_resource'],
      failurePlan:['patrol_known_route','hold_settlement_perimeter','secure_known_resource'],
      successCondition:'alive_resource_secured', hazardModel:'resource-loss-v1'
    }),
    scenario({
      id:'exposed-patrol', version:1, title:'Exposed Patrol', horizonQuanta:4,
      objective:'Withdraw an exposed patrol before it is lost, accepting temporary pressure to preserve the force.',
      requiredActions:['withdraw_exposed_patrol'], criticalActions:['withdraw_exposed_patrol'],
      initial:{materials:16,readiness:30,patrolSlots:1,repairCrewSlots:1,hostilePressure:76,informationReach:30,infrastructureReliability:58,resourceSecurity:48,routeSecurity:44,settlementSecurity:52,structureSupport:52,tension:58,trust:38,criticalStructureHealth:84,patrolIntegrity:56},
      flags:{settlementAlive:true,structureDamaged:false,routeDamaged:false,infrastructureDegraded:false,resourceKnown:false,resourceSecured:false,contactFresh:true,combatAlertActive:true,directIntelligence:true,patrolExposed:true},
      successPlan:['withdraw_exposed_patrol'],
      failurePlan:['intercept_hostile_contact','hold_settlement_perimeter'],
      successCondition:'alive_patrol_preserved', hazardModel:'patrol-attrition-v1'
    }),
    scenario({
      id:'multi-crisis-priority', version:1, title:'Core Versus Resource Priority', horizonQuanta:4,
      objective:'Preserve the critical settlement core even when doing so means losing an exposed resource.',
      requiredActions:['repair_known_structure','secure_known_resource'], criticalActions:['repair_known_structure'],
      initial:{materials:12,readiness:32,patrolSlots:1,repairCrewSlots:1,hostilePressure:54,informationReach:28,infrastructureReliability:54,resourceSecurity:20,routeSecurity:42,settlementSecurity:46,structureSupport:24,tension:54,trust:40,criticalStructureHealth:54,patrolIntegrity:78},
      flags:{settlementAlive:true,structureDamaged:true,routeDamaged:false,infrastructureDegraded:false,resourceKnown:true,resourceSecured:false,contactFresh:false,combatAlertActive:true,directIntelligence:true,patrolExposed:false},
      successPlan:['repair_known_structure'],
      failurePlan:['secure_known_resource','hold_settlement_perimeter'],
      successCondition:'alive_core_priority_preserved', hazardModel:'multi-crisis-v1'
    }),
    scenario({
      id:'deescalation-window', version:1, title:'Defensive De-escalation Window', horizonQuanta:5,
      objective:'Use the available defensive channel before escalating tension closes the diplomatic window.',
      requiredActions:['open_defensive_channel'], criticalActions:['open_defensive_channel'],
      initial:{materials:16,readiness:28,patrolSlots:1,repairCrewSlots:1,hostilePressure:42,informationReach:35,infrastructureReliability:62,resourceSecurity:52,routeSecurity:50,settlementSecurity:58,structureSupport:58,tension:82,trust:25,criticalStructureHealth:88,patrolIntegrity:84},
      flags:{settlementAlive:true,structureDamaged:false,routeDamaged:false,infrastructureDegraded:false,resourceKnown:false,resourceSecured:false,contactFresh:false,combatAlertActive:false,directIntelligence:true,patrolExposed:false},
      successPlan:['open_defensive_channel'],
      failurePlan:['hold_settlement_perimeter','hold_settlement_perimeter','hold_settlement_perimeter'],
      successCondition:'alive_deescalated', hazardModel:'tension-escalation-v1'
    })
  ]);

  var SCENARIO_BY_ID = {};
  SCENARIOS.forEach(function (s) { SCENARIO_BY_ID[s.id] = s; });
  Object.freeze(SCENARIO_BY_ID);

  var CAPACITY_KEYS = ['materials','patrolSlots','readiness','repairCrewSlots'];
  var METRIC_KEYS = ['hostilePressure','informationReach','infrastructureReliability','resourceSecurity','routeSecurity','settlementSecurity','structureSupport','tension','trust'];
  var FLAG_KEYS = ['combatAlertActive','contactFresh','directIntelligence','infrastructureDegraded','patrolExposed','resourceKnown','resourceSecured','routeDamaged','settlementAlive','structureDamaged'];
  var STATE_KEYS = ['capacities','contractId','cooldownUntil','criticalStructureHealth','flags','horizonQuanta','metrics','mode','objectiveProfileId','patrolIntegrity','quantum','registryId','scenarioId','scenarioVersion','schemaVersion','seed','stateId'];
  var RUN_KEYS = ['actionsAttempted','actionsCompleted','certificationId','contractId','failureReason','finalObjectiveVector','finalState','mode','objectiveComplete','objectiveProfileId','runId','scenarioId','scenarioVersion','schemaVersion','seed','trace'];

  function scenarioAt(id) {
    var s = SCENARIO_BY_ID[id];
    invariant(!!s, 'Unknown scenarioId: ' + id);
    return s;
  }

  function jitter(seed, scenarioId, quantum, salt) {
    var h = Identity.hash64x2({ seed:seed, scenarioId:scenarioId, quantum:quantum, salt:salt });
    return parseInt(h.slice(0, 4), 16) % 3;
  }

  function stateBody(raw) {
    return Identity.canonicalize({
      capacities:raw.capacities, contractId:CONTRACT_ID, cooldownUntil:raw.cooldownUntil,
      criticalStructureHealth:raw.criticalStructureHealth, flags:raw.flags,
      horizonQuanta:raw.horizonQuanta, metrics:raw.metrics, mode:MODE,
      objectiveProfileId:OBJECTIVE_PROFILE_ID, patrolIntegrity:raw.patrolIntegrity,
      quantum:raw.quantum, registryId:REGISTRY_ID, scenarioId:raw.scenarioId,
      scenarioVersion:raw.scenarioVersion, schemaVersion:SCHEMA_VERSION, seed:raw.seed
    });
  }

  function createScenarioState(scenarioId, seed) {
    var s = scenarioAt(scenarioId);
    integer(seed, 'seed', 1, 2147483647);
    var capacities = {};
    CAPACITY_KEYS.forEach(function (k) { capacities[k] = integer(s.initial[k], k, 0, 100); });
    var metrics = {};
    METRIC_KEYS.forEach(function (k) { metrics[k] = integer(s.initial[k], k, 0, 100); });
    var flags = {};
    FLAG_KEYS.forEach(function (k) { flags[k] = s.flags[k] === true; });
    var body = stateBody({
      capacities:capacities, cooldownUntil:new Array(Forest.ACTION_COUNT).fill(0),
      criticalStructureHealth:integer(s.initial.criticalStructureHealth, 'criticalStructureHealth', 0, 100),
      flags:flags, horizonQuanta:s.horizonQuanta, metrics:metrics,
      patrolIntegrity:integer(s.initial.patrolIntegrity, 'patrolIntegrity', 0, 100),
      quantum:0, scenarioId:s.id, scenarioVersion:s.version, seed:seed
    });
    return Identity.canonicalize(Object.assign({}, body, { stateId:hashBody(STATE_PREFIX, body) }));
  }

  function validateState(raw) {
    exactKeys(raw, STATE_KEYS, 'scenario state');
    invariant(typeof raw.stateId === 'string' && raw.stateId.indexOf(STATE_PREFIX) === 0, 'Invalid scenario stateId.');
    var s = scenarioAt(raw.scenarioId);
    integer(raw.seed, 'seed', 1, 2147483647);
    integer(raw.quantum, 'quantum', 0, s.horizonQuanta);
    invariant(raw.scenarioVersion === s.version && raw.horizonQuanta === s.horizonQuanta, 'Scenario version or horizon mismatch.');
    exactKeys(raw.capacities, CAPACITY_KEYS, 'scenario capacities');
    CAPACITY_KEYS.forEach(function (k) { integer(raw.capacities[k], k, 0, 100); });
    exactKeys(raw.metrics, METRIC_KEYS, 'scenario metrics');
    METRIC_KEYS.forEach(function (k) { integer(raw.metrics[k], k, 0, 100); });
    exactKeys(raw.flags, FLAG_KEYS, 'scenario flags');
    FLAG_KEYS.forEach(function (k) { invariant(typeof raw.flags[k] === 'boolean', k + ' must be boolean.'); });
    invariant(Array.isArray(raw.cooldownUntil) && raw.cooldownUntil.length === Forest.ACTION_COUNT, 'cooldownUntil width mismatch.');
    raw.cooldownUntil.forEach(function (v) { integer(v, 'cooldownUntil', 0, 1000); });
    integer(raw.criticalStructureHealth, 'criticalStructureHealth', 0, 100);
    integer(raw.patrolIntegrity, 'patrolIntegrity', 0, 100);
    var body = stateBody(raw);
    invariant(raw.stateId === hashBody(STATE_PREFIX, body), 'Scenario stateId mismatch.');
    return Identity.canonicalize(raw);
  }

  function targetAvailable(action, state) {
    var f = state.flags;
    switch (action.key) {
      case 'hold_settlement_perimeter': case 'open_defensive_channel': return true;
      case 'patrol_known_route': case 'reconnoiter_forest_lane': return true;
      case 'intercept_hostile_contact': return f.contactFresh;
      case 'screen_combat_alert': return f.combatAlertActive;
      case 'reinforce_threatened_structure': case 'repair_known_structure': return f.structureDamaged;
      case 'fortify_known_route': return f.routeDamaged;
      case 'secure_known_resource': return f.resourceKnown && !f.resourceSecured;
      case 'stabilize_known_infrastructure': return f.infrastructureDegraded;
      case 'share_direct_intelligence': return f.directIntelligence;
      case 'withdraw_exposed_patrol': return f.patrolExposed && (f.contactFresh || f.combatAlertActive);
      default: return false;
    }
  }

  function legalReason(state, actionKey) {
    var state2 = validateState(state);
    var action = actionByKey(actionKey);
    if (!state2.flags.settlementAlive) return 'settlement_destroyed';
    if (state2.quantum >= state2.horizonQuanta) return 'horizon_reached';
    if (state2.cooldownUntil[action.index] > state2.quantum) return 'cooldown';
    if (state2.capacities.readiness < action.cost.readiness) return 'insufficient_readiness';
    if (state2.capacities.materials < action.cost.materials) return 'insufficient_materials';
    if (state2.capacities.patrolSlots < action.cost.patrolSlots) return 'no_patrol_slot';
    if (state2.capacities.repairCrewSlots < action.cost.repairCrewSlots) return 'no_repair_crew';
    if (action.requiresTarget && !targetAvailable(action, state2)) return 'no_eligible_target';
    return null;
  }

  function applyHazard(state, scenario) {
    var m = state.metrics, f = state.flags;
    var j = jitter(state.seed, scenario.id, state.quantum, scenario.hazardModel);
    switch (scenario.hazardModel) {
      case 'perimeter-pressure-v1':
        m.hostilePressure = clamp(m.hostilePressure + 4 + j, 0, 100);
        m.settlementSecurity = clamp(m.settlementSecurity - Math.max(3, Math.floor((m.hostilePressure - 36) / 9)), 0, 100);
        break;
      case 'core-decay-v1':
        if (f.structureDamaged) state.criticalStructureHealth = clamp(state.criticalStructureHealth - (9 + j), 0, 100);
        m.hostilePressure = clamp(m.hostilePressure + 2, 0, 100);
        break;
      case 'cascade-v1':
        if (f.infrastructureDegraded) m.infrastructureReliability = clamp(m.infrastructureReliability - (4 + j), 0, 100);
        if (f.routeDamaged) m.routeSecurity = clamp(m.routeSecurity - 3, 0, 100);
        if (m.infrastructureReliability <= 12) m.settlementSecurity = clamp(m.settlementSecurity - 8, 0, 100);
        break;
      case 'resource-loss-v1':
        if (!f.resourceSecured) {
          m.resourceSecurity = clamp(m.resourceSecurity - 8, 0, 100);
          if (m.resourceSecurity === 0) { f.resourceKnown = false; m.routeSecurity = clamp(m.routeSecurity - 18, 0, 100); m.settlementSecurity = clamp(m.settlementSecurity - 8, 0, 100); }
        }
        break;
      case 'patrol-attrition-v1':
        if (f.patrolExposed) state.patrolIntegrity = clamp(state.patrolIntegrity - (34 + j), 0, 100);
        m.hostilePressure = clamp(m.hostilePressure + 3, 0, 100);
        break;
      case 'multi-crisis-v1':
        if (f.structureDamaged) state.criticalStructureHealth = clamp(state.criticalStructureHealth - (12 + j), 0, 100);
        if (!f.resourceSecured) {
          m.resourceSecurity = clamp(m.resourceSecurity - 8, 0, 100);
          if (m.resourceSecurity === 0) { f.resourceKnown = false; m.routeSecurity = clamp(m.routeSecurity - 18, 0, 100); m.settlementSecurity = clamp(m.settlementSecurity - 8, 0, 100); }
        }
        break;
      case 'tension-escalation-v1':
        m.tension = clamp(m.tension + 3 + j, 0, 100);
        m.trust = clamp(m.trust - 1, 0, 100);
        if (m.tension > 90) { m.settlementSecurity = clamp(m.settlementSecurity - 10, 0, 100); m.infrastructureReliability = clamp(m.infrastructureReliability - 6, 0, 100); }
        break;
    }
    if (state.criticalStructureHealth <= 0 || state.patrolIntegrity <= 0 && scenario.id === 'exposed-patrol' || m.settlementSecurity <= 0 || m.tension >= 100) f.settlementAlive = false;
  }

  function applyActionEffect(state, action) {
    var outcome = action.outcome;
    METRIC_KEYS.forEach(function (k) {
      if (Object.prototype.hasOwnProperty.call(outcome, k)) state.metrics[k] = clamp(state.metrics[k] + outcome[k], 0, 100);
    });
    switch (action.key) {
      case 'intercept_hostile_contact': state.flags.contactFresh = false; break;
      case 'screen_combat_alert': state.flags.combatAlertActive = false; break;
      case 'repair_known_structure':
        state.criticalStructureHealth = Math.max(state.criticalStructureHealth, 82);
        state.flags.structureDamaged = false;
        break;
      case 'reinforce_threatened_structure': state.criticalStructureHealth = clamp(state.criticalStructureHealth + 18, 0, 100); break;
      case 'fortify_known_route':
        state.metrics.routeSecurity = Math.max(state.metrics.routeSecurity, 62);
        state.flags.routeDamaged = false;
        break;
      case 'stabilize_known_infrastructure':
        state.metrics.infrastructureReliability = Math.max(state.metrics.infrastructureReliability, 60);
        state.flags.infrastructureDegraded = false;
        break;
      case 'secure_known_resource':
        if (state.flags.resourceKnown) {
          state.flags.resourceSecured = true;
          state.metrics.resourceSecurity = Math.max(state.metrics.resourceSecurity, 58);
        }
        break;
      case 'withdraw_exposed_patrol':
        state.flags.patrolExposed = false;
        state.patrolIntegrity = clamp(state.patrolIntegrity + 30, 0, 100);
        break;
      case 'share_direct_intelligence': state.flags.directIntelligence = false; break;
    }
  }

  function nextStateBody(state) {
    return stateBody(state);
  }

  function stepScenario(rawState, actionKey) {
    var before = validateState(rawState);
    var scenario = scenarioAt(before.scenarioId);
    var reason = legalReason(before, actionKey);
    invariant(reason === null, 'Illegal scenario action: ' + actionKey + ' (' + reason + ').');
    var action = actionByKey(actionKey);
    var state = clone(before);
    delete state.stateId;
    state.capacities.readiness -= action.cost.readiness;
    state.capacities.materials -= action.cost.materials;
    var startQuantum = state.quantum;
    for (var q = 0; q < action.cost.executionQuanta && state.quantum < state.horizonQuanta && state.flags.settlementAlive; q++) {
      applyHazard(state, scenario);
      state.quantum += 1;
    }
    if (state.flags.settlementAlive) applyActionEffect(state, action);
    state.cooldownUntil[action.index] = state.quantum + action.cost.cooldownQuanta;
    var body = nextStateBody(state);
    var after = Identity.canonicalize(Object.assign({}, body, { stateId:hashBody(STATE_PREFIX, body) }));
    return Identity.canonicalize({
      actionIndex:action.index, actionKey:action.key, completed:state.flags.settlementAlive,
      endQuantum:after.quantum, failureReason:state.flags.settlementAlive ? null : 'settlement_destroyed',
      startQuantum:startQuantum, state:after
    });
  }

  function objectiveVector(rawState) {
    var state = validateState(rawState);
    var c = state.capacities, m = state.metrics;
    var recovery = Math.round((c.readiness + c.materials + c.patrolSlots * 12 + c.repairCrewSlots * 20) / 4);
    var deescalation = clamp(Math.round(((100 - m.tension) + m.trust) / 2), 0, 100);
    return Object.freeze([
      state.flags.settlementAlive ? 1 : 0,
      state.criticalStructureHealth,
      m.settlementSecurity,
      m.infrastructureReliability,
      m.routeSecurity,
      state.patrolIntegrity,
      clamp(recovery, 0, 100),
      m.resourceSecurity,
      deescalation
    ]);
  }

  function compareObjectiveVectors(a, b) {
    invariant(Array.isArray(a) && Array.isArray(b) && a.length === 9 && b.length === 9, 'Objective vectors must have nine values.');
    for (var i = 0; i < 9; i++) {
      if (a[i] > b[i]) return 1;
      if (a[i] < b[i]) return -1;
    }
    return 0;
  }

  function scenarioComplete(state, scenario) {
    var m = state.metrics, f = state.flags;
    if (!f.settlementAlive) return false;
    switch (scenario.successCondition) {
      case 'alive_perimeter_pressure_controlled': return !f.contactFresh && !f.combatAlertActive && m.settlementSecurity >= 28 && m.hostilePressure <= 72;
      case 'alive_core_repaired': return !f.structureDamaged && state.criticalStructureHealth >= 75;
      case 'alive_infrastructure_and_route_restored': return !f.infrastructureDegraded && !f.routeDamaged && m.infrastructureReliability >= 55 && m.routeSecurity >= 55;
      case 'alive_resource_secured': return f.resourceSecured && m.resourceSecurity >= 50;
      case 'alive_patrol_preserved': return !f.patrolExposed && state.patrolIntegrity >= 35;
      case 'alive_core_priority_preserved': return !f.structureDamaged && state.criticalStructureHealth >= 70;
      case 'alive_deescalated': return m.tension <= 78 && m.trust >= 32;
      default: return false;
    }
  }

  function runBody(raw) {
    return Identity.canonicalize({
      actionsAttempted:raw.actionsAttempted, actionsCompleted:raw.actionsCompleted,
      certificationId:CERTIFICATION_ID, contractId:CONTRACT_ID,
      failureReason:raw.failureReason, finalObjectiveVector:raw.finalObjectiveVector,
      finalState:raw.finalState, mode:MODE, objectiveComplete:raw.objectiveComplete,
      objectiveProfileId:OBJECTIVE_PROFILE_ID, scenarioId:raw.scenarioId,
      scenarioVersion:raw.scenarioVersion, schemaVersion:SCHEMA_VERSION,
      seed:raw.seed, trace:raw.trace
    });
  }

  function runScenario(scenarioId, plan, seed) {
    var scenario = scenarioAt(scenarioId);
    invariant(Array.isArray(plan) && plan.length > 0 && plan.length <= 20, 'Scenario plan must contain 1-20 action keys.');
    var state = createScenarioState(scenarioId, seed);
    var trace = [];
    var attempted = 0, completed = 0, cursor = 0, failureReason = null;
    while (state.quantum < state.horizonQuanta && state.flags.settlementAlive && !scenarioComplete(state, scenario)) {
      var requested = plan[Math.min(cursor, plan.length - 1)];
      cursor += 1;
      attempted += 1;
      var reason = legalReason(state, requested);
      var actionKey = reason === null ? requested : 'hold_settlement_perimeter';
      var fallbackReason = reason;
      var step = stepScenario(state, actionKey);
      state = step.state;
      completed += step.completed ? 1 : 0;
      trace.push(Identity.canonicalize({
        actionKey:actionKey, completed:step.completed, endQuantum:step.endQuantum,
        fallbackFrom:fallbackReason === null ? null : requested,
        fallbackReason:fallbackReason, startQuantum:step.startQuantum,
        stateId:state.stateId
      }));
      if (!state.flags.settlementAlive) failureReason = 'settlement_destroyed';
      if (trace.length > 32) throw new Error('Scenario trace exceeded safety bound.');
    }
    var complete = scenarioComplete(state, scenario);
    if (!complete && !failureReason) failureReason = state.quantum >= state.horizonQuanta ? 'objective_not_complete_at_horizon' : 'objective_not_complete';
    var body = runBody({
      actionsAttempted:attempted, actionsCompleted:completed, failureReason:complete ? null : failureReason,
      finalObjectiveVector:objectiveVector(state), finalState:state, objectiveComplete:complete,
      scenarioId:scenario.id, scenarioVersion:scenario.version, seed:seed, trace:trace
    });
    return Identity.canonicalize(Object.assign({}, body, { runId:hashBody(RUN_PREFIX, body) }));
  }

  function validateRun(raw) {
    exactKeys(raw, RUN_KEYS, 'scenario run');
    invariant(typeof raw.runId === 'string' && raw.runId.indexOf(RUN_PREFIX) === 0, 'Invalid scenario runId.');
    validateState(raw.finalState);
    var expected = runScenario(raw.scenarioId, raw.trace.map(function (t) { return t.fallbackFrom || t.actionKey; }), raw.seed);
    invariant(raw.runId === hashBody(RUN_PREFIX, runBody(raw)), 'Scenario runId mismatch.');
    invariant(raw.finalState.scenarioId === raw.scenarioId, 'Scenario run final state mismatch.');
    invariant(Array.isArray(raw.finalObjectiveVector) && raw.finalObjectiveVector.length === 9, 'Scenario run objective vector mismatch.');
    return Identity.canonicalize(raw);
  }

  function ablatedPlan(scenario) {
    return scenario.successPlan.map(function (key) {
      return scenario.criticalActions.indexOf(key) >= 0 ? 'hold_settlement_perimeter' : key;
    });
  }

  function representability(scenarioId) {
    var scenario = scenarioAt(scenarioId);
    var missing = [];
    scenario.requiredActions.forEach(function (key) {
      var action = null;
      try { action = actionByKey(key); } catch (e) { missing.push(key + ':missing-action'); return; }
      var binding = Closure.BINDINGS[action.index];
      if (!binding || binding.actionKey !== key) missing.push(key + ':missing-command-binding');
    });
    return Identity.canonicalize({
      commandParityRequired:true, missingMechanics:missing,
      representable:missing.length === 0, requiredActions:scenario.requiredActions,
      scenarioId:scenario.id, scenarioVersion:scenario.version
    });
  }

  function certificationBody(raw) {
    return Identity.canonicalize({
      authority:AUTHORITY, certificationId:CERTIFICATION_ID, contractId:CONTRACT_ID,
      mode:MODE, objectiveProfileId:OBJECTIVE_PROFILE_ID, registryId:REGISTRY_ID,
      results:raw.results, scenarioCount:SCENARIOS.length, schemaVersion:SCHEMA_VERSION,
      seedCount:raw.seedCount, strategicCompetenceClaim:false,
      productionAuthorityClaim:false, allScenariosCertified:raw.allScenariosCertified
    });
  }

  function certifyScenario(scenarioId, seedCount) {
    var scenario = scenarioAt(scenarioId);
    seedCount = seedCount == null ? DEFAULT_SEED_COUNT : integer(seedCount, 'seedCount', 1, MAX_SEED_COUNT);
    var rep = representability(scenario.id);
    var success = 0, failure = 0, ablated = 0, deterministic = true, vectorWins = 0;
    var records = [];
    for (var i = 0; i < seedCount; i++) {
      var seed = 18427 + i * 9973 + scenario.id.length * 31;
      var good = runScenario(scenario.id, scenario.successPlan, seed);
      var bad = runScenario(scenario.id, scenario.failurePlan, seed);
      var cut = runScenario(scenario.id, ablatedPlan(scenario), seed);
      var again = runScenario(scenario.id, scenario.successPlan, seed);
      if (good.objectiveComplete) success++;
      if (!bad.objectiveComplete) failure++;
      if (!cut.objectiveComplete) ablated++;
      if (good.runId !== again.runId || Identity.canonicalStringify(good) !== Identity.canonicalStringify(again)) deterministic = false;
      if (compareObjectiveVectors(good.finalObjectiveVector, bad.finalObjectiveVector) > 0) vectorWins++;
      records.push(Identity.canonicalize({
        ablatedComplete:cut.objectiveComplete, failureComplete:bad.objectiveComplete,
        seed:seed, successComplete:good.objectiveComplete,
        successRunId:good.runId, failureRunId:bad.runId, ablatedRunId:cut.runId
      }));
    }
    var certified = rep.representable && deterministic && success / seedCount >= 0.80 && failure / seedCount >= 0.80 && ablated / seedCount >= 0.80 && vectorWins === seedCount;
    return Identity.canonicalize({
      ablatedFailureRate:+(ablated/seedCount).toFixed(4), certified:certified,
      deterministic:deterministic, failureWitnessRate:+(failure/seedCount).toFixed(4),
      objectiveVectorWinRate:+(vectorWins/seedCount).toFixed(4), records:records,
      representability:rep, scenarioId:scenario.id, scenarioVersion:scenario.version,
      seedCount:seedCount, successWitnessRate:+(success/seedCount).toFixed(4)
    });
  }

  function certifyAll(seedCount) {
    seedCount = seedCount == null ? DEFAULT_SEED_COUNT : integer(seedCount, 'seedCount', 1, MAX_SEED_COUNT);
    var results = SCENARIOS.map(function (s) { return certifyScenario(s.id, seedCount); });
    var all = results.every(function (r) { return r.certified; });
    var body = certificationBody({ results:results, seedCount:seedCount, allScenariosCertified:all });
    return Identity.canonicalize(Object.assign({}, body, { reportId:hashBody(CERT_PREFIX, body) }));
  }

  function validateCertification(raw) {
    invariant(raw && typeof raw === 'object' && typeof raw.reportId === 'string' && raw.reportId.indexOf(CERT_PREFIX) === 0, 'Invalid certification reportId.');
    var expected = certifyAll(raw.seedCount);
    invariant(Identity.canonicalStringify(raw) === Identity.canonicalStringify(expected), 'Certification report does not match canonical computation.');
    return expected;
  }

  return Object.freeze({
    SCHEMA_VERSION:SCHEMA_VERSION, CONTRACT_ID:CONTRACT_ID, REGISTRY_ID:REGISTRY_ID,
    OBJECTIVE_PROFILE_ID:OBJECTIVE_PROFILE_ID, CERTIFICATION_ID:CERTIFICATION_ID,
    MODE:MODE, AUTHORITY:AUTHORITY, DEFAULT_SEED_COUNT:DEFAULT_SEED_COUNT,
    MAX_SEED_COUNT:MAX_SEED_COUNT, OBJECTIVE_PROFILE:OBJECTIVE_PROFILE,
    SCENARIOS:SCENARIOS, SCENARIO_COUNT:SCENARIOS.length,
    createScenarioState:createScenarioState, validateState:validateState,
    legalReason:legalReason, stepScenario:stepScenario,
    objectiveVector:objectiveVector, compareObjectiveVectors:compareObjectiveVectors,
    runScenario:runScenario, validateRun:validateRun,
    representability:representability, certifyScenario:certifyScenario,
    certifyAll:certifyAll, validateCertification:validateCertification
  });
});
