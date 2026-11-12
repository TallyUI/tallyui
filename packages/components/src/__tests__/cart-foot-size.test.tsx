import * as React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { CartFoot } from '../cart/cart-foot';

// react-native-web atomizes className into hashed classes, so copy it to a data attribute.
vi.mock('react-native', async (importOriginal) => {
  const rn = await importOriginal<typeof import('react-native')>();
  const withClass = (Base: React.ElementType) =>
    React.forwardRef((props: { className?: string }, ref) => (
      <Base ref={ref} {...props} dataSet={{ class: props.className }} />
    ));
  return { ...rn, View: withClass(rn.View), Pressable: withClass(rn.Pressable) };
});

afterEach(cleanup);

describe('CartFoot size', () => {
  it('centres a fixed 44 px square actions button', () => {
    render(<CartFoot total={{ amount: 3125, currency: 'EUR' }} onCheckout={() => {}}
      actions={[{ label: 'Order details', onPress: () => {} }]} />);
    const classes = (screen.getByTestId('cart-foot-more').getAttribute('data-class') ?? '').split(/\s+/);
    expect(classes).toEqual(expect.arrayContaining(['h-11', 'w-11', 'self-center']));
    expect(classes).not.toContain('min-h-12');
    expect(classes).not.toContain('min-w-12');
  });

  it('gives Checkout a 56 px minimum height and fills the remaining width', () => {
    render(<CartFoot total={{ amount: 3125, currency: 'EUR' }} onCheckout={() => {}} />);
    const classes = (screen.getByTestId('cart-checkout').getAttribute('data-class') ?? '').split(/\s+/);
    expect(classes).toEqual(expect.arrayContaining(['min-h-14', 'flex-1']));
    expect(classes).not.toContain('min-h-12');
  });

  it('keeps the Checkout minimum height and opacity when disabled', () => {
    render(<CartFoot total={{ amount: 3125, currency: 'EUR' }} onCheckout={() => {}} disabled />);
    const classes = (screen.getByTestId('cart-checkout').getAttribute('data-class') ?? '').split(/\s+/);
    expect(classes).toEqual(expect.arrayContaining(['min-h-14', 'opacity-50']));
  });
});
