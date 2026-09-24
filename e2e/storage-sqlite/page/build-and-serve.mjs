#!/usr/bin/env node
// Playwright's webServer command for the `storage-sqlite` project. Builds
// the worker the same way a consuming app does, with the package's own bin
// (`tallyui-build-sqlite-worker`, see PR #71), which bundles the worker from
// the package's *built* entry (`dist/web/worker.js`, through the package
// exports) and copies `sqlite3.wasm` next to it. Bundles the test page
// separately with esbuild's JS API, resolved from `@tallyui/storage-sqlite`'s
// own `esbuild` devDependency, then serves the result as a static site.
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { createServer } from 'node:http';
import { readFile, copyFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '../../..');
const storageSqlite = path.join(repoRoot, 'packages/storage-sqlite');
const outDir = path.join(here, 'dist');
const esbuild = createRequire(path.join(storageSqlite, 'package.json'))('esbuild');

function bundle(entry, outfile, alias = {}) {
  esbuild.buildSync({
    entryPoints: [entry],
    bundle: true,
    format: 'esm',
    platform: 'browser',
    target: 'es2022',
    outfile,
    alias,
  });
}

async function build() {
  await mkdir(outDir, { recursive: true });

  const builtWorkerEntry = path.join(storageSqlite, 'dist/web/worker.js');
  if (!existsSync(builtWorkerEntry)) {
    throw new Error(`${builtWorkerEntry} is missing: run pnpm build first`);
  }
  // Run the package's own bin, the same way a consuming app's build step
  // does, with cwd set to the package so it resolves
  // `@tallyui/storage-sqlite/web-worker` through the package's own
  // self-reference (the same way the bin's own test runs it). Writes
  // `tallyui-sqlite-worker.js` and `sqlite3.wasm` into outDir.
  const bin = path.join(storageSqlite, 'scripts/build-web-worker.mjs');
  execFileSync(process.execPath, [bin, outDir], { cwd: storageSqlite, stdio: 'inherit' });

  // The page imports `rxdb` directly, but its own directory (this one) has
  // no ancestor node_modules with rxdb in pnpm's isolated layout, so alias
  // it to the copy `storage-sqlite` already depends on.
  bundle(path.join(here, 'index.ts'), path.join(outDir, 'index.js'), {
    rxdb: path.join(storageSqlite, 'node_modules/rxdb'),
  });

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
