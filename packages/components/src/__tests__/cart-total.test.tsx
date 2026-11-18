import { describe, it, expect } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { Text } from 'react-native';
import { formatMoney } from '@tallyui/core';
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

  it('renders Fees and Shipping rows between Discount and the tax rows, as WCPOS v2', () => {
    const { container } = render(<CartTotal subtotal={subtotal} total={total} discount={{ amount: 250, currency: 'EUR' }} locale="en"
      fees={{ amount: 120, currency: 'EUR' }} shipping={{ amount: 240, currency: 'EUR' }}
      taxLines={[{ label: 'VAT', amount: { amount: 400, currency: 'EUR' } }]} />);
    expect(within(screen.getByTestId('cart-total-fees')).getByText('Fees')).toBeDefined();
    expect(within(screen.getByTestId('cart-total-fees')).getByText('€1.20')).toBeDefined();
    expect(within(screen.getByTestId('cart-total-shipping')).getByText('Shipping')).toBeDefined();
    expect(within(screen.getByTestId('cart-total-shipping')).getByText('€2.40')).toBeDefined();
    const text = container.textContent ?? '';
    const positions = ['Subtotal', 'Discount', 'Fees', 'Shipping', 'VAT', 'Total'].map((label) => text.indexOf(label));
    expect(positions.every((position) => position >= 0)).toBe(true);
    expect([...positions].sort((a, b) => a - b)).toEqual(positions);
  });

  it.each([undefined, 0])('omits the Fees and Shipping rows for %s', (amount) => {
    const charge = amount === undefined ? undefined : { amount, currency: 'EUR' };
    render(<CartTotal subtotal={subtotal} total={total} locale="en" fees={charge} shipping={charge} />);
    expect(screen.queryByText('Fees')).toBeNull();
    expect(screen.queryByText('Shipping')).toBeNull();
  });

  it('shows a negative fee, as WCPOS v2 shows any non-zero fee', () => {
    render(<CartTotal subtotal={subtotal} total={total} locale="en" fees={{ amount: -100, currency: 'EUR' }} />);
    const row = screen.getByTestId('cart-total-fees');
    expect(within(row).getByText(formatMoney({ amount: -100, currency: 'EUR' }, 'en')!)).toBeDefined();
  });

  it('renders afterSubtotal between Subtotal and Discount', () => {
    render(<CartTotal subtotal={subtotal} total={total} discount={{ amount: 250, currency: 'EUR' }} locale="en"
      afterSubtotal={<Text testID="coupon-row">SAVE10</Text>} />);
    const label = screen.getByText('Subtotal');
    const slot = screen.getByText('SAVE10');
    const discountLabel = screen.getByText('Discount');
    expect(label.compareDocumentPosition(slot) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(slot.compareDocumentPosition(discountLabel) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('tags tax rows as included, not added, when taxInclusive', () => {
    render(<CartTotal subtotal={subtotal} total={total} locale="en" taxInclusive
      taxLines={[{ label: 'VAT 19%', amount: { amount: 479, currency: 'EUR' } }]} />);
    expect(screen.getByText('VAT 19%')).toBeDefined();
    expect(screen.getByText('Including tax')).toBeDefined();
    expect(screen.queryByText('incl. VAT 19%')).toBeNull();
  });

  const twoTaxLines = [
    { label: 'VAT 19%', amount: { amount: 479, currency: 'EUR' } },
    { label: 'Local tax', amount: { amount: 51, currency: 'EUR' } },
  ];

  it('keeps each tax label as passed and tags it "Including tax" when taxInclusive, as WCPOS v2', () => {
    render(<CartTotal subtotal={subtotal} total={total} locale="en" taxInclusive taxLines={twoTaxLines} />);
    const row = within(screen.getByTestId('cart-total-tax-0'));
    expect(row.getByText('VAT 19%')).toBeDefined();
    expect(row.getByText('Including tax')).toBeDefined();
    expect(row.getByText('€4.79')).toBeDefined();
    expect(screen.queryByText(/incl\. VAT 19%/)).toBeNull();
  });

  it('tags tax rows "Excluding tax" when taxInclusive is false', () => {
    render(<CartTotal subtotal={subtotal} total={total} locale="en" taxInclusive={false} taxLines={twoTaxLines} />);
    expect(within(screen.getByTestId('cart-total-tax-0')).getByText('Excluding tax')).toBeDefined();
    expect(screen.queryByText('Including tax')).toBeNull();
  });

  it('draws no tax tag when taxInclusive is absent', () => {
    render(<CartTotal subtotal={subtotal} total={total} locale="en" taxLines={twoTaxLines} />);
    expect(screen.queryByText('Including tax')).toBeNull();
    expect(screen.queryByText('Excluding tax')).toBeNull();
    expect(within(screen.getByTestId('cart-total-tax-0')).getByText('VAT 19%')).toBeDefined();
  });

  it('tags every tax row and no other row', () => {
    render(<CartTotal subtotal={subtotal} total={total} locale="en" taxInclusive taxLines={twoTaxLines} />);
    expect(screen.getAllByText('Including tax')).toHaveLength(2);
    expect(within(screen.getByText('Subtotal').parentElement!).queryByText('Including tax')).toBeNull();
  });

  it('renders supplied zero amounts', () => {
    render(<CartTotal subtotal={{ amount: 0, currency: 'EUR' }} total={{ amount: 0, currency: 'EUR' }} locale="en" />);
    expect(screen.getAllByText('€0.00')).toHaveLength(2);
  });
});
