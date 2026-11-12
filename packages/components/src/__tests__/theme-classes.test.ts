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

const docsRoot = join(repoRoot, 'apps/web/content/docs');
// changelog.mdx is generated from the package CHANGELOGs and quotes removed tokens as history.
const docs = readdirSync(docsRoot, { recursive: true, encoding: 'utf8' }).filter((file) => file.endsWith('.mdx') && file !== 'changelog.mdx').map((file) => ({
  file: relative(repoRoot, join(docsRoot, file)),
  source: readFileSync(join(docsRoot, file), 'utf8'),
}));

it.each([
  /\b(bg|text|border)-danger\b/,
  /\btext-muted(?!-)/,
  /\bbg-surface\b|surface-alt|--color-surface/,
  /6366f1|6b7280/i,
])('has no stale theme tokens in docs matching %s', (pattern) => {
  expect(docs.filter(({ source }) => pattern.test(source)).map(({ file }) => file)).toEqual([]);
});

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

it('bordered controls fill with the card', () => {
  const classes = [
    readFileSync(join(root, 'ui/button/index.tsx'), 'utf8').match(/outline: '([^']*)'/)?.[1],
    readFileSync(join(root, 'ui/icon-button/index.tsx'), 'utf8').match(/outline: '([^']*)'/)?.[1],
    readFileSync(join(root, 'ui/select/index.tsx'), 'utf8').match(/<SelectPrimitive\.Trigger[\s\S]*?cn\(\s*'([^']*)'/)?.[1],
    readFileSync(join(root, 'ui/input/index.tsx'), 'utf8').match(/<View[\s\S]*?cn\(\s*'([^']*)'/)?.[1],
    readFileSync(join(root, 'ui/textarea/index.tsx'), 'utf8').match(/<TextInput[\s\S]*?cn\(\s*'([^']*)'/)?.[1],
    readFileSync(join(root, 'ui/combobox/index.tsx'), 'utf8').match(/<ComboboxPrimitive\.Trigger[\s\S]*?cn\(\s*'([^']*)'/)?.[1],
  ];
  for (const value of classes) {
    expect(value).toMatch(/\bbg-card\b/);
    expect(value).toMatch(/\bborder-input\b/);
    expect(value).not.toMatch(/\bbg-background\b/);
  }
});

it('paints modal backdrops with the scrim token', () => {
  const classes = [
    readFileSync(join(root, 'ui/dialog/index.tsx'), 'utf8').match(/<DialogPrimitive\.Overlay[\s\S]*?cn\(\s*'([^']*)'/)?.[1],
    readFileSync(join(root, 'ui/alert-dialog/index.tsx'), 'utf8').match(/<AlertDialogPrimitive\.Overlay[\s\S]*?cn\(\s*'([^']*)'/)?.[1],
    readFileSync(join(root, 'shell/nav-drawer.tsx'), 'utf8').match(/<Pressable\b[^>]*-backdrop[^>]*className="([^"]*)"/)?.[1],
  ];
  for (const value of classes) {
    expect(value).toMatch(/\bbg-scrim\b/);
    expect(value).not.toMatch(/bg-black/);
  }
  expect(sources.filter(({ file }) => file.startsWith('packages/components/src/ui/'))
    .filter(({ source }) => /bg-black\/\d+/.test(source)).map(({ file }) => file)).toEqual([]);
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
