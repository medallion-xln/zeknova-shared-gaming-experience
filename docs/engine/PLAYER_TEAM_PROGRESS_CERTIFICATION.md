# Player and team progression certification — ZGE-09

The versioned ZGE-08 ownership policy is preserved: 14 personal XP per successful placement, an actor's build-type achievement set, rank from that actor's attributed standing infrastructure, collective supplies/objectives and a once-only 25 team XP reward. No ambiguous historical collective XP/avatar/buildings is assigned to a joiner. New inventory/equipment containers remain private; no new unsupported reward policy is invented.

| Scenario | Evidence and boundary |
|---|---|
| Simultaneous construction | Real PHP gateways serialize; one stale shared revision rejects before spending; actor movement revisions remain independent |
| Personal claims and team completion | SQL unique personal/team claims share COMMIT with costs, building/events/receipt/snapshot; separate actor views receive only their own private progress |
| Duplicate delivery and lost acknowledgment | Worker, PHP and whole-launcher failures return the original receipt on retry, preserving one cost and one reward effect |
| Disconnect/reconnect and pending outbox | Independent browser contexts retain original IDs/revisions, reload and converge; client stale-generation validation precedes outbox removal |
| Worker/full service restart | Automatic worker generation and outer-service launcher restart preserve private XP, shared buildings and team reward; browser and process tests inspect exact state |
| Role revocation, departure and return | New `zge09-progression.test.mjs` downgrades Alice to viewer, denies writes, revokes membership (401), restarts the worker, restores the same membership and retries the old join receipt. A fresh join intent reports already joined; Alice and Bob retain 14 personal XP each, one 25-XP team reward and exactly two personal claims |
| Legacy attribution | Existing original collective migration/provenance, checkpoint and mixed-archive tests remain unchanged and passing |

The first new departure test expected 403 for revocation, whereas the existing authentication contract correctly returns 401; its new assertion was corrected to that exact contract. The next probe incorrectly expected a new join result from a duplicate original receipt; it was corrected to assert the duplicate receipt plus a separate fresh join intent. Both initial failures and the passing final test are retained. No prior assertion or gameplay rule was weakened.

The multi-minute construction profile deliberately exercises stale-revision/occupancy conflicts. The final mixed workload performs a real measured state refresh before a construction intent, so it also exercises successful spending, personal achievements and collective mission completion instead of benchmarking only rejected stale clicks. Preflight HTTP reads count toward measured throughput and the unchanged quota. Its exact SQL receipt-based placement count is checked against total personal XP, team claims are at most one, supplies never go negative and complete offline archive recovery is checked after the owned service stops. Large receipt audits use scalar SQL aggregation rather than an unbounded stdout dump.

This is the bounded construction-world policy. The full original campaign/personal economy, aid, repair, relocation, damage, utilities, health, room/reset and live writer closure remain incomplete. No source-owned operation is enabled in the live legacy game. Unsupported effects remain rejected/quarantined before mutation or spending; no additional minified bundle patches were applied. See the retained SOURCE_WRITER_COVERAGE and LIVE_AUTHORITY_READINESS_ZGE_07 contracts.
