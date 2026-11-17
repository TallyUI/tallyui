import path from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import ts from 'typescript';

// These are exported for compatibility only and are removed at the next major.
const INTERNAL_EXPORTS = [
  'COLLECT_POLL_MS',
  'DISPLAY_SIGNAL_POLL_MS',
  'OPEN_SIGNAL_POLL_MS',
  'SNAPSHOT_POLL_MS',
  'SNAPSHOT_MIN_INTERVAL_MS',
  'SNAPSHOT_RESEND_MS',
  'SNAPSHOT_LIFETIME_MS',
  'SIGNAL_POLL_MS',
  'LIST_POLL_MS',
  'CONNECT_TIMEOUT_MS',
  'PENDING_POLL_MS',
  'HELLO_RETRY_MS',
  'createWedgeState',
  'foldWedgeKey',
  'stripBoundary',
  'replayWedgeDetector',
] as const;

describe('@tallyui/pos internal public exports', () => {
  let checker: ts.TypeChecker;
  let exports: ts.Symbol[];

  beforeAll(() => {
    const repoRoot = process.cwd();
    const entryPath = path.join(repoRoot, 'packages/pos/src/index.ts');
    const configFile = ts.readConfigFile(path.join(repoRoot, 'tsconfig.json'), ts.sys.readFile);
    const parsed = ts.parseJsonConfigFileContent(configFile.config, ts.sys, repoRoot);
    const program = ts.createProgram({
      rootNames: [entryPath],
      options: { ...parsed.options, noEmit: true },
    });
    checker = program.getTypeChecker();
    const sourceFile = program.getSourceFile(entryPath)!;
    const moduleSymbol = checker.getSymbolAtLocation(sourceFile)!;
    exports = checker.getExportsOfModule(moduleSymbol);
  }, 60_000);

  it('keeps every internal export in the public entry until the next major', () => {
    const names = exports.map((symbol) => symbol.name);
    for (const name of INTERNAL_EXPORTS) {
      expect(names, `Missing public export: ${name}`).toContain(name);
    }
  }, 60_000);

  it('marks every internal export deprecated at its declaration', () => {
    for (const name of INTERNAL_EXPORTS) {
      const exported = exports.find((symbol) => symbol.name === name)!;
      expect(exported, `Missing public export: ${name}`).toBeDefined();
      const symbol = exported.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(exported) : exported;
      const deprecated = symbol.declarations?.some((decl) =>
        ts.getJSDocDeprecatedTag(decl)
        || (ts.isVariableDeclaration(decl) && ts.getJSDocDeprecatedTag(decl.parent?.parent)));
      expect(deprecated, `Missing @deprecated tag on export: ${name}`).toBe(true);
    }
  }, 60_000);
});
