#!/usr/bin/env node
// Playwright's webServer command for the `storage-sqlite` project. Bundles
// the test page and the real worker entry (`packages/storage-sqlite/src/web
// /worker.ts`) with esbuild, copies `sqlite3.wasm` next to the bundled
// worker (the sqlite-wasm module fetches it relative to its own URL), then
// serves the result as a static site. `tallyui-build-sqlite-worker` (the
// package's own bin, see PR #71) doesn't exist on `main` yet, so this
// bundles with esbuild directly instead, per the spec. esbuild is never a
// declared dependency here: it already ships in the pnpm store as tsup's
// bundler, and its CLI is reachable at the store's shared bin folder below,
// so no dependency is added to run it.
import { execFileSync } from 'node:child_process';
import { createServer } from 'node:http';
import { readFile, copyFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '../../..');
const storageSqlite = path.join(repoRoot, 'packages/storage-sqlite');
const outDir = path.join(here, 'dist');
const esbuild = path.join(repoRoot, 'node_modules/.pnpm/node_modules/.bin/esbuild');

function bundle(entry, outfile, extraArgs = []) {
  execFileSync(
    esbuild,
    [entry, '--bundle', '--format=esm', '--platform=browser', '--target=es2022', `--outfile=${outfile}`, ...extraArgs],
    { stdio: 'inherit' }
  );
}

async function build() {
  await mkdir(outDir, { recursive: true });

  // The worker's own bare imports (rxdb-premium, @sqlite.org/sqlite-wasm)
  // resolve naturally: node resolution walks up from worker.ts's own
  // directory to `packages/storage-sqlite/node_modules`, which has them.
  bundle(path.join(storageSqlite, 'src/web/worker.ts'), path.join(outDir, 'worker.js'));

  // The page imports `rxdb` directly, but its own directory (this one) has
  // no ancestor node_modules with rxdb in pnpm's isolated layout, so alias
  // it to the copy `storage-sqlite` already depends on.
  bundle(path.join(here, 'index.ts'), path.join(outDir, 'index.js'), [
    `--alias:rxdb=${path.join(storageSqlite, 'node_modules/rxdb')}`,
  ]);

  await copyFile(
    path.join(storageSqlite, 'node_modules/@sqlite.org/sqlite-wasm/dist/sqlite3.wasm'),
    path.join(outDir, 'sqlite3.wasm')
  );
  await copyFile(path.join(here, 'index.html'), path.join(outDir, 'index.html'));
}

const CONTENT_TYPES = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.wasm': 'application/wasm',
};

function serve(port) {
  createServer(async (req, res) => {
    const reqPath = req.url === '/' ? '/index.html' : req.url ?? '/index.html';
    const filePath = path.join(outDir, reqPath);
    if (!filePath.startsWith(outDir)) {
      res.writeHead(403).end();
      return;
    }
    try {
      const body = await readFile(filePath);
      res.writeHead(200, { 'Content-Type': CONTENT_TYPES[path.extname(filePath)] ?? 'application/octet-stream' });
      res.end(body);
    } catch {
      res.writeHead(404).end('not found');
    }
  }).listen(port, () => {
    // Playwright's webServer waits on this URL responding.
    console.log(`storage-sqlite e2e page on http://localhost:${port}`);
  });
}

await build();
serve(Number(process.env.PORT ?? 8090));
