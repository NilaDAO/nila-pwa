#!/usr/bin/env bash
# scripts/release/publish.sh dev|prod — build the `release` branch and upload it to the Amplify app (Docs/RELEASE.md).
#
#   scripts/release/publish.sh dev     → Amplify branch `dev`  (check it there first)
#   scripts/release/publish.sh prod    → Amplify branch `prod` = pwa.nila.land (only the commit published to dev)
#
# Run by a person, on a machine with .env.production (gitignored) and an AWS login for the Amplify app. Never by an
# agent. Refuses unless: the checkout is the `release` branch, clean and equal to origin/release; .env.production holds
# no demo flag; the build passes scripts/release/check-no-demo.sh; for prod, dev was published from the same commit.
# The build runs with a clean environment (only .env.production and the version), so demo variables in this shell
# (REACT_APP_COGNITO_DEMO, REACT_APP_DEMO_*, …) can never reach it.
set -euo pipefail

APP_ID="${AMPLIFY_APP_ID:-d108zfeejs7ppp}"
REGION="${AMPLIFY_REGION:-ap-south-1}"
ENVN="${1:-}"
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
STATE="$ROOT/.release"                  # gitignored: which commit went to dev (the prod gate)
say() { printf '\033[1m[publish]\033[0m %s\n' "$*" >&2; }
die() { printf '\033[31m[publish]\033[0m %s\n' "$*" >&2; exit 1; }
case "$ENVN" in dev|prod) ;; *) die "usage: $0 dev|prod" ;; esac
cd "$ROOT"
for c in aws git node npx zip curl; do command -v $c >/dev/null || die "$c not found"; done

# ── the checkout ─────────────────────────────────────────────────────────────
[ "$(git rev-parse --abbrev-ref HEAD)" = release ] || die "check out the release branch (git checkout release && git pull)"
git fetch -q origin release
[ -z "$(git status --porcelain --untracked-files=no)" ] || die "the checkout has changes — commit nothing here, publish what origin/release holds"
HEAD_SHA=$(git rev-parse HEAD)
[ "$HEAD_SHA" = "$(git rev-parse origin/release)" ] || die "HEAD is not origin/release (git pull)"
[ -f .env.production ] || die "no .env.production"
grep -qE '^\s*REACT_APP_(COGNITO_DEMO|DEMO_[A-Z_]*)\s*=\s*\S' .env.production && die ".env.production sets a demo flag — remove it"
VERSION=$(sed -n 's/^REACT_APP_VERSION=//p' .env.production | tail -1)
SHORT=$(git rev-parse --short HEAD)
mkdir -p "$STATE"
if [ "$ENVN" = prod ]; then
  [ "$(cat "$STATE/dev" 2>/dev/null | cut -d' ' -f1)" = "$HEAD_SHA" ] || die "publish this commit ($SHORT) to dev first and check it there"
  printf 'Publish %s (version %s) to pwa.nila.land? Type "publish prod": ' "$SHORT" "$VERSION" >&2
  read -r ok; [ "$ok" = "publish prod" ] || die "stopped"
fi

# ── build (clean environment) and the gate ──────────────────────────────────
say "build $SHORT (version $VERSION) with .env.production only"
# 13 Nov: in a clean worktree of this commit, holding only .env.production. Built in this folder, CRA also read
# .env.local (the local demo's settings), and its demo values reached the build.
SRC="$STATE/src"
git worktree remove --force "$SRC" >/dev/null 2>&1 || rm -rf "$SRC"
git worktree add --detach -q "$SRC" "$HEAD_SHA"
trap 'git worktree remove --force "$SRC" >/dev/null 2>&1 || true' EXIT
cp .env.production "$SRC/.env.production"
ln -s "$PWD/node_modules" "$SRC/node_modules"
( cd "$SRC" && env -i PATH="$PATH" HOME="$HOME" NODE_ENV=production GENERATE_SOURCEMAP=false \
  npx env-cmd -f .env.production npx react-app-rewired build ) >"$STATE/build.log" 2>&1 \
  || { tail -20 "$STATE/build.log" >&2; die "build failed (log: .release/build.log)"; }
BUILD="$SRC/build"
scripts/release/check-no-demo.sh "$BUILD"

# ── upload to Amplify (manual deployment) ───────────────────────────────────
ZIP="$STATE/build-$SHORT.zip"
rm -f "$ZIP"; ( cd "$BUILD" && zip -qr "$ZIP" . )
say "Amplify $APP_ID / branch $ENVN: upload $(du -h "$ZIP" | cut -f1)"
read -r JOB URL < <(aws amplify create-deployment --app-id "$APP_ID" --branch-name "$ENVN" --region "$REGION" \
  --query '[jobId, zipUploadUrl]' --output text)
curl -sf -X PUT -T "$ZIP" "$URL" >/dev/null || die "upload failed"
aws amplify start-deployment --app-id "$APP_ID" --branch-name "$ENVN" --job-id "$JOB" --region "$REGION" >/dev/null
for i in $(seq 1 120); do
  st=$(aws amplify get-job --app-id "$APP_ID" --branch-name "$ENVN" --job-id "$JOB" --region "$REGION" \
    --query 'job.summary.status' --output text)
  case "$st" in SUCCEED) break ;; FAILED|CANCELLED) die "Amplify job $JOB: $st" ;; esac
  sleep 5
done
[ "$st" = SUCCEED ] || die "Amplify job $JOB still $st after 10 minutes"
echo "$HEAD_SHA $(date -u +%FT%TZ) job $JOB version $VERSION" >"$STATE/$ENVN"
say "published $SHORT (version $VERSION) to $ENVN (job $JOB)"
[ "$ENVN" = dev ] && say "check https://dev.$APP_ID.amplifyapp.com, then: scripts/release/publish.sh prod"
[ "$ENVN" = prod ] && say "tag it: git tag pwa-$(date -u +%F)-$SHORT $SHORT && git push origin pwa-$(date -u +%F)-$SHORT"
