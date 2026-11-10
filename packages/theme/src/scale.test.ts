// @vitest-environment node
// Port of WCPOS v2 `packages/components/src/lib/scale.test.ts`.
import { readFileSync } from 'node:fs';
import { fileURLToPath, URL } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  MAX_FONT_SCALE, POINTER_FLOORS, SCALE_STEPS, SCALE_VARIABLE_NAMES,
  resolveStep, scaleVariables,
} from './scale';

const steps = ['compact', 'regular', 'spacious'] as const;
const pointers = ['coarse', 'fine'] as const;

describe('resolveStep', () => {
  it.each([
    [639, 'compact'], [640, 'regular'], [1599, 'regular'], [1600, 'spacious'],
  ] as const)('resolves Auto at %s to %s', (extent, step) => {
    expect(resolveStep('auto', extent)).toBe(step);
  });

  it.each(steps)('lets the %s override win at any extent', (step) => {
    expect(resolveStep(step, 390)).toBe(step);
    expect(resolveStep(step, 2560)).toBe(step);
  });

  it.each([undefined, null, '', 'tiny', 'AUTO'])('falls back to Auto for %s', (override) => {
    expect(resolveStep(override, 390)).toBe('compact');
    expect(resolveStep(override, 1024)).toBe('regular');
  });
});

describe('scaleVariables', () => {
  it('returns the full Regular column for a fine pointer', () => {
    expect(scaleVariables('regular', 'fine')).toEqual({
      '--spacing': 4, '--text-base': 14, '--spacing-ctl': 44,
      '--spacing-row': 44, '--spacing-tile': 64, '--radius': 8,
      '--text-amt': 40, '--text-xs': 12, '--text-2xs': 11,
    });
  });

  it('floors only Compact controls and rows for a coarse pointer', () => {
    expect(scaleVariables('compact', 'coarse')).toEqual({
      '--spacing': 3.5, '--text-base': 13, '--spacing-ctl': 44,
      '--spacing-row': 44, '--spacing-tile': 56, '--radius': 6,
      '--text-amt': 34, '--text-xs': 12, '--text-2xs': 11,
    });
  });

  it('keeps Compact controls and rows for a fine pointer', () => {
    expect(scaleVariables('compact', 'fine')).toMatchObject({
      '--spacing-ctl': 40, '--spacing-row': 36,
    });
  });

  it.each(steps)('never floors tiles and clears the pointer floors at %s', (step) => {
    for (const pointer of pointers) {
      const variables = scaleVariables(step, pointer);
      expect(variables['--spacing-tile']).toBe(SCALE_STEPS[step][4]);
      expect(variables['--spacing-ctl']).toBeGreaterThanOrEqual(POINTER_FLOORS[pointer]);
      expect(variables['--spacing-row']).toBeGreaterThanOrEqual(POINTER_FLOORS[pointer]);
    }
  });
});

describe('constants', () => {
  it('caps the OS text multiplier at 1.3', () => {
    expect(MAX_FONT_SCALE).toBe(1.3);
  });

  it('names exactly nine variables', () => {
    expect(SCALE_VARIABLE_NAMES).toHaveLength(9);
  });

  it.each(steps)('has nine values and readable small text at %s', (step) => {
    expect(SCALE_STEPS[step]).toHaveLength(9);
    expect(scaleVariables(step, 'fine')['--text-xs']).toBeGreaterThanOrEqual(12);
    expect(scaleVariables(step, 'fine')['--text-2xs']).toBeGreaterThanOrEqual(11);
  });
});

describe('scale.css', () => {
  const css = readFileSync(fileURLToPath(new URL('./scale.css', import.meta.url)), 'utf8');

  it('declares the Regular column in the first theme block', () => {
    const block = css.match(/@theme\s*\{([^}]*)\}/)![1];
    const declarations = Object.fromEntries(
      [...block.matchAll(/(--[\w-]+):\s*([\d.]+)px/g)].map(([, name, value]) => [name, Number(value)]),
    );
    expect(declarations).toEqual(Object.fromEntries(
      SCALE_VARIABLE_NAMES.map((name, i) => [name, SCALE_STEPS.regular[i]]),
    ));
  });

  it('derives the type ramp and radii inline', () => {
    const block = css.match(/@theme inline\s*\{([^}]*)\}/)![1];
    expect(block).toContain('--text-sm: calc(var(--text-base) * 0.929);');
    expect(block).toContain('--radius-lg: var(--radius);');
  });
});
