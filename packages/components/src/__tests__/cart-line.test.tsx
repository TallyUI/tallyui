import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { CartLine } from '../cart/cart-line';

describe('CartLine', () => {
  it('renders the supplied name, unit price, quantity and line total', () => {
    render(<CartLine name="Coffee" quantity={2} unitPrice={{ amount: 850, currency: 'EUR' }} lineTotal={{ amount: 1700, currency: 'EUR' }} locale="en" />);
    expect(screen.getByText('Coffee')).toBeDefined();
    expect(screen.getByText('€8.50 × 2')).toBeDefined();
    expect(screen.getByText('€17.00')).toBeDefined();
  });

  it('renders one "Name: Value" row per attribute, in order, under the name', () => {
    const { container } = render(<CartLine name="Shirt" attributes={{ Size: 'M', Color: 'Black' }} quantity={1}
      unitPrice={{ amount: 850, currency: 'EUR' }} lineTotal={{ amount: 850, currency: 'EUR' }} locale="en" />);
    expect(container.textContent).toBe('ShirtSize: MColor: Black€8.50 × 1€8.50');
  });

  it.each([undefined, {}])('renders no attribute rows when attributes are %s', (attributes) => {
    const { container } = render(<CartLine name="Shirt" attributes={attributes} quantity={1}
      unitPrice={{ amount: 850, currency: 'EUR' }} lineTotal={{ amount: 850, currency: 'EUR' }} locale="en" />);
    expect(container.textContent).toBe('Shirt€8.50 × 1€8.50');
  });

  it('displays the supplied total without recomputing it', () => {
    render(<CartLine name="Coffee" quantity={2} unitPrice={{ amount: 850, currency: 'EUR' }} lineTotal={{ amount: 1500, currency: 'EUR' }} locale="en" />);
    expect(screen.getByText('€15.00')).toBeDefined();
  });

  it('formats zero-digit currencies', () => {
    render(<CartLine name="Coffee" quantity={1} unitPrice={{ amount: 850, currency: 'JPY' }} lineTotal={{ amount: 850, currency: 'JPY' }} locale="en" />);
    expect(screen.getByText('¥850 × 1')).toBeDefined();
    expect(screen.getByText('¥850')).toBeDefined();
  });

  it('uses a dash for unknown currency', () => {
    render(<CartLine name="Coffee" quantity={3} unitPrice={{ amount: 850, currency: 'XXX' }} lineTotal={{ amount: 2550, currency: 'XXX' }} />);
    expect(screen.getByText('— × 3')).toBeDefined();
    expect(screen.getByText('—')).toBeDefined();
  });
});
