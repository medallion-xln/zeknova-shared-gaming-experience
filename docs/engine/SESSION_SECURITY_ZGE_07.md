# Persistent staging sessions — ZGE-07

This is a loopback staging security contract, not production identity certification. PHP remains the sole durable writer; the source construction port runs under its SQLite transaction. Production APIs/configuration, real credentials and databases are untouched.

## Identity and permission model

`memberships` owns current `(player_id,world_id)` role and revocation. `sessions` stores SHA-256 access-token hashes and expiry; additive `session_meta` stores version 1, a random persistent session ID, creation time and revocation. `credentials` stores separately hashed private reauthentication credentials, scoped to the same principal/world/session. A `connections` row binds a server-generated transient connection ID to that session AND access-token hash. Client identity, balances, ownership and feature flags cannot grant permission.

CLI-only `setup.php` provisions isolated fixture identities into a private file, never an HTTP response or log. Initial fixture access lasts 24 hours for ZGE-06 compatibility. Reauthentication issues a random 192-bit access token for 15 minutes using a separately provisioned 256-bit credential valid for 30 days. At most eight access sessions per logical session remain unrevoked after renewal. Expired/revoked hashes remain as audit metadata; there is no indefinite-validity access token. Private credentials can create additional tabs for the same principal; they do not authorize a different world. This deliberately excludes remote registration, account recovery and production identity federation.

The POST `/staging/session` protocol `zge.session.v1` supports `connect`, `disconnect`, `reauthenticate`, and `revoke`. Connect creates a new connection, retaining the persistent session ID. Disconnect closes only that connection. Revoke invalidates all access tokens, connections and reauthentication credentials belonging to that persistent session. Membership revocation denies both reads and writes immediately upon the next serialized authorization check. Existing ZGE-06 world clients may omit connection ID; this is explicit v1 transport compatibility with the same principal/membership authorization, not an authentication bypass.

Every `/staging/world` command authenticates before taking the write lock, rechecks after `BEGIN IMMEDIATE`, and checks again before COMMIT. Expiry while preparing a candidate discards its deductions, buildings, receipt, events and mission/reward claim. A revocation committed before the arriving request obtains its lock takes precedence. A command valid at its COMMIT remains committed even if access is revoked before its reply; reauthentication/retry retrieves the durable receipt. Effectively-once committed effects do not imply exactly-once network delivery.

## Request boundary

- Explicit Bearer header for access; separate Refresh header for reauthentication. Cookies never authenticate. An explicit foreign Origin is denied; no credentialed CORS permission is emitted.
- Builder membership permits the example's place/remove/move/select commands. Viewer membership permits private reads, not mutations. Shared colony roles intentionally allow authorized builders to remove shared buildings. No client resource grant is accepted.
- Strict top-level/command allowlists, bounded ASCII command/building IDs, nonnegative integer expected revisions, bounded JSON depth, a 65,536-byte request limit, typed cursors, and ahead-of-server cursor rejection. Queries use prepared values; clients cannot choose SQL tables.
- Persistent per-minute quotas: world route 600/IP, 240/principal/world by default (configured range 8–600); session route 60/IP; archive paging 600/IP. Buckets older than the previous minute are discarded. Quota rejection is 429 and cannot reset by reconnecting or selecting another command ID. This is a loopback bound, not an Internet denial-of-service certificate.
- Errors expose stable reasons, not exceptions, SQL, worker stderr, tokens or database paths. Responses are no-store/nosniff. Request bodies and Authorization headers are not logged by these tools.
- SQLite uses WAL, synchronous FULL, foreign keys and a busy timeout. A staging DB must be in an owned 0700 directory under the real temporary directory; symlinked/noncanonical parents and public DB files are rejected. Files inherit umask 0077. Initial private identity writes are flushed/fsynced to a pending file before DB commit, then atomically renamed; restarting can finish pending publication.
- Every route requires both explicit staging environment gates and a loopback peer. The launcher binds 127.0.0.1. The static router allows only the example and necessary source/vendor assets, never `.env`, DB, setup scripts or production API files.

## Replica and recovery

The browser learns trusted player/world identity before loading an outbox. Its outbox key uses that identity, not an expiring access token. Old token-prefix keys are adopted only after authentication. Reload with expired access can exchange a private credential, reload the original logical commands and reconcile durable receipts. Reauthentication credentials are cleared from inputs and never retained in browser storage; only the new access token is stored in sessionStorage.

A connection generation invalidates delayed replies from earlier connections. The replica validates world/schema/revisions, snapshot digest, world-vs-snapshot projection, receipt shape and the entire event page BEFORE publication. An older acknowledgment cannot rewind state; a higher cursor with a lower revision is rejected. Interrupted replies retain their outbox entries. Snapshot digest uses the existing Node canonical JSON implementation, avoiding PHP/browser number/order differences.

`/staging/events` provides authenticated ordered pages (maximum 256), optionally capped at a previously confirmed snapshot cursor. Event hashes, identity and contiguous sequence are checked. The client retains at most its configured event window (256 by default), independently of the durable archive.

## Evidence and remaining gates

`packages/server-php/test/session-security.test.mjs` adds 11 actual PHP/SQLite tests alongside the original 10 durable tests. Coverage includes expired/revoked credentials, live role downgrade, cross-session connections, independent tabs, real wall-clock expiry before commit, revocation while waiting for a SQLite write lock, forged identity/revisions/SQL IDs, cookies/Origin/size/quota boundaries, file permissions, corrupt archives/snapshots/checkpoints, explicit replay recovery, archive authorization, actual process death at mission completion, and SQLite write rejection. See `evidence/zge07/session-security.json` and the complete engine log.

The browser certificate exercises expired access, a lost committed reply, page reload, stable outbox recovery, initial and in-session reauthentication, separate connection identity, conflicting builders, snapshot mismatch, cross-world denial and restart. Secret-bearing identity files stay outside the repository/evidence.

Remaining production gates include identity provisioning policy, remote TLS/deployment, credential lifecycle operations, capacity/backpressure, backup policy and a supervised/bounded gameplay worker host. PHP still starts Node workers for command/state evaluation. Staging still has a shared colony avatar and collective mission XP; per-player world progression is a separate game policy. None of this activates the existing live game.
