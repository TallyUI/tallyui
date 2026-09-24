#!/usr/bin/env node
// Prebuilds the sqlite worker for Metro/Expo web apps, which can't bundle a
// module worker at runtime (see the package README's "Expo web (Metro)"
// section). Run this from the CONSUMING APP's own build step, e.g.
// `npx tallyui-build-sqlite-worker public/` — never in this repo. The entry
// point is this bin's own package source (src/web/worker.ts), not the
// installed '@tallyui/storage-sqlite/web-worker' export, which resolves to
// dist/web/worker.js and so wouldn't exist for a consumer that installs
// TallyUI from a raw checkout with no build step. The output bundle links
// rxdb-premium code, so it is built under, and bound by, the APP's own RXDB
// Premium licence, and it must NEVER be committed to this repo or published
// from this package.
//
// Usage: tallyui-build-sqlite-worker <outDir>

import { createRequire } from 'node:module';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { mkdir, copyFile, writeFile } from 'node:fs/promises';
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

const packageDir = fileURLToPath(new URL('..', import.meta.url));
const entryPath = fileURLToPath(new URL('../src/web/worker.ts', import.meta.url));
const entryRelative = path.relative(packageDir, entryPath);
const metafilePath = process.env.TALLYUI_WORKER_METAFILE;

const result = await esbuild.build({
  // The entry is this bin's own package source file (src/web/worker.ts),
  // resolved from the script's own location, not through the package's
  // `exports`: same relative path in a raw checkout and a published
  // install, and neither needs a `dist` build.
  //
  // Everything the entry imports (rxdb-premium, sqlite-wasm) resolves from
  // the entry file's own location, as it did when the entry came through the
  // package export: the installed package's dependencies, which are the
  // app's own peer installs. absWorkingDir keeps output and metafile paths
  // relative to the app.
  absWorkingDir: appDir,
  entryPoints: [entryPath],
  outfile: path.join(resolvedOutDir, 'tallyui-sqlite-worker.js'),
  bundle: true,
  format: 'esm',
  platform: 'browser',
  metafile: Boolean(metafilePath),
});

if (metafilePath) {
  await writeFile(metafilePath, JSON.stringify(result.metafile));
}

// sqlite-wasm's default `locateFile` resolves `sqlite3.wasm` as
// `new URL('sqlite3.wasm', import.meta.url)`, and esbuild leaves that
// `import.meta.url` untouched when bundling, so at runtime it evaluates to
// the worker's own URL. The wasm file must sit next to the built worker for
// that lookup to find it; no `locateFile` override is needed.
const require = createRequire(pathToFileURL(path.join(appDir, 'package.json')));
const wasmSource = require.resolve('@sqlite.org/sqlite-wasm/sqlite3.wasm');
await copyFile(wasmSource, path.join(resolvedOutDir, 'sqlite3.wasm'));

console.log(`Built ${path.join(resolvedOutDir, 'tallyui-sqlite-worker.js')} from ${entryRelative} and copied sqlite3.wasm.`);
