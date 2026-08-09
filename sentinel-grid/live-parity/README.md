# ZekNova Stage 2F-Z Live Campaign Workspace

Directories:

- `fixtures/` — raw runtime captures evaluated by Stage 2E-Z.
- `records/` — self-hashed Stage 2E-Z shadow records.
- `sessions/` — self-hashed Stage 2F-Z session manifests.
- `candidates/` — self-hashed controlled candidate evaluation records.
- `quarantine/` — rejected, replay, synthetic, duplicate or malformed evidence.
- `evidence/` — campaign and decision outputs.

Only records with `captureProvenance.kind = "live-runtime"`, `productionEligible = true`, valid runtime/repository hashes, and a matching session manifest can count toward sustained-shadow certification.

Create a session manifest after records have been produced:

```bash
node create-session-manifest.mjs \
  --session-id SESSION_ID \
  --environment-id ZEKNOVA_ENVIRONMENT_ID \
  --repository-head GIT_HEAD \
  --runtime-build-hash SHA256 \
  --collector-id COLLECTOR_ID \
  --started-at ISO_TIMESTAMP \
  --ended-at ISO_TIMESTAMP \
  --output sessions/SESSION_ID.json
```

Convert candidate recommendation evidence into a controlled evaluation record:

```bash
node evaluate-controlled-candidate.mjs \
  --record records/SHADOW_RECORD.json \
  --candidate candidate-recommendation.json \
  --output candidates/CANDIDATE_RECORD.json
```

Run the Stage 2F-Z campaign and controlled evaluation gate:

```bash
./certify-stage2f-campaign.sh
```

The command fails closed until the authentic live campaign, candidate safety, coverage and latency thresholds pass. Even a passing result is limited to human-reviewed R0 controlled shadow evaluation. It cannot grant execution authority.
