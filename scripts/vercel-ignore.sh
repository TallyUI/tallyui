#!/bin/sh
# Vercel's ignoreCommand (vercel.json): exit 0 skips the preview build, exit 1 builds.
# Skips only when the change touches none of PATHS: @tallyui/web's workspace dependency closure
# (what `pnpm --filter "@tallyui/web..."` builds) and the root build files.
# packages/integration-tests/src/vercel-ignore.test.ts fails when the closure and this list differ.
PATHS='apps/web apps/mock-api connectors/medusa connectors/shopify connectors/vendure connectors/woocommerce
packages/components packages/core packages/database packages/pos packages/primitives packages/theme
package.json pnpm-lock.yaml pnpm-workspace.yaml vercel.json tsconfig.json turbo.json'
cd "$(dirname "$0")/.." || exit 1
# The base is the last successful deployment's commit. Vercel leaves VERCEL_GIT_PREVIOUS_SHA empty on
# a branch's first deployment, where HEAD^ could hide the branch's earlier commits, so that builds.
# HEAD^ is used only when the variable is unset. A base missing from the clone (it is shallow) builds.
if [ -n "${VERCEL_GIT_PREVIOUS_SHA+set}" ]; then base=$VERCEL_GIT_PREVIOUS_SHA; else base=HEAD^; fi
[ -n "$base" ] && git rev-parse --quiet --verify "$base^{commit}" >/dev/null || exit 1
# shellcheck disable=SC2086 # PATHS is split into pathspecs on purpose
if git diff --quiet "$base" HEAD -- $PATHS; then exit 0; fi
exit 1
