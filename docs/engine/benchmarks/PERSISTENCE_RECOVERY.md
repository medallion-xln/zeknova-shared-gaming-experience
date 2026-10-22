# Persistence and recovery

Original game save tests use its real PHP/file-backed `/api/save.php`, version4 snapshots and the acknowledged transport. They are distinct from the source world's PHP/SQLite transaction journal. All accounts/data are isolated local fixtures.

| Original-game case | Current result |
|---|---|
| Repeated autosaves/physical Save |128actualHTTP200acknowledgments in the902.836s window; end transport revision129/saved/no pending. Raw array contains five pre/post-window responses, excluded. |
| Durable XP/resources/progress | APIRequestContext GET bypasses browser's pending-save overlay. Later read revision133/XP1333/38kills preserves earned state; endloop XP1309/36kills was earlier sampling, not a lost-state mismatch. |
| Buildings/mission victory | Two physical final grids retained across reload with boss defeat and one reward claim. |
| Interrupted POST network | Actual request abortion→retrying→saved after route removal. |
| Lost ACK after real COMMIT | First response was committed at revision190, then aborted. Retry committed revision191 using a different operationID despite same logical seq6. **Idempotency/revision-churn defect confirmed**; no duplicate economic reward/charge demonstrated by snapshot replacement. |
| Stale save | Actual server409 from deliberately stale baseRevision, then refresh/retry succeeds. This is not a full concurrent-personal-field merge certificate. |
| Outbox/full-page reload | Initial30s assertion expired; isolated natural-timer retest recovered in **36.342s** after unblock, with recoveredFromStore and direct durable GET. The failure is retained; no timer/quotas were reset to force PASS. |
| Real missing authentication | Clearing local session cookies makes direct GET401 and actual POST transition to auth-expired. Credentials restored privately; same-page Save remains auth-expired. Physical reload recovers pending work with HTTP200. No exposed resume/reauth workflow was certified. |
| Browser process restart | Actual owned Chrome process closed/recreated with privately preserved authorized storage; earned XP/building/progress server state retained. Cookie files are excluded from published evidence. |
| Rank | Ensign persisted; promotion continuity not exercised. |
| Original production TTL expiry | NOT_TESTED. Missing-cookie401 is not proof of production identity expiration. Source-world real expiry tests are separate. |

`operationId()` currently includes wall time on every flush, so lost-ACK retries change identity. Proposed follow-up is stable per-intent IDs persisted with outbox state plus a commit-then-lost-ACK regression, not merely a network refusal before COMMIT. No gameplay/API fix is included here.

The transport exposes auth-expired in diagnostics and retains pending state, but body/screenshot evidence does not show a normal player-facing session recovery control. This is a UX limitation; no irreversible loss was reproduced. Do not claim that client UI text is a durable acknowledgment.

The [source recovery supplement](SOURCE_ENGINE_PERSISTENCE_RECOVERY.md) separately records56realHTTP/SQLite/process tests: auth expiry at COMMIT, worker/gateway/launcher recovery, backup/restore, corrupt/missing DB fencing, SQLite_FULL rollback, exact receipts/events/claims and restart ceiling. SQLite allocation exhaustion is not full filesystem-volume exhaustion. Outermost service death still requires operator restart; production identity/TLS/owner rotation gates remain.

[Original cases](evidence/original/original-persistence.json), [isolated retest](evidence/original/original-recovery-retest.json), [source load](MULTIPLAYER_LOAD_RESULTS.md).
