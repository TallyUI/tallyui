// @vitest-environment node
import { readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath, URL } from 'node:url';
import { expect, it } from 'vitest';

const root = fileURLToPath(new URL('../', import.meta.url));
const repoRoot = fileURLToPath(new URL('../../../../', import.meta.url));

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return ['__tests__', 'node_modules'].includes(entry.name) ? [] : sourceFiles(path);
    return /\.tsx?$/.test(entry.name) ? [path] : [];
  });
}

const sources = [root, join(repoRoot, 'apps/demo/app'), join(repoRoot, 'apps/demo/lib')].flatMap(sourceFiles).map((path) => ({
  file: relative(repoRoot, path),
  source: readFileSync(path, 'utf8'),
}));

it('has no undefined surface-alt classes', () => {
  expect(sources.filter(({ source }) => source.includes('surface-alt')).map(({ file }) => file)).toEqual([]);
});

it('has no undefined bg-surface classes', () => {
  expect(sources.filter(({ source }) => /\bbg-surface(?!-)\b/.test(source)).map(({ file }) => file)).toEqual([]);
});

it('has no old primary colour literals', () => {
  expect(sources.filter(({ source }) => /6366f1/i.test(source)).map(({ file }) => file)).toEqual([]);
});

it('keeps the demo primary colour equal to the theme token', () => {
  const tokens = readFileSync(join(repoRoot, 'packages/theme/src/tokens.css'), 'utf8');
  const theme = tokens.match(/@theme\s*\{([^}]+)\}/)?.[1];
  const primary = theme?.match(/--color-primary:\s*([^;]+);/)?.[1].trim();
  const demo = readFileSync(join(repoRoot, 'apps/demo/lib/theme-colors.ts'), 'utf8');
  const demoPrimary = demo.match(/export const PRIMARY = ['"]([^'"]+)['"];/)?.[1];
  expect(primary).toBeDefined();
  expect(demoPrimary).toBe(primary);
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

it('has no undefined danger classes', () => {
  expect(sources.filter(({ source }) => /\b(bg|text|border)-danger\b/.test(source)).map(({ file }) => file)).toEqual([]);
});

it.each(['order/order-status-badge.tsx', 'product/product-stock-badge.tsx'])('%s uses foreground text on status tints', (file) => {
  expect(readFileSync(join(root, file), 'utf8')).not.toMatch(/text-(success|info|warning|destructive)\b/);
});

it('has no hard-coded placeholder colour props', () => {
  expect(sources.filter(({ source }) => /placeholderTextColor=["']#/.test(source)).map(({ file }) => file)).toEqual([]);
});

it('has no old demo secondary text colour literals', () => {
  expect(sources.filter(({ source }) => /6b7280/i.test(source)).map(({ file }) => file)).toEqual([]);
});

it('keeps the demo muted foreground colour equal to the theme token', () => {
  const tokens = readFileSync(join(repoRoot, 'packages/theme/src/tokens.css'), 'utf8');
  const theme = tokens.match(/@theme\s*\{([^}]+)\}/)?.[1];
  const mutedForeground = theme?.match(/--color-muted-foreground:\s*([^;]+);/)?.[1].trim();
  const demo = readFileSync(join(repoRoot, 'apps/demo/lib/theme-colors.ts'), 'utf8');
  const demoMutedForeground = demo.match(/export const MUTED_FOREGROUND = ['"]([^'"]+)['"];/)?.[1];
  expect(mutedForeground).toBeDefined();
  expect(demoMutedForeground).toBe(mutedForeground);
});
