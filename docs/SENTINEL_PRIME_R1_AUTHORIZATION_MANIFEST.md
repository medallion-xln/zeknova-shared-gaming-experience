# Sentinel Prime R1 Authorization Manifest

Status: **AWAITING EXPLICIT HUMAN AUTHORIZATION**. Live execution is disabled.

## Baseline R0

- `BASELINE_R0_CERTIFIED=true`
- Git HEAD: `9015537fb0e2b6cc3e2d24901e78b40b5de191e0`
- Git status SHA-256: `6bbb7c1998328a0e63b3c8d2f33f41350d0a7964f91f462f21b0c4ec12e468de`
- Git diff SHA-256: `901f827130b00197ac3ad66cd45b5573469c7df88117a39974b281bb76c599da`
- Prime runtime SHA-256: `d8938f0f02a450a79a5326708a378eae6c31dbc1d839b30bd424853d5f897866`
- W0-P.2 contract SHA-256: `5cfec8bb0c7de88061910085fb8f53a81bfd8e6b818f9c57ccb9ed43d55789f4`
- W0-P.2 runtime SHA-256: `a7831f4b9d7776b6c823bbf80855b696f82a8077ee81fba245c43d3e2f93f49f`

The baseline was captured from an already-dirty working tree without overwriting user changes. The complete test suite passed immediately before R1 implementation.

## Allowlist

| Prime action | Supported W0-P.2 command |
|---|---|
| `stabilize` | `hold_settlement_perimeter` |
| `scout_region` | `reconnoiter_forest_lane` |
| `intercept_contact` | `intercept_hostile_contact` |
| `fortify_known_route` | `fortify_known_route` |
| `repair_known_structure` | `repair_known_structure` |
| `share_intelligence` | `share_verified_intelligence` |

All other commands are denied. Prime cannot directly mutate the world. The executor requires canonical identity, legal mask agreement, allowlist membership, W0-P.2 hard-safety legality, target rebinding, matching provenance, freshness within one quantum, an authorization capability, and a single session identity.

## Kill switch and rollback

Call `ZekNovaSentinelPrimeR1.killSwitch(reason)` to fail closed immediately. It disables dispatch and returns authority to R0; the incumbent scripted controller remains installed and unchanged. Reloading without an explicit authorization capability also starts at R0.

Automatic fallback occurs on executor exceptions, stale state, provenance mismatch, illegal actions, target-binding failures, and repeated recommendation execution.

## Files introduced or changed

- `src/world/PrimeR1Authority.js`
- `src/game/SentinelPrimeExecutor.js`
- `tests/sentinel-prime-r1-authority.test.mjs`
- `docs/SENTINEL_PRIME_R1_AUTHORIZATION_MANIFEST.md`
- `src/main.js`
- `package.json`

## Current gate

Gates 1–3 are implemented. Gate 4 has automated dry-run coverage but still requires authentic-session parity evidence. Gate 5 is intentionally closed. No browser-facing authorization method is exposed and no R1 token is issued automatically.

An authorization decision must reference the final SHA-256 of this manifest. Authorization applies to one authenticated local canary session only.
