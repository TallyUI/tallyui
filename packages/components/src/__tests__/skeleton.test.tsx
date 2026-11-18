import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { scaleVariables } from '@tallyui/theme';
import { Skeleton, skeletonCount, SKELETON_MAX_ROWS } from '../ui';

afterEach(() => cleanup());

describe('skeletonCount', () => {
  it.each([
    [0, 44], [-100, 44], [Number.NaN, 44], [Infinity, 44],
    [100, 0], [100, -1], [100, Number.NaN], [100, Infinity],
  ])('is 1 for a non-finite or non-positive input (%s / %s)', (extent, rowHeight) => {
    expect(skeletonCount(extent, rowHeight)).toBe(1);
  });

  it.each([[100, 44, 3], [44, 44, 1], [45, 44, 2], [480, 48, 10]])('fills %s at %s a row with %s rows', (extent, rowHeight, count) => {
    expect(skeletonCount(extent, rowHeight)).toBe(count);
  });

  it('caps the rows at 12', () => {
    expect(SKELETON_MAX_ROWS).toBe(12);
    expect(skeletonCount(600, 44)).toBe(12);
    expect(skeletonCount(10_000, 44)).toBe(12);
  });
});

describe('Skeleton', () => {
  it('is busy, and a row is the default scale row height', () => {
    render(<Skeleton shape="row" testID="shape" />);
    const shape = screen.getByTestId('shape');
    expect(shape.getAttribute('aria-busy')).toBe('true');
    // The context's default scale, which a tree with no ScaleProvider reads (scale-provider.tsx).
    expect(getComputedStyle(shape).height).toBe(`${scaleVariables('regular', 'coarse')['--spacing-row']}px`);
  });

  it('lets the caller style win over the scale height', () => {
    render(<Skeleton shape="tile" testID="shape" style={{ height: 3 }} />);
    expect(getComputedStyle(screen.getByTestId('shape')).height).toBe('3px');
  });

  it('imports no animation and uses no animation utility', () => {
    expect(readFileSync(`${__dirname}/../ui/skeleton/index.tsx`, 'utf8')).not.toMatch(/reanimated|animate-|Animated/);
  });
});
