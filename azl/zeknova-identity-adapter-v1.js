/* W0-O.0 read-only bridge from the live identity integration to AZL. */
(function (g) {
  'use strict';
  var Contract = g.ZekNovaIdentityContract;
  if (!Contract && typeof require === 'function') {
    try { Contract = require('./zeknova-identity-contract-v1.js'); } catch (_) {}
  }
  if (!Contract) throw new Error('ZekNova identity contract is required before the identity adapter.');

  function integration() {
    return g.ZekNovaIdentityIntegration || null;
  }

  function captureIdentitySnapshot() {
    var active = integration();
    if (!active || typeof active.captureSnapshot !== 'function') {
      throw new Error('ZekNova identity integration is not installed.');
    }
    var snapshot = active.captureSnapshot();
    return Contract.stableClone(snapshot);
  }

  function cloneIdentitySnapshot(snapshot) {
    return Contract.IdentityRegistry.fromSnapshot(snapshot).snapshot();
  }

  function identitySnapshotHash(snapshot) {
    return Contract.hash64x2(snapshot);
  }

  g.ZEK_IDENTITY_ADAPTER = Object.freeze({
    id: 'zeknova-identity-adapter-v1',
    schemaVersion: 1,
    registryId: Contract.REGISTRY_ID,
    captureIdentitySnapshot: captureIdentitySnapshot,
    cloneIdentitySnapshot: cloneIdentitySnapshot,
    identitySnapshotHash: identitySnapshotHash
  });
})(typeof globalThis !== 'undefined' ? globalThis : self);
