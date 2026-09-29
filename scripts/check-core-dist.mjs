#!/usr/bin/env node
import { readFileSync, existsSync } from 'node:fs'; // backstop for check-workspace-deps.mjs (#157 review): check:deps sees source only
import { builtinModules } from 'node:module';
import { dirname, resolve } from 'node:path';
const ENTRY = 'packages/core/dist/index.js';
const RXDB_RE = /from\s*['"](rxdb|rxjs)(?:\/[^'"]*)?['"]/;
// Every static, side-effect or dynamic import specifier. tsup strips `node:` when it bundles
// (`import { createHash } from "crypto"`), so a bare built-in, or a subpath of one (fs/promises), counts too.
const IMPORT_RE = /(?:from\s*|import\s*(?:\(\s*)?)['"]([^'"]*)['"]/g;
const BUILTINS = new Set(builtinModules);
const isBuiltin = (spec) => spec.startsWith('node:') || BUILTINS.has(spec.split('/')[0]);
const LOCAL_RE = /(?:from\s*|import\s*(?:\(\s*)?)['"](\.[^'"]*)['"]/g;
function badImport(file, seen = new Set()) {
  if (seen.has(file) || !existsSync(file)) return null; seen.add(file);
  const content = readFileSync(file, 'utf8');
  const hit = content.match(RXDB_RE) || [...content.matchAll(IMPORT_RE)].find((m) => isBuiltin(m[1]));
  if (hit) return `${file} imports ${hit[1]}`;
  for (const m of content.matchAll(LOCAL_RE)) {
    const bad = badImport(resolve(dirname(file), m[1].endsWith('.js') ? m[1] : `${m[1]}.js`), seen);
    if (bad) return bad;
  }
  return null;
}
if (!existsSync(ENTRY)) { console.error(`check:core-dist: ${ENTRY} missing; run \`pnpm build\` first`); process.exit(1); }
const bad = badImport(ENTRY);
if (bad) { console.error(`check:core-dist: ${bad} (core's main entry stays RxDB- and Node-built-in-free; import @tallyui/core/rxdb or @tallyui/core/server instead)`); process.exit(1); }
console.log(`check:core-dist: ${ENTRY} is RxDB- and Node-built-in-free`);
