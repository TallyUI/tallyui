#!/usr/bin/env node
import { readFileSync, existsSync } from 'node:fs'; // backstop for check-workspace-deps.mjs (#157 review): check:deps sees source only
import { builtinModules, createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
const ENTRY = 'packages/core/dist/index.js';
const RXDB_RE = /from\s*['"](rxdb|rxjs)(?:\/[^'"]*)?['"]/;
// Every static, side-effect or dynamic import specifier. tsup strips `node:` when it bundles
// (`import { createHash } from "crypto"`), so a bare built-in, or a subpath of one (fs/promises), counts too.
const IMPORT_RE = /(?:from\s*|import\s*(?:\(\s*)?)['"]([^'"]*)['"]/g;
const BUILTINS = new Set(builtinModules);
const isBuiltin = (spec) => spec.startsWith('node:') || BUILTINS.has(spec.split('/')[0]);
const LOCAL_RE = /(?:from\s*|import\s*(?:\(\s*)?)['"](\.[^'"]*)['"]/g;
function badImport(file, check = (content) => content.match(RXDB_RE) || [...content.matchAll(IMPORT_RE)].find((m) => isBuiltin(m[1])), seen = new Set()) {
  if (seen.has(file) || !existsSync(file)) return null; seen.add(file);
  const content = readFileSync(file, 'utf8');
  const hit = check(content);
  if (hit) return `${file} imports ${hit[1]}`;
  for (const m of content.matchAll(LOCAL_RE)) {
    const bad = badImport(resolve(dirname(file), m[1].endsWith('.js') ? m[1] : `${m[1]}.js`), check, seen);
    if (bad) return bad;
  }
  return null;
}
if (!existsSync(ENTRY)) { console.error(`check:core-dist: ${ENTRY} missing; run \`pnpm build\` first`); process.exit(1); }
const bad = badImport(ENTRY);
if (bad) { console.error(`check:core-dist: ${bad} (core's main entry stays RxDB- and Node-built-in-free; import @tallyui/core/rxdb or @tallyui/core/server instead)`); process.exit(1); }
console.log(`check:core-dist: ${ENTRY} is RxDB- and Node-built-in-free`);
const BROWSER_ENTRIES = [
  'packages/database/dist/index.js',
  'packages/primitives/dist/index.js',
  'packages/components/dist/index.js',
  'packages/storage-sqlite/dist/index.js',
  'packages/pos/dist/index.js',
  'packages/theme/dist/index.js',
  'connectors/medusa/dist/index.js',
  'connectors/shopify/dist/index.js',
  'connectors/vendure/dist/index.js',
  'connectors/woocommerce/dist/index.js',
];
for (const entry of BROWSER_ENTRIES) {
  if (!existsSync(entry)) { console.error(`check:core-dist: ${entry} missing; run \`pnpm build\` first`); process.exit(1); }
  const bad = badImport(entry, (content) => [...content.matchAll(IMPORT_RE)].find((m) =>
    isBuiltin(m[1]) || m[1] === '@tallyui/core/server' || m[1].startsWith('@tallyui/core/server/')));
  if (bad) { console.error(`check:core-dist: ${bad} (browser packages import from @tallyui/core, never @tallyui/core/server or a Node built-in)`); process.exit(1); }
}
console.log('check:core-dist: all ten browser entries are free of Node built-ins and @tallyui/core/server');

// The CJS copy of ./server (for the CommonJS backend plugins) must load under require() and expose
// the same runtime exports as the ESM build, so a plugin that switches loses nothing.
const SERVER_ESM = 'packages/core/dist/server/index.js';
const SERVER_CJS = 'packages/core/dist/server/index.cjs';
for (const f of [SERVER_CJS, 'packages/core/dist/server/index.d.cts']) {
  if (!existsSync(f)) { console.error(`check:core-dist: ${f} missing; run \`pnpm build\` first`); process.exit(1); }
}
const cjsKeys = Object.keys(createRequire(import.meta.url)(resolve(SERVER_CJS))).sort();
const esmKeys = Object.keys(await import(resolve(SERVER_ESM))).sort();
if (cjsKeys.join() !== esmKeys.join()) {
  console.error(`check:core-dist: ${SERVER_CJS} exports differ from ${SERVER_ESM}: cjs [${cjsKeys}] vs esm [${esmKeys}]`);
  process.exit(1);
}
console.log(`check:core-dist: ${SERVER_CJS} loads under require() with the same ${cjsKeys.length} exports as the ESM build`);
