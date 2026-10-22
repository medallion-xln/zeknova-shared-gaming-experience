# Persistence Integrity (ZGE-02)

Scope: the reproducible silent-autosave defect (ZGE-00 C2 / ZGE-01 "unchanged") is replaced by an acknowledged, retried, coalesced save channel installed at the fetch boundary. The authoritative bundle is **not modified**; the PHP API is **not modified**.

## Root cause (confirmed in ZGE-00/01, unchanged until now)
`assets/index-02987539.js` class `RR.save(e)`: `localStorage.setItem(...)` then `fetch(save.php, { method:"POST", keepalive:true, ... })` inside `try { … } catch {}`. Chrome rejects keepalive fetches once the per-page keepalive in-flight budget is exhausted; every later autosave fails with `TypeError: Failed to fetch` for the life of the page and the error is swallowed. The snapshot (`version:4 … player:{x,y,z,health,stamina}`) never carried XP.

## Implementation (`packages/persistence`)
- `SaveTransport` — sequence-numbered submissions, **latest-wins coalescing**, **one request in flight** (an older request can never overwrite newer state), `persistence.operationId` (server idempotency) and `persistence.baseRevision` (server 409 stale guard) on every POST, non-keepalive `fetch` with an 8 s timeout, classification: 200+JSON → `saved`; 401/403 → `auth-expired` (terminal until `resume()`); 409 → `conflict` (refresh server revision via GET, retry); 400/413/422 → `rejected` (surfaced, never retried); network/timeout/5xx → `retrying` with bounded exponential backoff (800 ms … 30 s, ±15 % jitter) and `degraded` after `maxRetries` while still retrying at the cap. The pending snapshot is persisted in `localStorage` (`zge.persistence.pending.v1.<team>.<user>`) until acknowledged.
- `legacyInterceptor` — wraps `window.fetch` **before the bundle loads** (pre-runtime director `persistence-transport`): POST `save.php` → snapshot captured, `zge` extension attached (`player.xp`, `officerClass`, `rankXp`), queued; the bundle receives a synthetic 202. GET `save.php` → passed through; if an unacknowledged pending snapshot survived a reload and the server revision is not ahead of our last ack, the pending state is merged over the server copy so the client restores the newest state; the `zge` extension is remembered and **XP is restored after `zeknova:gameplay-ready`**. `pagehide`/`beforeunload` → `sendBeacon` with a `text/plain` body (CORS-safelisted; `application/json` makes `sendBeacon` return false) carrying the small final snapshot, never reported as saved.
- Schema (`schema.js`) — server-accepted versions 1–4 validated client-side (version, buildings array, ≤3000, teamCode); `migrateSnapshot()` normalises v1→v4 with defaults; extension schema `zge.save-extension.v1`; the server stores unknown top-level keys verbatim (verified on disk: `data/save-*.json` contains `zge.player.xp`).
- Surfacing — engine events `persistence:state|saved|retry|rejected|auth-expired|conflict|beacon|recovered|xp-restored`, metrics counters, `document.documentElement.dataset.zgePersistence`, dev panel line, `ZGE.persistence()`.

## Automated tests (`packages/persistence/test/persistence.test.mjs`, 12/12)
Acknowledged-only success with revision · coalescing (3 rapid → 1 POST; 50 rapid → ≤6 POSTs, final state = newest) · transient retry with backoff then success · degraded keeps pending in store · auth expiry terminal + resume re-sends · client-side and server-side rejections surfaced and not retried · 409 conflict refresh + retry with newer base · request timeout retries · reload recovery from the pending store · unload beacon (type and no-ack) · schema migrations v1–v4, unsupported version rejected, extension round-trip · fetch-boundary interceptor end-to-end (202 to bundle, XP attached, pending-newer GET merge, XP restored on ready, original fetch restored on dispose).

## Browser certification (Chrome 155, PHP dev server, session 2026-10-20)
| Scenario | Result |
|---|---|
| Normal autosave | acknowledged with server revision (rev 11 → … → 153 across the session); `zgePersistence=saved` |
| 12 rapid `game.save()` | 1 POST, 1 ack (coalesced) |
| Outage: POST refused 7 s | `retrying`, 4 retries, pending preserved (`pendingSeq` set); after unblock → `saved`, revision advanced |
| Auth expiry: POST → 401 | `auth-expired` surfaced with server message; no retries; `resume()` → `saved` |
| Rejection: POST → 422 | `rejected` surfaced, not retried; next save `saved` |
| Legacy keepalive call site | intercepted → synthetic 202 `{ ok, deferred, transport }`; real POSTs are `fetch` (non-keepalive) |
| Unload beacon | `sendBeacon` returned true; Playwright observed a `ping` request with `text/plain`; server log received the POST; its write exercised the 409 conflict path, which refreshed the revision and retried |
| XP survival | XP 806 before full-page restart → 806 after (restored from the `zge` extension; `recoveredFromStore: 1` re-sent the unload-time pending snapshot) |
| Repeated saves | 22+ acknowledged in one session, 0 lost |

## Not changed / remaining
- Server-side XP is carried in the personal save extension, not in `profile-*.json` rank progression (rank remains server-derived from standing infrastructure).
- Multi-tab conflict resolution refreshes the base revision and re-posts the client snapshot (server merges buildings/worldProgress by id); it does not merge personal fields field-by-field.
- The legacy `localStorage` mirror written by the bundle is untouched.
