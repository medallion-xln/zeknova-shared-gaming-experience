/**
 * BossCombat — separate combat module for boss attack behavior and mission-forced confrontations.
 * Missions decide WHEN combat starts; BossCombat controls HOW enemies fight.
 */
import { BOSS_CONFIGS, MISSION_BOSS_IDS } from "./BossSystem.js";
import { MISSION_OBJECTIVES, COMMISSIONING_CONFIG, COMMISSIONING_REGEN_MS, commissioningAttackerIds, missionReadyForBoss } from "./Missions.js";

// ---------------------------------------------------------------------------
// State architecture — separate permanent vs per-run vs QA
// ---------------------------------------------------------------------------
// permanent: zeknova.save.v1.<teamCode> (buildings, resources, commissioningEncounters, permanent boss unlocks)
// per-run:  zeknova.bossRun.v1.<teamCode> in sessionStorage (bosses fought since refresh, reset on new run)
// QA:       zeknova.qa.* — debug only, never merged into production save
export const BOSS_RUN_KEY = (teamCode) => `zeknova.bossRun.v1.${teamCode || "default"}`;
export const QA_BOSS_KEY = (teamCode) => `zeknova.qa.bossDefeats.v1.${teamCode || "default"}`;

function readRunState(teamCode) {
  try {
    const raw = sessionStorage.getItem(BOSS_RUN_KEY(teamCode));
    return raw ? JSON.parse(raw) : { bossDefeats: {}, startedAt: Date.now() };
  } catch { return { bossDefeats: {}, startedAt: Date.now() }; }
}
function writeRunState(teamCode, state) {
  try { sessionStorage.setItem(BOSS_RUN_KEY(teamCode), JSON.stringify(state)); } catch {}
}
export function getRunBossDefeats(teamCode) {
  return readRunState(teamCode).bossDefeats || {};
}
export function markRunBossDefeated(teamCode, defeat) {
  const s = readRunState(teamCode);
  s.bossDefeats[defeat.missionId] = defeat;
  writeRunState(teamCode, s);
}
export function resetRunBossState(teamCode) {
  try { sessionStorage.removeItem(BOSS_RUN_KEY(teamCode)); } catch {}
  writeRunState(teamCode, { bossDefeats: {}, startedAt: Date.now() });
}
export function isQaMode() {
  try { return ["localhost","127.0.0.1","::1"].includes(location.hostname) && new URLSearchParams(location.search).has("qaBoss"); } catch { return false; }
}

// ---------------------------------------------------------------------------
// Boss attack state — thin wrappers over zkBossManager (no duplication)
// ---------------------------------------------------------------------------
let _gameRef = null;
export function attachGame(game) { _gameRef = game; }

export function startBossEncounter(bossId, context = {}) {
  if (!_gameRef?.bossManager) return false;
  const missionId = Object.entries(MISSION_BOSS_IDS).find(([, id]) => id === bossId)?.[0] || context.missionId;
  if (!missionId) return false;
  return _gameRef.bossManager.startEncounter({ missionId, ...(context.seed ? { seed: context.seed } : {}), ...(context.force ? { force: true } : {}) });
}
export function updateBossCombat(dt) {
  if (!_gameRef?.bossManager?.active) return;
  _gameRef.bossManager.update(dt);
}
export function resetBossEncounter(bossId) {
  if (!_gameRef?.bossManager) return;
  if (_gameRef.bossManager.config?.id === bossId) _gameRef.bossManager.cleanup(false);
  cleanupBossCombat();
}
export function cleanupBossCombat() {
  if (!_gameRef?.bossManager) return;
  _gameRef.bossManager.pool?.clear?.();
  _gameRef.bossManager.clearTelegraphs?.();
}

// ---------------------------------------------------------------------------
// Forced mission confrontation — Highlands 1 Juggernaut + 2 Red shooters (spitter)
// ---------------------------------------------------------------------------
export function spawnMissionConfrontation(game, missionId) {
  const cfg = COMMISSIONING_CONFIG[missionId];
  if (!cfg) return false;
  if (typeof game._spawnCommissioningGroup === "function") return game._spawnCommissioningGroup(missionId);
  // Fallback tension-independent triple
  const roles = cfg.attackers.map(a => a.role);
  let spawned = 0;
  for (const role of roles) {
    const e = game.spawnEnemy(true, role);
    if (e) { e.userData.hostile = true; e.userData.guardian = false; if (e.userData.juggernautState) e.userData.juggernautState = "pursuit"; spawned++; }
  }
  return spawned === 3;
}

// ---------------------------------------------------------------------------
// Helpers for deterministic refresh (no Mission 1 flash)
// ---------------------------------------------------------------------------
export function nextBossInRunOrder(game, permanentContext) {
  const team = String(game.user?.teamCode || "default");
  const runDefeats = getRunBossDefeats(team);
  // All mission ids in campaign order (from Missions.js order)
  const order = Object.keys(MISSION_OBJECTIVES);
  // Find first mission that is unlocked (permanent buildings done) but not yet fought this run
  for (const mid of order) {
    if (runDefeats[mid]) continue;
    // The run ledger is transient, but permanent mission readiness remains authoritative.
    if (missionReadyForBoss(mid, permanentContext)) return mid;
  }
  return null;
}
