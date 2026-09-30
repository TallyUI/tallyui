// Ports for the e2e web servers. Each worktree gets its own ports, derived from its repo root path, so
// `reuseExistingServer` can never reuse (and test) a server another worktree started.
import path from 'node:path';

// CI runs one checkout per machine, so it keeps the fixed ports.
const CI_WEB_PORT = 8081;
const CI_SQLITE_PORT = 8090;
const CI_SQLITE_UPGRADE_PORT = 8092;
// Derived ports start here, above the common dev-server ports.
const DERIVED_BASE = 20000;
// Number of port pairs; web ports are even in 20000–29998, and sqlite takes the next odd port.
// 5000 pairs keeps collisions rare across this machine's ~50 worktrees (1000 gave ~65% odds of one).
const DERIVED_PAIRS = 5000;
// The storage-sqlite upgrade proof's server (#242) sits this far above the web port: even, in 30000–39998.
const UPGRADE_OFFSET = 10000;
// FNV-1a 32-bit offset basis and prime.
const FNV_OFFSET = 0x811c9dc5;
const FNV_PRIME = 0x01000193;

function fnv1a(text: string): number {
  let hash = FNV_OFFSET;
  for (let i = 0; i < text.length; i++) hash = Math.imul(hash ^ text.charCodeAt(i), FNV_PRIME) >>> 0;
  return hash;
}

// An override port must be an integer in 1–65535; a typo throws rather than starting on a wrong port.
function portFromEnv(env: Record<string, string | undefined>, name: string, fallback: number): number {
  const value = env[name];
  const port = value ? Number(value) : fallback;
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`${name} must be an integer port in 1-65535, got "${value}"`);
  }
  return port;
}
// The one CI check for the e2e setup: unset, '', '0' and 'false' mean "not CI".
export function isCI(env: Record<string, string | undefined>): boolean {
  return !!env.CI && env.CI !== '0' && env.CI !== 'false';
}
type E2EPorts = { web: number; sqlite: number; sqliteUpgrade: number; reuse: boolean };
export function e2ePorts(root: string, env: Record<string, string | undefined>): E2EPorts {
  if (isCI(env)) return { web: CI_WEB_PORT, sqlite: CI_SQLITE_PORT, sqliteUpgrade: CI_SQLITE_UPGRADE_PORT, reuse: false };
  const derived = DERIVED_BASE + 2 * (fnv1a(root) % DERIVED_PAIRS);
  return {
    web: portFromEnv(env, 'E2E_WEB_PORT', derived),
    sqlite: portFromEnv(env, 'E2E_SQLITE_PORT', derived + 1),
    sqliteUpgrade: portFromEnv(env, 'E2E_SQLITE_UPGRADE_PORT', derived + UPGRADE_OFFSET),
    reuse: env.E2E_REUSE === '1',
  };
}
// `node e2e/ports.ts [root]` prints the ports for that root (default: this repo's root, from the script's path).
// Not `import.meta.main`: Playwright loads this file as CommonJS, where `import.meta` breaks the load.
if (process.argv[1]?.endsWith('ports.ts')) {
  const root = process.argv[2] ?? path.resolve(path.dirname(process.argv[1]), '..');
  console.log(JSON.stringify(e2ePorts(root, process.env)));
}
