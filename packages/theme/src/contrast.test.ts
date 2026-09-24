// @vitest-environment node
import { readFileSync } from 'node:fs';
import { fileURLToPath, URL } from 'node:url';
import { describe, expect, it } from 'vitest';

const css = readFileSync(fileURLToPath(new URL('./tokens.css', import.meta.url)), 'utf8');
const tokens = (block: string) => Object.fromEntries(
  [...block.matchAll(/--color-([\w-]+):\s*(#[\da-f]{6})/gi)].map(([, name, value]) => [name, value]),
);
const base = tokens(css.match(/@theme\s*\{([^}]*)\}/)![1]);
const light = tokens(css.match(/@variant light\s*\{([^}]*)\}/)![1]);

function luminance(hex: string): number {
  const channels = [1, 3, 5].map((offset) => {
    const value = parseInt(hex.slice(offset, offset + 2), 16) / 255;
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
}

function contrast(first: string, second: string): number {
  const a = luminance(first);
  const b = luminance(second);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

describe('WCAG contrast calculation', () => {
  it('gives white on black a ratio of 21', () => {
    expect(contrast('#ffffff', '#000000')).toBeCloseTo(21, 2);
  });

  it('documents the old primary failing normal-text AA', () => {
    expect(contrast('#ffffff', '#6366f1')).toBeLessThan(4.5);
  });
});

describe.each([['base', base], ['light', light]] as const)('%s theme contrast', (_, colors) => {
  it.each([
    ['primary-foreground', 'primary', 4.5],
    ['foreground', 'background', 4.5],
    ['foreground', 'card', 4.5],
    ['foreground', 'muted', 4.5],
    ['muted-foreground', 'background', 4.5],
    ['muted-foreground', 'card', 4.5],
    ['muted-foreground', 'muted', 4.5],
    ['primary', 'background', 4.5],
    ['success', 'muted', 3.0],
    ['input', 'background', 3.0],
    ['input', 'card', 3.0],
    ['input', 'muted', 3.0],
  ] as const)('%s on %s meets %s:1', (foreground, background, minimum) => {
    expect(contrast(colors[foreground], colors[background])).toBeGreaterThanOrEqual(minimum);
  });
});

it.each(['primary', 'ring', 'muted-foreground', 'input'])('%s matches in both light blocks', (name) => {
  expect(base[name]).toBe(light[name]);
});
