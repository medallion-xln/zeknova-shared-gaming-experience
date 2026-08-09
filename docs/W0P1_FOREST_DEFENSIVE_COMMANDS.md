# W0-P.1 — Canonical Live Forest Defensive Command Interface

W0-P.1 adds the first incumbent-authorized live command path for three W0-AF actions:

- `patrol_known_route`
- `intercept_hostile_contact`
- `withdraw_exposed_patrol`

## Authority boundary

The public Sentinel-facing adapter is read-only. It can inspect command records and runtime snapshots but cannot issue, execute, dispatch, commit, or apply a command. Live commands require the explicit authority source `incumbent-scripted-ai` and are issued only through `zeknova-incumbent-forest-command-controller-v1`. Requests labeled `sentinel-prime`, `sentinel-router`, `shadow-replay`, or `test-projection` are rejected.

## Lifecycle

```text
candidate → accepted → active → completed | failed | interrupted
```

Costs are deducted exactly once at acceptance. Cooldown begins at the terminal command quantum. Patrol and intercept reserve a live patrol assignment; withdrawal reuses the currently assigned patrol and can interrupt a committed patrol or intercept command.

## Live effects

`patrol_known_route` moves a registered patrol to the grounded route endpoint and returns it to its defensive origin. `intercept_hostile_contact` resolves the canonical observed subject to the live enemy identity and moves the patrol into intercept range; it does not apply damage. `withdraw_exposed_patrol` transfers the active assignment and returns the patrol to its defensive origin.

## Scope

This phase proves the command interface and lifecycle for the first three actions. It does not grant Sentinel authority, does not bind the remaining ten W0-AF actions, and does not claim full W0-P strategic outcome parity.
