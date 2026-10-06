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
import { join, relative, resolve, dirname, basename, sep } from 'node:path';
const ROOT = process.cwd();
const GROUPS = ['packages', 'connectors', 'apps'];
const SKIP_DIRS = new Set(['node_modules', 'dist', '.turbo', '.expo', '.next', 'out']);
const CODE_RE = /\.(ts|tsx)$/;
const TEST_RE = /\.test(-d)?\.[jt]sx?$/;
const STATIC_START = /^(import|export|\})\b/;
const FROM_RE = /from\s*['"](@tallyui\/[a-zA-Z0-9_-]+)/;
const DYNAMIC_RE = /import\s*\(\s*['"](@tallyui\/[a-zA-Z0-9_-]+)/;

// Layering (Front desk, 2026-09-25): components may import @tallyui/pos only as `import
// type`/`export type`, or a pure function on this allow-list — never a hook, store, the
// order builder, a namespace/default import, a value re-export, or a dynamic import().
const COMPONENTS_POS_ALLOWLIST = new Set([
  'buildReceiptData', 'searchProducts', 'catalogueEntries', 'findEntryByCode', 'variantPriceLabel', 'needsAttention',
  // register screens (ADR-032 amendment 1, register-screens-a): the pure movement/amount grammar
  // the register screens validate against before a money action, never a hook or the store.
  'parseMinor', 'validAmount', 'movementFieldError', 'normalizeAmount',
  // register screens, job B (register-screens-b): the count/closure maths and one pure data
  // table (denomination faces by currency, not a hook or the store) RegisterCount/ClosureSheet
  // read, never write, from.
  'countVariance', 'overThreshold', 'denominationTotal', 'denominations', 'varianceText', 'minorToDecimal',
  // the approval gate (approved-by): the one "over threshold" definition RegisterCount and
  // useRegisterSession's closeSession share.
  'closeNeedsApproval',
  // the Z report's approved mixed-rounding line (#287): one pure string constant ClosureSheet
  // shares with buildClosureDocument, never a hook or the store.
  'TAX_ROUNDING_MIXED_NOTE',
  // the catalogue (Catalogue 3.5.0 slice a, placement ruling 2026-10-06): the pure product
  // sort ProductTable orders rows with, never a hook or the store.
  'sortProducts', 'productSortValue',
]);
const POS_MSG = 'components may import only types and allow-listed pure functions from pos';
const POS_NAMED_RE = /(?:import|export)\s+(type\s+)?\{([^}]*)\}\s*from\s*['"]@tallyui\/pos['"]/g;
const POS_DEFAULT_RE = /import\s+(type\s+)?(\*\s+as\s+[\w$]+|[A-Za-z_$][\w$]*)\s*(?:,\s*\{([^}]*)\})?\s*from\s*['"]@tallyui\/pos['"]/g;
const POS_STAR_EXPORT_RE = /export\s+(type\s+)?\*(?:\s+as\s+[\w$]+)?\s*from\s*['"]@tallyui\/pos['"]/g;
const POS_DYNAMIC_RE = /import\s*\(\s*['"]@tallyui\/pos['"]/g;
function lineOf(content, index) {
  return content.slice(0, index).split('\n').length;
}
function reportNamed(list, relFile, line) {
  let n = 0;
  for (const raw of list.split(',')) {
    const spec = raw.trim();
    if (!spec || spec.startsWith('type ')) continue;
    const name = spec.split(/\s+as\s+/)[0].trim();
    if (!COMPONENTS_POS_ALLOWLIST.has(name)) {
      console.error(`${relFile}:${line} imports ${name} from @tallyui/pos (${POS_MSG})`);
      n++;
    }
  }
  return n;
}
function layeringViolations(files) {
  let n = 0;
  for (const file of files) {
    const relFile = relative(ROOT, file);
    if (isTestFile(relFile)) continue;
    const content = readFileSync(file, 'utf8');
    POS_NAMED_RE.lastIndex = 0;
    for (let m; (m = POS_NAMED_RE.exec(content));) {
      if (!m[1]) n += reportNamed(m[2], relFile, lineOf(content, m.index));
    }
    POS_DEFAULT_RE.lastIndex = 0;
    for (let m; (m = POS_DEFAULT_RE.exec(content));) {
      if (m[1]) continue;
      const line = lineOf(content, m.index);
      console.error(`${relFile}:${line} imports ${m[2]} from @tallyui/pos (${POS_MSG})`);
      n++;
      if (m[3]) n += reportNamed(m[3], relFile, line);
    }
    POS_STAR_EXPORT_RE.lastIndex = 0;
    for (let m; (m = POS_STAR_EXPORT_RE.exec(content));) {
      if (!m[1]) { console.error(`${relFile}:${lineOf(content, m.index)} imports * from @tallyui/pos (${POS_MSG})`); n++; }
    }
    POS_DYNAMIC_RE.lastIndex = 0;
    for (let m; (m = POS_DYNAMIC_RE.exec(content));) {
      console.error(`${relFile}:${lineOf(content, m.index)} imports @tallyui/pos dynamically (${POS_MSG})`);
      n++;
    }
  }
  return n;
}
// Runtime imports some source must never make (Front desk, 2026-09-27). Only a statement-level
// `import type`/`export type` is allowed; a value, side-effect or dynamic import is not.
// - pos must not load @tallyui/database: its entry registers RxDB plugins as a module-level side
//   effect (create-db.ts, dev mode outside production).
// - core's main entry stays RxDB-free; rxdb and rxjs are optional peers, used only by the
//   `@tallyui/core/rxdb` subpath (packages/core/src/rxdb/).
const FORBIDDEN_RUNTIME_IMPORTS = [
  { pkg: '@tallyui/pos', dir: 'packages/pos/src/', spec: String.raw`@tallyui\/database`, why: 'pos may use only `import type` from @tallyui/database' },
  { pkg: '@tallyui/core', dir: 'packages/core/src/', except: 'packages/core/src/rxdb/', spec: String.raw`(?:rxdb|rxjs)(?:\/[^'"]*)?`, why: "core's main entry stays RxDB-free; use the @tallyui/core/rxdb subpath" },
];
function forbiddenImportViolations(pkgName, files) {
  let n = 0;
  for (const { pkg, dir, except, spec, why } of FORBIDDEN_RUNTIME_IMPORTS) {
    if (pkg !== pkgName) continue;
    const staticRe = new RegExp(String.raw`^[ \t]*(import|export)\s+(type\s+)?(?:[^'";]*?\s+from\s*)?['"](${spec})['"]`, 'gm');
    const dynamicRe = new RegExp(String.raw`import\s*\(\s*['"](${spec})['"]`, 'g');
    for (const file of files) {
      const relFile = relative(ROOT, file).split(sep).join('/');
      if (isTestFile(relFile) || !relFile.startsWith(dir) || (except && relFile.startsWith(except))) continue;
      const content = readFileSync(file, 'utf8');
      const hits = [...content.matchAll(staticRe)].filter((m) => !m[2]).concat([...content.matchAll(dynamicRe)]);
      for (const m of hits) {
        console.error(`${relFile}:${lineOf(content, m.index)} imports ${m.at(-1)} at runtime (${why})`);
        n++;
      }
    }
  }
  return n;
}
// A relative import/export resolving into rxdb/ pulls it in just as surely (the #157 review).
const RELATIVE_SPEC_RE = /^[ \t]*(import|export)\s+(type\s+)?(?:[^'";]*?\s+from\s*)?['"](\.[^'"]*)['"]/gm;
function coreRxdbReexportViolations(pkgName, files) {
  if (pkgName !== '@tallyui/core') return 0;
  const rxdbAbs = join(ROOT, 'packages/core/src/rxdb'); let n = 0;
  for (const file of files) {
    const relFile = relative(ROOT, file).split(sep).join('/');
    if (isTestFile(relFile) || !relFile.startsWith('packages/core/src/') || relFile.startsWith('packages/core/src/rxdb/')) continue;
    const content = readFileSync(file, 'utf8');
    for (const m of content.matchAll(RELATIVE_SPEC_RE)) {
      if (m[2]) continue;
      const r = resolve(dirname(file), m[3]);
      if (r !== rxdbAbs && !r.startsWith(rxdbAbs + sep)) continue;
      console.error(`${relFile}:${lineOf(content, m.index)} pulls in the rxdb subpath at runtime (core's main entry stays RxDB-free; import @tallyui/core/rxdb instead)`); n++;
    }
  }
  return n;
}
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
    if (pkg.name === '@tallyui/components') violations += layeringViolations(files);
    violations += forbiddenImportViolations(pkg.name, files);
    violations += coreRxdbReexportViolations(pkg.name, files);
  }
}
if (violations === 0) {
  console.log(`check:deps: checked ${checked.length} packages, no undeclared @tallyui/* imports (${checked.join(', ')})`);
  process.exit(0);
} else {
  console.error(`check:deps: ${violations} violation(s)`);
  process.exit(1);
}
