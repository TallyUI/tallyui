# Contributing to TallyUI

## Local setup

TallyUI uses [RxDB Premium](https://rxdb.info/premium) (ADR-031, ADR-044).
The `rxdb-premium` package's install script downloads and decrypts the
licensed plugins, so `pnpm install` needs a licence token. Without one, the
install fails.

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

The installer prints the token in its output. Don't paste install logs
anywhere public.

## Versions

`rxdb` and `rxdb-premium` are pinned to the same exact version (currently
16.21.1). Upgrade them together, in one PR.

## Releasing

See [RELEASING.md](RELEASING.md).
