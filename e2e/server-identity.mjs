// @ts-check
// Whether the server on a port was started from this worktree: lsof names each listening process, whose working
// directory must be the repo root or inside it. Plain .mjs, so `node --test` imports it without a warning.
import { execFileSync } from 'node:child_process';
import { existsSync, realpathSync } from 'node:fs';
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
  const holders = [];
  try {
    // Every listener: on macOS a second process can listen on another address of the same port.
    const listed = lsof(['-nP', `-iTCP:${port}`, '-sTCP:LISTEN', '-t']).map((pid) => pid.trim());
    const pids = new Set(listed.filter(Boolean));
    if (pids.size === 0) throw new Error('no listening process');
    for (const pid of pids) {
      // `c` adds the command name for the message; the `n` line of the cwd descriptor is the directory.
      const fields = lsof(['-a', '-p', pid, '-d', 'cwd', '-Fcn']);
      const command = fields.find((line) => line.startsWith('c'))?.slice(1);
      const cwd = fields.find((line) => line.startsWith('n'))?.slice(1);
      if (!cwd) throw new Error(`no working directory for pid ${pid}`);
      // Its real path, or '' (never ours) when it no longer exists.
      const real = existsSync(cwd) ? realpathSync(cwd) : '';
      holders.push({ real, holder: `${command ?? 'unknown'} (pid ${pid}) from ${cwd}` });
    }
  } catch (error) {
    // Unknown must not pass: lsof failing (it exits 1 when nothing listens) or saying nothing is a refusal.
    const reason = error instanceof Error ? error.message.split('\n')[0] : String(error);
    return { ok: false, message: `e2e: could not tell who serves port ${port} (lsof: ${reason})` };
  }
  // Real paths on both sides: lsof reports the physical cwd (/private/tmp, not /tmp), and root may be a symlink.
  const repo = realpathSync(root);
  const foreign = holders.filter(({ real }) => real !== repo && !real.startsWith(repo + path.sep));
  if (foreign.length === 0) return { ok: true };
  const holder = foreign.map(({ real, holder }) => (real ? holder : `${holder}, which no longer exists`)).join('; ');
  const fix = 'stop it or change E2E_WEB_PORT/E2E_SQLITE_PORT';
  return { ok: false, message: `e2e: port ${port} is served by ${holder}, not from this worktree (${repo}); ${fix}` };
}
