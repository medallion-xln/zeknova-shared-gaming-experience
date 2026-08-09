/* Read-only W0-O.6 Sentinel Prime shadow adapter. Never executes or commits actions. */
(function (root) {
  'use strict';
  function integration() {
    var value = root.ZekNovaPrimeShadowIntegration;
    if (!value) throw new Error('ZekNova Prime shadow integration is not installed.');
    return value;
  }
  function clone(value) {
    var I = root.ZekNovaIdentityContract;
    if (!I) throw new Error('ZekNova identity contract is unavailable.');
    return I.stableClone(value);
  }
  root.ZEK_PRIME_SHADOW_ADAPTER = Object.freeze({
    id: 'zeknova-prime-shadow-adapter-v1',
    schemaVersion: 1,
    engineId: 'sentinel-prime-root-puct-v1-development',
    featureLayoutId: 'zeknova-prime-observation-layout-v1',
    featureCount: 592,
    actionSpaceId: 'zeknova-observation-action-space-v1-development',
    actionCount: 6,
    mode: 'shadow-only',
    authority: 'none-no-action-execution',
    runForFaction: function (factionId, options) {
      return clone(integration().runForFaction(factionId, options));
    },
    runLocalShadow: function (options) {
      return clone(integration().runLocalShadow(options));
    },
    captureTelemetrySnapshot: function () {
      return clone(integration().captureTelemetrySnapshot());
    },
    captureTelemetryHash: function () {
      return integration().captureTelemetryHash();
    },
    entries: function () {
      return clone(integration().entries());
    }
  });
})(typeof globalThis !== 'undefined' ? globalThis : this);
