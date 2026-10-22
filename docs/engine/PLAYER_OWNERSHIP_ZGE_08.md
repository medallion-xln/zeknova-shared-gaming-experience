# Player ownership — ZGE-08

The opt-in durable schema is `zge.multiplayer-construction.v1`; an authenticated browser receives `zge.multiplayer-view.v1`. The normal game and old collective fixture retain their existing compatibility paths. Only the supervised multiplayer launcher opts into this model by default.

| Owner | State and policy |
|---|---|
| World | Terrain, environment, shared buildings, ordered events, revision, authority lease |
| Team | Shared construction supplies, first-colony objective and its once-only 25 XP reward |
| Player | Stable authenticated ID, avatar pose, personal revision, selected structure, personal XP/rank, achievement/mission progress, private inventory/equipment/metadata schema |
| Session | Existing authenticated session/connection records, expiry and membership; never accepted from client gameplay fields |

A builder explicitly joins; reads and session renewals do not create profiles. Joining creates a distinct safe pose with zero personal XP and ensign rank. Both tabs using the same principal control the same player; independent principals control independent avatars. The server injects the trusted session player ID and current authorized roster. Forged actor fields, peer identity, cross-world access, revoked builders and spectator writes are denied. A spectator may read permitted public state without an avatar.

Movement and selection use a personal revision, so another player's unrelated movement does not invalidate them. The executor still checks the current shared geometry/collision state. Construction changes use the shared revision: concurrent conflicting placements serialize and one stale command is rejected before spending. Receipts are scoped to world and authenticated player plus the original logical command ID. Retry does not mint a new ID or update the old expected revision.

## Progression policy

Personal successful placement awards 14 XP, matching the readable/live pointer behavior established by earlier construction parity. It goes only to the authenticated builder. A once-per-building-type achievement records the personal milestone; no unsupported achievement XP was invented. The minimal `construction-types` personal progress records successful placements and distinct types. Its claim is protected by a SQL unique key in the same commit as costs, events, snapshot and receipt. Team first-colony completion keeps its existing once-only 25 XP in the team account. Personal XP and team XP are displayed separately.

Personal rank calls the existing `src/game/OfficerRank.js` standing-infrastructure policy using newly attributed actor buildings. Removal recalculates all affected actors, including a building's owner when another authorized builder removes it. XP is retained on removal. A test uses actual campaign project types and biome definitions with synthetic cheap construction/terrain to prove independent promotion and demotion. The two-structure valley catalog does not exercise the full live campaign/rank ladder; its officers ordinarily remain ensigns. Shared removal permissions are retained from existing mechanics; ownership attribution does not introduce a private-property permission rule.

Personal inventory, equipment and metadata are versioned empty private containers. This milestone adds no unsupported item loot, equipment economy, faction system or campaign reward policy. Current permissions remain authoritative SQL membership. Aid, repair and relocation remain quarantined, and the minimal server construction catalog remains shelter/beacon.

## Explicit historical migration

Legacy collective snapshots are preserved verbatim as SQL-only provenance, including the old avatar, collective XP, receipts and reward history. Existing shared supplies, buildings, team objectives and team XP remain collective. Historical buildings receive no invented player ownership. No historical avatar, XP, rank or reward is assigned to the first joiner. New players start at zero personal XP. The archive retains the old source checkpoint and old namespaced receipt identities; recovery replays the legacy prefix and then trusted actor commands without rewriting logical identities.

## Privacy

Public entities and peers expose player ID, pose and rank. The authenticated actor's projection alone includes their XP, personal revision/selection, inventory/equipment/metadata, personal progress and claim IDs. Internal ledger, migration provenance and peer private state are excluded from both snapshot and WorldState. Peer-private events become ordered `EventRedacted` placeholders. Sequence-derived opaque projection IDs replace internal transaction/command IDs, including in paginated archives; cursor order and authority metadata remain intact. The collective endpoint refuses new-model snapshots, preventing a route fallback from returning the SQL-owned full snapshot.

These are visibility guarantees, not secrecy of facts inferable from publicly visible construction. The browser test privately inspects both test accounts to verify their values but never receives peer XP in either actor's public projection. Gold marks the current avatar; blue marks peers. Fixture credentials, runtime keys and database files are excluded from repository evidence.

Tests cover deterministic joins, actor revisions, XP/team separation, private projections, legacy migration, checkpoint/replay, roster revocation, real rank policy, HTTP/archive privacy and conflicts. Existing expiry, renew/revoke, connection and reload tests remain in the 221-test suite; both new and earlier authenticated browser certificates pass. See [report](ZGE_08_IMPLEMENTATION_REPORT.md).
