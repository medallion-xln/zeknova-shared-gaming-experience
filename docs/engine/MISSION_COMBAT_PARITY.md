# Bounded mission and combat parity — ZGE-04

Both systems remain pure, non-authoritative evaluators. No live campaign, boss, projectile, health or reward owner changes.

`reduceMission` extends ZGE-03's target evaluator with a serializable command ledger, duplicate/conflict handling and ordered event proposals: objective progress in definition order → mission completion → reward eligibility. Prerequisites lock evaluation. Completion suppresses repeat rewards even under a new command ID. Eligibility never changes an inventory. Representative fixtures compare building, either-building, biome visit, biome resources, biome building and boss completion against the actual readable legacy `objectiveComplete`. The original suite still checks all twelve mission definitions and existing encounter behavior. This does not certify every commissioning condition or a full campaign playthrough.

`reduceCombat` extends the pure damage proposal with legal-target lookup, command idempotency, immutable target state, health transitions, damage/death events and serializable reduction state. It uses existing hit-validation/projectile-owner options. Tests compare numeric damage and defeat flags against the actual legacy `createCombatResult` publisher over twelve health/damage combinations, and verify illegal targets, failed hit masks, wrong projectile ownership, invalid damage and duplicate conflicts cannot mutate the input or charge health again. Event order is damage then death; repeated command IDs emit no new events.

The legacy result publisher is an observation oracle for already-resolved numeric outcomes, not proof that armor, immunity, boss defense, stagger, projectile travel or weapon feel have been extracted. Those remain legacy rules. Browser regression rechecks actual damage and a controlled Sunscar boss defeat/reward record; the new reducers do not take part in those authoritative mutations.

Pure reducers return proposals and detached state. An eventual gameplay owner must apply them once and persist the ledger with state. They are not a network authority layer, a reward transport, or a replacement for the twelve mission/boss FSMs.
