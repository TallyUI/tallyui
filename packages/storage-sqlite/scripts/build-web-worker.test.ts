// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { existsSync } from 'node:fs';
import { mkdtemp, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const packageDir = fileURLToPath(new URL('..', import.meta.url));
const scriptPath = path.join(packageDir, 'scripts', 'build-web-worker.mjs');
const require = createRequire(import.meta.url);

function resolvable(specifier: string): boolean {
  try {
    require.resolve(specifier, { paths: [packageDir] });
    return true;
  } catch {
    return false;
  }
}

// The script needs esbuild and rxdb-premium (RXDB Premium needs a licence
// token to install, see docs/CONTRIBUTING.md) resolvable, and the package
// already built, since it bundles the real, built worker entry.
const missing = [
  !resolvable('esbuild') && 'esbuild',
  !resolvable('rxdb-premium') && 'rxdb-premium',
  !existsSync(path.join(packageDir, 'dist/web/worker.js')) && 'the built package (run `pnpm --filter @tallyui/storage-sqlite build`)',
].filter((reason): reason is string => reason !== false);

if (missing.length > 0 && !process.env.CI) {
  console.warn(`Skipping build-web-worker tests: ${missing.join(', ')} not available locally.`);
}

(missing.length === 0 ? describe : describe.skip)('build-web-worker script', () => {
  it('bundles the worker and copies sqlite3.wasm into the output directory', async () => {
    const outDir = await mkdtemp(path.join(tmpdir(), 'tallyui-sqlite-worker-'));
    try {
      // Run with cwd = this package, standing in for a consuming app: it has
      // its own copy of @tallyui/storage-sqlite (self-referenced), esbuild
      // and @sqlite.org/sqlite-wasm resolvable from here the same way.
      execFileSync(process.execPath, [scriptPath, outDir], { cwd: packageDir, stdio: 'pipe' });

      const workerStat = await stat(path.join(outDir, 'tallyui-sqlite-worker.js'));
      const wasmStat = await stat(path.join(outDir, 'sqlite3.wasm'));
      expect(workerStat.size).toBeGreaterThan(0);
      expect(wasmStat.size).toBeGreaterThan(0);
    } finally {
      await rm(outDir, { recursive: true, force: true });
    }
  });
});
