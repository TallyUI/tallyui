// @vitest-environment node
import { readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath, URL } from 'node:url';
import { expect, it } from 'vitest';

const root = fileURLToPath(new URL('../', import.meta.url));

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return entry.name === '__tests__' ? [] : sourceFiles(path);
    return /\.tsx?$/.test(entry.name) ? [path] : [];
  });
}

const sources = sourceFiles(root).map((path) => ({
  file: relative(root, path),
  source: readFileSync(path, 'utf8'),
}));

it('has no undefined surface-alt classes', () => {
  expect(sources.filter(({ source }) => source.includes('surface-alt')).map(({ file }) => file)).toEqual([]);
});

it('uses muted-foreground for text colour', () => {
  expect(sources.filter(({ source }) => /\btext-muted(?!-)/.test(source)).map(({ file }) => file)).toEqual([]);
});

it('gives product cards a border', () => {
  expect(readFileSync(join(root, 'product/product-card.tsx'), 'utf8')).toContain('border-border');
});

it('gives quick-tender buttons an input border', () => {
  expect(readFileSync(join(root, 'checkout/cash-tendered.tsx'), 'utf8')).toContain('border-input');
});
