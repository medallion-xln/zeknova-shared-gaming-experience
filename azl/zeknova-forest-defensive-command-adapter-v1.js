/* W0-P.1 public adapter — read-only command inspection. Live issue/advance remains on the incumbent controller only. */
(function (g) {
  'use strict';
  var C = g.ZekNovaForestDefensiveCommandContract;
  if (!C) throw new Error('Forest defensive command contract must load before adapter.');
  g.ZEK_FOREST_DEFENSIVE_COMMAND_ADAPTER = Object.freeze({
    id: 'zeknova-forest-defensive-command-adapter-v1',
    contractId: C.CONTRACT_ID,
    commandSpaceId: C.COMMAND_SPACE_ID,
    mode: C.MODE,
    requiredAuthority: C.REQUIRED_AUTHORITY,
    supportedActionIndexes: C.SUPPORTED_ACTION_INDEXES,
    commandDefinitions: C.COMMAND_DEFINITIONS,
    captureRuntimeSnapshot: function () {
      var integration = g.ZekNovaForestDefensiveCommandIntegration;
      if (!integration) throw new Error('Forest defensive command integration is unavailable.');
      return integration.captureRuntimeSnapshot();
    },
    getCommand: function (commandId) {
      var integration = g.ZekNovaForestDefensiveCommandIntegration;
      if (!integration) throw new Error('Forest defensive command integration is unavailable.');
      return integration.getCommand(commandId);
    }
  });
})(typeof globalThis !== 'undefined' ? globalThis : this);
