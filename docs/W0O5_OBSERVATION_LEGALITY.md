# W0-O.5 — Observation-Sensitive Legality

W0-O.5 converts a validated W0-O.3 faction observation into a deterministic legal-target view and an observation mask for a six-action development action space.

The observation layer never reads the authoritative world and never executes an action. It intersects with an explicit upstream mask that represents native and lifecycle legality already decided elsewhere.

## Development actions

1. `stabilize` — observation-independent safe fallback
2. `scout_region` — requires a fresh known route
3. `intercept_contact` — requires a fresh hostile unit contact
4. `fortify_known_route` — requires a fresh known route
5. `repair_known_structure` — requires a fresh damaged or disabled structure
6. `share_intelligence` — requires a fresh direct-acquisition knowledge slot

## Precedence

1. Terminal or replan boundary masks every action.
2. Upstream native/lifecycle mask is preserved.
3. Observation and target requirements are applied.
4. Final legality is the bitwise intersection.

Observation knowledge cannot resurrect an action already blocked upstream. Targets omitted by W0-O.3 fixed-capacity overflow are reported as omitted but cannot be selected because their target IDs are absent from the canonical target view.

This phase is read-only and development-scoped. Prime authority and action execution remain out of scope until W0-O.6 shadow integration and later authority gates.
