/*
 * ZekNova Live Parity Contract v1
 * W0-P: deterministic measurement-only binding of W0-AF planning declarations
 * to currently observable ZekNova runtime surfaces.
 *
 * Universal module. Exact same bytes install in ZekNova and Sentinel Grid.
 * No action execution, world mutation, wall clock, DOM, network, or storage.
 */
(function (root, factory) {
  var api = factory(
    root.ZekNovaIdentityContract,
    root.ZekNovaFactionObservationContract,
    root.ZekNovaForestDefensiveActionContract
  );
  root.ZekNovaLiveParityContract = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (Identity, Observation, Forest) {
  'use strict';

  if (!Identity || Identity.CONTRACT_ID !== 'zeknova-identity-contract-v1') throw new Error('Live parity requires zeknova-identity-contract-v1.');
  if (!Observation || Observation.CONTRACT_ID !== 'zeknova-faction-observation-contract-v1') throw new Error('Live parity requires zeknova-faction-observation-contract-v1.');
  if (!Forest || Forest.CONTRACT_ID !== 'zeknova-forest-defensive-action-contract-v1') throw new Error('Live parity requires zeknova-forest-defensive-action-contract-v1.');

  var SCHEMA_VERSION = 1;
  var CONTRACT_ID = 'zeknova-live-parity-contract-v1';
  var REGISTRY_ID = 'zeknova-live-parity-v1-development';
  var PARITY_SPACE_ID = 'zeknova-forest-defensive-live-parity-v1';
  var MODE = 'measurement-only';
  var AUTHORITY = 'none-no-action-execution';
  var REPORT_PREFIX = 'zkpr:v1:';
  var BINDING_PREFIX = 'zkpb:v1:';
  var DECLARED_STATUSES = Object.freeze(['exact', 'partial', 'unbound']);
  var EFFECTIVE_STATUSES = Object.freeze(['exact-observed', 'partial-observed', 'declared-source-missing', 'unbound']);
  var PARITY_LEVELS = Object.freeze(['exact', 'partial', 'none', 'not_applicable']);
  var DIMENSION_KEYS = Object.freeze(['actionExistence', 'cost', 'duration', 'eligibility', 'failure', 'outcome', 'target']);
  var SURFACE_KEYS = Object.freeze([
    'gameEnemyArray',
    'gameProcessEnemySpawning',
    'gameResolveDiplomacy',
    'gameSpawnEnemy',
    'gameUpdateEnemies',
    'perceptionShareEvent',
    'relationsBeginCeasefire',
    'relationsPerform',
    'relationsRecordDelta',
    'relationsUpdateCeasefire',
    'sourceVersion'
  ]);

  function invariant(ok, message) { if (!ok) throw new Error(message); }
  function exactKeys(value, keys, label) {
    invariant(value && typeof value === 'object' && !Array.isArray(value), label + ' must be an object.');
    var actual = Object.keys(value).sort();
    var expected = keys.slice().sort();
    invariant(JSON.stringify(actual) === JSON.stringify(expected), label + ' has unexpected or missing fields.');
  }
  function integer(value, name, min, max) {
    invariant(Number.isInteger(value), name + ' must be an integer.');
    if (min != null) invariant(value >= min, name + ' is below minimum.');
    if (max != null) invariant(value <= max, name + ' is above maximum.');
    return value;
  }
  function string(value, name, allowNull) {
    if (allowNull && value === null) return null;
    invariant(typeof value === 'string' && value.length > 0, name + ' must be a non-empty string.');
    return value;
  }
  function stringArray(value, name) {
    invariant(Array.isArray(value), name + ' must be an array.');
    return value.map(function (item, index) { return string(item, name + '[' + index + ']'); });
  }
  function bool(value, name) { invariant(typeof value === 'boolean', name + ' must be boolean.'); return value; }
  function parityMap(raw) {
    exactKeys(raw, DIMENSION_KEYS, 'parity dimensions');
    var out = {};
    DIMENSION_KEYS.forEach(function (key) {
      invariant(PARITY_LEVELS.indexOf(raw[key]) >= 0, 'Unknown parity level for ' + key + '.');
      out[key] = raw[key];
    });
    return Identity.canonicalize(out);
  }
  function frozenDimensions(raw) { return Object.freeze(parityMap(raw)); }
  function bindingBody(raw) {
    return Identity.canonicalize({
      actionIndex: raw.actionIndex,
      actionKey: raw.actionKey,
      completionSignal: raw.completionSignal,
      declaredStatus: raw.declaredStatus,
      dimensions: raw.dimensions,
      handler: raw.handler,
      requiredSurfaceFlags: raw.requiredSurfaceFlags,
      sourceAnchors: raw.sourceAnchors,
      sourceFile: raw.sourceFile,
      sourceKind: raw.sourceKind,
      unsupportedEffects: raw.unsupportedEffects
    });
  }
  function bindingIdFor(body) { return BINDING_PREFIX + Identity.hash64x2(body); }
  function freezeBinding(raw) {
    integer(raw.actionIndex, 'actionIndex', 0, Forest.ACTION_COUNT - 1);
    invariant(Forest.ACTIONS[raw.actionIndex].key === raw.actionKey, 'Binding action key/index mismatch.');
    invariant(DECLARED_STATUSES.indexOf(raw.declaredStatus) >= 0, 'Unknown declared parity status.');
    var requires = stringArray(raw.requiredSurfaceFlags || [], 'requiredSurfaceFlags');
    requires.forEach(function (flag) { invariant(SURFACE_KEYS.indexOf(flag) >= 0 && flag !== 'sourceVersion', 'Unknown runtime surface flag.'); });
    var body = bindingBody({
      actionIndex: raw.actionIndex,
      actionKey: raw.actionKey,
      completionSignal: raw.completionSignal == null ? null : string(raw.completionSignal, 'completionSignal'),
      declaredStatus: raw.declaredStatus,
      dimensions: parityMap(raw.dimensions),
      handler: raw.handler == null ? null : string(raw.handler, 'handler'),
      requiredSurfaceFlags: requires,
      sourceAnchors: stringArray(raw.sourceAnchors || [], 'sourceAnchors'),
      sourceFile: raw.sourceFile == null ? null : string(raw.sourceFile, 'sourceFile'),
      sourceKind: string(raw.sourceKind, 'sourceKind'),
      unsupportedEffects: stringArray(raw.unsupportedEffects || [], 'unsupportedEffects')
    });
    if (body.declaredStatus === 'unbound') {
      invariant(body.handler === null && body.sourceFile === null && body.requiredSurfaceFlags.length === 0, 'Unbound binding must not claim a live handler.');
      invariant(DIMENSION_KEYS.every(function (key) { return body.dimensions[key] === 'none' || body.dimensions[key] === 'not_applicable'; }), 'Unbound binding cannot claim parity.');
    } else {
      invariant(body.handler !== null && body.sourceFile !== null && body.requiredSurfaceFlags.length > 0, 'Bound or partial binding requires source evidence and runtime surface flags.');
    }
    return Object.freeze(Object.assign({}, body, { bindingId: bindingIdFor(body) }));
  }

  var NONE = frozenDimensions({ actionExistence:'none', cost:'none', duration:'none', eligibility:'none', failure:'none', outcome:'none', target:'none' });
  var BINDINGS = Object.freeze([
    freezeBinding({
      actionIndex:0, actionKey:'hold_settlement_perimeter', declaredStatus:'partial',
      handler:'ZekNovaGame.processEnemySpawning / ZekNovaGame.spawnEnemy autonomous perimeter pressure',
      sourceFile:'assets/index-02987539.js', sourceKind:'bundled-autonomous-runtime-behavior',
      sourceAnchors:['processEnemySpawning(','spawnEnemy(','ZekNovan patrol entering the biome'],
      requiredSurfaceFlags:['gameEnemyArray','gameProcessEnemySpawning','gameSpawnEnemy'],
      completionSignal:'enemy spawn/update loop continues; no canonical macro completion signal',
      dimensions:{actionExistence:'partial',cost:'none',duration:'none',eligibility:'none',failure:'none',outcome:'partial',target:'not_applicable'},
      unsupportedEffects:['readiness recovery is not implemented as a live faction metric','settlement security delta is not measurable from a canonical completion event','the behavior is autonomous and cannot be selected by W0-AF']
    }),
    freezeBinding({actionIndex:1,actionKey:'patrol_known_route',declaredStatus:'unbound',handler:null,sourceFile:null,sourceKind:'none',sourceAnchors:[],requiredSurfaceFlags:[],completionSignal:null,dimensions:NONE,unsupportedEffects:['no route-targeted ZekNovan patrol command exists','no canonical route patrol completion signal exists']}),
    freezeBinding({actionIndex:2,actionKey:'reconnoiter_forest_lane',declaredStatus:'unbound',handler:null,sourceFile:null,sourceKind:'none',sourceAnchors:[],requiredSurfaceFlags:[],completionSignal:null,dimensions:NONE,unsupportedEffects:['no faction recon command exists','no observation-production completion event is bound to a ZekNovan patrol']}),
    freezeBinding({
      actionIndex:3, actionKey:'intercept_hostile_contact', declaredStatus:'partial',
      handler:'ZekNovaGame.updateEnemies autonomous chase/attack loop',
      sourceFile:'assets/index-02987539.js', sourceKind:'bundled-autonomous-runtime-behavior',
      sourceAnchors:['updateEnemies(','fireEnemyProjectile(','spawnEnemy('],
      requiredSurfaceFlags:['gameEnemyArray','gameUpdateEnemies'],
      completionSignal:'enemy health/removal exists, but no action-bound intercept completion signal',
      dimensions:{actionExistence:'partial',cost:'none',duration:'none',eligibility:'partial',failure:'none',outcome:'partial',target:'none'},
      unsupportedEffects:['no canonical W0-AF target ID is accepted by the runtime loop','readiness and patrol-slot costs are not live faction resources','tension +2 is not action-bound','the autonomous enemy loop is not a selectable macro action']
    }),
    freezeBinding({actionIndex:4,actionKey:'screen_combat_alert',declaredStatus:'unbound',handler:null,sourceFile:null,sourceKind:'none',sourceAnchors:[],requiredSurfaceFlags:[],completionSignal:null,dimensions:NONE,unsupportedEffects:['combat alerts do not dispatch defender screening behavior','no action-bound settlement security effect exists']}),
    freezeBinding({actionIndex:5,actionKey:'reinforce_threatened_structure',declaredStatus:'unbound',handler:null,sourceFile:null,sourceKind:'none',sourceAnchors:[],requiredSurfaceFlags:[],completionSignal:null,dimensions:NONE,unsupportedEffects:['no ZekNovan reinforcement command targets damaged structures','no patrol-slot or materials parity exists']}),
    freezeBinding({actionIndex:6,actionKey:'repair_known_structure',declaredStatus:'unbound',handler:null,sourceFile:null,sourceKind:'none',sourceAnchors:[],requiredSurfaceFlags:[],completionSignal:null,dimensions:NONE,unsupportedEffects:['no ZekNovan repair crew command exists','building records have no action-bound repair completion event']}),
    freezeBinding({actionIndex:7,actionKey:'fortify_known_route',declaredStatus:'unbound',handler:null,sourceFile:null,sourceKind:'none',sourceAnchors:[],requiredSurfaceFlags:[],completionSignal:null,dimensions:NONE,unsupportedEffects:['no route fortification runtime command exists','route security is not a live authoritative metric']}),
    freezeBinding({actionIndex:8,actionKey:'secure_known_resource',declaredStatus:'unbound',handler:null,sourceFile:null,sourceKind:'none',sourceAnchors:[],requiredSurfaceFlags:[],completionSignal:null,dimensions:NONE,unsupportedEffects:['no ZekNovan resource-security patrol command exists','resource security is not a live authoritative metric']}),
    freezeBinding({actionIndex:9,actionKey:'stabilize_known_infrastructure',declaredStatus:'unbound',handler:null,sourceFile:null,sourceKind:'none',sourceAnchors:[],requiredSurfaceFlags:[],completionSignal:null,dimensions:NONE,unsupportedEffects:['no ZekNovan infrastructure stabilization command exists','repair crew and materials costs are not bound to live runtime state']}),
    freezeBinding({
      actionIndex:10, actionKey:'share_direct_intelligence', declaredStatus:'partial',
      handler:'PerceptionEventIntegration.shareEvent',
      sourceFile:'src/game/PerceptionEventIntegration.js', sourceKind:'explicit-grounded-intelligence-envelope',
      sourceAnchors:['shareEvent({','this.stream.share({','originalEventId'],
      requiredSurfaceFlags:['perceptionShareEvent'],
      completionSignal:'validated intelligence_shared event appended to W0-O.1 stream',
      dimensions:{actionExistence:'exact',cost:'none',duration:'partial',eligibility:'exact',failure:'exact',outcome:'partial',target:'exact'},
      unsupportedEffects:['readiness cost is not a live resource','trust +1 is not produced by intelligence sharing','cooldown is not action-bound in the live runtime']
    }),
    freezeBinding({
      actionIndex:11, actionKey:'open_defensive_channel', declaredStatus:'partial',
      handler:'RelationsPanel.perform / RelationsPanel.recordDelta / ZekNovaGame.resolveDiplomacy',
      sourceFile:'src/game/RelationsPanel.js', sourceKind:'player-facing-diplomacy-runtime',
      sourceAnchors:['perform(action)','recordDelta({ tension, trust, reason })','cooldownRemaining(action)'],
      requiredSurfaceFlags:['gameResolveDiplomacy','relationsPerform','relationsRecordDelta'],
      completionSignal:'player-facing diplomacy or reconciliation action updates tension/trust',
      dimensions:{actionExistence:'partial',cost:'none',duration:'none',eligibility:'partial',failure:'partial',outcome:'partial',target:'not_applicable'},
      unsupportedEffects:['no exact -10 tension +8 trust action exists','cooldowns are wall-clock seconds rather than control quanta','the surface is player initiated, not ZekNovan faction controlled','readiness cost is not live']
    }),
    freezeBinding({
      actionIndex:12, actionKey:'withdraw_exposed_patrol', declaredStatus:'partial',
      handler:'RelationsPanel.beginCeasefire / RelationsPanel.updateCeasefire',
      sourceFile:'src/game/RelationsPanel.js', sourceKind:'player-facing-ceasefire-runtime',
      sourceAnchors:['beginCeasefire()','updateCeasefire()','Observed ceasefire'],
      requiredSurfaceFlags:['relationsBeginCeasefire','relationsUpdateCeasefire'],
      completionSignal:'30-second no-fire ceasefire completion updates tension/trust',
      dimensions:{actionExistence:'partial',cost:'none',duration:'partial',eligibility:'partial',failure:'partial',outcome:'partial',target:'none'},
      unsupportedEffects:['no canonical patrol target is accepted','no patrol slot is released','readiness +8 is not live','the effect is player ceasefire behavior, not faction patrol withdrawal']
    })
  ]);

  var RUNTIME_SURFACE_KEYS = SURFACE_KEYS;
  var ENTRY_KEYS = Object.freeze(['actionIndex','actionKey','bindingId','completionSignal','declaredStatus','dimensions','effectiveStatus','handler','handlerAvailable','requiredSurfaceFlags','sourceAnchors','sourceFile','sourceKind','unsupportedEffects']);
  var REPORT_KEYS = Object.freeze(['actionCount','authority','candidateSetId','contractId','exactObservedCount','factionId','mode','mutatingProbeCount','observationId','paritySpaceId','partialObservedCount','planningStateId','productionReady','quantum','registryId','reportId','runtimeSurface','schemaVersion','sourceMissingCount','unboundCount','worldId','entries']);

  function isBindingId(value) { return typeof value === 'string' && /^zkpb:v1:[0-9a-f]{16}$/.test(value); }
  function isReportId(value) { return typeof value === 'string' && /^zkpr:v1:[0-9a-f]{16}$/.test(value); }
  function createRuntimeSurface(raw) {
    raw = raw || {};
    var out = {};
    RUNTIME_SURFACE_KEYS.forEach(function (key) {
      if (key === 'sourceVersion') out[key] = typeof raw[key] === 'string' && raw[key].length ? raw[key] : 'zeknova-live-runtime-surface-v1';
      else out[key] = raw[key] === true;
    });
    return Identity.canonicalize(out);
  }
  function validateRuntimeSurface(raw) {
    exactKeys(raw, RUNTIME_SURFACE_KEYS, 'runtime surface');
    RUNTIME_SURFACE_KEYS.forEach(function (key) {
      if (key === 'sourceVersion') string(raw[key], key);
      else bool(raw[key], key);
    });
    return createRuntimeSurface(raw);
  }
  function handlerAvailable(binding, surface) {
    if (binding.declaredStatus === 'unbound') return false;
    return binding.requiredSurfaceFlags.every(function (flag) { return surface[flag] === true; });
  }
  function effectiveStatus(binding, available) {
    if (binding.declaredStatus === 'unbound') return 'unbound';
    if (!available) return 'declared-source-missing';
    return binding.declaredStatus === 'exact' ? 'exact-observed' : 'partial-observed';
  }
  function reportBody(fields) {
    return Identity.canonicalize({
      actionCount: fields.actionCount,
      authority: fields.authority,
      candidateSetId: fields.candidateSetId,
      contractId: fields.contractId,
      entries: fields.entries,
      exactObservedCount: fields.exactObservedCount,
      factionId: fields.factionId,
      mode: fields.mode,
      mutatingProbeCount: fields.mutatingProbeCount,
      observationId: fields.observationId,
      paritySpaceId: fields.paritySpaceId,
      partialObservedCount: fields.partialObservedCount,
      planningStateId: fields.planningStateId,
      productionReady: fields.productionReady,
      quantum: fields.quantum,
      registryId: fields.registryId,
      runtimeSurface: fields.runtimeSurface,
      schemaVersion: fields.schemaVersion,
      sourceMissingCount: fields.sourceMissingCount,
      unboundCount: fields.unboundCount,
      worldId: fields.worldId
    });
  }
  function reportIdFor(body) { return REPORT_PREFIX + Identity.hash64x2(body); }
  function createParityReport(raw) {
    Identity.parseWorldId(raw.worldId);
    Identity.assertCanonicalIdentity(raw.factionId, 'factionId');
    invariant(/^zkid:v1:faction:/.test(raw.factionId), 'Invalid factionId.');
    integer(raw.quantum, 'quantum', 0);
    invariant(Observation.isObservationId(raw.observationId), 'Invalid observationId.');
    invariant(Forest.isStateId(raw.planningStateId), 'Invalid planningStateId.');
    invariant(Forest.isCandidateSetId(raw.candidateSetId), 'Invalid candidateSetId.');
    var surface = validateRuntimeSurface(createRuntimeSurface(raw.runtimeSurface));
    var entries = BINDINGS.map(function (binding) {
      var available = handlerAvailable(binding, surface);
      return Identity.canonicalize({
        actionIndex: binding.actionIndex,
        actionKey: binding.actionKey,
        bindingId: binding.bindingId,
        completionSignal: binding.completionSignal,
        declaredStatus: binding.declaredStatus,
        dimensions: binding.dimensions,
        effectiveStatus: effectiveStatus(binding, available),
        handler: binding.handler,
        handlerAvailable: available,
        requiredSurfaceFlags: binding.requiredSurfaceFlags,
        sourceAnchors: binding.sourceAnchors,
        sourceFile: binding.sourceFile,
        sourceKind: binding.sourceKind,
        unsupportedEffects: binding.unsupportedEffects
      });
    });
    var exactCount = entries.filter(function (entry) { return entry.effectiveStatus === 'exact-observed'; }).length;
    var partialCount = entries.filter(function (entry) { return entry.effectiveStatus === 'partial-observed'; }).length;
    var missingCount = entries.filter(function (entry) { return entry.effectiveStatus === 'declared-source-missing'; }).length;
    var unboundCount = entries.filter(function (entry) { return entry.effectiveStatus === 'unbound'; }).length;
    var body = reportBody({
      actionCount: Forest.ACTION_COUNT,
      authority: AUTHORITY,
      candidateSetId: raw.candidateSetId,
      contractId: CONTRACT_ID,
      entries: entries,
      exactObservedCount: exactCount,
      factionId: raw.factionId,
      mode: MODE,
      mutatingProbeCount: 0,
      observationId: raw.observationId,
      paritySpaceId: PARITY_SPACE_ID,
      partialObservedCount: partialCount,
      planningStateId: raw.planningStateId,
      productionReady: exactCount === Forest.ACTION_COUNT && missingCount === 0 && unboundCount === 0,
      quantum: raw.quantum,
      registryId: REGISTRY_ID,
      runtimeSurface: surface,
      schemaVersion: SCHEMA_VERSION,
      sourceMissingCount: missingCount,
      unboundCount: unboundCount,
      worldId: raw.worldId
    });
    return Identity.canonicalize(Object.assign({}, body, { reportId: reportIdFor(body) }));
  }
  function validateParityReport(raw) {
    exactKeys(raw, REPORT_KEYS, 'live parity report');
    invariant(Array.isArray(raw.entries) && raw.entries.length === Forest.ACTION_COUNT, 'Parity report must include every action.');
    raw.entries.forEach(function (entry) {
      exactKeys(entry, ENTRY_KEYS, 'live parity entry');
      invariant(isBindingId(entry.bindingId), 'Invalid bindingId.');
      invariant(EFFECTIVE_STATUSES.indexOf(entry.effectiveStatus) >= 0, 'Unknown effective parity status.');
    });
    var expected = createParityReport(raw);
    invariant(isReportId(raw.reportId) && Identity.canonicalStringify(raw) === Identity.canonicalStringify(expected), 'Live parity report does not match canonical computation.');
    return expected;
  }

  return Object.freeze({
    SCHEMA_VERSION: SCHEMA_VERSION,
    CONTRACT_ID: CONTRACT_ID,
    REGISTRY_ID: REGISTRY_ID,
    PARITY_SPACE_ID: PARITY_SPACE_ID,
    MODE: MODE,
    AUTHORITY: AUTHORITY,
    DECLARED_STATUSES: DECLARED_STATUSES,
    EFFECTIVE_STATUSES: EFFECTIVE_STATUSES,
    DIMENSION_KEYS: DIMENSION_KEYS,
    RUNTIME_SURFACE_KEYS: RUNTIME_SURFACE_KEYS,
    BINDINGS: BINDINGS,
    isBindingId: isBindingId,
    isReportId: isReportId,
    createRuntimeSurface: createRuntimeSurface,
    validateRuntimeSurface: validateRuntimeSurface,
    createParityReport: createParityReport,
    validateParityReport: validateParityReport
  });
});
