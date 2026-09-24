// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdtemp, rm, stat, readFile } from 'node:fs/promises';
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
// token to install, see docs/CONTRIBUTING.md) resolvable. It bundles from
// this checkout's own src/web/worker.ts, so no `dist` build is needed.
const missing = [
  !resolvable('esbuild') && 'esbuild',
  !resolvable('rxdb-premium') && 'rxdb-premium',
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

  it("builds from this checkout's src/web/worker.ts, with no dist file as an input", async () => {
    const outDir = await mkdtemp(path.join(tmpdir(), 'tallyui-sqlite-worker-'));
    const metafilePath = path.join(outDir, 'metafile.json');
    try {
      const output = execFileSync(process.execPath, [scriptPath, outDir], {
        cwd: packageDir,
        stdio: 'pipe',
        env: { ...process.env, TALLYUI_WORKER_METAFILE: metafilePath },
      }).toString();

      const workerStat = await stat(path.join(outDir, 'tallyui-sqlite-worker.js'));
      const wasmStat = await stat(path.join(outDir, 'sqlite3.wasm'));
      expect(workerStat.size).toBeGreaterThan(0);
      expect(wasmStat.size).toBeGreaterThan(0);
      expect(output).toContain('src/web/worker.ts');

      // Metafile input keys are relative to `cwd` (packageDir here, via
      // absWorkingDir). Only this package's OWN dist is the bug under test:
      // third-party deps (rxdb, sqlite-wasm) legitimately ship a dist/ and
      // are expected among the inputs.
      const metafile = JSON.parse(await readFile(metafilePath, 'utf8'));
      const inputPaths = Object.keys(metafile.inputs);
      expect(inputPaths.length).toBeGreaterThan(0);
      expect(inputPaths.some((input) => input === 'dist' || input.startsWith('dist/'))).toBe(false);
    } finally {
      await rm(outDir, { recursive: true, force: true });
    }
  });
});
