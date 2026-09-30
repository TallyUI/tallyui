// @vitest-environment node
import { spawnSync } from 'node:child_process'
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

// scripts/vercel-ignore.sh decides whether Vercel builds the apps/web preview (exit 0 skips, 1 builds).
const ROOT = fileURLToPath(new URL('../../../', import.meta.url))
const SCRIPT = join(ROOT, 'scripts/vercel-ignore.sh')
const DEP_FIELDS = ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies']

function scriptPaths(): string[] {
  const m = /^PATHS='([^']*)'/m.exec(readFileSync(SCRIPT, 'utf8'))
  if (!m) throw new Error('no PATHS list in scripts/vercel-ignore.sh')
  return m[1].split(/\s+/).filter(Boolean)
}

// Every workspace package dir, from pnpm-workspace.yaml's `packages:` globs (all of the form `dir/*`).
function workspaceDirs(): string[] {
  const block = /^packages:\n((?:[ \t]+-.*\n)+)/m.exec(readFileSync(join(ROOT, 'pnpm-workspace.yaml'), 'utf8'))
  const globs = block![1].trim().split('\n').map(line => line.replace(/^\s*-\s*/, '').replace(/["']/g, ''))
  expect(globs.every(g => /^[\w.-]+\/\*$/.test(g))).toBe(true)
  return globs.flatMap(g => {
    const group = g.slice(0, -2)
    return readdirSync(join(ROOT, group), { withFileTypes: true })
      .filter(e => e.isDirectory() && existsSync(join(ROOT, group, e.name, 'package.json')))
      .map(e => `${group}/${e.name}`)
  })
}

// @tallyui/web and every workspace package it depends on, transitively, through any dependency field:
// the packages `pnpm --filter "@tallyui/web..." build` (vercel.json's buildCommand) builds.
function webClosure(): string[] {
  const pkgs = new Map<string, { dir: string, json: Record<string, Record<string, string>> }>()
  for (const dir of workspaceDirs()) {
    const json = JSON.parse(readFileSync(join(ROOT, dir, 'package.json'), 'utf8'))
    pkgs.set(json.name, { dir, json })
  }
  const seen = new Set<string>()
  const queue = ['@tallyui/web']
  while (queue.length) {
    const name = queue.pop()!
    if (seen.has(name)) continue
    seen.add(name)
    for (const field of DEP_FIELDS) queue.push(...Object.keys(pkgs.get(name)!.json[field] ?? {}).filter(dep => pkgs.has(dep)))
  }
  return [...seen].map(name => pkgs.get(name)!.dir).sort()
}

describe('the path list', () => {
  it("names exactly @tallyui/web's workspace dependency closure", () => {
    expect(scriptPaths().filter(p => p.includes('/')).sort()).toEqual(webClosure())
    expect(webClosure()).not.toContain('packages/storage-sqlite')
  })

  it('names only root build files that exist', () => {
    for (const file of scriptPaths().filter(p => !p.includes('/'))) expect(existsSync(join(ROOT, file)), file).toBe(true)
  })
})

describe("the script's decision, in a throwaway git repo", () => {
  // The parent's git and Vercel variables must not reach the throwaway repo or the script.
  function env(extra: Record<string, string> = {}): NodeJS.ProcessEnv {
    const clean = Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith('GIT_') && k !== 'VERCEL_GIT_PREVIOUS_SHA'))
    return { ...clean, ...extra }
  }
  function git(cwd: string, ...args: string[]): string {
    const r = spawnSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@example.com', '-c', 'commit.gpgsign=false', ...args], { cwd, env: env(), encoding: 'utf8' })
    if (r.status !== 0) throw new Error(`git ${args.join(' ')}: ${r.stderr}`)
    return r.stdout.trim()
  }
  let edits = 0
  function commit(dir: string, path: string): string {
    mkdirSync(dirname(join(dir, path)), { recursive: true })
    writeFileSync(join(dir, path), `edit ${++edits}\n`)
    git(dir, 'add', '-A')
    git(dir, 'commit', '-q', '-m', path)
    return git(dir, 'rev-parse', 'HEAD')
  }
  // A repo whose first commit holds the script; left in the OS tmp dir.
  function repo(): string {
    const dir = mkdtempSync(join(tmpdir(), 'vercel-ignore-'))
    mkdirSync(join(dir, 'scripts'))
    copyFileSync(SCRIPT, join(dir, 'scripts/vercel-ignore.sh'))
    git(dir, 'init', '-q')
    commit(dir, 'README.md')
    return dir
  }
  const decide = (dir: string, extra?: Record<string, string>) =>
    spawnSync('sh', ['scripts/vercel-ignore.sh'], { cwd: dir, env: env(extra) }).status

  it.each([
    ['packages/storage-sqlite/README.md', 0],
    ['packages/core/src/x.ts', 1],
    ['apps/web/src/app/page.tsx', 1],
    ['pnpm-lock.yaml', 1],
  ])('a commit touching only %s exits %i, from HEAD^ or from the previous deployment', (path, code) => {
    const dir = repo()
    const previous = git(dir, 'rev-parse', 'HEAD')
    commit(dir, path)
    expect(decide(dir)).toBe(code)
    expect(decide(dir, { VERCEL_GIT_PREVIOUS_SHA: previous })).toBe(code)
  })

  it('diffs from the previous deployment, so an earlier library commit still builds', () => {
    const dir = repo()
    const previous = git(dir, 'rev-parse', 'HEAD')
    commit(dir, 'packages/core/src/x.ts')
    commit(dir, 'docs/notes.md')
    expect(decide(dir)).toBe(0)
    expect(decide(dir, { VERCEL_GIT_PREVIOUS_SHA: previous })).toBe(1)
  })

  it('builds when the base cannot be resolved: an empty or unknown previous SHA, the first commit, a shallow clone', () => {
    const first = repo()
    expect(decide(first)).toBe(1)
    const dir = repo()
    commit(dir, 'docs/notes.md')
    expect(decide(dir)).toBe(0)
    expect(decide(dir, { VERCEL_GIT_PREVIOUS_SHA: '' })).toBe(1)
    expect(decide(dir, { VERCEL_GIT_PREVIOUS_SHA: 'f'.repeat(40) })).toBe(1)
    const shallow = join(mkdtempSync(join(tmpdir(), 'vercel-ignore-')), 'clone')
    git(tmpdir(), 'clone', '-q', '--depth=1', `file://${dir}`, shallow)
    expect(decide(shallow)).toBe(1)
  })
})
