// `node --test e2e/server-identity.test.mjs`: ownsPort accepts a listener started from the repo and refuses any other,
// or one it cannot identify.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { realpathSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { ownsPort } from './server-identity.mjs';

const repo = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const root = '/work/tallyui';

// A fake lsof: the listener query answers `pids`, the cwd query answers `node` running in `cwd`.
const fakeLsof = (pids, cwd) => (file, args, options) => {
  assert.equal(file, 'lsof');
  assert.equal(options.timeout, 5000);
  if (args.includes('-t')) return pids;
  assert.deepEqual(args, ['-a', '-p', '4242', '-d', 'cwd', '-Fcn']);
  return cwd === undefined ? 'p4242\ncnode\n' : `p4242\ncnode\nfcwd\nn${cwd}\n`;
};

test('a listener running in the repo root or below it is accepted', () => {
  assert.deepEqual(ownsPort(20000, root, fakeLsof('4242\n', root)), { ok: true });
  assert.deepEqual(ownsPort(20000, root, fakeLsof('4242\n4343\n', `${root}/apps/demo`)), { ok: true });
});

test('a listener running elsewhere, even in a sibling with the same prefix, is refused by name', () => {
  for (const cwd of ['/work/other', `${root}-2`]) {
    assert.deepEqual(ownsPort(20000, root, fakeLsof('4242\n', cwd)), {
      ok: false,
      message:
        `e2e: port 20000 is served by node (pid 4242) from ${cwd}, not from this worktree (${root}); ` +
        'stop it or change E2E_WEB_PORT/E2E_SQLITE_PORT',
    });
  }
});

test('an unknown holder is refused: lsof failing, finding no listener, or giving no cwd', () => {
  const failing = () => {
    throw new Error('spawnSync lsof ETIMEDOUT');
  };
  const cases = [
    [failing, 'spawnSync lsof ETIMEDOUT'],
    [fakeLsof('', root), 'no listening process'],
    [fakeLsof('4242\n', undefined), 'no working directory for pid 4242'],
  ];
  for (const [run, reason] of cases) {
    assert.deepEqual(ownsPort(20000, root, run), {
      ok: false,
      message: `e2e: could not tell who serves port 20000 (lsof: ${reason})`,
    });
  }
});

// Starts a real Node listener on a free port with the given cwd and returns it with its port.
async function listenFrom(cwd) {
  // Plain write, not console.log: the test runner forces colour, which would wrap the number in escape codes.
  const listener = "require('node:net').createServer().listen(0, '127.0.0.1', function () { process.stdout.write(String(this.address().port)); });";
  const child = spawn(process.execPath, ['-e', listener], { cwd, stdio: ['ignore', 'pipe', 'inherit'] });
  const port = await new Promise((resolve, reject) => {
    child.once('error', reject);
    child.stdout.once('data', (data) => resolve(Number(String(data).trim())));
  });
  return { child, port };
}

const stop = async ({ child }) => {
  if (child.exitCode !== null) return;
  const exited = new Promise((resolve) => child.once('exit', resolve));
  child.kill();
  await exited;
};

test('a real listener started outside the repo is refused, naming its directory; one started in the repo passes', async () => {
  const outside = realpathSync(os.tmpdir()); // lsof reports the resolved path (/private/var/... on macOS)
  const servers = [];
  try {
    servers.push(await listenFrom(outside));
    servers.push(await listenFrom(repo));
    const refused = ownsPort(servers[0].port, repo);
    assert.equal(refused.ok, false);
    assert.match(refused.message, new RegExp(`is served by node \\(pid ${servers[0].child.pid}\\) from `));
    assert.ok(refused.message.includes(` from ${outside}, not from this worktree (${repo})`), refused.message);
    assert.deepEqual(ownsPort(servers[1].port, repo), { ok: true });
  } finally {
    await Promise.all(servers.map(stop)); // a live listener would keep the run alive after a failure
  }
});
