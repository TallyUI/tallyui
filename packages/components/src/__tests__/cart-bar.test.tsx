import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CartBar } from '../sale/cart-bar';
import { blue, SaleHarness, sale, traits } from './sale-harness';

afterEach(() => cleanup());

describe('CartBar', () => {
  it("shows 'Cart is empty' and is disabled with no lines", () => {
    render(<SaleHarness>{(sale) => <CartBar sale={sale} onOpen={vi.fn()} />}</SaleHarness>);
    const button = screen.getByRole('button', { name: 'Cart is empty' });
    expect(button.getAttribute('aria-disabled')).toBe('true');
    expect(screen.getByText('Cart is empty')).toBeTruthy();
  });

  it('shows the line count and the total once there are lines, and is enabled', () => {
    const onOpen = vi.fn();
    render(<SaleHarness>{(sale) => <CartBar sale={sale} onOpen={onOpen} />}</SaleHarness>);
    act(() => { sale.add(blue, traits); sale.add(blue, traits); });
    const button = screen.getByRole('button', { name: 'Open cart, 2 items, €31.25' });
    expect(button.getAttribute('aria-disabled')).not.toBe('true');
    expect(screen.getByText('Cart · 2 items')).toBeTruthy();
    button.click();
    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  it('reads "1 item" in the singular', () => {
    render(<SaleHarness>{(sale) => <CartBar sale={sale} onOpen={vi.fn()} />}</SaleHarness>);
    act(() => sale.add(blue, traits));
    expect(screen.getByText('Cart · 1 item')).toBeTruthy();
  });
});
