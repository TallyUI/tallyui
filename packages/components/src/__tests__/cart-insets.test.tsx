import * as React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen } from '@testing-library/react';
import { View } from 'react-native';
import { CartPanel } from '../cart/cart-panel';
import { CartTotal } from '../cart/cart-total';
import { Cart } from '../sale/cart';
import { SaleHarness, sale, blue, traits } from './sale-harness';

// Preserve classes before react-native-web atomizes them, and give Cart a tablet viewport.
vi.mock('react-native', async (importOriginal) => {
  const rn = await importOriginal<typeof import('react-native')>();
  const withClass = (Base: React.ElementType) =>
    React.forwardRef((props: { className?: string }, ref) =>
      <Base ref={ref} {...props} dataSet={{ class: props.className }} />);
  return {
    ...rn,
    View: withClass(rn.View),
    useWindowDimensions: () => ({ width: 1024, height: 768, scale: 1, fontScale: 1 }),
  };
});

afterEach(cleanup);

const classes = (el: Element) => (el.getAttribute('data-class') ?? '').split(/\s+/);

describe('Cart insets', () => {
  it('puts totals and the foot 8 px inside the cart and 8 px apart', () => {
    render(<SaleHarness>{(sale) => <Cart sale={sale} />}</SaleHarness>);
    act(() => sale.add(blue, traits));

    const footer = screen.getByTestId('cart-footer');
    expect(classes(footer)).toContain('gap-2');
    expect(classes(footer)).not.toContain('gap-3');
    expect(classes(footer)).not.toContain('pb-4');

    const wrapper = classes(footer.parentElement!);
    expect(wrapper).toEqual(expect.arrayContaining(['px-2', 'py-2', 'border-t']));
    expect(wrapper).not.toContain('px-3');

    const total = classes(footer.firstElementChild!);
    expect(total).toEqual(expect.arrayContaining(['px-0', 'py-0']));
    expect(total).not.toContain('px-3');
    expect(total).not.toContain('py-3');
  });

  it('keeps standalone CartTotal padding', () => {
    const { container } = render(
      <CartTotal subtotal={{ amount: 1000, currency: 'EUR' }} total={{ amount: 1000, currency: 'EUR' }} />
    );
    expect(classes(container.firstElementChild!)).toEqual(expect.arrayContaining(['px-3', 'py-3']));
  });

  it('keeps the default CartPanel footer padding', () => {
    render(<CartPanel items={[]} renderItem={() => null} footer={<View testID="standalone-footer" />} />);
    const wrapper = screen.getByTestId('standalone-footer').parentElement!;
    expect(classes(wrapper)).toEqual(expect.arrayContaining(['px-3', 'py-2']));
  });
});
