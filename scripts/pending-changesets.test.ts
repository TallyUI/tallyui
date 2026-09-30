import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { countPendingChangesets } from './pending-changesets.mjs';

const ids = ['brave-cats-sing', 'quiet-dogs-run', 'green-owls-fly'];
let dirs: string[] = [];

function changesetDir(preJson?: string) {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'pending-changesets-'));
  dirs.push(dir);
  for (const id of ids) writeFileSync(path.join(dir, `${id}.md`), '---\n"@tallyui/core": patch\n---\n\nA change.\n');
  writeFileSync(path.join(dir, 'README.md'), '# Changesets\n');
  writeFileSync(path.join(dir, 'config.json'), '{}\n');
  if (preJson !== undefined) writeFileSync(path.join(dir, 'pre.json'), preJson);
  return dir;
}

function preJson(mode: 'pre' | 'exit', changesets: string[]) {
  return JSON.stringify({ mode, tag: 'next', initialVersions: {}, changesets });
}

afterEach(() => {
  for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
  dirs = [];
});

describe('countPendingChangesets', () => {
  it('counts every changeset but README.md without pre.json', () => {
    expect(countPendingChangesets(changesetDir())).toBe(3);
  });

  it('leaves out the changesets pre.json lists in pre mode', () => {
    expect(countPendingChangesets(changesetDir(preJson('pre', ids.slice(0, 2))))).toBe(1);
  });

  it('counts 0 in pre mode once pre.json lists every changeset', () => {
    expect(countPendingChangesets(changesetDir(preJson('pre', ids)))).toBe(0);
  });

  it('counts every changeset in exit mode', () => {
    expect(countPendingChangesets(changesetDir(preJson('exit', ids)))).toBe(3);
  });

  it('throws on a pre.json that is not valid JSON', () => {
    const dir = changesetDir('{ "mode": "pre",');
    expect(() => countPendingChangesets(dir)).toThrow();
  });

  it('agrees with the changesets release plan on this repo', async () => {
    const root = path.resolve(__dirname, '..');
    const require = createRequire(import.meta.url);
    const cliRequire = createRequire(require.resolve('@changesets/cli/package.json'));
    const getReleasePlan = cliRequire('@changesets/get-release-plan').default;
    const plan = await getReleasePlan(root);
    expect(countPendingChangesets(path.join(root, '.changeset'))).toBe(plan.changesets.length);
  });
});
