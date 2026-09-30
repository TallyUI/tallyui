// `node --test e2e/server-identity.test.mjs`: ownsPort accepts listeners started from the repo and refuses any other,
// or one it cannot identify.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdirSync, mkdtempSync, realpathSync, symlinkSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { ownsPort } from './server-identity.mjs';

const repo = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const outside = realpathSync(os.tmpdir()); // lsof reports the resolved path (/private/var/... on macOS)
// ownsPort compares real paths, so the fakes use real directories, left for the OS to clean: a root, a directory in
// it, a sibling sharing its prefix, and one elsewhere.
const base = realpathSync(mkdtempSync(path.join(os.tmpdir(), 'tallyui-identity-')));
const root = path.join(base, 'tallyui');
for (const dir of [`${root}/apps/demo`, `${root}-2`, `${base}/other`]) mkdirSync(dir, { recursive: true });

// A fake lsof: the listener query answers the pids of `cwds` ({ pid: cwd }), each cwd query `node` running in its cwd.
const fakeLsof = (cwds) => (file, args, options) => {
  assert.equal(file, 'lsof');
  assert.equal(options.timeout, 5000);
  if (args.includes('-t')) {
    assert.deepEqual(args, ['-nP', '-iTCP:20000', '-sTCP:LISTEN', '-t']); // without LISTEN, clients would count
    return Object.keys(cwds).map((pid) => `${pid}\n`).join('');
  }
  const pid = args[2];
  assert.deepEqual(args, ['-a', '-p', pid, '-d', 'cwd', '-Fcn']);
  return cwds[pid] === undefined ? `p${pid}\ncnode\n` : `p${pid}\ncnode\nfcwd\nn${cwds[pid]}\n`;
};

test('a listener running in the repo root or below it is accepted', () => {
  assert.deepEqual(ownsPort(20000, root, fakeLsof({ 4242: root })), { ok: true });
  assert.deepEqual(ownsPort(20000, root, fakeLsof({ 4242: root, 4343: `${root}/apps/demo` })), { ok: true });
});

test('every listener is checked: each one running elsewhere, or in a directory now gone, is refused by name', () => {
  const cwds = { 4242: root, 4343: `${base}/other`, 4444: `${root}/gone` };
  assert.equal(
    ownsPort(20000, root, fakeLsof(cwds)).message,
    `e2e: port 20000 is served by node (pid 4343) from ${base}/other; node (pid 4444) from ${root}/gone, which no ` +
      `longer exists, not from this worktree (${root}); stop it or change E2E_WEB_PORT/E2E_SQLITE_PORT`,
  );
});

test('a listener running elsewhere, even in a sibling with the same prefix, is refused by name', () => {
  for (const cwd of [`${base}/other`, `${root}-2`]) {
    assert.deepEqual(ownsPort(20000, root, fakeLsof({ 4242: cwd })), {
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
    [fakeLsof({}), 'no listening process'],
    [fakeLsof({ 4242: undefined }), 'no working directory for pid 4242'],
  ];
  for (const [run, reason] of cases) {
    assert.deepEqual(ownsPort(20000, root, run), {
      ok: false,
      message: `e2e: could not tell who serves port 20000 (lsof: ${reason})`,
    });
  }
});

// Plain write, not console.log: the test runner forces colour, which would wrap the output in escape codes.
const LISTENER = "const [host, port] = process.argv.slice(1); require('node:net').createServer().on('error', (e) => process.stdout.write(e.code)).listen(Number(port), host, function () { process.stdout.write(String(this.address().port)); });";
const CLIENT = "require('node:net').connect(Number(process.argv[2]), process.argv[1], () => process.stdout.write('connected'));";

// Starts a real Node child with the given cwd, by default a listener on a free 127.0.0.1 port. Returns it with what it
// said (its port, or its bind error's code) and that as a port (NaN if it was not one).
async function listenFrom(cwd, host = '127.0.0.1', port = 0, script = LISTENER) {
  const child = spawn(process.execPath, ['-e', script, host, String(port)], { cwd, stdio: ['ignore', 'pipe', 'inherit'] });
  const said = await new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('close', (code) => resolve(`exited ${code}`)); // after its output, if any
    child.stdout.once('data', (data) => resolve(String(data).trim()));
  });
  return { child, said, port: Number(said) };
}

// Starts each child in turn (each start gets the ones before it), runs `check` on them, then stops them all, even after
// a failure: a live listener would keep the run alive.
async function withChildren(starts, check) {
  const children = [];
  try {
    for (const start of starts) children.push(await start(children));
    await check(children);
  } finally {
    await Promise.all(children.map(stop));
  }
}

const stop = async ({ child }) => {
  if (child.exitCode !== null) return;
  const exited = new Promise((resolve) => child.once('exit', resolve));
  child.kill();
  await exited;
};

test('a real listener started outside the repo is refused, naming its directory; one started in the repo passes', async () => {
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

test('a stranger on 127.0.0.1 beside our listener on :: at the same port is refused by name', (t) =>
  withChildren([() => listenFrom(repo, '::'), ([ours]) => listenFrom(outside, '127.0.0.1', ours.port)], ([ours, other]) => {
    assert.ok(ours.port > 0, ours.said);
    if (other.said === 'EADDRINUSE') return t.skip('this OS refused the second listener on the port');
    assert.equal(other.port, ours.port, other.said);
    const { message } = ownsPort(ours.port, repo);
    assert.ok(message?.includes(`served by node (pid ${other.child.pid}) from ${outside}, not from `), message);
  }));

test('a client connected to our listener from elsewhere is not counted as a listener', () =>
  withChildren([() => listenFrom(repo), ([ours]) => listenFrom(outside, '127.0.0.1', ours.port, CLIENT)], ([ours, client]) => {
    assert.equal(client.said, 'connected');
    assert.deepEqual(ownsPort(ours.port, repo), { ok: true });
  }));

test('roots are compared by real path: one reached through a symlink, and one under /tmp (lsof: /private/tmp on macOS)', () => {
  const link = path.join(mkdtempSync(path.join(os.tmpdir(), 'tallyui-link-')), 'root');
  symlinkSync(repo, link);
  const underTmp = mkdtempSync('/tmp/tallyui-identity-');
  return withChildren([() => listenFrom(repo), () => listenFrom(underTmp)], ([ours, tmpServer]) => {
    assert.deepEqual(ownsPort(ours.port, link), { ok: true });
    assert.deepEqual(ownsPort(tmpServer.port, underTmp), { ok: true });
  });
});
