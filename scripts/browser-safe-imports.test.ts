import { readdirSync, readFileSync } from 'node:fs';
import { builtinModules } from 'node:module';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = path.resolve(__dirname, '..');
const SOURCES = [
  'packages/database', 'packages/primitives', 'packages/components',
  'packages/storage-sqlite', 'packages/pos', 'packages/theme',
  'connectors/medusa', 'connectors/shopify', 'connectors/vendure', 'connectors/woocommerce',
];
const BUILTINS = new Set(builtinModules);
const IMPORT_RE = /\b(?:import|export)\s*(?!\s*type\b)(?:[^;'"`]*?\bfrom\s*)?['"]([^'"]+)['"]|\bimport\s*\(\s*['"]([^'"]+)['"]/g;

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      return ['__tests__', '__fixtures__', '__mocks__'].includes(entry.name) ? [] : sourceFiles(file);
    }
    return /\.tsx?$/.test(entry.name) && !/\.(?:test\.tsx?|test-d\.ts|spec\.ts|test-helper\.ts)$/.test(entry.name) ? [file] : [];
  });
}

describe('browser packages stay off @tallyui/core/server and Node built-ins', () => {
  const files = SOURCES.flatMap((dir) => sourceFiles(path.resolve(ROOT, dir, 'src')));

  it('has no forbidden runtime imports', () => {
    const offending: string[] = [];
    for (const file of files) {
      for (const match of readFileSync(file, 'utf8').matchAll(IMPORT_RE)) {
        const specifier = match[1] ?? match[2];
        if (specifier.startsWith('node:') || BUILTINS.has(specifier.split('/')[0]) ||
            specifier === '@tallyui/core/server' || specifier.startsWith('@tallyui/core/server/')) {
          offending.push(`${path.relative(ROOT, file)}: ${specifier}`);
        }
      }
    }
    expect(offending, offending.join('\n')).toEqual([]);
  });

  it('walks at least 50 source files', () => {
    expect(files.length).toBeGreaterThanOrEqual(50);
  });
});
