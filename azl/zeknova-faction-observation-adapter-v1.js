/* Read-only W0-O.3 adapter. Exposes only canonical faction-private Prime observations. */
(function (root) {
  'use strict';
  function integration() {
    var value = root.ZekNovaFactionObservationIntegration;
    if (!value) throw new Error('ZekNova faction observation integration is not installed.');
    return value;
  }
  function clone(value) {
    var I = root.ZekNovaIdentityContract;
    if (!I) throw new Error('ZekNova identity contract is unavailable.');
    return I.stableClone(value);
  }
  root.ZEK_FACTION_OBSERVATION_ADAPTER = Object.freeze({
    id: 'zeknova-faction-observation-adapter-v1',
    schemaVersion: 1,
    featureLayoutId: 'zeknova-prime-observation-layout-v1',
    featureCount: 592,
    captureFactionObservation: function (factionId, options) {
      return integration().captureForFaction(factionId, options);
    },
    captureLocalFactionObservation: function (options) {
      return integration().captureLocalFaction(options);
    },
    observationHash: function (packet) {
      var C = root.ZekNovaFactionObservationContract;
      if (!C) throw new Error('ZekNova faction observation contract is unavailable.');
      return new C.FactionObservation(packet).hash();
    },
    featureVector: function (packet) {
      var C = root.ZekNovaFactionObservationContract;
      if (!C) throw new Error('ZekNova faction observation contract is unavailable.');
      return new C.FactionObservation(packet).features();
    },
    capturePrimeInput: function (factionId, options) {
      var packet = integration().captureForFaction(factionId, options);
      return clone({
        factionId: packet.factionId,
        featureCount: packet.featureCount,
        featureLayoutId: packet.featureLayoutId,
        featureVector: packet.featureVector,
        observationId: packet.observationId,
        quantum: packet.quantum,
        worldId: packet.worldId
      });
    }
  });
})(typeof globalThis !== 'undefined' ? globalThis : this);
