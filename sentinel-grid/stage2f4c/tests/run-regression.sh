#!/usr/bin/env bash
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
node "$HERE/stage2f4c-regression.cjs" "$@"
