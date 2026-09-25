#!/usr/bin/env node
// Fails when a package imports a `@tallyui/*` workspace package it hasn't
// declared: undeclared imports resolve only via the monorepo's vitest
// aliases / TS paths, so a filtered `pnpm --filter` install would fail.
//
// Narrow false-positive handling: a static import/export only counts when
// the trimmed line starts with `import`, `export` or `}` (a multi-line
// import's closing brace). That excludes a JSDoc usage example
// (`* import … from '@tallyui/x';`) and an error string quoting one.
import { readFileSync, readdirSync } from 'node:fs';
import { join, relative, basename, sep } from 'node:path';
const ROOT = process.cwd();
const GROUPS = ['packages', 'connectors', 'apps'];
const SKIP_DIRS = new Set(['node_modules', 'dist', '.turbo', '.expo', '.next', 'out']);
const CODE_RE = /\.(ts|tsx)$/;
const TEST_RE = /\.test(-d)?\.[jt]sx?$/;
const STATIC_START = /^(import|export|\})\b/;
const FROM_RE = /from\s*['"](@tallyui\/[a-zA-Z0-9_-]+)/;
const DYNAMIC_RE = /import\s*\(\s*['"](@tallyui\/[a-zA-Z0-9_-]+)/;
function walk(dir, out) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIRS.has(entry.name)) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (CODE_RE.test(entry.name)) out.push(full);
  }
}
function isTestFile(relFile) {
  if (TEST_RE.test(basename(relFile))) return true;
  const parts = relFile.split(sep);
  return parts.includes('__tests__') || parts.includes('e2e');
}
function importsIn(file) {
  const found = [];
  readFileSync(file, 'utf8').split('\n').forEach((raw, i) => {
    const line = raw.trim();
    const m = STATIC_START.test(line) ? FROM_RE.exec(line) : DYNAMIC_RE.exec(line);
    if (m) found.push({ dep: m[1], line: i + 1 });
  });
  return found;
}
let violations = 0;
const checked = [];
for (const group of GROUPS) {
  const groupDir = join(ROOT, group);
  let entries;
  try { entries = readdirSync(groupDir, { withFileTypes: true }); } catch { continue; }
  for (const entry of entries) {
    const pkgDir = join(groupDir, entry.name);
    let pkg;
    try { pkg = JSON.parse(readFileSync(join(pkgDir, 'package.json'), 'utf8')); } catch { continue; }
    checked.push(pkg.name);
    const declaredRuntime = new Set([...Object.keys(pkg.dependencies || {}), ...Object.keys(pkg.peerDependencies || {})]);
    const declaredAny = new Set([...declaredRuntime, ...Object.keys(pkg.devDependencies || {})]);
    const files = [];
    walk(pkgDir, files);
    for (const file of files) {
      const relFile = relative(ROOT, file);
      const test = isTestFile(relFile);
      for (const { dep, line } of importsIn(file)) {
        if (dep === pkg.name) continue;
        const declared = test ? declaredAny.has(dep) : declaredRuntime.has(dep);
        if (!declared) {
          const section = test ? 'devDependencies' : 'dependencies';
          console.error(`${pkg.name}: ${relFile}:${line} imports ${dep} (declare it in ${section})`);
          violations++;
        }
      }
    }
  }
}
if (violations === 0) {
  console.log(`check:deps: checked ${checked.length} packages, no undeclared @tallyui/* imports (${checked.join(', ')})`);
  process.exit(0);
} else {
  console.error(`check:deps: ${violations} violation(s)`);
  process.exit(1);
}
