#!/usr/bin/env bash
# scripts/release/check-no-demo.sh [build dir] — fails when a release build carries demo code or demo settings.
#
# The local demo (nila-integrations) and the static demo are built with REACT_APP_COGNITO_DEMO / REACT_APP_DEMO_STATIC;
# those are build-time literals (config-overrides.js), so a real build drops every demo branch. This check makes that
# a gate: CI runs it on every PR and push to main, and scripts/release/publish.sh runs it before any upload to Amplify.
# The markers are strings only demo code contains (calibrated on a clean build: generic `localhost` / `31337` occur in
# libraries and are not markers).
set -euo pipefail
B="${1:-build}"
[ -d "$B/static/js" ] || { echo "check-no-demo: no build at $B (npm run build first)" >&2; exit 2; }
MARKERS=(
  '/__demo/'                      # the demo servers' routes (login stand-in, record, fixtures)
  'demo-fixtures'                 # the static demo's answers
  '[demo-static]'                 # the static demo shim
  '[demo] static'                 # the static demo shim
  'nila.demo.'                    # demo-only browser storage keys
  'X-Nila-Demo'                   # the demo servers' request header
  'outside the local demo'        # utils/demoMode.js's guard (present only when its flag is not a build-time literal)
  '127.0.0.1:8545'                # the local Polygon fork
  'localhost:8000'                # the local demo node
  'localhost:8010'                # the local Stellar network
)
fail=0
for m in "${MARKERS[@]}"; do
  files=$(grep -rlF -- "$m" "$B" --include='*.js' --include='*.html' --include='*.json' 2>/dev/null || true)
  if [ -n "$files" ]; then
    echo "check-no-demo: \"$m\" in: $(echo "$files" | sed "s#^$B/##" | tr '\n' ' ')" >&2
    fail=1
  fi
done
if [ "$fail" = 1 ]; then
  echo "check-no-demo: FAILED — this build carries demo code or demo settings; it must not reach pwa.nila.land" >&2
  exit 1
fi
echo "check-no-demo: clean (${#MARKERS[@]} markers, $(find "$B" -name '*.js' | wc -l | tr -d ' ') js files)"
