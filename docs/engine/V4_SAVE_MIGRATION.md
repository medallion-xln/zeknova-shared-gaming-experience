# V4 save migration — ZGE-06

`packages/persistence/src/V4Migration.js` implements `zge.v4-world-migration.v1` over actual repository v4 saves and existing `zge.save-extension.v1`. It produces a validated immutable core world snapshot plus a complete original payload, canonical provenance and explicit unresolved-history notes. It does **not** import v4 balances into the unrelated shelter/stone staging economy or automatically authorize gameplay from saved data.

Mapped: world/team/player identity; transforms/building IDs/rotation/level; resource balances; known XP/officer/rankXp extension; missionStats, boss claim/reward IDs as recorded; world/shared revisions. Unknown top-level, building, mission and extension fields survive unchanged in `original`. Unknown extensions are preserved uninterpreted; historical construction events/idempotency/reward receipts missing from v4 are explicitly marked missing, never inferred as already-certified engine history. Core world authority remains descriptive LEGACY metadata, not permission. Health/utility/aid/diplomacy/combat fields remain losslessly in the original pending a complete game-specific policy port.

Existing production v4 SaveTransport/schema/interceptor and PHP save paths are untouched. This adapter accepts observed v4 only; existing v1–v4 migration code remains separate. No unsupported older engine extension format is invented. Missing optional player/progress/extension fields receive documented representation defaults; raw input remains available for exact semantic rollback. Serialization whitespace is not a byte-preservation claim.

Migration is idempotent. Existing migration envelopes must reproduce their original canonical provenance and the exact derived projection; tampered balances fail. `persistV4Migration` validates before invoking a supplied write callback, so failures cannot overwrite a source save. `rollbackV4Migration` returns a deeply detached original object, including unknown fields. No production save file/database is read or rewritten by migration tests.

Tests cover early/late campaign-like fixtures, known v1 extension XP 777/rank/boss claim fields, absent optional fields, unknown extension retention, full unknown-field round trip, repeated migration, invalid resources, unsupported version, and altered projection rejection with zero write callbacks. Existing legacy v4 ordinary-game save/restore and XP follow-up are rerun separately.

Remaining integration gate: materialize a complete ZekNova runtime seed with its catalog/terrain, personal/team rank/reward ownership, utility/health/aid policy and missing command-history rules, then prove reversible runtime↔v4 export against broader owner-approved real saves. The current adapter certifies recoverable read-only core-state migration and lossless rollback for tested v4 inputs; it is not a full live campaign/economy takeover adapter.


## ZGE-07 update

A separate isolated editable branch now supports validated forward V4 export, repeat import, exact original rollback and a CAS-store commit contract. Unknown fields/extensions, identity, XP/ranks, mission/boss reward records and revision metadata are preserved. This does not certify full live gameplay execution or production transport. See V4_CONSTRUCTION_COMPATIBILITY_ZGE_07.md.
