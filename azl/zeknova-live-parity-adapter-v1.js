/* ZekNova Live Parity Adapter v1 — read-only measurement surface. */
(function (g) {
  'use strict';
  var C = g.ZekNovaLiveParityContract;
  if (!C) throw new Error('Live parity contract must load before adapter.');
  var adapter = {
    id: 'zeknova-live-parity-adapter-v1',
    contractId: C.CONTRACT_ID,
    paritySpaceId: C.PARITY_SPACE_ID,
    mode: C.MODE,
    authority: C.AUTHORITY,
    actionCount: C.BINDINGS.length,
    bindings: C.BINDINGS,
    captureLocalParity: function (options) {
      var integration = g.ZekNovaLiveParityIntegration;
      if (!integration) throw new Error('Live parity integration is unavailable.');
      return integration.captureLocalParity(options || {});
    },
    captureForFaction: function (factionId, options) {
      var integration = g.ZekNovaLiveParityIntegration;
      if (!integration) throw new Error('Live parity integration is unavailable.');
      return integration.captureForFaction(factionId, options || {});
    },
    captureRuntimeSurface: function () {
      var integration = g.ZekNovaLiveParityIntegration;
      if (!integration) throw new Error('Live parity integration is unavailable.');
      return integration.captureRuntimeSurface();
    }
  };
  g.ZEK_LIVE_PARITY_ADAPTER = Object.freeze(adapter);
})(typeof globalThis !== 'undefined' ? globalThis : this);
