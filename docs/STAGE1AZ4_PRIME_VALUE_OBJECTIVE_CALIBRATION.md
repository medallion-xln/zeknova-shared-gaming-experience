# Stage 1A-Z.4 — Prime Value and Objective Calibration

Status: `provisional-linux-only`

Stage 1A-Z.4 evaluates isolated value-calibration variants on the Stage 1A-Z.3 mandatory-root-coverage candidate. It preserves 96 simulations, depth 8, uniform legal priors, no rollout, deterministic action-index tie-breaking, scenario dynamics, and zero live authority.

Variants:

1. Frozen Stage 1A-Z.3 raw lexicographic scalar reproduction.
2. Bounded normalized objective scalar.
3. Bounded normalized scalar with explicit terminal separation — selected candidate.
4. Terminal separation plus conservative stalled-state penalty.
5. Bounded base-101 lexicographic scalar.

The selected candidate returns `+1` for certified objective completion, `-1` for settlement destruction, and a bounded normalized objective value for nonterminal states. It does not read authored witness plans, success plans, failure plans, or critical-action lists.

This phase does not claim strategic competence, production readiness, actual-incumbent superiority, or command authority.
