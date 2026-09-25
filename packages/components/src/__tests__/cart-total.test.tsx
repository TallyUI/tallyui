import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { CartTotal } from '../cart/cart-total';

const subtotal = { amount: 3000, currency: 'EUR' };
const total = { amount: 3451, currency: 'EUR' };

describe('CartTotal', () => {
  it('renders supplied subtotal and total without calculating them', () => {
    render(<CartTotal subtotal={subtotal} total={total} locale="en" />);
    expect(screen.getByText('Subtotal')).toBeDefined();
    expect(screen.getByText('Total')).toBeDefined();
    expect(screen.getByText('€30.00')).toBeDefined();
    expect(screen.getByText('€34.51')).toBeDefined();
    expect(screen.queryByText('Discount')).toBeNull();
  });

  it('renders each supplied tax row', () => {
    render(<CartTotal subtotal={subtotal} total={total} locale="en" taxLines={[
      { label: 'VAT', amount: { amount: 400, currency: 'EUR' } },
      { label: 'Local tax', amount: { amount: 51, currency: 'EUR' } },
    ]} />);
    expect(screen.getByText('VAT')).toBeDefined();
    expect(screen.getByText('€4.00')).toBeDefined();
    expect(screen.getByText('Local tax')).toBeDefined();
    expect(screen.getByText('€0.51')).toBeDefined();
    expect(screen.getByText('€34.51')).toBeDefined();
  });

  it('shows positive discounts with a minus sign', () => {
    render(<CartTotal subtotal={subtotal} total={total} discount={{ amount: 250, currency: 'EUR' }} locale="en" />);
    expect(screen.getByText('Discount')).toBeDefined();
    expect(screen.getByText('−€2.50')).toBeDefined();
  });

  it.each([0, -100])('omits a discount of %i', (amount) => {
    render(<CartTotal subtotal={subtotal} total={total} discount={{ amount, currency: 'EUR' }} locale="en" />);
    expect(screen.queryByText('Discount')).toBeNull();
  });

  it('orders the rows Subtotal / Discount / Tax / Total, matching the receipt', () => {
    const { container } = render(<CartTotal subtotal={subtotal} total={total} discount={{ amount: 250, currency: 'EUR' }} locale="en"
      taxLines={[{ label: 'VAT', amount: { amount: 400, currency: 'EUR' } }]} />);
    const text = container.textContent ?? '';
    const positions = ['Subtotal', 'Discount', 'VAT', 'Total'].map((label) => text.indexOf(label));
    expect(positions.every((position) => position >= 0)).toBe(true);
    expect([...positions].sort((a, b) => a - b)).toEqual(positions);
  });

  it('labels tax rows as included, not added, when taxInclusive', () => {
    render(<CartTotal subtotal={subtotal} total={total} locale="en" taxInclusive
      taxLines={[{ label: 'VAT 19%', amount: { amount: 479, currency: 'EUR' } }]} />);
    expect(screen.getByText('incl. VAT 19%')).toBeDefined();
    expect(screen.queryByText('VAT 19%')).toBeNull();
  });

  it('renders supplied zero amounts', () => {
    render(<CartTotal subtotal={{ amount: 0, currency: 'EUR' }} total={{ amount: 0, currency: 'EUR' }} locale="en" />);
    expect(screen.getAllByText('€0.00')).toHaveLength(2);
  });
});
