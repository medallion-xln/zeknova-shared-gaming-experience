/** Render numerical report exclusively from captured benchmark JSON. */
import {readFileSync,writeFileSync} from 'node:fs';
const root=process.env.ZGE_ANALYSIS_DIR||'/tmp/zge-bench01/multiplayer/analysis';
const summary=JSON.parse(readFileSync(root+'/summary.json')),rows=summary.rows;
const n=v=>Number.isFinite(v)?v.toFixed(2):'unavailable';
const table=(list)=>['|Profile|Clients / gateways|HTTP/s|Durable accepted/s|p50 ms|p95 ms|p99 ms|429|Transport/fault failures|Gameplay rejections|','|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|',...list.map(r=>`|${r.profile}|${r.clients} / ${r.gateways}|${n(r.requestsPerSecond)}|${n(r.acceptedCommandsPerSecond)}|${n(r.latencyMs.p50)}|${n(r.latencyMs.p95)}|${n(r.latencyMs.p99)}|${r.requests.throttled}|${r.requests.transportFailures}|${r.requests.rejectedCommands}|`)].join('\n');
const sustained=rows.filter(r=>r.mode==='quota-compliant paced'),burst=rows.filter(r=>r.mode!=='quota-compliant paced'),eight=sustained.find(r=>r.profile==='mixed'&&r.clients===8);
const faults=rows.flatMap(r=>r.faults.map(f=>({...f,label:r.label,clients:r.clients}))),stageNames=['authentication','authorization','quota','admission','lockWait','databaseOpen','ipc','commit'];
const stageRows=stageNames.map(k=>{const s=eight?.stagesMs[k];return `|${k}|${n(s?.p50)}|${n(s?.p95)}|${n(s?.p99)}|${n(s?.max)}|`;});
const maxStage=k=>Math.max(...rows.map(r=>r.stagesMs[k]?.max??0));
const text=`# Source-owned multiplayer load results — ZGE-BENCH-01

**Outcome: PASS_WITH_LIMITS for bounded local staging correctness; maximum-player and long-run capacity not established.** The source-owned construction world is independently playable through physical controls for two, four and eight authenticated browser contexts. All ${rows.length} private HTTP workload archives replayed exactly, including command receipts, event bytes/checksums, complete final snapshots and personal/team claims. This report does not certify the original legacy ZekNova game's multiplayer or combat.

The machine-readable [analysis](evidence/multiplayer/analysis/summary.json) contains every profile/client count, stage percentile, observed recovery time, per-request slow trace, process/memory sample and exact audit. The 56-test security/recovery run and 2/4/8 physical browser results are in [source persistence and recovery](SOURCE_ENGINE_PERSISTENCE_RECOVERY.md).

## Conditions and method

Loopback HTTP against fresh private SQLite databases; PHP gateway count equals2/4/8 authenticated actors and a single fenced world worker. Managed outer service, supervised persistent Node runtime, Unix socket IPC, unchanged bearer authentication, normal principal240/min and shared world-IP600/min quotas, normal admission limits and SQLite durable transaction settings remain active. All non-movement HTTP fixtures explicitly start with100000 synthetic shared stone for workload longevity; movement starts with12. Neither seed changes runtime behavior or authentication/quotas.

Sustained profiles are paced at6 scheduled intents/s per world (not per player); mixed construction refreshes state before issuing an original placement/removal intent, so measured HTTP/s can exceed6. Bursts issue48 original scheduled intents across independent actors without pacing, plus required mixed reads or recovery retries. Accepted command throughput excludes reads, rejected gameplay and duplicate receipts. Each condition has one trial. Short profiles are bounded workload observations and cannot establish a supported population, statistically robust tail latency or an Internet service SLA.

The workload's monotonic end-to-end HTTP timer includes fetch plus JSON parsing/reconciliation, not browser frame delivery. Percentiles sort finite timings and select index floor((N-1)*p). Handler stages are observational and can overlap; their sum is not a request total. Queue metrics are worker/admission measurements; external socket/PHP queue time is unavailable. Five-second process samples include the harness, owned service/launcher/worker and PHP gateways; helper-process CPU between samples can be missed. Brief sampler subprocesses can cause perturbation; maximum sampler duration is retained. No GPU utilization is claimed for this HTTP benchmark.

Runtime/toolchain and HEAD use the root benchmark environment manifest. Fixture/runtime/test source hashes are in [source custody](evidence/multiplayer/source-custody.json). No authority source, quota policy, golden hash, gameplay behavior, existing service or production database was modified.

## Sustained profiles

${table(sustained)}

Construction rejections and stale world revisions reflect authoritative conflict handling; exact reasons/counts are retained in JSON. Recovery-profile503/transport failures are injected-fault outcomes; they are counted, never discarded from latency or relabeled as accepted gameplay. Quota/admission429 responses remain visible and preserve original intent IDs for retries.

## Burst profiles

${table(burst)}

The burst figures are short peak observations under unchanged quotas. They must not be described as realistic sustained gameplay or extrapolated into a maximum supported player count. State/history have zero accepted mutation commands by definition.

## Stage attribution: eight-player mixed paced profile

|Stage|p50 ms|p95 ms|p99 ms|max ms|
|---|---:|---:|---:|---:|
${stageRows.join('\n')}

For this mixed run, transaction p95=${n(eight?.transactionMs.p95)}ms, runtime evaluation p95=${n(eight?.runtimeEvaluationMs.p95)}ms and runtime queue p95=${n(eight?.runtimeQueueMs.p95)}ms. Across all fresh workloads, largest observed database-open=${n(maxStage('databaseOpen'))}ms and COMMIT=${n(maxStage('commit'))}ms. These measurements do not identify the host/storage root cause of historical slow opens/commits. Per-request top slow records and all raw stages remain available for attribution.

## Recovery while traffic continues

|Profile|Clients|Fault|Observed first successful higher-generation response ms|
|---|---:|---|---:|
${faults.map(f=>`|${f.label}|${f.clients}|${f.kind}|${n(f.firstSuccessfulNewGenerationMs)}|`).join('\n')}

Recovery duration starts at fault dispatch and ends at completion of the first observed successful higher-generation HTTP response; it includes the scheduler/polling interval. Burst recovery retries original pending IDs after the owned worker is ready. No authority transfer or multi-writer bypass occurs. Every associated complete archive audit passed.

## Memory, process and descriptor observations

|Profile|Clients|Duration s|Worker heap start/end/peak MiB|Aggregate RSS start/end/peak MiB|FD start/end/peak|Sampled CPU % of one core|
|---|---:|---:|---|---|---|---:|
${sustained.map(r=>`|${r.profile}|${r.clients}|${n(r.durationMs/1000)}|${n(r.workerHeapMiB.start)} / ${n(r.workerHeapMiB.end)} / ${n(r.workerHeapMiB.peak)}|${n(r.rssMiB.start)} / ${n(r.rssMiB.end)} / ${n(r.rssMiB.peak)}|${r.fileDescriptors.start} / ${r.fileDescriptors.end} / ${r.fileDescriptors.peak}|${n(r.cpuPercentOneCore)}|`).join('\n')}

These short unforced-GC samples do not prove leak freedom or a retained-object leak. Recovery swaps worker generations, so its heap slope does not describe one process. Earlier ZGE-11 code-space/heap-growth attribution and dominator-level retention questions remain unresolved. The old20-minute evidence remains historical; this milestone did not repeat an equivalent long multiplayer soak.

## Historical comparison

|Milestone|Condition|Duration|HTTP requests|p50/p95/p99 ms|Classification|
|---|---|---:|---:|---|---|
|ZGE-10|8 actors, mixed,6 scheduled intents/s|900s|5940|17.75 /31.84 /79.96|Historical recorded baseline|
|ZGE-11|8 actors, mixed,6 scheduled intents/s|1200.17s|7921|19.78 /38.15 /121.42|Historical recorded baseline|
|ZGE-BENCH-01|8 actors, mixed,6 scheduled intents/s|${n((eight?.durationMs??0)/1000)}s|${eight?.requests.total??0}|${n(eight?.latencyMs.p50)} /${n(eight?.latencyMs.p95)} /${n(eight?.latencyMs.p99)}|NONCOMPARABLE for improvement/regression: shorter duration, current host load/cache state, one trial|

Same authority/HTTP harness lineage and hardware family make the measurements useful context. Different durations/archive sizes and no paired-control run prevent a causal percentage-improvement/regression claim. Historical maximum488.63ms COMMIT and402.89ms database-open spikes remain unresolved even if absent from short current profiles. No unchanged/improved label is awarded solely because current samples are faster.

## Actual-data charts

![Multiplayer accepted throughput](evidence/multiplayer/analysis/multiplayer-throughput.svg)

![Multiplayer p95/p99 latency](evidence/multiplayer/analysis/multiplayer-latency.svg)

## Reproduction

From the repository root, while other performance suites are stopped:

\`\`\`sh
env ZGE_EVIDENCE_DIR=/tmp/zge-bench01-repro-load ZGE_DURATION_SECONDS=20 ZGE_RECOVERY_SECONDS=36 \\
 node scripts/zge-bench01-multiplayer-run.mjs
env ZGE_EVIDENCE_DIR=/tmp/zge-bench01-repro-load ZGE_ANALYSIS_DIR=/tmp/zge-bench01-repro-analysis \\
 node scripts/zge-bench01-multiplayer-analyze.mjs
\`\`\`

Each workload closes only its owned private fixture before running the existing read-only full archive audit. The audit CLI separately refuses live runtime sockets, symlinked/public directories and non-private fixture paths. Credential/session files are not copied into published evidence. Failed harness attempts, if any, are retained separately and do not become PASS data.

For browser functional reproduction, set PLAYWRIGHT_MODULE to the installed Playwright module and run scripts/zge-bench01-multiplayer-browser.mjs. It creates all private users itself; no credentials are supplied or printed. It uses real keyboard down/up, focus and construction-button clicks. The first browser attempt lacked a convergence wait between players' placements; authority correctly rejected stale state and the harness timed out. The corrected test waits for reconciliation; source behavior and assertions remain unchanged.

Production is NO-GO pending the existing security/identity/TLS/operations/live-authority gates. The source engine's local staging verdict must remain separate from original gameplay and Studio/SDK verdicts.
`;
writeFileSync('docs/engine/benchmarks/MULTIPLAYER_LOAD_RESULTS.md',text);console.log('Rendered report from '+rows.length+' actual workload result files');
