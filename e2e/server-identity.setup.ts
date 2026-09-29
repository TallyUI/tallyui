// Setup project `server-identity`: runs after the web servers are up and before any test, and fails unless each server
// this run uses was started from this worktree. Two worktrees deriving the same port within seconds can both pass
// e2e/port-free.mjs; the second Expo then skips its own server, and both runs would test one server.
import path from 'node:path';
import { test } from '@playwright/test';
import { e2ePorts, isCI } from './ports';
import { ownsPort } from './server-identity.mjs';

const root = path.resolve(__dirname, '..');

test('each web server was started from this worktree', () => {
  const ports = e2ePorts(root, process.env);
  // CI has one checkout per machine; with E2E_REUSE=1 the user chose to test a running server, maybe another worktree's.
  const skipped = isCI(process.env) ? 'CI runs one checkout per machine' : ports.reuse ? 'E2E_REUSE=1' : '';
  if (skipped) {
    test.info().annotations.push({ type: 'server-identity', description: `not checked: ${skipped}` });
    return;
  }
  const refusals = [ports.web, ports.sqlite].flatMap((port) => {
    const owned = ownsPort(port, root);
    return owned.ok ? [] : [owned.message];
  });
  if (refusals.length > 0) throw new Error(refusals.join('\n'));
});
