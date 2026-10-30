# ZGE-18A.3 — Hosted CI publication preparation

Date: 2026-10-30 (America/Los_Angeles). Baseline HEAD: `f91da08de12474990e4379b4b6ed906acb8a836b`.

## Disposition

**CONDITIONAL GO for candidate publication preparation.** All required local replica gates pass, including independent mutation controls and fail-fast verification. Hosted CI remains **NOT VERIFIED**. This task prepares publication only. No branch, commit, push, PR, merge, deployment, workflow dispatch or ZGE-18B implementation is authorized or performed by this preparation.

## Workflow change and failure propagation

`.github/workflows/zge18a.yml` now includes `node --test tests/runtime-disposal-mutations.test.mjs` immediately after the behavior suite and before SDK output integrity in the required `integrity` job. There is no `continue-on-error`, conditional skip, exception suppression or success override. GitHub's fail-fast Linux shell causes a nonzero mutation process result to fail its step and job; subsequent ordinary steps cannot turn it green.

The actual integrity command block was also run locally under `bash -e -o pipefail` with command collaborators stubbed: the mutation command returned 42, the block exited 42, and the following SDK integrity command did not execute. This is a shell failure-propagation check, distinct from the independent mutation suite's real passing controls and assertion-based mutant kills. Evidence is embedded in [local-workflow.json](evidence/zge18a3/local-workflow.json).

## Complete local replica

The complete fresh-install workflow replica passed all fourteen command gates, plus output preservation and fail-fast verification. The fresh temporary snapshot uses Node 22.22.2 and a fresh `npm ci --ignore-scripts`. Before running it, the runner verifies that its portable command sequence exactly matches the integrity job's multiline workflow commands, including the newly required mutation command. Available local PHP/SQLite substitutes for the Ubuntu OS package-install step; no OS changes are made. The replica does not run checkout/setup-node Actions, host Ubuntu, activate GitHub Actions or exercise the optional self-hosted GPU job.

The workflow's final scoped Git diff is represented locally by a complete path-set/SHA-256 comparison of `artifacts/runtime-reconstruction` and `packages/sdk/dist` before/after all gates. This permits a clean-snapshot reproduction without a scratch Git branch or commit. The actual hosted workflow retains `git diff --exit-code -- artifacts/runtime-reconstruction packages/sdk/dist` against its committed checkout. New documentation/evidence files are produced after the executable snapshot run; no tested code changes afterward.

| Local replica gate | Result |
|---|---|
| Fresh locked install | PASS |
| Source check | PASS |
| Runtime reconstruction build/integrity | PASS |
| Graphics-context and renderer-ownership checks | PASS |
| Runtime lineage | 2/2; six tamper controls PASS |
| Runtime behaviors | 32/32 PASS |
| Independent disposal mutations | M3/M4/M5/M10 KILLED; four controls PASS |
| SDK output integrity | PASS; four drift controls |
| Engine suite | 347/347 PASS |
| SDK suite | 70/70 PASS (overlaps engine suite) |
| SDK build | PASS |
| Public package/fresh consumer release verification | PASS |
| Independent clean reproducibility builds | PASS; 11 matching outputs |
| Generated-output path and SHA-256 preservation | PASS |
| Mutation failure propagation | PASS; simulated exit 42 stops actual command block |
| Final whitespace check | `git diff --check` PASS |

Full command output, exit codes, durations, test counts and compared output hashes are retained in [local-workflow.json](evidence/zge18a3/local-workflow.json). The workflow bytes in the current workspace equal the tested snapshot bytes.

## Final candidate and excluded paths

The original **51 intended candidate paths are retained without omission**. The workflow was already one of those 51 paths. Five new preparation deliverables bring the final inventory to **56 paths: 19 tracked modifications and 37 untracked additions relative to HEAD**:

- `docs/engine/ZGE_18A3_HOSTED_CI_PREPARATION.md`
- `docs/engine/evidence/zge18a3/local-workflow.json`
- `docs/engine/evidence/zge18a3/inventory.json`
- `docs/engine/evidence/zge18a3/protected-paths.json`
- `docs/engine/evidence/zge18a3/staging-paths.txt`

The [machine-readable inventory](evidence/zge18a3/inventory.json) records all original paths, all final paths, and unrelated dirty paths separately. The [explicit staging path file](evidence/zge18a3/staging-paths.txt) lists each intended file once, with no directories, wildcards or broad add operation. Historical ZGE-18A.2 evidence remains unchanged; its 51-path count describes that earlier checkpoint.

The staging allowlist excludes the `stable-fast-3d` gitlink and every nested path; `node_modules`; `.env` and `.env.*`; all unrelated Sentinel Grid tooling/browser artifacts; shipping runtime assets; and `src/game/Game.js`. The candidate runtime reconstruction files remain in the pre-existing reviewed candidate inventory; this task changes none of their bytes or behavior. A targeted scan checks common private-key/token/access-key signatures in every proposed candidate file and records only findings metadata, never credential contents. It does not claim universal secret detection.

[Protected-path evidence](evidence/zge18a3/protected-paths.json) records file-set/byte preservation, shipping and launch comparisons against HEAD, unchanged HEAD, and an empty real staging index. No protected path is selected for staging.

## Exact staging and publication plan — owner execution after authorization only

