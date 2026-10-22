# Operational reliability and retained allocations — ZGE-11

The authority implementation is unchanged from ZGE-10. PHP/SQLite remains the sole durable gameplay writer, with generation fencing, original receipts/claims, current authorization, DB identity, existing-only opening, fair bounded admission and unchanged quotas. SDK/Studio use separate local stores; no publishing/debug write path enters staging. The existing developer service remains untouched, while benchmarks use fresh private complete-service fixtures. No OS daemon or production service is installed.

## Longer representative soak

The asynchronous ZGE-10 sampler/workload ran for1200.167452 seconds with7921 actual authenticated HTTP requests, eight actors, eight gateways and one persistent worker. It retained6129 successful command acknowledgments and241 expected gameplay rejections (239 occupied,2 stale shared revision). There were zero transport failures/restarts and **one admission-busy429**. The original command `load-4-169` retried under the same ID and succeeded once at the next attempt; no receipt/intent was silently replaced. This is preserved backpressure behavior, not a quota increase or a zero-throttle certificate.

E2E p50/p95/p99 were **19.78/38.15/121.42ms**, maximum1168.56ms. These are worse than the prior17.75/31.84/79.96ms sample; host-contended runs are not a causal SDK performance comparison. The final read-only archive audit matched6378 commands,19861 events, every receipt/seal/claim and complete snapshot in50.59s. Final revision6137,240 accepted placements, four personal XP totals840, four personal claims, one team claim and shared stone99040 passed the declared synthetic100000-stone fixture invariants. Eight setup joins explain the archive/timed-command difference.

Sampled owned CPU was181100ms, about15.09% of one core; transient lease helpers may be missed. Aggregate RSS638.11→578.98MiB, peak690.17, change-59.125MiB, tail OLS-0.661MiB/min after the first20%. Worker used heap7.13→14.19MiB, observed6.10–27.38MiB, with a **+0.340MiB/min** sampled tail. Heap capacity10.64→46.14MiB and cumulative observed GC8→2048 /4.98→1304.50ms demonstrate collection/capacity effects. Harness used-heap tail+0.452MiB/min includes intentionally retained traces/stage arrays/samples.

Numeric owned FDs224→224 peak230; ten long-lived Node children excluding the combined harness/monitor remained bounded (launcher, worker, eight gateway wrappers), plus eight PHP children. DB+WAL+SHM204800→17965056 bytes reflects retained authority history. One worker start, zero worker/service restarts, timeouts or stale replies were observed. Sampling does not force GC or change the request path. Background source/build/browser/diagnostic work is disclosed; no supported population, production SLA or indefinite memory stability is inferred.

## Heap class evidence

A separate isolated evaluator probe executes9000 synthetic candidate moves without HTTP/SQL, preserving only current state. Private raw V8 snapshots are aggregated then deleted; evidence contains class/self-size totals, not heap payloads or credentials. Forced GC occurs only in this diagnostic. The first attempt retained its own aggregation tables and falsely increased Object counts by305; that observer effect is retained and corrected by writing summaries out of process memory between checkpoints.

The corrected warm/5000/9000/disposed used heaps were5329760/6030280/6056896/5961808 bytes. WorldEvaluator, MultiplayerConstructionRuntime and GameplayEventJournal each remained exactly one object through active checkpoints and disappeared after disposal. Arrays315, Maps26, Sets23, WeakMaps10 and WeakSets3 stayed constant across the warm/9000 snapshots. Only three ordinary Objects (+120 self-bytes) were added. Object count fell3736→3403 after disposal. Dominant measured category self-size growth was compiled code+324064 bytes and hidden structures+28344, versus strings+1000 and arrays+152. The final4000 moves added only26616 used-heap bytes.

These are class counts and **self sizes**, not dominator retained sizes or allocation-stack proof. They support runtime reuse/bounded fixed-state retention and normal compilation/capacity effects in this probe. They do not explain every sustained multi-actor allocation, prove a whole-service plateau or justify leak-free status. Longer fixed-state controls/dominator profiling remain open. The authority source was not redesigned to improve this synthetic probe.

## Tail attribution

The new maximum around287s measured1032.46ms IPC with924.10ms worker evaluation. In the surrounding285.78→290.65s resource window, worker cumulative GC duration rose290.77→686.14ms (about395.37ms), while sampled worker CPU rose260ms. This is evidence of a coincident GC/scheduling stall; coarse window data cannot assign all924ms to one collection or separate off-CPU scheduling from GC wall duration. The retry/backpressure cluster and all actual spans are retained.

Largest new COMMIT was278.07ms at240.50s; largest databaseOpen160.42ms at601.50s. Neither reproduces the exact prior488.63/402.89ms samples. A separate500-cycle PDO experiment, on an isolated WAL/synchronous-FULL synthetic table, measured open p50/p95/p99/max0.093/0.182/0.240/0.301ms and COMMIT0.081/0.189/0.348/3.203ms. It changes no service pragma. These low idle-probe values argue against a constant intrinsic open/COMMIT cost; they do not identify the cause of rare host-contended fsync/open stalls. Kernel/storage traces were not collected, so full COMMIT/open root-cause attribution remains unresolved.

## Recovery continuity

Complete engine and retained browser suites re-execute auth/private progress, quota/fairness, worker fencing, session/disconnect, original-ID retries, launcher SIGKILL, DB absence/replacement/original inode return, restart ceilings, pre/post-COMMIT process death, isolated backup/restore, replay corruption and SQLite BUSY/FULL handling. Historical real-volume ENOSPC evidence remains ZGE-09's certificate; no new volume fill or power-loss claim is made.

The outermost foreground monitor still requires explicit developer restart after its own termination; owned child shutdown and stale-control recovery remain tested. Live ZekNova stays LEGACY. Production identity/TLS, operational policy, credential rotation/post-rotation verification and owner release remain NO-GO gates.
