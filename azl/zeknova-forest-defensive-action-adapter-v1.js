/* ZekNova Forest Defensive Action Adapter v1 — read-only planning surface. */
(function (g) {
  'use strict';
  var C = g.ZekNovaForestDefensiveActionContract;
  if (!C) throw new Error('Forest defensive action contract must load before adapter.');
  var adapter = {
    id: 'zeknova-forest-defensive-action-adapter-v1',
    contractId: C.CONTRACT_ID,
    actionSpaceId: C.ACTION_SPACE_ID,
    actionCount: C.ACTION_COUNT,
    rootStance: C.ROOT_STANCE,
    authority: C.AUTHORITY,
    actions: C.ACTIONS,
    captureLocalActionSet: function (options) {
      var integration = g.ZekNovaForestDefensiveActionIntegration;
      if (!integration) throw new Error('Forest defensive action integration is unavailable.');
      return integration.captureLocalActionSet(options || {});
    },
    captureForFaction: function (factionId, options) {
      var integration = g.ZekNovaForestDefensiveActionIntegration;
      if (!integration) throw new Error('Forest defensive action integration is unavailable.');
      return integration.captureForFaction(factionId, options || {});
    },
    projectLocalOutcome: function (actionIndex, targetId, options) {
      var integration = g.ZekNovaForestDefensiveActionIntegration;
      if (!integration) throw new Error('Forest defensive action integration is unavailable.');
      return integration.projectLocalOutcome(actionIndex, targetId, options || {});
    }
  };
  g.ZEK_FOREST_DEFENSIVE_ACTION_ADAPTER = Object.freeze(adapter);
})(typeof globalThis !== 'undefined' ? globalThis : this);
