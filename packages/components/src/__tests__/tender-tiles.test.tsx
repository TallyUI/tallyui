import * as React from 'react';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { formatMoney } from '@tallyui/core';
import { Tender } from '../sale/tender';
import { blue, pricing, SaleHarness, sale, traits } from './sale-harness';

// Record the className prop before react-native-web filters it; keep the real Pressable.
vi.mock('react-native', async (importOriginal) => {
  const rn = await importOriginal<typeof import('react-native')>();
  const Pressable: React.ElementType = rn.Pressable;
  return { ...rn, Pressable: React.forwardRef((props: { className?: string }, ref) => (
    <Pressable ref={ref} {...props} dataSet={{ class: props.className }} />
  )) };
});

afterEach(() => cleanup());

const settings = { ...pricing, taxRatesPpm: { default: 0 } };
const money = (amount: number) => formatMoney({ amount, currency: 'EUR' }) ?? '';
function start(priceMinor: number, method: 'cash' | 'external' = 'cash', methods?: Parameters<typeof Tender>[0]['methods']) {
  render(<SaleHarness settings={settings}>{(sale) => <Tender sale={sale} methods={methods} />}</SaleHarness>);
  act(() => sale.add(blue, traits));
  act(() => sale.setUnitPrice(sale.order.lineItems[0].id, priceMinor));
  act(() => sale.startTender(method));
}

describe('Tender method tiles', () => {
  it('draws each method as a tile with its icon and title', () => {
    start(2500);
    const cash = within(screen.getByTestId('tender-method-cash'));
    const external = within(screen.getByTestId('tender-method-external'));
    expect(cash.getByText('Cash')).toBeTruthy();
    expect(cash.getByTestId('tender-method-cash-icon')).toBeTruthy();
    expect(external.getByText('Card terminal')).toBeTruthy();
    expect(external.getByTestId('tender-method-external-icon')).toBeTruthy();
  });

  it('lays the tiles out in rows of five equal cells', () => {
    start(2500);
    const grid = screen.getByTestId('tender-methods');
    expect(grid.children).toHaveLength(1);
    expect(grid.children[0].children).toHaveLength(5);
  });

  it('marks the picked tile with a border, not a filled button, and a tap still picks the method', () => {
    start(2500);
    const cash = screen.getByTestId('tender-method-cash');
    const external = screen.getByTestId('tender-method-external');
    expect(cash.getAttribute('aria-selected')).toBe('true');
    expect(external.getAttribute('aria-selected')).toBe('false');
    expect(cash.getAttribute('data-class')?.split(/\s+/)).toContain('border-primary');
    expect(cash.getAttribute('data-class')?.split(/\s+/)).not.toContain('bg-primary');
    fireEvent.click(external);
    expect(external.getAttribute('aria-selected')).toBe('true');
    expect(cash.getAttribute('aria-selected')).toBe('false');
    expect(screen.getByTestId('tender-take').textContent).toBe(`Take ${money(2500)} in Card terminal`);
  });
});
