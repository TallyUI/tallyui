// @ts-check
// Whether the server on a port was started from this worktree: lsof names the listening process, whose working
// directory must be the repo root or inside it. Plain .mjs, so `node --test` imports it without a warning.
import { execFileSync } from 'node:child_process';
import path from 'node:path';

// Each lsof call may take this long (ms); a hung lsof then fails the check instead of stalling the run.
const LSOF_TIMEOUT_MS = 5000;

/**
 * @typedef {(file: string, args: string[], options: { encoding: 'utf8', timeout: number, stdio: 'pipe' }) => string} Run
 * @param {number} port
 * @param {string} root this worktree's repo root
 * @param {Run} [run] execFileSync, or a fake in tests
 * @returns {{ ok: true } | { ok: false, message: string }}
 */
export function ownsPort(port, root, run = /** @type {Run} */ (execFileSync)) {
  // stdio 'pipe' keeps lsof's stderr out of the test output; the failure message carries the reason instead.
  const lsof = (/** @type {string[]} */ args) =>
    run('lsof', args, { encoding: 'utf8', timeout: LSOF_TIMEOUT_MS, stdio: 'pipe' }).split('\n');
  let pid, command, cwd;
  try {
    pid = lsof(['-nP', `-iTCP:${port}`, '-sTCP:LISTEN', '-t'])[0].trim();
    if (!pid) throw new Error('no listening process');
    // `c` adds the command name for the message; the `n` line of the cwd descriptor is the directory.
    const fields = lsof(['-a', '-p', pid, '-d', 'cwd', '-Fcn']);
    command = fields.find((line) => line.startsWith('c'))?.slice(1);
    cwd = fields.find((line) => line.startsWith('n'))?.slice(1);
    if (!cwd) throw new Error(`no working directory for pid ${pid}`);
  } catch (error) {
    // Unknown must not pass: lsof failing (it exits 1 when nothing listens) or saying nothing is a refusal.
    const reason = error instanceof Error ? error.message.split('\n')[0] : String(error);
    return { ok: false, message: `e2e: could not tell who serves port ${port} (lsof: ${reason})` };
  }
  const repo = path.resolve(root);
  if (cwd === repo || cwd.startsWith(repo + path.sep)) return { ok: true };
  const holder = `${command ?? 'unknown'} (pid ${pid}) from ${cwd}`;
  const fix = 'stop it or change E2E_WEB_PORT/E2E_SQLITE_PORT';
  return { ok: false, message: `e2e: port ${port} is served by ${holder}, not from this worktree (${repo}); ${fix}` };
}
