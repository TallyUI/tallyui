import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import {
  ActivityHeartbeatIcon,
  CashRegisterIcon,
  ChartLineIcon,
  DiscountIcon,
  GiftIcon,
  MessageQuestionIcon,
  ReceiptIcon,
  SearchIcon,
  SettingsIcon,
  UsersIcon,
  createSvgIcon,
} from '../ui';

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

describe("WCPOS v2's nav icons", () => {
  // Tabler path data as in v2's packages/components/src/icon/svg/tabler/*.svg.
  it.each([
    ['CashRegisterIcon', CashRegisterIcon, [
      'M21 15h-2.5a1.503 1.503 0 0 0-1.5 1.5a1.503 1.503 0 0 0 1.5 1.5h1a1.503 1.503 0 0 1 1.5 1.5a1.503 1.503 0 0 1-1.5 1.5H17m2 0v1m0-8v1m-6 6H6a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2h2m12 3.12V9a2 2 0 0 0-2-2h-2',
      'M16 10V4a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v6m8 0H8m8 0h1m-9 0H7m1 4v.01M8 17v.01m4-3.02V14m0 3v.01',
    ]],
    ['GiftIcon', GiftIcon, [
      'M3 9a1 1 0 0 1 1-1h16a1 1 0 0 1 1 1v2a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1zm9-1v13',
      'M19 12v7a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-7m2.5-4a2.5 2.5 0 0 1 0-5A4.8 8 0 0 1 12 8a4.8 8 0 0 1 4.5-5a2.5 2.5 0 0 1 0 5',
    ]],
    ['ReceiptIcon', ReceiptIcon, [
      'M5 21V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16l-3-2l-2 2l-2-2l-2 2l-2-2zM9 7h6m-6 4h6m-2 4h2',
    ]],
    ['DiscountIcon', DiscountIcon, [
      'm9 15l6-6',
      'M9 9.5a.5.5 0 1 0 1 0a.5.5 0 1 0-1 0m5 5a.5.5 0 1 0 1 0a.5.5 0 1 0-1 0',
      'M3 12a9 9 0 1 0 18 0a9 9 0 1 0-18 0',
    ]],
    ['UsersIcon', UsersIcon, [
      'M5 7a4 4 0 1 0 8 0a4 4 0 1 0-8 0M3 21v-2a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v2m1-17.87a4 4 0 0 1 0 7.75M21 21v-2a4 4 0 0 0-3-3.85',
    ]],
    ['ChartLineIcon', ChartLineIcon, ['M4 19h16M4 15l4-6l4 2l4-5l4 4']],
    ['ActivityHeartbeatIcon', ActivityHeartbeatIcon, ['M3 12h4.5L9 6l4 12l2-9l1.5 3H21']],
    ['SettingsIcon', SettingsIcon, [
      'M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 0 0 2.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 0 0 1.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 0 0-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 0 0-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 0 0-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 0 0-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 0 0 1.066-2.573c-.94-1.543.826-3.31 2.37-2.37c1 .608 2.296.07 2.572-1.065',
      'M9 12a3 3 0 1 0 6 0a3 3 0 0 0-6 0',
    ]],
    ['MessageQuestionIcon', MessageQuestionIcon, [
      'M8 9h8m-8 4h6m0 5h-1l-5 3v-3H6a3 3 0 0 1-3-3V7a3 3 0 0 1 3-3h12a3 3 0 0 1 3 3v4.5M19 22v.01M19 19a2.003 2.003 0 0 0 .914-3.782a1.98 1.98 0 0 0-2.414.483',
    ]],
  ] as const)('%s draws its Tabler paths', (name, NavIcon, paths) => {
    expect(NavIcon.displayName).toBe(name);
    const { container } = render(<NavIcon />);
    const svg = container.querySelector('svg');
    expect(svg?.getAttribute('viewBox')).toBe('0 0 24 24');
    const drawn = Array.from(svg?.querySelectorAll('path') ?? []);
    expect(drawn.map((path) => path.getAttribute('d'))).toEqual(paths);
    if (name === 'DiscountIcon') expect(drawn[1]?.getAttribute('fill')).toBe('currentColor');
  });
});
