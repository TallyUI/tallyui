import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { act, cleanup, render, screen, within } from '@testing-library/react';
import { CartTotal } from '../cart/cart-total';
import { Cart } from '../sale/cart';
import { SaleHarness, sale, blue, traits } from './sale-harness';

afterEach(cleanup);

const subtotal = { amount: 3000, currency: 'EUR' };
const total = { amount: 3600, currency: 'EUR' };
const taxLines = [{ label: 'VAT', amount: { amount: 600, currency: 'EUR' } }];

describe('Cart Total row', () => {
  it('shows the label and formatted total by default', () => {
    render(<CartTotal subtotal={subtotal} taxLines={taxLines} total={total} locale="en" />);
    expect(screen.getByText('Total')).toBeDefined();
    expect(screen.getByText('€36.00')).toBeDefined();
  });

  it('omits the total but keeps subtotal and tax when showTotal is false', () => {
    render(<CartTotal subtotal={subtotal} taxLines={taxLines} total={total} locale="en" showTotal={false} />);
    expect(screen.getByText('Subtotal')).toBeDefined();
    expect(screen.getByText('€30.00')).toBeDefined();
    expect(screen.getByText('VAT')).toBeDefined();
    expect(screen.getByText('€6.00')).toBeDefined();
    expect(screen.queryByText('Total')).toBeNull();
    expect(screen.queryByText('€36.00')).toBeNull();
  });

  it('passes showTotal false through Cart to its footer', () => {
    render(<SaleHarness>{(sale) => <Cart sale={sale} showTotal={false} />}</SaleHarness>);
    act(() => sale.add(blue, traits));
    expect(within(screen.getByTestId('cart-footer')).queryByText('Total')).toBeNull();
  });

  it('shows Total in the Cart footer by default', () => {
    render(<SaleHarness>{(sale) => <Cart sale={sale} />}</SaleHarness>);
    act(() => sale.add(blue, traits));
    expect(within(screen.getByTestId('cart-footer')).getByText('Total')).toBeDefined();
  });

  it('uses semibold for both Total texts and no bold weight', () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const source = readFileSync(join(here, '../cart/cart-total.tsx'), 'utf8');
    expect(source).toContain('<Text className="font-semibold">Total</Text>');
    expect(source).toContain('<Text className="font-semibold">{formatMoney(total, locale) ?? \'—\'}</Text>');
    expect(source).not.toContain('font-bold');
  });
});
