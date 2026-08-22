const AUTHORITY = Object.freeze({
  tier: "R0_RECOMMENDATION_ONLY",
  canDispatch: false,
  canMutateLiveWorld: false,
  canControlActors: false,
  canChangeGameplayOutcome: false,
  canModifyMissionState: false,
  canModifyPhysics: false,
  canModifySaveState: false,
  canModifyMultiplayerSync: false,
});

function classify(actor) {
  if (actor.boss || actor.immediateThreat || actor.missionCritical) return "T0";
  if (actor.infrastructureCritical) return "T1";
  if (actor.distance <= 44) return "T2";
  if (actor.civilian && actor.sameBiome) return "T3";
  return "T4";
}

self.onmessage = (event) => {
  if (event.data?.type !== "classify") return;
  const recommendations = (event.data.observation?.actors || []).map((actor) => ({ id: actor.id, suggestedTier: classify(actor) }));
  self.postMessage({ type: "recommendations", authority: AUTHORITY, recommendations });
};
