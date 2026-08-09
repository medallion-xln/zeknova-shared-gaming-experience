# Stage 1A-Z.7 — Adaptive Compute Allocation

Replaces the fixed 96-simulation policy with deterministic evidence-based allocation.

Measured at simulation checkpoints: root entropy, expert disagreement, visit margin, value margin, action stability, and state familiarity.

Candidate budgets: **32, 48, 64, 96, 128 simulations**. Mandatory root coverage, Stage 1A-Z.4 value calibration, Stage 1A-Z.5 selective horizon, and Stage 1A-Z.6 deterministic memoization semantics remain preserved.

Authority remains none. The contract evaluates and recommends only.
