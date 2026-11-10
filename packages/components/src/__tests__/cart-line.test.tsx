import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { CartLine } from '../cart/cart-line';

const eur = (amount: number) => ({ amount, currency: 'EUR' });

describe('CartLine', () => {
  it('renders the quantity, name, unit price and line total in their columns', () => {
    const { container } = render(<CartLine name="Coffee" quantity={2} unitPrice={eur(850)} lineTotal={eur(1700)} locale="en" />);
    expect(container.textContent).toBe('2Coffee€8.50€17.00');
  });

  it('joins attributes on one line under the name', () => {
    render(<CartLine name="Shirt" attributes={{ Size: 'M', Colour: 'Red' }} quantity={1}
      unitPrice={eur(850)} lineTotal={eur(850)} locale="en" />);
    expect(screen.getByText('Size: M · Colour: Red')).toBeDefined();
  });

  it.each([undefined, {}])('a simple line shows no attributes (%s)', (attributes) => {
    const { container } = render(<CartLine name="Shirt" attributes={attributes} quantity={1}
      unitPrice={eur(850)} lineTotal={eur(850)} locale="en" />);
    expect(container.textContent).toBe('1Shirt€8.50€8.50');
  });

  it('strikes the regular price only when it is above the unit price', () => {
    const { rerender } = render(<CartLine name="Bottle" quantity={1} unitPrice={eur(1500)} regularUnitPrice={eur(2300)}
      lineTotal={eur(1500)} locale="en" />);
    const struck = screen.getByLabelText('Regular price €23.00');
    expect(struck.textContent).toBe('€23.00');
    expect(struck.style.textDecoration).toContain('line-through');
    for (const regular of [1500, 1200]) {
      rerender(<CartLine name="Bottle" quantity={1} unitPrice={eur(1500)} regularUnitPrice={eur(regular)} lineTotal={eur(1500)} locale="en" />);
      expect(screen.queryByLabelText(/^Regular price/)).toBeNull();
    }
  });

  it('hides the Price column when showPrice is false', () => {
    const { container } = render(<CartLine name="Bottle" quantity={1} unitPrice={eur(1500)} regularUnitPrice={eur(2300)}
      lineTotal={eur(1500)} showPrice={false} locale="en" />);
    expect(container.textContent).toBe('1Bottle€15.00');
  });

  it('displays the supplied total without recomputing it', () => {
    render(<CartLine name="Coffee" quantity={2} unitPrice={eur(850)} lineTotal={eur(1500)} locale="en" />);
    expect(screen.getByText('€15.00')).toBeDefined();
  });

  it('formats zero-digit currencies', () => {
    const { container } = render(<CartLine name="Coffee" quantity={1} unitPrice={{ amount: 850, currency: 'JPY' }}
      lineTotal={{ amount: 850, currency: 'JPY' }} locale="en" />);
    expect(container.textContent).toBe('1Coffee¥850¥850');
  });

  it('uses a dash for unknown currency', () => {
    const { container } = render(<CartLine name="Coffee" quantity={3} unitPrice={{ amount: 850, currency: 'XXX' }}
      lineTotal={{ amount: 2550, currency: 'XXX' }} />);
    expect(container.textContent).toBe('3Coffee——');
  });
});
