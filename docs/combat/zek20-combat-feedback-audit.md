# ZEK-20 combat-feedback audit

Recorded at source HEAD `9015537fb0e2b6cc3e2d24901e78b40b5de191e0`. The worktree already contained prior milestone changes. Intended-owner checks found no concurrent writer during this change.

| Path | Production owner/event | Existing response | ZEK-20 response |
|---|---|---|---|
| Player fire/projectile creation | reconstructed `Game.attack` and weapon-specific fire methods | weapon model recoil, muzzle/projectile visuals | preserved; no damage or cadence changes |
| Projectile hit/damage | `Game.damageWeaponTarget` confirmed `true` plus observed health delta | impact pulse, knockback, XP/boss bookkeeping | one immutable impact descriptor, marker, pooled sparks, synthetic transient, layered canvas impulse |
| Enemy hit/stagger | `damageWeaponTarget` and existing enemy state | push/knockback and certified stagger rules | bounded directional cosmetic yaw flinch; gameplay stagger unchanged |
| Enemy death | authoritative health/death cleanup | existing death/reward lifecycle | distinct kill marker, stronger bounded impulse, accent; reward logic unchanged |
| Boss damage/phase | `damageWeaponTarget`, `BossManager` | boss HUD, phases, telegraphs, stun bookkeeping | restrained boss hit response and phase marker; no per-shot boss flinch |
| Player damage/death | `BossManager.damagePlayer`, `updateEnemyProjectiles`, `updateEnemyUnit` | health mutation, pulse/toast/HUD, existing death lifecycle | directional indicator, severity-scaled impulse/haptic/audio, low-health vignette |

## Ownership and constraints

- Damage authority: existing reconstructed `Game` and `BossManager` methods.
- Hit feedback, camera impulse, presentation hold, synthetic audio, and DOM VFX authority: `CombatFeedbackDirector` at R0 presentation authority.
- “Hit stop” is a 0–42 ms presentation hold only. Simulation, networking, persistence, UI, and asynchronous timers are never paused or scaled.
- Camera response transforms the renderer canvas, never the gameplay camera or controls. Impulses decay, stack to a maximum of 12, and respect reduced-motion preference.
- VFX uses 16 preallocated DOM sparks and a 64-entry diagnostic event ring. No per-hit particle-system allocation occurs after mount.
- Critical, weak-point, armor, and miss classifications are not synthesized because the current confirmed-damage surface does not expose authoritative flags. Existing Picasso silhouettes and boss telegraphs remain the source of those cues.

## Certification scope

The deterministic ZEK-20 test covers normal, heavy, multi-hit/player-damage, and boss descriptors corresponding to normal encounters and Missions 4, 8, and 12 classes. It verifies exact-once confirmed feedback, unchanged damage results, four-way direction classification, bounded camera accumulation, bounded history, disposal/restoration, and presentation-only authority. The full repository regression certifies the 12 missions, 12 bosses, persistence, multiplayer identity, reset, physics, reconstruction, and ZEK-16 through ZEK-19 gates.

The representative Scene 6 WebGL submission count remains structurally 739: ZEK-20 adds only a fixed DOM overlay and does not add a Three.js object, material, texture, renderer call, or draw hook. The matched baseline samples remain p95 16.7/16.8 ms and p99 17.0/17.5 ms. A new browser timing capture was not taken, so no post-change p95/p99 claim is made.
