import * as React from 'react';
import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { CART_COLUMNS, CART_PICKING_QUANTITY } from '../cart/cart-columns';
import { Cart } from '../sale/cart';
import { blue, SaleHarness, sale, traits } from './sale-harness';

vi.mock('react-native', async (importOriginal) => {
  const rn = await importOriginal<typeof import('react-native')>();
  const withClass = (Base: React.ElementType) =>
    React.forwardRef((props: { className?: string }, ref) => <Base ref={ref} {...props} dataSet={{ class: props.className }} />);
  return {
    ...rn, View: withClass(rn.View),
    useWindowDimensions: () => ({ width: 1024, height: 768, scale: 1, fontScale: 1 }),
  };
});

afterEach(cleanup);

it('P9: with picker, Cart widens the quantity head, item cells and fee cell; without it, all stay at the default width', { timeout: 20_000 }, () => {
  const view = render(<SaleHarness capabilities={{ orderCreate: 5 }}>{(sale) => <Cart sale={sale} />}</SaleHarness>);
  act(() => { sale.add(blue, traits); sale.add(blue, traits); sale.add(blue, traits); });
  act(() => { sale.addCustomLine({ name: 'Alteration', priceMinor: 360 }); });
  act(() => { sale.addFee({ name: 'Bag', amountMinor: 120 }); });
  const cellsWith = (cls: string) => Array.from(view.container.querySelectorAll('[data-class]'))
    .filter((el) => el.getAttribute('data-class') === cls).length;

  expect(screen.getAllByRole('columnheader')[0].getAttribute('data-class')).toContain(CART_COLUMNS.quantity.head);
  expect(cellsWith(CART_COLUMNS.quantity.cell)).toBe(3);
  expect(cellsWith(CART_PICKING_QUANTITY.cell)).toBe(0);
  expect(screen.getByTestId('cart-charge-line').firstElementChild!.getAttribute('data-class')).toBe(CART_COLUMNS.quantity.cell);

  view.rerender(
    <SaleHarness capabilities={{ orderCreate: 5 }}>{(sale) => <Cart sale={sale}
      picker={{ picked: {}, paid: {}, unitMinor: (_id, n) => n * 100, onPick: vi.fn() }} />}</SaleHarness>);
  expect(screen.getAllByRole('columnheader')[0].getAttribute('data-class')).toContain(CART_PICKING_QUANTITY.head);
  expect(cellsWith(CART_PICKING_QUANTITY.cell)).toBe(3);
  expect(cellsWith(CART_COLUMNS.quantity.cell)).toBe(0);
  expect(screen.getByTestId('cart-charge-line').firstElementChild!.getAttribute('data-class')).toBe(CART_PICKING_QUANTITY.cell);
});
