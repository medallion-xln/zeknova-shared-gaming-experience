# ZEK-22 animation, audio, and choreography audit

## Animation capability map

| Family | Idle/move | Attack | Directional hit | Generic hit/stagger | Death | Runtime choice |
|---|---|---|---|---|---|---|
| Player officer rigs | walk/run | rifle fire, roll-fire; pose support varies by rank | none | none | Ensign death asset | existing player controller; no combat-rule changes |
| Stalker, spitter, skyray, saboteur, juggernaut | walk/run | procedural production attacks | none | none | model controller `playDeath` where HQ model is resident | bounded directional procedural fallback |
| Ancient Thornwarden | idle/run | slam | none | no dedicated stagger | model controller death | authored slam vocabulary for stagger/phase request |
| Spore Cantor | walk/run | production spore patterns; no dedicated authored attack clip | none | none | model controller death | boss pulse fallback; production pattern remains primary |
| White Screecher | base/run | judgment, combo, dive | none | no dedicated stagger | model controller death | judgment for stagger, dive for phase choreography |
| Other certified bosses | idle/run coverage varies | judgment/combo/slash/slam/throw/dive depending on family | none | none | model controller death | production attack mapping and safe pulse fallback |

No new mixers are allocated. `CombatReactionDirector` requests existing model-controller actions, performs bounded fallback transforms, and never delays damage, AI, boss lifecycle, or cleanup.

## Audio inventory

No `.wav`, `.ogg`, `.mp3`, `.m4a`, `.aac`, or `.flac` combat assets exist in the repository. Authored weapon-body, creature-response, environment-tail, and boss-defeat assets remain an asset gap.

`CombatAudioDirector` therefore uses project-owned procedural synthesis with deterministic roles for normal, heavy, kill, boss hit, defense mitigation, boss stagger, phase, and player damage. Major events use two or three restrained layers. Playback is capped at 16 simultaneous oscillator voices and 3 layers per event; ended nodes disconnect and leave the active set.

## Ownership

- Combat truth: immutable `CombatResult` from production rules.
- Reaction requests: `CombatReactionDirector`, R0 animation presentation.
- Audio: `CombatAudioDirector`, bounded procedural presentation.
- Camera, HUD, VFX, and orchestration: `CombatFeedbackDirector`.
- Gameplay timing, health, AI goals, boss stagger duration, phases, death, and campaign completion remain untouched.
