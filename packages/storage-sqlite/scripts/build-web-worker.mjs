#!/usr/bin/env node
// Prebuilds the @tallyui/storage-sqlite/web-worker entry for Metro/Expo web
// apps, which can't bundle a module worker at runtime (see the package
// README's "Expo web (Metro)" section). Run this from the CONSUMING APP's
// own build step, e.g. `npx tallyui-build-sqlite-worker public/` — never in
// this repo. The output bundle links rxdb-premium code, so it is built
// under, and bound by, the APP's own RXDB Premium licence, and it must
// NEVER be committed to this repo or published from this package.
//
// Usage: tallyui-build-sqlite-worker <outDir>

import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { mkdir, copyFile } from 'node:fs/promises';
import path from 'node:path';

const outDir = process.argv[2];
if (!outDir) {
  console.error('Usage: tallyui-build-sqlite-worker <outDir>');
  process.exit(1);
}

let esbuild;
try {
  ({ default: esbuild } = await import('esbuild'));
} catch {
  console.error('esbuild is not installed: install esbuild as a dev dependency to use this script.');
  process.exit(1);
}

const appDir = process.cwd();
const resolvedOutDir = path.resolve(appDir, outDir);
await mkdir(resolvedOutDir, { recursive: true });

await esbuild.build({
  // Resolve the entry (and everything it imports: rxdb-premium, sqlite-wasm)
  // starting from the app's own working directory, not this script's
  // location, so the app's installed dependency graph is what gets bundled.
  absWorkingDir: appDir,
  entryPoints: ['@tallyui/storage-sqlite/web-worker'],
  outfile: path.join(resolvedOutDir, 'tallyui-sqlite-worker.js'),
  bundle: true,
  format: 'esm',
  platform: 'browser',
});

// sqlite-wasm's default `locateFile` resolves `sqlite3.wasm` as
// `new URL('sqlite3.wasm', import.meta.url)`, and esbuild leaves that
// `import.meta.url` untouched when bundling, so at runtime it evaluates to
// the worker's own URL. The wasm file must sit next to the built worker for
// that lookup to find it; no `locateFile` override is needed.
const require = createRequire(pathToFileURL(path.join(appDir, 'package.json')));
const wasmSource = require.resolve('@sqlite.org/sqlite-wasm/sqlite3.wasm');
await copyFile(wasmSource, path.join(resolvedOutDir, 'sqlite3.wasm'));

console.log(`Built ${path.join(resolvedOutDir, 'tallyui-sqlite-worker.js')} and copied sqlite3.wasm.`);
