#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")" && pwd)"
MARKER="$ROOT/../integration.json"
KERNEL="$(node -e 'const fs=require("fs");const m=JSON.parse(fs.readFileSync(process.argv[1],"utf8"));process.stdout.write(m.kernelPath)' "$MARKER")"
exec node "$KERNEL/scripts/certify-zeknova-stage2f-campaign.mjs" \
  --records "$ROOT/records" \
  --sessions "$ROOT/sessions" \
  --candidates "$ROOT/candidates" \
  --output "$ROOT/evidence/stage2f-latest.json"
