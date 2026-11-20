import * as React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { CART_COLUMNS, CART_PICKING_QUANTITY, CartColumnHeads, cartColumnIds, cartShowsPrice } from '../cart/cart-columns';
import { CartChargeLine } from '../cart/cart-charge-line';
import { CartLine } from '../cart/cart-line';
import { I18nProvider } from '../i18n';

// Preserve classes before react-native-web atomizes them, so the picking width can be read off each cell.
vi.mock('react-native', async (importOriginal) => {
  const rn = await importOriginal<typeof import('react-native')>();
  const withClass = (Base: React.ElementType) =>
    React.forwardRef((props: { className?: string }, ref) => <Base ref={ref} {...props} dataSet={{ class: props.className }} />);
  return { ...rn, View: withClass(rn.View) };
});

const heads = () => screen.getAllByRole('columnheader').map((head) => head.textContent);

describe('CartColumnHeads', () => {
  it("renders v2's heads Qty, Item, Price, Total in order", () => {
    render(<CartColumnHeads />);
    expect(heads()).toEqual(['Qty', 'Item', 'Price', 'Total']);
  });

  it('drops the Price head when showPrice is false', () => {
    render(<CartColumnHeads showPrice={false} />);
    expect(heads()).toEqual(['Qty', 'Item', 'Total']);
  });

  it('reads the heads from the catalogue (Q1)', () => {
    const fr = { 'pos_cart.col_qty': 'Qté', 'pos_cart.col_item': 'Article', 'pos_cart.col_price': 'Prix', 'pos_cart.col_total': 'Total' };
    render(<I18nProvider locale="fr" resources={{ fr }}><CartColumnHeads /></I18nProvider>);
    expect(heads()).toEqual(['Qté', 'Article', 'Prix', 'Total']);
  });
});

describe('cartShowsPrice', () => {
  it.each([
    [undefined, 1024, 768, true],
    [300, 1024, 768, true],
    [299, 1024, 768, false],
    [400, 767, 1024, false],
    [400, 1024, 479, false],
  ])('cart %s wide in a %s × %s window: %s', (cartWidth, windowWidth, windowHeight, shows) => {
    expect(cartShowsPrice({ cartWidth, windowWidth, windowHeight })).toBe(shows);
  });
});

describe('cartColumnIds', () => {
  it("defaults to today's columns", () => {
    expect(cartColumnIds()).toEqual(['quantity', 'name', 'price', 'total']);
  });

  it('lists every shown column in the fixed order, and drops Price without showPrice', () => {
    const all = { quantity: { show: true }, image: { show: true }, name: { show: true }, sku: { show: true }, price: { show: true }, total: { show: true } };
    expect(cartColumnIds(all)).toEqual(['quantity', 'image', 'name', 'sku', 'price', 'total']);
    expect(cartColumnIds(all, { showPrice: false })).toEqual(['quantity', 'image', 'name', 'sku', 'total']);
  });
});

describe('CartColumnHeads columns', () => {
  it('heads the Image column with an empty label and the SKU column with SKU', () => {
    render(<CartColumnHeads columns={{ image: { show: true }, sku: { show: true }, quantity: { show: false } }} />);
    expect(heads()).toEqual(['', 'Item', 'SKU', 'Price', 'Total']);
  });

  it('heads the quantity column "This payment" with picking, and leaves it alone without', () => {
    render(<CartColumnHeads picking />);
    expect(heads()).toEqual(['This payment', 'Item', 'Price', 'Total']);
    cleanup();
    render(<CartColumnHeads picking={false} />);
    expect(heads()).toEqual(['Qty', 'Item', 'Price', 'Total']);
  });

  it('has no Item head when name is hidden', () => {
    render(<CartColumnHeads columns={{ name: { show: false } }} />);
    expect(heads()).toEqual(['Qty', 'Price', 'Total']);
  });
});

describe('the picking quantity width', () => {
  const eur = (amount: number) => ({ amount, currency: 'EUR' });
  const quantityClasses = (picking?: boolean) => {
    cleanup();
    render(<>
      <CartColumnHeads picking={picking} />
      <CartLine testID="line" name="Shirt" quantity={2} unitPrice={eur(1250)} lineTotal={eur(2500)} picking={picking} />
      <CartChargeLine testID="charge" name="Delivery" price={eur(500)} total={eur(500)} picking={picking} />
    </>);
    return [screen.getAllByRole('columnheader')[0], screen.getByTestId('line').firstElementChild!, screen.getByTestId('charge').firstElementChild!]
      .map((el) => el.getAttribute('data-class'));
  };

  it('widens the quantity head and cells only while picking', () => {
    expect(CART_PICKING_QUANTITY.head).not.toBe(CART_COLUMNS.quantity.head);
    expect(CART_PICKING_QUANTITY.cell).not.toBe(CART_COLUMNS.quantity.cell);
    const [head, line, charge] = quantityClasses(true);
    expect(head).toContain(CART_PICKING_QUANTITY.head);
    expect([line, charge]).toEqual([CART_PICKING_QUANTITY.cell, CART_PICKING_QUANTITY.cell]);
    for (const picking of [undefined, false]) {
      const [plainHead, plainLine, plainCharge] = quantityClasses(picking);
      expect(plainHead).toContain(CART_COLUMNS.quantity.head);
      expect([plainLine, plainCharge]).toEqual([CART_COLUMNS.quantity.cell, CART_COLUMNS.quantity.cell]);
    }
  });
});
