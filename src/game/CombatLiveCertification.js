const local = () => ["localhost", "127.0.0.1", "::1"].includes(globalThis.location?.hostname);

/** Runs only inside an isolated localhost performance fixture, after timing capture. */
export function certifyLiveCombat({ game, results, feedback } = {}) {
  if (!local() || !game?.qaPerformanceFixture || !new URLSearchParams(location.search).has("combatCertification")) return null;
  const boss = game.bossManager?.boss, player = game.player;
  if (!boss || !player) return Object.freeze({ pass: false, reason: "active production boss unavailable" });
  const health = Number(boss.userData.health), playerHealth = Number(player.health), xp = Number(player.xp), outbox = [...(game.bossManager.damageOutbox || [])];
  const priorHits = Number(boss.userData.bossConsecutiveHits || 0), priorLast = Number(boss.userData.bossLastHitAt || 0), priorStun = Number(boss.userData.bossStunnedAt || 0);
  const resultBefore = results.results.length, feedbackBefore = feedback.events.length;
  boss.userData.bossConsecutiveHits = 0; boss.userData.bossLastHitAt = 0; boss.userData.bossStunnedAt = 0;
  for (let index = 0; index < 4; index += 1) game.damageWeaponTarget(boss, 1, 0xffffff, "rifle");
  const bossResults = results.results.slice(resultBefore);
  game.bossManager.debugPlayerDamage = true;
  game.bossDamageInvulnerableUntil = 0; game.bossRollIFrameUntil = 0;
  game.bossManager.damagePlayer(1, "zek21-live-probe", "zek21-projectile");
  const allResults = results.results.slice(resultBefore);
  const output = Object.freeze({
    missionId: game.bossManager.config?.missionId,
    bossId: boss.userData.bossId,
    bossActive: Boolean(game.bossManager.active),
    combatResults: allResults.length,
    feedbackDispatches: feedback.events.length - feedbackBefore,
    bossDamageResults: bossResults.length,
    bossStaggered: bossResults.some((result) => result.bossStaggered),
    playerDamageResult: allResults.some((result) => result.targetType === "player" && result.attribution?.projectileId === "zek21-projectile"),
    exactOnce: feedback.events.length - feedbackBefore === allResults.length,
    pass: bossResults.length === 4 && allResults.length === 5 && feedback.events.length - feedbackBefore === 5 && bossResults.some((result) => result.bossStaggered),
  });
  boss.userData.health = health; player.health = playerHealth; player.xp = xp;
  boss.userData.bossConsecutiveHits = priorHits; boss.userData.bossLastHitAt = priorLast; boss.userData.bossStunnedAt = priorStun;
  game.bossManager.damageOutbox = outbox; game.updateHud?.(true);
  return output;
}

export default certifyLiveCombat;
