# Sentinel Goban Intelligence Verification

Sentinel's expanded strategy model uses a standard 19×19 goban: 19 vertical lines × 19 horizontal lines = 361 addressable intersections. The board is a strategic abstraction over the ZekNova world, not replacement collision geometry.

## What it proposes to control

1. **Actor tactics:** role-specific behavior from civilians and workers through scouts, conventional ZekNovans, juggernauts, and bosses.
2. **Combat strategy:** threat positioning, chokepoints, telegraphed boss phases, engagement, reassessment, withdrawal, or escalation.
3. **Infrastructure:** build, defend, sabotage, and repair priorities for routes, power, water, communications, defenses, and shelters.
4. **Diplomacy:** ceasefire, withdrawal, safe-passage, resource-exchange, and surrender proposals.
5. **Day/night:** requests for dawn/day/dusk/night when the cycle supports a tactical or civilian objective. Mission and safety rules remain authoritative.
6. **Gameplay improvement:** candidate policies may be evaluated against a frozen baseline. They cannot rewrite code or self-promote; human promotion is mandatory.
7. **Combat initiation:** a proposed sequence of observe → position → telegraph → engage → reassess → withdraw/escalate. Starting an encounter remains a separately certified command.

## How intelligence is verified

Each canonical state must pass these steps:

1. Map every relevant entity to one of 361 intersections.
2. Produce the same plan twice from the same canonical state.
3. Prove every actor/action/target is legal for its role.
4. Prove civilians never receive lethal intents.
5. Prove bosses use readable telegraphed sequences.
6. Change one meaningful fact—such as tension—and confirm the strategy responds.
7. Compare role plans and confirm different roles do not collapse into one behavior.
8. Evaluate the candidate against a frozen baseline across identical scenarios.
9. Reject promotion on any regression, illegal action, unexplained mutation, or missing outcome measurement.
10. Replay through a dry-run adapter, demonstrate rollback, then require a new human authorization manifest for each control domain.

This verifies deterministic, state-sensitive, role-differentiated planning. It does not treat complexity or random behavior as intelligence.

## Current authority

The expanded goban system is evaluation-only: `canDispatch=false`, `canMutateLiveWorld=false`. Existing Sentinel Prime R1 remains limited to its six certified reversible actions. Enemy control, bosses, infrastructure creation, diplomacy, world-cycle changes, policy promotion, and combat initiation require separate adapters and certification; they are not silently added to R1.

## R0 live-adapter candidates

`SentinelGobanShadowAdapters` translates every verified actor intent plus infrastructure, diplomacy, world-cycle, and combat-sequence proposals into immutable shadow command records. Each record retains the state hash, plan and command identities, coordinate, actor, role, target, legal evidence, incumbent baseline action, predicted/actual outcome binding, provenance, and rollback recipe.

`SentinelGobanShadowIntegration` captures the current ZekNova actors, boss, infrastructure, player threat, tension, ceasefire, and quantum without exposing an execute method. It hashes state before and after proposal generation and rejects any mutation. Authentic-session records are stored in memory for parity export. Fixture tests validate this capture path, but fixture evidence is not sufficient to mark the authentic-session campaign complete.

The 2026-08-09 authenticated local campaign completed six read-only observation windows. Determinism, incumbent binding, observed-outcome binding, provenance, rollback, legality, civilian safety, boss telegraph ordering, and zero mutation passed. The preserved evidence is `docs/governance/evidence/goban-authentic-parity-20260809.json`. Baseline comparison and counterfactual coverage remain incomplete because the session did not expose the required civilian, infrastructure, objective, positioning, mission-outcome, day/night, boss-stage, and candidate counterfactual measurements. The authority recommendation therefore remains `REJECT`.

The append-only coverage audit added two further authenticated windows without changing the first artifact. It is preserved as `docs/governance/evidence/goban-coverage-audit-20260809.json`. Runtime capability probes confirmed that no approved Goban counterfactual simulator or live day/night state exists and that the observed session contained no canonical civilian-safety outcome, infrastructure population, scalar objective outcome, positioning-quality evaluator, completed mission outcome, or active boss stage. These absences fail closed; they are not replaced by fixtures or synthetic values.
