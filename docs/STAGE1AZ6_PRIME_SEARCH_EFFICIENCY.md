# Stage 1A-Z.6 — Prime Search Efficiency

Status: **provisional-linux-only**.

This phase evaluates deterministic memoization of legal actions, transitions, and leaf values around the frozen Stage 1A-Z.5 search policy. The selected candidate must preserve the exact action sequence, root ranking, objective outcomes, 96-simulation budget, selective horizon behavior, and no-authority boundary.

Canonical efficiency evidence excludes wall-clock timing. It records computation counts and cache hits so results remain portable across machines.
