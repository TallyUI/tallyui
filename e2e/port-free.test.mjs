// `node --test e2e/port-free.test.mjs`: the preflight refuses a held port and passes a free one.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import net from 'node:net';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

const script = fileURLToPath(new URL('./port-free.mjs', import.meta.url));
const preflight = (port) => spawnSync(process.execPath, [script, String(port)], { encoding: 'utf8' });

// Holds a free port on `host` (undefined: Node's default, both families), runs the preflight, then releases it.
async function checkHeld(host, busyAddress) {
  const server = net.createServer();
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen({ port: 0, host }, resolve);
  });
  const { port } = server.address();
  let held;
  try {
    held = preflight(port);
  } finally {
    await new Promise((resolve) => server.close(resolve)); // an open server would keep the run alive after a failure
  }
  assert.equal(held.status, 1);
  assert.match(held.stderr, new RegExp(`port ${port} is already in use \\(.+\\) by .+; stop it, or set E2E_REUSE=1`));
  assert.ok(held.stderr.includes(busyAddress(port)), held.stderr);
  assert.equal(preflight(port).status, 0);
}

// Whether this machine has an IPv6 loopback to hold.
const hasIpv6Loopback = await new Promise((resolve) => {
  const server = net.createServer();
  server.once('error', () => resolve(false));
  server.listen({ port: 0, host: '::1' }, () => server.close(() => resolve(true)));
});

test('a port held on 127.0.0.1 only is refused, and passes once released', () =>
  checkHeld('127.0.0.1', (port) => `127.0.0.1:${port}`));

test('a port held on 0.0.0.0 only is refused, and passes once released', () =>
  checkHeld('0.0.0.0', (port) => `0.0.0.0:${port}`));

test('a port held on ::1 only is refused, and passes once released', { skip: !hasIpv6Loopback }, () =>
  checkHeld('::1', (port) => `[::1]:${port}`));

test("a port held by Node's default listen is refused, and passes once released", () =>
  checkHeld(undefined, (port) => `[::]:${port}`));
