# Release lane — from a fix to pwa.nila.land

Every change reaches pwa.nila.land the same way, and nothing from the demo comes along.

| Step | Who | How | Gate |
|---|---|---|---|
| 1. Fix | dev / agent | branch `t1/pwa/<task>` (own worktree) | — |
| 2. Try on the local demo | dev / agent | nila-integrations `DEMO_PWA_REF=t1/pwa/<task> scripts/demo-stack.sh pwa` | the demo's settings are injected at build time by nila-integrations, never written in this repo |
| 3. PR to `main` | dev / agent | `gh pr create` | CI `build + no demo` (required), `tests` (not yet required) |
| 4. Merge to `main` | reviewer | GitHub | branch protection: PR + CI green |
| 5. Weekly release PR `main → release` | GitHub Actions | `.github/workflows/release-pr.yml`, Mondays (or *Run workflow*) | CI on the PR |
| 6. Merge the release PR | reviewer | GitHub | the decision to publish |
| 7. Publish | a person, never an agent | `git checkout release && git pull && scripts/release/publish.sh dev`, check, then `publish.sh prod` | `check-no-demo.sh`; prod only the commit dev got; typed confirmation |

**No demo settings on pwa.nila.land.** Demo-only code sits behind build-time literals (`REACT_APP_COGNITO_DEMO`,
`REACT_APP_DEMO_STATIC`, `config-overrides.js`), so a real build drops it. `scripts/release/check-no-demo.sh` makes
that a gate: it fails a build containing any demo marker (`/__demo/`, `demo-fixtures`, `nila.demo.`, `X-Nila-Demo`, the
demo guard's warning, the local chain / node / Stellar addresses). CI runs it on every PR and push; `publish.sh` runs
it before every upload, and builds with a clean environment (only `.env.production`), refusing a `.env.production`
that sets a demo flag.

**Amplify** (app `d108zfeejs7ppp`, `ap-south-1`): not connected to Git; branches are published by manual deployment
(`create-deployment` → upload → `start-deployment`), which `publish.sh` does. `prod` is pwa.nila.land, `dev` is
`dev.d108zfeejs7ppp.amplifyapp.com`. Version: bump `REACT_APP_VERSION` in `.env.production` before publishing.

**Tag** after a prod publish: `pwa-<date>-<sha>` (the script prints the command).
