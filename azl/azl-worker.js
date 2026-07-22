'use strict';

/*
 * Sentinel Grid ZekNova Search Worker v2
 *
 * Expected sibling files:
 *   ./zeknova-adapter.js
 *   ./azl-engine.js
 *
 * The main thread must capture the live ZekNova state through:
 *   AZL_ADAPTER.captureSearchState()
 *
 * Then send that plain-object state to this worker.
 */

importScripts('./zeknova-adapter.js?v=azl4', './azl-engine.js?v=azl4');

var EXPECTED_ADAPTER_VERSION = 2;
var EXPECTED_STATE_SCHEMA_VERSION = 2;
var EXPECTED_FEATURE_SPEC_VERSION = 2;
var EXPECTED_ACTION_SPACE_VERSION = 1;
var EXPECTED_TELEMETRY_VERSION = 1;

function hasOwn(object, key) {
  return Object.prototype.hasOwnProperty.call(object, key);
}

function getDependencies() {
  var adapter = self.AZL_ADAPTER;
  var engine = self.AZL && self.AZL.StrategicEngine;

  if (!adapter) {
    throw new Error(
      'ZekNova adapter did not initialize. ' +
      'Confirm that zeknova-adapter.js exists beside this worker.'
    );
  }

  if (!engine || typeof engine.search !== 'function') {
    throw new Error(
      'AZL StrategicEngine did not initialize. ' +
      'Confirm that azl-engine.js exists beside this worker.'
    );
  }

  if (!adapter.sim) {
    throw new Error('ZekNova adapter is missing its simulation contract.');
  }

  if (!Array.isArray(adapter.actions) || adapter.actions.length === 0) {
    throw new Error('ZekNova adapter action space is unavailable.');
  }

  return {
    adapter: adapter,
    engine: engine
  };
}

function verifyAdapterVersions(adapter) {
  var mismatches = [];

  if (adapter.version !== EXPECTED_ADAPTER_VERSION) {
    mismatches.push(
      'adapter version ' +
      adapter.version +
      ' != ' +
      EXPECTED_ADAPTER_VERSION
    );
  }

  if (adapter.stateSchemaVersion !== EXPECTED_STATE_SCHEMA_VERSION) {
    mismatches.push(
      'state schema version ' +
      adapter.stateSchemaVersion +
      ' != ' +
      EXPECTED_STATE_SCHEMA_VERSION
    );
  }

  if (adapter.featureSpecVersion !== EXPECTED_FEATURE_SPEC_VERSION) {
    mismatches.push(
      'feature specification version ' +
      adapter.featureSpecVersion +
      ' != ' +
      EXPECTED_FEATURE_SPEC_VERSION
    );
  }

  if (adapter.actionSpaceVersion !== EXPECTED_ACTION_SPACE_VERSION) {
    mismatches.push(
      'action-space version ' +
      adapter.actionSpaceVersion +
      ' != ' +
      EXPECTED_ACTION_SPACE_VERSION
    );
  }

  if (adapter.telemetryVersion !== EXPECTED_TELEMETRY_VERSION) {
    mismatches.push(
      'telemetry version ' +
      adapter.telemetryVersion +
      ' != ' +
      EXPECTED_TELEMETRY_VERSION
    );
  }

  if (mismatches.length) {
    throw new Error(
      'ZekNova worker rejected an incompatible adapter: ' +
      mismatches.join('; ')
    );
  }
}

