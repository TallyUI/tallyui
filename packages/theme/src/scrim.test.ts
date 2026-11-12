// @vitest-environment node
import { readFileSync } from 'node:fs';
import { fileURLToPath, URL } from 'node:url';
import { describe, expect, it } from 'vitest';

const css = readFileSync(fileURLToPath(new URL('./tokens.css', import.meta.url)), 'utf8');
const base = css.match(/@theme\s*\{([^}]*)\}/)![1];
const light = css.match(/@variant light\s*\{([^}]*)\}/)![1];
const dark = css.match(/@variant dark\s*\{([^}]*)\}/)![1];

describe.each([
  ['base', base, '#14161b47'],
  ['light', light, '#14161b47'],
  ['dark', dark, '#00000280'],
] as const)('%s theme scrim', (_, block, value) => {
  it('defines the scrim token exactly once', () => {
    expect(block.match(/--color-scrim\s*:/g) ?? []).toHaveLength(1);
  });

  it('uses the per-theme 8-digit hex value', () => {
    expect(block.match(/--color-scrim:\s*([^;]+);/)?.[1].trim()).toBe(value);
  });
});
