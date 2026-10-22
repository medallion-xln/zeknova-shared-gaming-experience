# Live authority migration gate — ZGE-05

**NO-GO for live takeover. LEGACY remains the sole live construction writer. No live legacy mutation path is disabled, no ENGINE flag is enabled and no minified patch is added.** Source-world ENGINE ownership and server fixture arbitration are separately executable and tested.

| Takeover condition | Live result / remaining proof |
|---|---|
| Disable every legacy writer | FAIL: pointer/place, direct addRecord, restore, drag, repair, enemy damage and multiplayer health merge remain independent |
| Engine sole writer | Independent scene only; source-owned live commit port absent |
| Preserve every side effect | FAIL: complete utility/health/terrain traversal, aid callback/benefits, rank/progression, territory, all campaign/rewards and presentation ordering not fully ported |
| Exactly one charge per accepted logical transaction | Certified locally/server fixture; no live construction journal |
| Preserve mission progression | Example mission/reward certified; live progression remains legacy |
| Persistence compatibility | Existing v4 and XP/save transport preserved/tested; source checkpoint deliberately separate; no complete runtime↔v4 migration |
| Authorized multiplayer | Tested fixture only; PHP command arbitration unproven |
| Deterministic rollback | Prior cooperating AuthorityDomain/LIFO fixtures and new replay pass; live multi-effect rollback unproven |
| Browser regression | Current game and independent world covered; bounded parity cannot close missing side effects |
| No unsafe bundle patch | Met by retaining legacy; source-level complete port is still required |

The observed `buildings.place` seam cannot stop pointer XP/diplomacy/save, addRecord restore/network paths, dragging and direct health mutations. `ZekNovaLegacyBridge` is lifecycle-only. Another wrapper would not establish sole authority. The new runtime is the specified independent-source alternative, not a live compatibility substitution.

## Concrete replacement specification

1. Implement a readable `ConstructionCommandPort` in the live game shell, covering input/selection/place, relocate begin/update/commit/cancel, repair, damage, remove/reset, restore and network reconciliation. All effect owners and mutation sites in SOURCE_RUNTIME_RECONSTRUCTION must route through it. Rendering receives snapshots/events, never writable records.
2. Initially route that port to the existing legacy implementation. Instrument every writer with a required private lease; raw helpers become inaccessible outside the selected writer. No unguarded arrays, health assignments or callback side channels remain. Validate interception coverage with adversarial inactive-writer/direct-call tests.
3. Specify ZekNova-specific pure terrain/utility/health/aid/rank/diplomacy/mission policies and explicit randomness/clock inputs. Resolve the missing original aid effect method before claiming parity. Reproduce exact IDs/rotations/save references; expanded canonical fixtures must cover all side effects and known failure paths. Deliberate fixes need separate behavior acceptance rather than silent normalization.
4. Map v4 + extension into a new versioned runtime checkpoint including personal/rank/aid/health/utility/mission/reward/idempotency state. Prove migration and inverse export on real bounded saved worlds. Do not restore authority permission from a snapshot. Use checkpoint/delta histories and retained command tombstones rather than dropping receipts arbitrarily.
5. Put multiplayer construction commands behind the real authenticated transactional server protocol described in MULTIPLAYER_CONSTRUCTION_CERTIFICATION. No client snapshot may spend team resources authoritatively. Certify actual process crashes, concurrent clients, auth, fencing, delayed replies and server storage.
6. Only after all ports/policies/persistence/server/effects pass, activate one local development ENGINE lease through the existing AuthorityDomain policy, atomically migrate state/journal, prove the legacy writer cannot run, and test immediate rollback under a fresh fence. Then separately qualify production release; do not automatically promote dirty artifacts.

Other independent release blockers: urgent owner credential rotation/history remediation, three unreconciled golden hashes/original-build provenance, duplicate embedded Three instance, exact historical GLTF hang root cause and remaining page-only teardown. Asset/KTX2 fault tests mitigate their tested conditions without closing the original hang attribution.
