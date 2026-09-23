import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SearchIcon, createSvgIcon } from '../ui';

describe('SearchIcon', () => {
  it('renders with and without a label without console errors', () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      render(<SearchIcon />);
      render(<SearchIcon accessibilityLabel="Search" />);
      expect(consoleError).not.toHaveBeenCalled();
    } finally {
      consoleError.mockRestore();
    }
  });

  it.each([undefined, 24])('renders an SVG at size %s', (size) => {
    const { container } = render(<SearchIcon size={size} />);
    const svg = container.querySelector('svg');
    expect(svg?.getAttribute('width')).toBe(String(size ?? 16));
    expect(svg?.getAttribute('height')).toBe(String(size ?? 16));
    expect(svg?.getAttribute('viewBox')).toBe('0 0 24 24');
    expect(svg?.querySelector('circle')?.getAttribute('cx')).toBe('11');
    expect(svg?.querySelector('circle')?.getAttribute('cy')).toBe('11');
    expect(svg?.querySelector('circle')?.getAttribute('r')).toBe('7');
    expect(svg?.querySelector('line')?.getAttribute('x1')).toBe('16.5');
    expect(svg?.querySelector('line')?.getAttribute('y1')).toBe('16.5');
    expect(svg?.querySelector('line')?.getAttribute('x2')).toBe('21');
    expect(svg?.querySelector('line')?.getAttribute('y2')).toBe('21');
  });

  it('is decorative and inherits color by default', () => {
    const { container } = render(<SearchIcon />);
    const svg = container.querySelector('svg');
    expect(screen.queryByRole('img')).toBeNull();
    expect(svg?.getAttribute('aria-hidden')).toBe('true');
    expect(svg?.getAttribute('stroke')).toBe('currentColor');
    expect(svg?.getAttribute('stroke-width')).toBe('2');
    expect(SearchIcon.displayName).toBe('SearchIcon');
  });

  it('exposes a labelled image when an accessibility label is given', () => {
    render(<SearchIcon accessibilityLabel="Search" />);
    expect(screen.getByRole('img', { name: 'Search' }).tagName).toBe('svg');
  });

  it('uses the supplied stroke color', () => {
    const { container } = render(<SearchIcon color="#123456" />);
    expect(container.querySelector('svg')?.getAttribute('stroke')).toBe('#123456');
  });
});

it('passes the stroke width to the SVG and the icon renderer', () => {
  const Icon = createSvgIcon('TestIcon', ({ strokeWidth }) => <SearchIcon size={strokeWidth} />);
  const { container } = render(<Icon strokeWidth={3} />);
  expect(container.querySelector('svg')?.getAttribute('stroke-width')).toBe('3');
  expect(container.querySelector('svg svg')?.getAttribute('width')).toBe('3');
});
