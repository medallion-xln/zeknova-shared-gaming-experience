/* Read-only W0-O.1 adapter. It exposes only the grounded event stream. */
(function (root) {
  'use strict';
  root.ZEK_PERCEPTION_EVENT_ADAPTER = Object.freeze({
    id: 'zeknova-perception-event-adapter-v1',
    schemaVersion: 1,
    capturePerceptionEventSnapshot: function () {
      var integration = root.ZekNovaPerceptionEventIntegration;
      if (!integration || typeof integration.captureSnapshot !== 'function') {
        throw new Error('ZekNova perception event integration is not installed.');
      }
      return integration.captureSnapshot();
    },
    perceptionEventSnapshotHash: function (snapshot) {
      var C = root.ZekNovaIdentityContract;
      if (!C) throw new Error('ZekNova identity contract is unavailable.');
      return C.hash64x2(snapshot);
    },
    eventsForFaction: function (factionId) {
      var integration = root.ZekNovaPerceptionEventIntegration;
      if (!integration) throw new Error('ZekNova perception event integration is not installed.');
      return integration.stream.eventsForFaction(factionId);
    },
    getEvent: function (eventId) {
      var integration = root.ZekNovaPerceptionEventIntegration;
      if (!integration) throw new Error('ZekNova perception event integration is not installed.');
      return integration.stream.getEvent(eventId);
    }
  });
})(typeof globalThis !== 'undefined' ? globalThis : this);
