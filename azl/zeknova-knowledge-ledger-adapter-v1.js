/* Read-only W0-O.2 adapter. It exposes only faction-scoped event-derived knowledge. */
(function (root) {
  'use strict';
  root.ZEK_FACTION_KNOWLEDGE_ADAPTER = Object.freeze({
    id: 'zeknova-faction-knowledge-adapter-v1',
    schemaVersion: 1,
    captureKnowledgeSnapshot: function () {
      var integration = root.ZekNovaFactionKnowledgeIntegration;
      if (!integration || typeof integration.captureSnapshot !== 'function') {
        throw new Error('ZekNova faction knowledge integration is not installed.');
      }
      return integration.captureSnapshot();
    },
    knowledgeSnapshotHash: function (snapshot) {
      var C = root.ZekNovaIdentityContract;
      if (!C) throw new Error('ZekNova identity contract is unavailable.');
      return C.hash64x2(snapshot);
    },
    recordsForFaction: function (factionId, options) {
      var integration = root.ZekNovaFactionKnowledgeIntegration;
      if (!integration) throw new Error('ZekNova faction knowledge integration is not installed.');
      return integration.recordsForFaction(factionId, options);
    },
    getRecord: function (factionId, subjectId, topic, options) {
      var integration = root.ZekNovaFactionKnowledgeIntegration;
      if (!integration) throw new Error('ZekNova faction knowledge integration is not installed.');
      return integration.getRecord(factionId, subjectId, topic, options);
    }
  });
})(typeof globalThis !== 'undefined' ? globalThis : this);
