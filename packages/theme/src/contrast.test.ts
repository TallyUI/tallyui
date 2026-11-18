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
const dark = tokens(css.match(/@variant dark\s*\{([^}]*)\}/)![1]);

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
    ['destructive-foreground', 'destructive', 4.5],
    ['success-foreground', 'success', 4.5],
    ['warning-foreground', 'warning', 4.5],
    ['info-foreground', 'info', 4.5],
    ['price', 'card', 4.5],
    ['sale', 'card', 4.5],
    ['success', 'muted', 3.0],
  ] as const)('%s on %s meets %s:1', (foreground, background, minimum) => {
    expect(contrast(colors[foreground], colors[background])).toBeGreaterThanOrEqual(minimum);
  });

  // Light control borders match WCPOS v2 (#756): lighter than 3:1, but still stronger than the plain border.
  it.each(['background', 'card', 'muted'] as const)('input stands out more than border on %s', (bg) => {
    expect(contrast(colors.input, colors[bg])).toBeGreaterThan(contrast(colors.border, colors[bg]));
  });
});

describe('dark theme contrast', () => {
  it.each([
    ['foreground', 'background', 4.5],
    ['foreground', 'card', 4.5],
    ['foreground', 'muted', 4.5],
    ['muted-foreground', 'background', 4.5],
    ['muted-foreground', 'card', 4.5],
    ['muted-foreground', 'muted', 4.5],
    ['primary-foreground', 'primary', 4.5],
    ['primary', 'background', 4.5],
    ['destructive-foreground', 'destructive', 4.5],
    ['success-foreground', 'success', 4.5],
    ['warning-foreground', 'warning', 4.5],
    ['info-foreground', 'info', 4.5],
    ['price', 'card', 4.5],
    ['sale', 'card', 4.5],
    ['input', 'background', 3.0],
    ['input', 'card', 3.0],
    ['input', 'muted', 3.0],
  ] as const)('%s on %s meets %s:1', (foreground, background, minimum) => {
    expect(contrast(dark[foreground], dark[background])).toBeGreaterThanOrEqual(minimum);
  });
});

it.each(['primary', 'ring', 'muted-foreground', 'input', 'success', 'warning', 'info', 'price', 'ok', 'ok-bg', 'warning-text', 'warning-bg', 'bad', 'bad-bg', 'c1', 'c2', 'c3', 'c4', 'c5', 'chart-1', 'chart-2', 'chart-3', 'chart-4', 'chart-5'])('%s matches in both light blocks', (name) => {
  expect(base[name]).toBe(light[name]);
});

describe.each([['light', light], ['dark', dark]] as const)('%s tone washes', (_, colors) => {
  // WCAG 1.4.11 non-text contrast: a disc's glyph on its wash.
  it.each([['ok', 'ok-bg'], ['warning-text', 'warning-bg'], ['bad', 'bad-bg']] as const)('%s glyph on %s meets 3:1', (ink, wash) => {
    expect(contrast(colors[ink], colors[wash])).toBeGreaterThanOrEqual(3);
  });

  // A band's words keep the foreground.
  it.each(['ok-bg', 'warning-bg', 'bad-bg'] as const)('foreground on %s meets AA', (wash) => {
    expect(contrast(colors.foreground, colors[wash])).toBeGreaterThanOrEqual(4.5);
  });

  it('ok is success and bad is destructive, as in v2', () => {
    expect(colors.ok).toBe(colors.success);
    expect(colors.bad).toBe(colors.destructive);
  });
});

it('dark warning-text is the dark warning, as in v2', () => {
  expect(dark['warning-text']).toBe(dark.warning);
});

describe.each([['light', light], ['dark', dark]] as const)('%s chart colours', (_, colors) => {
  // WCAG 1.4.11 non-text contrast: a chart mark against the card.
  it.each(['c1', 'c2', 'c3', 'c4', 'c5'] as const)('%s on card meets 3:1', (c) => {
    expect(contrast(colors[c], colors.card)).toBeGreaterThanOrEqual(3);
  });

  it.each([1, 2, 3, 4, 5] as const)('chart-$0 is c$0, as in v2', (n) => {
    expect(colors[`chart-${n}`]).toBe(colors[`c${n}`]);
  });
});

function over(fg: string, bg: string, alpha: number): string {
  return '#' + [1, 3, 5].map((offset) => {
    const foreground = parseInt(fg.slice(offset, offset + 2), 16);
    const background = parseInt(bg.slice(offset, offset + 2), 16);
    return Math.round(alpha * foreground + (1 - alpha) * background).toString(16).padStart(2, '0');
  }).join('');
}

describe.each([['light', light], ['dark', dark]] as const)('%s badge tint contrast', (_, colors) => {
  describe.each(['background', 'card'])('on %s', (surface) => {
    it.each(['success', 'info', 'warning', 'destructive'])('foreground on a 15%% %s tint meets AA', (status) => {
      expect(contrast(colors.foreground, over(colors[status], colors[surface], 0.15))).toBeGreaterThanOrEqual(4.5);
    });

    it('muted-foreground on a 15% muted tint meets AA', () => {
      expect(contrast(colors['muted-foreground'], over(colors.muted, colors[surface], 0.15))).toBeGreaterThanOrEqual(4.5);
    });
  });
});

it('documents why badge text uses foreground: success on its own light tint fails AA', () => {
  expect(contrast(light.success, over(light.success, light.card, 0.15))).toBeLessThan(4.5);
});
