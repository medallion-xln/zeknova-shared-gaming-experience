# W0-P.2 — Complete Forest Defensive Command Runtime

W0-P.2 supersedes the three-action W0-P.1 runtime with one canonical incumbent-only command surface for all thirteen W0-AF Forest Defensive actions.

The runtime preserves the authority boundary:

- `incumbent-scripted-ai` plus a module-private capability may issue a live command.
- Sentinel Prime, the Router, shadow replay, and test projections are rejected.
- The public adapter is read-only and exposes only snapshots and command lookup.

## Runtime assignments

Actions use one of five assignment modes: `none`, `patrol`, `repair`, `patrol-and-repair`, or `reuse-patrol`.

Costs are deducted once at acceptance. Every action has explicit completion, failure, interruption, and cooldown state. Targeted commands must use the exact W0-AF target ID from the current private faction observation.

## Newly bound actions

W0-P.2 adds live handlers for perimeter holding, forest-lane reconnaissance, combat-alert screening, structure reinforcement and repair, route fortification, resource security, infrastructure stabilization, direct intelligence sharing, and defensive diplomacy. It retains parity-compatible handlers for patrol, intercept, and withdrawal.

This phase establishes deterministic command lifecycles. It does not grant Sentinel authority and does not prove strategic competence.
