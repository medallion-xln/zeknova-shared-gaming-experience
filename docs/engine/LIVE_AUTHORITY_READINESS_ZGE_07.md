# Live construction authority decision — ZGE-07

**NO-GO for live ENGINE authority. Live ZekNova remains LEGACY; legacy writer disabled = NO. No production activation or development-only live takeover was performed.**

The independent `ConstructionPort` is the concrete replacement boundary. A scene/transport consumes immutable confirmed state; commands enter one private runtime through a durable host. This runs without importing the historical game. Live cutover would require routing every historical writer to that boundary, reconstructing the complete affected world/economy, then revoking old mutation access before enabling the new owner. A flag or place-only wrapper cannot do that.

| Required gate | ZGE-07 evidence | Decision |
|---|---|---|
| Complete writer inventory | Pointer/base place/layered addRecord/progression/aid/repair/relocation/damage/restore/room/reset/passive economy recorded in SOURCE_WRITER_COVERAGE; actual offsets retained | Identified graph, not proven closed against missing original source |
| Disable every legacy writer | No private lease covers those direct resource/record/mesh/health writes; timers/network/reset retain access | FAIL |
| Full construction effects | Bounded manager oracle matches; coverage matrix distinguishes matched, intentionally different, missing, unobservable and unsafe effects | INCOMPLETE |
| Aid resolution or safe exclusion | Independent example excludes/quarantines aid before cost; actual live callback still lacks its captured base implementation | Safe independent exclusion only; live gate FAIL |
| Atomic resources/buildings | Private candidate + BEGIN IMMEDIATE + CAS + durable receipt/events/reward + fault tests | PASS for isolated source world |
| Mission/reward parity | Example collective two-build/+25 policy, one SQL claim; original personal/campaign/rank/+14 flows remain live | FAIL for live parity |
| V4 compatibility | Tested isolated forward export/reimport, exact original rollback, unknown preservation and atomic-store boundary | PASS bounded data path; full live execution UNCERTIFIED |
| Multiplayer authorization | Current membership, expiry/revocation, separate connection/session identities, read/command/event authorization and adversarial tests | PASS loopback staging; production identity/remote deployment not certified |
| Rollback/recovery | Transaction rollback, pre/post-commit process death including mission reward, durable retry, integrity-denial/reconstruction; earlier local lease rollback fixture retained | PASS isolated; online live-owner rollback incomplete |
| Browser regression | Actual standalone/reconciliation/reauth/restart/denial and four native/fallback game modes, 390 oracle cases; diagnostic caveat retained below | Bounded PASS, not proof of hidden writers |
| Reproducible integration artifact | Readable independent port/worker/client/demo and `zge07-verify.mjs` | Independent artifact exists; original game build/source still missing |

The initial inherited browser restart probe observed `intervals=+1` in one run. An instrumented rerun retaining the same assertion passed all four modes with interval delta zero. It records timer-origin stacks, detached nodes, RAF differences and AbortSignal listener deltas; it does not claim whole-page teardown. The transient result remains in raw evidence and its cause is unresolved. No production/legacy timer behavior or golden assertion was changed to make the rerun pass.

Independent source authority can be switched to LEGACY/SHADOW only as a read-only boundary; ENGINE activation rejects a live boundary and conflicting flags. Existing live `construction=engine` denial remains. No prototype patch chain or bundle modification was added.

Exact remaining work: recover or separately specify aid benefits; port utility/health/repair/relocation/damage and all economic writers; preserve personal/team reward ownership and full campaign/rank semantics; make the live save/network/reset paths exclusively consume the new authority; certify fenced inverse migration and rollback; obtain reproducible original build provenance; resolve release security/owner gates. The older session roadmap's supervised worker, per-player characters, remote identity/TLS, larger actual-command history, backup/disk-full and operational retention work remain separate readiness gaps. They are not silently marked complete by this milestone.
