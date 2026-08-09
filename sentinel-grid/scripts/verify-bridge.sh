#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
for file in \
  "$ROOT/integration.json" \
  "$ROOT/adapter-migration/PARITY_CHECKLIST.md" \
  "$ROOT/live-parity/verify-live-fixtures.mjs" \
  "$ROOT/live-parity/certify-production-shadow.sh" \
  "$ROOT/live-parity/certify-stage2f-campaign.sh" \
  "$ROOT/live-parity/create-session-manifest.mjs" \
  "$ROOT/live-parity/evaluate-controlled-candidate.mjs" \
  "$ROOT/snapshot-export/capture-live-parity.template.mjs"; do
  [ -f "$file" ] || { echo "Missing bridge file: $file" >&2; exit 1; }
done
node -e 'const fs=require("fs"); const m=JSON.parse(fs.readFileSync(process.argv[1],"utf8")); if(m.authority!=="R0"||m.canDispatch!==false||m.canMutateLiveWorld!==false) process.exit(1); if(m.productionAdapterRegistered!==true||m.frozenCorpusBehavioralParityCertified!==true) process.exit(1); if(m.realStateCaptureFrameworkCertified!==true||m.sustainedShadowFrameworkCertified!==true) process.exit(1); if(m.stage2fCampaignFrameworkCertified!==true||m.stage2fControlledEvaluationFrameworkCertified!==true) process.exit(1); if(m.controlledShadowEvaluationEligible!==false||m.authorityPromotionEligible!==false) process.exit(1);' "$ROOT/integration.json"
node "$ROOT/live-parity/verify-live-fixtures.mjs"
printf 'ZekNova Sentinel Grid bridge: PASS (R0, Stage 2F-Z framework installed)\n'
