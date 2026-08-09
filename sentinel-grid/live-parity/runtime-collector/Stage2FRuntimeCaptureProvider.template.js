/*
 * Optional exact provider template.
 * Register this only from the existing read-only Prime shadow path, after it has
 * produced the real snapshot envelope and the real legacy Stage 1A-Z evidence.
 */
globalThis.ZekNovaStage2FCaptureProvider = Object.freeze({
  async collect(context = {}) {
    // Return the actual runtime-owned data. Do not synthesize or fill defaults.
    const envelope = globalThis.ZEK_NOVA_CURRENT_STAGE2F_ENVELOPE;
    const legacyEvidence = globalThis.ZEK_NOVA_CURRENT_STAGE2F_LEGACY_EVIDENCE;
    if (!envelope || !legacyEvidence) return null;
    return {
      captureVersion: 1,
      context: {
        factionId: context.factionId,
        biomeId: context.biomeId,
        missionId: context.missionId,
        missionPhase: context.missionPhase,
        tensionBand: context.tensionBand,
        infrastructureBand: context.infrastructureBand,
        tick: context.tick,
      },
      envelope,
      legacyEvidence,
    };
  },
});
