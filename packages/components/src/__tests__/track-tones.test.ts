// @vitest-environment node
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath, URL } from 'node:url';
import { expect, it } from 'vitest';

const root = fileURLToPath(new URL('../', import.meta.url));

it("the switch tracks are v2's", () => {
  const source = readFileSync(join(root, 'ui/switch/index.tsx'), 'utf8');
  const tracks = source.match(/props\.checked \? '([^']*)' : '([^']*)'/);
  expect(tracks?.[1]).toBe('bg-primary');
  expect(tracks?.[2]).toBe('bg-border');
  expect(source).not.toContain('bg-input');
});

it('the slider track is muted', () => {
  const source = readFileSync(join(root, 'ui/slider/index.tsx'), 'utf8');
  const classes = source.match(/<SliderPrimitive\.Track className="([^"]*)"/)?.[1];
  expect(classes).toMatch(/\bbg-muted\b/);
  expect(classes).not.toMatch(/\bbg-secondary\b/);
});

it('the slider thumb fills with the card', () => {
  const source = readFileSync(join(root, 'ui/slider/index.tsx'), 'utf8');
  const classes = source.match(/<SliderPrimitive\.Thumb className="([^"]*)"/)?.[1];
  expect(classes).toMatch(/\bbg-card\b/);
  expect(classes).toMatch(/\bborder-primary\b/);
  expect(classes).not.toMatch(/(?<!ring-offset-)\bbg-background\b/);
});
