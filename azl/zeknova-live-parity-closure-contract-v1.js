/*
 * ZekNova Live Parity Closure Contract v1
 * W0-P.3: deterministic, read-only certification that all thirteen W0-AF
 * Forest Defensive planning actions have exact incumbent-only command lifecycles.
 *
 * Universal module. Exact same bytes install in ZekNova and Sentinel Grid.
 * No command issue, execution, dispatch, world mutation, wall clock, network, or storage.
 */
(function (root, factory) {
  var api = factory(
    root.ZekNovaIdentityContract,
    root.ZekNovaFactionObservationContract,
    root.ZekNovaForestDefensiveActionContract,
    root.ZekNovaForestDefensiveCommandContractV2
  );
  root.ZekNovaLiveParityClosureContract = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (Identity, Observation, Forest, CommandV2) {
  'use strict';

  if (!Identity || Identity.CONTRACT_ID !== 'zeknova-identity-contract-v1') throw new Error('Parity closure requires zeknova-identity-contract-v1.');
  if (!Observation || Observation.CONTRACT_ID !== 'zeknova-faction-observation-contract-v1') throw new Error('Parity closure requires zeknova-faction-observation-contract-v1.');
  if (!Forest || Forest.CONTRACT_ID !== 'zeknova-forest-defensive-action-contract-v1') throw new Error('Parity closure requires zeknova-forest-defensive-action-contract-v1.');
  if (!CommandV2 || CommandV2.CONTRACT_ID !== 'zeknova-forest-defensive-command-contract-v2') throw new Error('Parity closure requires zeknova-forest-defensive-command-contract-v2.');

  var SCHEMA_VERSION = 1;
  var CONTRACT_ID = 'zeknova-live-parity-closure-contract-v1';
  var REGISTRY_ID = 'zeknova-live-parity-closure-v1-development';
  var PARITY_SPACE_ID = 'zeknova-forest-defensive-live-parity-closure-v1';
  var MODE = 'measurement-only-parity-closure';
  var AUTHORITY = 'none-no-action-execution';
  var HISTORICAL_W0P_DISPOSITION = 'preserved-as-historical-pre-command-runtime-measurement';
  var BINDING_PREFIX = 'zkpcb:v1:';
  var REPORT_PREFIX = 'zkpcr:v1:';
  var EFFECTIVE_STATUSES = Object.freeze(['exact-observed', 'source-missing']);
  var DIMENSION_KEYS = Object.freeze(['actionExistence','authority','completion','cost','duration','eligibility','failure','target']);
  var SURFACE_KEYS = Object.freeze([
    'commandContractV2',
    'commandIntegrationV2',
    'forestActionIntegration',
    'incumbentControllerV2',
    'publicAdapterV2',
    'registryBindingCount',
    'sourceVersion',
    'supportedActionCount'
  ]);

  function invariant(value, message) { if (!value) throw new Error(message); }
  function integer(value, name, min) { invariant(Number.isInteger(value) && value >= (min == null ? 0 : min), name + ' must be an integer >= ' + (min == null ? 0 : min) + '.'); return value; }
  function string(value, name) { invariant(typeof value === 'string' && value.length > 0, name + ' must be a nonempty string.'); return value; }
  function bool(value, name) { invariant(typeof value === 'boolean', name + ' must be boolean.'); return value; }
  function exactKeys(raw, keys, label) {
    invariant(raw && typeof raw === 'object' && !Array.isArray(raw), label + ' must be an object.');
    var actual = Object.keys(raw).sort();
    var expected = keys.slice().sort();
    invariant(Identity.canonicalStringify(actual) === Identity.canonicalStringify(expected), label + ' has unexpected or missing fields.');
  }
  function isBindingId(value) { return typeof value === 'string' && /^zkpcb:v1:[0-9a-f]{16}$/.test(value); }
  function isReportId(value) { return typeof value === 'string' && /^zkpcr:v1:[0-9a-f]{16}$/.test(value); }
  function frozenStringArray(value) { return Object.freeze(value.map(String)); }

  var HANDLERS = Object.freeze([
    'holdSettlementPerimeter',
    'patrolKnownRoute',
    'reconnoiterForestLane',
    'interceptHostileContact',
    'screenCombatAlert',
    'reinforceThreatenedStructure',
    'repairKnownStructure',
    'fortifyKnownRoute',
    'secureKnownResource',
    'stabilizeKnownInfrastructure',
    'shareDirectIntelligence',
    'openDefensiveChannel',
    'withdrawExposedPatrol'
  ]);

  function exactDimensions() {
    return Object.freeze(Identity.canonicalize({
      actionExistence:'exact',
      authority:'exact',
      completion:'exact',
      cost:'exact',
      duration:'exact',
      eligibility:'exact',
      failure:'exact',
      target:'exact'
    }));
  }

  function bindingBody(raw) {
    return Identity.canonicalize({
      actionIndex: raw.actionIndex,
      actionKey: raw.actionKey,
      assignmentMode: raw.assignmentMode,
      completionSignals: raw.completionSignals,
      cooldownQuanta: raw.cooldownQuanta,
      costHash: raw.costHash,
      dimensions: raw.dimensions,
      executionQuanta: raw.executionQuanta,
      handler: raw.handler,
      requiredAuthority: raw.requiredAuthority,
      requiresTarget: raw.requiresTarget,
      targetTopics: raw.targetTopics
    });
  }

  function freezeBinding(index) {
    var action = Forest.ACTIONS[index];
    var definition = CommandV2.COMMAND_DEFINITIONS[index];
    invariant(action && definition && action.index === index && definition.actionIndex === index, 'Missing action or command definition at index ' + index + '.');
    invariant(action.key === definition.actionKey, 'Action and command definition key mismatch.');
    var body = bindingBody({
      actionIndex:index,
      actionKey:action.key,
      assignmentMode:definition.assignmentMode,
      completionSignals:frozenStringArray(definition.completionSignals),
      cooldownQuanta:definition.cooldownQuanta,
      costHash:Identity.hash64x2(action.cost),
      dimensions:exactDimensions(),
      executionQuanta:definition.executionQuanta,
      handler:HANDLERS[index],
      requiredAuthority:CommandV2.REQUIRED_AUTHORITY,
      requiresTarget:Boolean(definition.requiresTarget),
      targetTopics:frozenStringArray(definition.targetTopics || [])
    });
    return Object.freeze(Object.assign({}, body, { bindingId:BINDING_PREFIX + Identity.hash64x2(body) }));
  }

  var BINDINGS = Object.freeze(Array.from({ length: Forest.ACTION_COUNT }, function (_, index) { return freezeBinding(index); }));

  var RUNTIME_SURFACE_KEYS = SURFACE_KEYS;
  function createRuntimeSurface(raw) {
    raw = raw || {};
    return Identity.canonicalize({
      commandContractV2:bool(raw.commandContractV2, 'commandContractV2'),
      commandIntegrationV2:bool(raw.commandIntegrationV2, 'commandIntegrationV2'),
      forestActionIntegration:bool(raw.forestActionIntegration, 'forestActionIntegration'),
      incumbentControllerV2:bool(raw.incumbentControllerV2, 'incumbentControllerV2'),
      publicAdapterV2:bool(raw.publicAdapterV2, 'publicAdapterV2'),
      registryBindingCount:integer(raw.registryBindingCount, 'registryBindingCount', 0),
      sourceVersion:string(raw.sourceVersion, 'sourceVersion'),
      supportedActionCount:integer(raw.supportedActionCount, 'supportedActionCount', 0)
    });
  }
  function validateRuntimeSurface(raw) {
    exactKeys(raw, RUNTIME_SURFACE_KEYS, 'parity closure runtime surface');
    return createRuntimeSurface(raw);
  }
  function surfaceComplete(surface) {
    return surface.commandContractV2 && surface.commandIntegrationV2 && surface.forestActionIntegration && surface.incumbentControllerV2 && surface.publicAdapterV2 && surface.registryBindingCount === Forest.ACTION_COUNT && surface.supportedActionCount === Forest.ACTION_COUNT;
  }

  var ENTRY_KEYS = Object.freeze(['actionIndex','actionKey','assignmentMode','bindingId','completionSignals','cooldownQuanta','costHash','dimensions','effectiveStatus','executionQuanta','handler','requiredAuthority','requiresTarget','targetTopics']);
  var REPORT_KEYS = Object.freeze(['actionCount','authority','candidateSetId','commandParityComplete','contractId','entries','exactObservedCount','factionId','historicalW0PDisposition','missingCount','mode','mutatingProbeCount','observationId','paritySpaceId','planningStateId','productionReady','quantum','registryId','reportId','runtimeSurface','schemaVersion','sentinelAuthority','strategicCompetenceClaim','worldId']);

  function reportBody(raw) {
    return Identity.canonicalize({
      actionCount:raw.actionCount,
      authority:raw.authority,
      candidateSetId:raw.candidateSetId,
      commandParityComplete:raw.commandParityComplete,
      contractId:raw.contractId,
      entries:raw.entries,
      exactObservedCount:raw.exactObservedCount,
      factionId:raw.factionId,
      historicalW0PDisposition:raw.historicalW0PDisposition,
      missingCount:raw.missingCount,
      mode:raw.mode,
      mutatingProbeCount:raw.mutatingProbeCount,
      observationId:raw.observationId,
      paritySpaceId:raw.paritySpaceId,
      planningStateId:raw.planningStateId,
      productionReady:raw.productionReady,
      quantum:raw.quantum,
      registryId:raw.registryId,
      runtimeSurface:raw.runtimeSurface,
      schemaVersion:raw.schemaVersion,
      sentinelAuthority:raw.sentinelAuthority,
      strategicCompetenceClaim:raw.strategicCompetenceClaim,
      worldId:raw.worldId
    });
  }

  function createClosureReport(raw) {
    raw = raw || {};
    Identity.parseWorldId(raw.worldId);
    Identity.assertCanonicalIdentity(raw.factionId, 'factionId');
    invariant(/^zkid:v1:faction:/.test(raw.factionId), 'Invalid factionId.');
    integer(raw.quantum, 'quantum', 0);
    invariant(Observation.isObservationId(raw.observationId), 'Invalid observationId.');
    invariant(Forest.isStateId(raw.planningStateId), 'Invalid planningStateId.');
    invariant(Forest.isCandidateSetId(raw.candidateSetId), 'Invalid candidateSetId.');
    var surface = validateRuntimeSurface(createRuntimeSurface(raw.runtimeSurface));
    var complete = surfaceComplete(surface);
    var entries = BINDINGS.map(function (binding) {
      return Identity.canonicalize(Object.assign({}, binding, { effectiveStatus:complete ? 'exact-observed' : 'source-missing' }));
    });
    var exactCount = complete ? Forest.ACTION_COUNT : 0;
    var missingCount = complete ? 0 : Forest.ACTION_COUNT;
    var body = reportBody({
      actionCount:Forest.ACTION_COUNT,
      authority:AUTHORITY,
      candidateSetId:raw.candidateSetId,
      commandParityComplete:complete,
      contractId:CONTRACT_ID,
      entries:entries,
      exactObservedCount:exactCount,
      factionId:raw.factionId,
      historicalW0PDisposition:HISTORICAL_W0P_DISPOSITION,
      missingCount:missingCount,
      mode:MODE,
      mutatingProbeCount:0,
      observationId:raw.observationId,
      paritySpaceId:PARITY_SPACE_ID,
      planningStateId:raw.planningStateId,
      productionReady:false,
      quantum:raw.quantum,
      registryId:REGISTRY_ID,
      runtimeSurface:surface,
      schemaVersion:SCHEMA_VERSION,
      sentinelAuthority:false,
      strategicCompetenceClaim:false,
      worldId:raw.worldId
    });
    return Identity.canonicalize(Object.assign({}, body, { reportId:REPORT_PREFIX + Identity.hash64x2(body) }));
  }

  function validateClosureReport(raw) {
    exactKeys(raw, REPORT_KEYS, 'parity closure report');
    invariant(isReportId(raw.reportId), 'Invalid parity closure reportId.');
    invariant(Array.isArray(raw.entries) && raw.entries.length === Forest.ACTION_COUNT, 'Parity closure report must contain thirteen entries.');
    raw.entries.forEach(function (entry, index) {
      exactKeys(entry, ENTRY_KEYS, 'parity closure entry');
      invariant(isBindingId(entry.bindingId), 'Invalid parity closure bindingId.');
      invariant(entry.actionIndex === index && entry.actionKey === Forest.ACTIONS[index].key, 'Parity closure entry ordering mismatch.');
      invariant(EFFECTIVE_STATUSES.indexOf(entry.effectiveStatus) >= 0, 'Unknown parity closure effective status.');
      exactKeys(entry.dimensions, DIMENSION_KEYS, 'parity closure dimensions');
      DIMENSION_KEYS.forEach(function (key) { invariant(entry.dimensions[key] === 'exact', 'Parity closure dimensions must remain exact declarations.'); });
    });
    var expected = createClosureReport(raw);
    invariant(Identity.canonicalStringify(raw) === Identity.canonicalStringify(expected), 'Parity closure report does not match canonical computation.');
    return expected;
  }

  return Object.freeze({
    SCHEMA_VERSION:SCHEMA_VERSION,
    CONTRACT_ID:CONTRACT_ID,
    REGISTRY_ID:REGISTRY_ID,
    PARITY_SPACE_ID:PARITY_SPACE_ID,
    MODE:MODE,
    AUTHORITY:AUTHORITY,
    HISTORICAL_W0P_DISPOSITION:HISTORICAL_W0P_DISPOSITION,
    EFFECTIVE_STATUSES:EFFECTIVE_STATUSES,
    DIMENSION_KEYS:DIMENSION_KEYS,
    RUNTIME_SURFACE_KEYS:RUNTIME_SURFACE_KEYS,
    BINDINGS:BINDINGS,
    isBindingId:isBindingId,
    isReportId:isReportId,
    createRuntimeSurface:createRuntimeSurface,
    validateRuntimeSurface:validateRuntimeSurface,
    createClosureReport:createClosureReport,
    validateClosureReport:validateClosureReport
  });
});
