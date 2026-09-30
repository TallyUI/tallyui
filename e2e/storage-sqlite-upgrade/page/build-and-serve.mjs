#!/usr/bin/env node
// Playwright's webServer command for the `storage-sqlite-upgrade` project (#242). Builds three pages
// and serves them from ONE server, so they share one origin and therefore one OPFS:
//   /v16/    the 2.0.0 tree's storage worker and main thread (RxDB and Premium 16.21.1),
//   /v17/    this tree's storage worker and main thread (RxDB and Premium 17.5.0),
//   /mixed/  this tree's main thread with the 2.0.0 worker, as a browser with a cached stale worker.
// Each worker is built with its own tree's `tallyui-build-sqlite-worker` bin, as a consuming app
// builds it (see ../../storage-sqlite/page/build-and-serve.mjs). E2E_V16_TREE is the absolute path
// of a checkout of the git tag `@tallyui/storage-sqlite@2.0.0` with its licensed install done and
// `@tallyui/storage-sqlite` built (see ../upgrade.spec.ts for the setup commands).
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { createServer } from 'node:http';
import { readFile, copyFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const v17Tree = path.resolve(here, '../../..');
const v16Tree = process.env.E2E_V16_TREE;
if (!v16Tree || !path.isAbsolute(v16Tree)) {
  throw new Error('E2E_V16_TREE must be the absolute path of a @tallyui/storage-sqlite@2.0.0 checkout');
}
const outDir = path.join(here, 'dist');
const esbuild = createRequire(path.join(v17Tree, 'packages/storage-sqlite/package.json'))('esbuild');

/** Runs `tree`'s own worker bin into `out`, from its storage-sqlite package (as the existing harness does). */
function buildWorker(tree, out) {
  const storageSqlite = path.join(tree, 'packages/storage-sqlite');
  const builtWorkerEntry = path.join(storageSqlite, 'dist/web/worker.js');
  if (!existsSync(builtWorkerEntry)) {
    throw new Error(`${builtWorkerEntry} is missing: build @tallyui/storage-sqlite in ${tree} first`);
  }
  execFileSync(process.execPath, [path.join(storageSqlite, 'scripts/build-web-worker.mjs'), out], { cwd: storageSqlite, stdio: 'inherit' });
}

/**
 * Bundles a main thread. `rxdb` is aliased to the tree's storage-sqlite copy (the page directory has no
 * node_modules of its own), and `@tallyui/core` to the tree's source, since its `import` export is the
 * unbuilt `dist`. The v16 page reaches the 2.0.0 sources through the `tallyui-v16` alias.
 */
function bundleMain(tree, entry, outfile, extraAlias = {}) {
  esbuild.buildSync({
    entryPoints: [entry],
    bundle: true,
    format: 'esm',
    platform: 'browser',
    target: 'es2022',
    outfile,
    alias: {
      rxdb: path.join(tree, 'packages/storage-sqlite/node_modules/rxdb'),
      '@tallyui/core': path.join(tree, 'packages/core/src'),
      ...extraAlias,
    },
  });
}

async function page(dir, html) {
  await mkdir(path.join(outDir, dir), { recursive: true });
  await copyFile(path.join(here, html), path.join(outDir, dir, 'index.html'));
}

async function build() {
  await mkdir(outDir, { recursive: true });
  buildWorker(v16Tree, path.join(outDir, 'v16'));
  buildWorker(v17Tree, path.join(outDir, 'v17'));
  bundleMain(v16Tree, path.join(here, 'v16.js'), path.join(outDir, 'v16/index.js'), { 'tallyui-v16': path.join(v16Tree, 'packages') });
  bundleMain(v17Tree, path.join(here, 'v17.ts'), path.join(outDir, 'v17/index.js'));
  await page('v16', 'v16.html');
  await page('v17', 'v17.html');
  await page('mixed', 'mixed.html');
}

const CONTENT_TYPES = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.wasm': 'application/wasm',
};

function serve(port) {
  createServer(async (req, res) => {
    const pathname = new URL(req.url ?? '/', 'http://localhost').pathname;
    const reqPath = pathname.endsWith('/') ? `${pathname}index.html` : pathname;
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
    console.log(`storage-sqlite upgrade e2e pages on http://localhost:${port}/v16/, /v17/ and /mixed/`);
  });
}

await build();
serve(Number(process.env.PORT ?? 8092));
