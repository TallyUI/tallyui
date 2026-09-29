// Ports for the e2e web servers. Each worktree gets its own ports, derived from its repo root path, so
// `reuseExistingServer` can never reuse (and test) a server another worktree started.

// CI runs one checkout per machine, so it keeps the fixed ports.
const CI_WEB_PORT = 8081;
const CI_SQLITE_PORT = 8090;
// Derived ports start here, above the common dev-server ports.
const DERIVED_BASE = 20000;
// Number of port pairs; web ports are even in 20000–21998, and sqlite takes the next odd port.
const DERIVED_PAIRS = 1000;
// FNV-1a 32-bit offset basis and prime.
const FNV_OFFSET = 0x811c9dc5;
const FNV_PRIME = 0x01000193;

function fnv1a(text: string): number {
  let hash = FNV_OFFSET;
  for (let i = 0; i < text.length; i++) hash = Math.imul(hash ^ text.charCodeAt(i), FNV_PRIME) >>> 0;
  return hash;
}

type E2EPorts = { web: number; sqlite: number; reuse: boolean };
export function e2ePorts(root: string, env: Record<string, string | undefined>): E2EPorts {
  if (env.CI) return { web: CI_WEB_PORT, sqlite: CI_SQLITE_PORT, reuse: false };
  const derived = DERIVED_BASE + 2 * (fnv1a(root) % DERIVED_PAIRS);
  return {
    web: env.E2E_WEB_PORT ? Number(env.E2E_WEB_PORT) : derived,
    sqlite: env.E2E_SQLITE_PORT ? Number(env.E2E_SQLITE_PORT) : derived + 1,
    reuse: env.E2E_REUSE === '1',
  };
}
// `node e2e/ports.ts [root]` prints the ports for that root (default: the current directory).
// Not `import.meta.main`: Playwright loads this file as CommonJS, where `import.meta` breaks the load.
if (process.argv[1]?.endsWith('ports.ts')) {
  console.log(JSON.stringify(e2ePorts(process.argv[2] ?? process.cwd(), process.env)));
}