These commands are a reviewable future plan, not actions taken by this task. Start from the same HEAD and reviewed candidate bytes. Reinspect if any file has changed since this report. The working index must be empty. Validate the 56-file path list against `inventory.json`, inspect the full proposed diff and evidence, and confirm the protected exclusions before staging.

```sh
cd /Users/dwaynecampbell/Desktop/zeknova-shared-gaming-experience
test "$(git rev-parse HEAD)" = f91da08de12474990e4379b4b6ed906acb8a836b
test -z "$(git diff --cached --name-only)"
git switch -c codex/zge18a-ci
git --literal-pathspecs add --pathspec-from-file=docs/engine/evidence/zge18a3/staging-paths.txt
```

Before committing, require exact staged-set equality, not just a count:

```sh
python3 - <<'PY'
import hashlib, json, subprocess
from pathlib import Path
inventory = json.loads(Path('docs/engine/evidence/zge18a3/inventory.json').read_text())
expected = set(inventory['finalCandidatePaths'])
listed = Path('docs/engine/evidence/zge18a3/staging-paths.txt').read_text().splitlines()
assert len(listed) == len(set(listed)) == len(expected) == 56
assert set(listed) == expected
staged = set(filter(None, subprocess.check_output(
    ['git', 'diff', '--cached', '--name-only', '-z']).decode().split('\0')))
assert staged == expected, {'missing': sorted(expected-staged), 'extra': sorted(staged-expected)}
for name, digest in inventory['sha256'].items():
    staged_bytes = subprocess.check_output(['git', 'show', ':' + name])
    assert hashlib.sha256(staged_bytes).hexdigest() == digest, name
print('Exactly the 56 reviewed candidate paths staged; recorded content hashes match')
PY
git diff --cached --check
git diff --cached --stat
git diff --cached -- .github/workflows/zge18a.yml src/game/Game.js assets/index-02987539.js assets/model-runtime-c96327ba.js
```

Review the complete staged diff as well; the command above highlights the workflow and protected runtime/launch paths. The protected three files must have no staged diff. Candidate-only runtime changes inherited from the earlier milestone must remain explicitly understood as candidate changes, not shipping launch promotion.

After that review, the specifically authorized publication would be:

```sh
git commit -m "ZGE-18A: reconcile runtime lineage and certify SDK release"
git push -u origin codex/zge18a-ci
```

The push itself triggers the workflow's existing `push` event. Do not issue `gh workflow run`, open a PR, push `main`, merge, promote the candidate launch path, deploy or begin ZGE-18B as part of this plan. No GPU dispatch is needed for the requested hosted integrity job.

## Hosted GitHub Actions verification procedure

Repository: `medallion-xln/zeknova-shared-gaming-experience`; workflow: `.github/workflows/zge18a.yml`; job: `integrity`; runner: `ubuntu-24.04`. Repository permissions, Actions availability and hosted execution have not been checked by this task.

After the separately authorized push:

```sh
ZGE18A_SHA=$(git rev-parse HEAD)
gh run list -R medallion-xln/zeknova-shared-gaming-experience \
  --workflow zge18a.yml --branch codex/zge18a-ci --commit "$ZGE18A_SHA" \
  --event push --json databaseId,headSha,status,conclusion,url
```

Choose the run whose `headSha` equals the published commit exactly. Record its numeric ID as `ZGE18A_RUN_ID`; do not substitute a prior successful run. If no run appears, inspect Actions permissions/workflow recognition and report the blocker. Do not claim success or trigger another event without authorization.

```sh
gh run watch "$ZGE18A_RUN_ID" -R medallion-xln/zeknova-shared-gaming-experience --exit-status
gh run view "$ZGE18A_RUN_ID" -R medallion-xln/zeknova-shared-gaming-experience \
  --json headSha,headBranch,event,status,conclusion,url,jobs
gh run view "$ZGE18A_RUN_ID" -R medallion-xln/zeknova-shared-gaming-experience --log
```

Require completed/success for the exact-commit push run **and the `integrity` job**, with every required step executed successfully. Confirm pinned Node, fresh install, PHP/SQLite availability, 32/32 behavior tests, four independent mutation controls each reporting KILLED with passing control, 347/347 engine tests, 70/70 SDK tests, integrity checks, fresh public consumer, reproducibility and the final committed-output diff. Retain run URL, full commit SHA, job conclusion and logs. A skipped/cancelled/missing mutation command or failed integrity step is not hosted verification. The optional `browser-certification` job is expected to be skipped on push; that does not establish browser certification.

## Certification limits and exact owner authorization

RB-1 certification is **source-slice only**, not full-browser lifecycle certification. The harness executes verbatim disposer/selected wrappers with fixture collaborators; it does not construct the full `zR` instance or certify the whole browser teardown path. Timer completion, outer-wrapper work and overlapping live imports retain the limitations documented in the ZGE-18A.2 report. Hosted CI success would verify this integrity/package pipeline, not remove those lifecycle limits.

Required owner authorization for the next action is explicitly:

> Authorize creating `codex/zge18a-ci` from `f91da08`, staging only the 56 paths in the reviewed ZGE-18A.3 manifest, committing the reviewed candidate, and pushing that branch to `origin`, which will trigger GitHub-hosted CI. Authorize reading the resulting exact-commit run and retaining its verification evidence. This does not authorize a PR, merge, push to main, deployment, runtime promotion, GPU dispatch or ZGE-18B work.

That authorization has **not** been granted by this preparation request. Stop after reporting; no publication action follows automatically.
