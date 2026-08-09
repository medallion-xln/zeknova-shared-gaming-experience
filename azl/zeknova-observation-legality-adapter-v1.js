/* Read-only W0-O.5 adapter. Computes target and mask projections; never executes actions. */
(function (root) {
  'use strict';
  function integration() {
    var value = root.ZekNovaObservationLegalityIntegration;
    if (!value) throw new Error('ZekNova observation legality integration is not installed.');
    return value;
  }
  function clone(value) {
    var I = root.ZekNovaIdentityContract;
    if (!I) throw new Error('ZekNova identity contract is unavailable.');
    return I.stableClone(value);
  }
  root.ZEK_OBSERVATION_LEGALITY_ADAPTER = Object.freeze({
    id: 'zeknova-observation-legality-adapter-v1',
    schemaVersion: 1,
    actionSpaceId: 'zeknova-observation-action-space-v1-development',
    actionCount: 6,
    authority: 'read-only-no-action-execution',
    captureTargetView: function (factionId, options) {
      return integration().captureTargetView(factionId, options);
    },
    captureLocalTargetView: function (options) {
      return integration().captureLocalTargetView(options);
    },
    intersectForFaction: function (factionId, upstreamMask, options) {
      return integration().intersectForFaction(factionId, upstreamMask, options);
    },
    intersectForLocalFaction: function (upstreamMask, options) {
      return integration().intersectForLocalFaction(upstreamMask, options);
    },
    selectTarget: function (targetView, observation, actionIndex, targetId) {
      var C = root.ZekNovaObservationLegalityContract;
      if (!C) throw new Error('ZekNova observation legality contract is unavailable.');
      return clone(C.selectTarget(targetView, observation, actionIndex, targetId));
    }
  });
})(typeof globalThis !== 'undefined' ? globalThis : this);
