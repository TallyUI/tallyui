# Contributing to TallyUI

## Local setup

TallyUI uses [RxDB Premium](https://rxdb.info/premium) (ADR-031, ADR-044).
The `rxdb-premium` package's install script downloads and decrypts the
licensed plugins, so `pnpm install` needs a licence token. Without one, the
install fails.

**Never publish the decrypted plugins.** This repo is public, and its Actions
caches and artifacts can be read from fork PRs. So:
- CI never caches the pnpm store or `node_modules`;
- `sideEffectsCache` stays `false` in `pnpm-workspace.yaml`, and CI checks it;
- CI uploads no build output, trace or HTML report that could contain the
  worker bundle.

1. Put the token in your environment before installing. The installer reads
   the `RXDB_PREMIUM` environment variable:

   ```sh
   export RXDB_PREMIUM=<token>
   ```

   On the agent host (the Mac mini), the token is in the keychain:

   ```sh
   export RXDB_PREMIUM="$(security find-generic-password -s rxdb-premium -w)"
   ```

   Alternatively, put `RXDB_PREMIUM=<token>` in a `.env` file at the repo
   root. `.env` is git-ignored, and the installer searches parent
   directories for it. Never write the token to a committed file, and never
   use `package.json` `accessTokens`.

2. Install and build:

   ```sh
   pnpm install --frozen-lockfile
   pnpm build
   ```

3. Run the tests with at most two workers:

   ```sh
   pnpm vitest run --maxWorkers=2
   ```

   The Playwright e2e suite (`pnpm test:e2e:web`) starts its web servers on
   ports derived from the worktree's path, so two worktrees never test each
   other's servers; `node e2e/ports.ts` prints them. `E2E_WEB_PORT` and
   `E2E_SQLITE_PORT` override them, and `E2E_REUSE=1` reuses a server
   already running on those ports. Without `E2E_REUSE=1`, a port that is
   already taken fails the run before any test, naming the process that
   holds it: stop that process, or set `E2E_REUSE=1` to test its server.
   CI keeps 8081 and 8090.

The installer prints the token in its output. Don't paste install logs
anywhere public.

## Versions

`rxdb` and `rxdb-premium` are pinned to the same exact version (currently
17.5.0; ADR-031). Upgrade them together, in one PR.

## Releasing

See [RELEASING.md](RELEASING.md).
