# Releasing TallyUI packages

TallyUI publishes 11 packages to npm at one shared version: `@tallyui/core`,
`database`, `primitives`, `components`, `storage-sqlite`, `pos`, `theme` and
the four `connector-*` packages (ADR-041). A release takes two steps:

1. **A worker opens the version PR.** It runs `pnpm changeset version` on a
   branch, then commits the result and opens it as an ordinary PR. The PR is
   reviewed like any other, but merged only by Paul, or by this machine on
   his explicit word, which re-enables the Release workflow first. Until
   then it stays open.
2. **The Release workflow publishes.** On every push to `main`,
   `.github/workflows/release.yml` counts the pending changesets (in pre
   mode, those not yet listed in `.changeset/pre.json`). If there
   are none, it runs `pnpm changeset publish`. That publishes every package
   version not yet on npm, then pushes the git tags and creates the GitHub
   releases. If any changesets are pending, the publish job is skipped.

GitHub Actions never opens the version PR, because the TallyUI org's
enterprise policy forbids Actions from creating pull requests (ADR-043).

## Prerequisites

- Paul has given the go-ahead for this release. The Release workflow
  (`release.yml`, id 238319860) stays disabled until he does. It has been
  disabled since 2026-09-30 (the Front desk, 05:10): while it is active,
  merging the version PR publishes to npm at once, and publishing is
  Paul's call alone.
- The version PR (#200 or its successor) is merged only by Paul, or by
  this machine on his explicit word. On that word the workflow is
  re-enabled first (`gh workflow enable 238319860`), then the version PR
  is merged and #242's release checklist runs. Until then it stays open.
- Each package has an npm trusted publisher: org `TallyUI`, repo
  `tallyui`, workflow `release.yml`, environment blank (ADR-042). No npm
  token exists anywhere.
- Every package already exists on npm. npm can only set a trusted
  publisher on an existing package, so a brand-new package needs one
  bootstrap publish by Paul first.

## Changesets during development

Every PR that changes a published package adds a changeset
(`pnpm changeset`). Changesets pile up in `.changeset/` on `main` until the
next version PR consumes them. While any are pending, the Release workflow
does nothing.

### Internal peer ranges are `workspace:^`, never `workspace:*`

A `@tallyui/*` package's peer dependency on another one is written
`workspace:^`, and published as a caret range (`^2.1.0`).

- **Why both changes are needed:** by default, changesets bumps a
  peer-dependent major on *any* minor or major release of its peer, whatever
  the range. `.changeset/config.json` sets
  `onlyUpdatePeerDependentsWhenOutOfRange`, so it goes major only when the
  new version leaves the peer's range. And changesets reads a `workspace:*`
  peer as the exact current version, so with `workspace:*` every minor
  leaves the range anyway.
  - Either change alone still turns a minor changeset on `@tallyui/core`
    into a major for every peer-dependent, and the fixed group then lifts
    all the packages to the next major.
  - That's what happened with the first 2.1.0 version run, which came out
    as 3.0.0.
- **The option is unstable:** its key is
  `___experimentalUnsafeOptions_WILL_CHANGE_IN_PATCH`, and changesets
  silently ignores a key it doesn't know. A changesets update that renames
  it brings the 3.0.0 problem back. CI now runs `pnpm check:release-plan`,
  which fails on a major no changeset asked for.
- **Check:** before `pnpm changeset version`, `pnpm changeset status
  --verbose` must show no major unless a changeset asks for one. It is the
  first step of the procedure below.
- **Prereleases:** see "Prereleases (the `next` dist-tag)" below.

## Worker procedure: open the version PR

Run these from a worktree on a fresh branch off `main`:

```sh
git pull --ff-only origin main
pnpm install --frozen-lockfile
pnpm changeset status --verbose          # no major unless a changeset asks for one
export GITHUB_TOKEN="$(gh auth token)"   # changelog-github looks up PRs and authors
pnpm changeset version
pnpm install --frozen-lockfile
pnpm build
pnpm test
pnpm smoke:pack
```

Check the result before committing:

- `pnpm smoke:pack` passes: every tarball has LICENSE, its entry files and no `workspace:` ranges, and installs and imports in a clean project.
- `.changeset/` holds only `config.json` (and `README.md`, if present). Every
  pending changeset is consumed. In pre mode the changeset files stay, and
  every one is listed in `.changeset/pre.json`.
- All 11 packages have the same new version, and each one's `CHANGELOG.md`
  has an entry for it.
- `demo` and `web` are unchanged, because changesets ignores them. The
  private `mock-api` moves to the shared version with the rest (it falls
  in the fixed `@tallyui/*` group) but is never published. That is
  expected.
- If `pnpm install --frozen-lockfile` failed after versioning, run
  `pnpm install` and commit `pnpm-lock.yaml` too.

Commit everything as `chore: version packages`, push the branch, and open a
PR to `main` titled `chore: version packages <version>`. The body lists the
version and the changesets it consumed and ends with the Claude Code
footer. Report the PR number to the front desk.

**Before it merges,** make sure no new changeset has landed on `main`
since the branch was cut. If one has, rebase the branch and run
`pnpm changeset version` again. Otherwise the merge leaves a pending
changeset on `main`, the Release workflow skips publishing, and the release
waits for the next version PR.

## Prereleases (the `next` dist-tag)

### How it works

- A prerelease is changesets pre mode. The pre tag is both the version
  suffix and the npm dist-tag. `pnpm changeset pre enter next` gives
  `3.0.0-next.0`, then `3.0.0-next.1` and so on. The counter starts at 0.
  All of them are published under `next`. `latest` is untouched.
- In pre mode, `changeset version` keeps the changeset files and lists them
  in `.changeset/pre.json`. The Release workflow counts only the unlisted
  ones (`scripts/pending-changesets.mjs`), so a merged prerelease version PR
  still publishes.

### Procedure

- **First prerelease:** on the version branch, run
  `pnpm changeset pre enter next` before the normal procedure. Commit
  `pre.json` with the version output.
- **Further prereleases** (`next.1`, and so on): the normal procedure,
  without entering again.
- **The final release:** `pnpm changeset pre exit`, then the normal
  procedure. That consumes every changeset, deletes `pre.json` and
  publishes to `latest`.
- **Verify:** `npm view @tallyui/core dist-tags`.

### Things to know

- **Pinning:** apps pin a prerelease exactly (`3.0.0-next.0`). A caret
  range such as `^2.0.0` never matches a prerelease.
- **Only-pre packages:** `changeset publish` puts a package that has never
  had a regular release on `latest` rather than `next`. All 11 packages
  have one today. A new package needs its bootstrap publish first (see
  Prerequisites).
- **Peer ranges:** a prerelease doesn't satisfy a caret range on the release
  before it (`3.1.0-next.0` is outside `^3.0.0`). So a minor in pre mode
  lifts every peer-dependent to a major, and the fixed group then lifts all
  packages. `pnpm changeset status --verbose` and `pnpm check:release-plan`
  show it.

## After the merge

The Release workflow run on the merge commit publishes, provided Paul has
re-enabled it (see Prerequisites); if it is still disabled, nothing
publishes and nothing is tagged. Verify it:

```sh
npm view @tallyui/core version                 # the new version
npm view @tallyui/core --json | jq .dist.attestations   # provenance present
gh release list --repo TallyUI/tallyui --limit 11
```

If a publish fails partway, fix the cause and re-run the workflow run.
`changeset publish` skips versions that are already on npm, so a re-run
publishes only what is missing. Afterwards, check that every package has
its tag and GitHub release, and create any that are missing by hand.