function validateSearchState(adapter, state) {
  if (!state || typeof state !== 'object' || Array.isArray(state)) {
    throw new TypeError(
      'A captured ZekNova search-state object is required.'
    );
  }

  if (state.telemetryValid !== true) {
    throw new Error(
      'The supplied state was not created from valid live ZekNova telemetry.'
    );
  }

  if (!state.resources || typeof state.resources !== 'object') {
    throw new Error('Search state is missing resources.');
  }

  if (!state.indicators || typeof state.indicators !== 'object') {
    throw new Error('Search state is missing indicators.');
  }

  if (!state.buildings || typeof state.buildings !== 'object') {
    throw new Error('Search state is missing buildings.');
  }

  if (!Array.isArray(state.missionTargets)) {
    throw new Error('Search state is missing missionTargets.');
  }

  if (!Array.isArray(state.completedAOs)) {
    throw new Error('Search state is missing completedAOs.');
  }

  if (
    !Number.isFinite(Number(state.officerBonus)) ||
    Number(state.officerBonus) <= 0
  ) {
    throw new Error('Search state contains an invalid officerBonus.');
  }

  if (
    !Number.isFinite(Number(state.missionProgress)) ||
    Number(state.missionProgress) < 0 ||
    Number(state.missionProgress) > 100
  ) {
    throw new Error('Search state contains invalid missionProgress.');
  }

  if (
    typeof adapter.captureTransitionIdentity === 'function'
  ) {
    var identity = adapter.captureTransitionIdentity(state);

    if (!identity || typeof identity !== 'object') {
      throw new Error(
        'Adapter failed to create a canonical transition identity.'
      );
    }
  }

  var mask = new Uint8Array(adapter.actions.length);
  adapter.sim.legalMask(state, mask);

  var legalCount = 0;

  for (var i = 0; i < mask.length; i++) {
    if (mask[i]) legalCount++;
  }

  if (legalCount === 0) {
    throw new Error('Search state has no legal strategic actions.');
  }
}

function normalizeOptions(options) {
  options = options && typeof options === 'object'
    ? options
    : {};

  var normalized = {};

  if (options.simulations != null) {
    normalized.simulations = Number(options.simulations);
  }

  if (options.depth != null) {
    normalized.depth = Number(options.depth);
  }

  if (options.timeBudgetMs != null) {
    normalized.timeBudgetMs = Number(options.timeBudgetMs);
  }

  if (options.minimumSimulations != null) {
    normalized.minimumSimulations =
      Number(options.minimumSimulations);
  }

  if (options.cPuct != null) {
    normalized.cPuct = Number(options.cPuct);
  }

  if (options.seed != null) {
    normalized.seed = Number(options.seed) >>> 0;
  }

  return normalized;
}

function serializeError(error) {
  return {
    name: String(error && error.name || 'Error'),
    message: String(
      error && error.message ||
      error ||
      'Unknown ZekNova worker error.'
    )
  };
}

self.onmessage = function (event) {
  var message = event.data || {};
  var id = hasOwn(message, 'id') ? message.id : null;

  try {
    if (
      message.type != null &&
      message.type !== 'search'
    ) {
      throw new Error(
        'Unsupported worker message type: ' + message.type
      );
    }

    var dependencies = getDependencies();
    var adapter = dependencies.adapter;
    var engine = dependencies.engine;

    verifyAdapterVersions(adapter);
    validateSearchState(adapter, message.state);

    var options = normalizeOptions(message.options);

    var result = engine.search(
      adapter,
      message.state,
      options
    );

    if (!result || typeof result !== 'object') {
      throw new Error(
        'AZL StrategicEngine returned an invalid search result.'
      );
    }

    self.postMessage({
      id: id,
      type: 'search-result',
      ok: true,
      result: result,
      binding: {
        adapterId: adapter.id,
        adapterVersion: adapter.version,
        stateSchemaVersion: adapter.stateSchemaVersion,
        featureSpecVersion: adapter.featureSpecVersion,
        actionSpaceVersion: adapter.actionSpaceVersion,
        telemetryVersion: adapter.telemetryVersion,
        featureCount: adapter.featureCount,
        engineVersion: engine.version
      }
    });
  } catch (error) {
    self.postMessage({
      id: id,
      type: 'search-error',
      ok: false,
      error: serializeError(error)
    });
  }
};
