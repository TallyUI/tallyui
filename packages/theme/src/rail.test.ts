// @vitest-environment node
import { readFileSync } from 'node:fs';
import { fileURLToPath, URL } from 'node:url';
import { describe, expect, it } from 'vitest';

const css = readFileSync(fileURLToPath(new URL('./tokens.css', import.meta.url)), 'utf8');
const base = css.match(/@theme\s*\{([^}]*)\}/)![1];
const light = css.match(/@variant light\s*\{([^}]*)\}/)![1];
const dark = css.match(/@variant dark\s*\{([^}]*)\}/)![1];

const lightValues = {
  sidebar: '#e4eaf5',
  'sidebar-foreground': '#35383d',
  'sidebar-border': '#d2d8e1',
  'rail-accent': '#c2ddff',
  'rail-selected': '#ffffff',
  'rail-selected-foreground': '#5b5ef0',
};
const darkValues = {
  sidebar: '#050e18',
  'sidebar-foreground': '#9ba6b1',
  'sidebar-border': '#1a222b',
  'rail-accent': '#161b22',
  'rail-selected': '#262a4b',
  'rail-selected-foreground': '#818cf8',
};
type RailToken = keyof typeof lightValues;
const names = Object.keys(lightValues) as RailToken[];

const value = (block: string, name: string) => block.match(new RegExp(`--color-${name}:\\s*([^;]+);`))?.[1].trim();

function luminance(hex: string): number {
  const channels = [1, 3, 5].map((offset) => {
    const channel = parseInt(hex.slice(offset, offset + 2), 16) / 255;
    return channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });
  return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
}

function contrast(first: string, second: string): number {
  const a = luminance(first);
  const b = luminance(second);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

const themes = [
  ['base', base, lightValues],
  ['light', light, lightValues],
  ['dark', dark, darkValues],
] as const;

describe.each(themes)('%s theme rail tokens', (_, block, values) => {
  it('defines each rail token exactly once', () => {
    for (const name of names) {
      expect(block.match(new RegExp(`--color-${name}\\s*:`, 'g')) ?? [], name).toHaveLength(1);
    }
  });

  it('uses the per-theme values', () => {
    for (const name of names) {
      expect(value(block, name), name).toBe(values[name]);
    }
  });
});

describe.each(themes)('%s theme rail contrast', (_, block) => {
  it.each([
    ['sidebar-foreground', 'sidebar'],
    ['rail-selected-foreground', 'rail-selected'],
    ['sidebar-foreground', 'rail-accent'],
  ] as const)('%s on %s', (foreground, background) => {
    expect(contrast(value(block, foreground)!, value(block, background)!)).toBeGreaterThanOrEqual(4.5);
  });
});
