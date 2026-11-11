import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PortalHost } from '@tallyui/primitives';
import { TaxCalculationSettings, type TaxCalculationSettingsProps } from '../settings';

afterEach(cleanup);

function setup(props: Partial<TaxCalculationSettingsProps> = {}) {
  render(<><TaxCalculationSettings taxBasedOn="base" {...props} /><PortalHost /></>);
}
const trigger = () => screen.getByTestId('settings-tax-based-on');
const value = (id: string) => screen.getByTestId(`settings-tax-locked-${id}-value`).textContent;

describe('TaxCalculationSettings', () => {
  it('is the Calculation group, and offers the three bases in order', () => {
    setup({ onTaxBasedOnChange: vi.fn() });
    expect(screen.getByText('Calculation')).toBeTruthy();
    expect(screen.getByText('Calculate tax based on')).toBeTruthy();
    expect(trigger().textContent).toContain('Shop base address');
    fireEvent.click(trigger());
    expect(screen.getAllByRole('option').map((option) => option.textContent)).toEqual([
      'Customer shipping address', 'Customer billing address', 'Shop base address']);
  });

  it('choosing "Customer billing address" calls onTaxBasedOnChange("billing")', () => {
    const onTaxBasedOnChange = vi.fn();
    setup({ onTaxBasedOnChange });
    fireEvent.click(trigger());
    fireEvent.click(screen.getByTestId('settings-tax-based-on-billing'));
    expect(onTaxBasedOnChange).toHaveBeenCalledExactlyOnceWith('billing');
  });

  it('choosing the option already selected does not call onTaxBasedOnChange', () => {
    const onTaxBasedOnChange = vi.fn();
    setup({ taxBasedOn: 'billing', onTaxBasedOnChange });
    fireEvent.click(trigger());
    fireEvent.click(screen.getByTestId('settings-tax-based-on-billing'));
    expect(onTaxBasedOnChange).not.toHaveBeenCalled();
  });

  it('without the callback the select is disabled, still shows its value, and does not open', () => {
    setup();
    expect(trigger().getAttribute('aria-disabled')).toBe('true');
    expect(trigger().textContent).toContain('Shop base address');
    fireEvent.click(trigger());
    expect(screen.queryAllByRole('option')).toHaveLength(0);
  });

  it('shows the placeholder for no matching value', () => {
    setup({ taxBasedOn: 'nope' as TaxCalculationSettingsProps['taxBasedOn'] });
    expect(trigger().textContent).toContain('Select tax based on');
  });

  it('the locked rows show their values; inherit is "Based on cart items", a slug its class name', () => {
    setup({ pricesIncludeTax: true, shippingTaxClass: 'inherit', taxRoundAtSubtotal: false });
    expect(value('prices_include_tax')).toBe('Yes');
    expect(value('shipping_tax_class')).toBe('Based on cart items');
    expect(value('tax_round_at_subtotal')).toBe('No');
    expect(screen.getByTestId('settings-tax-locked-prices_include_tax').textContent).toContain('Prices entered with tax');
    expect(screen.getByTestId('settings-tax-locked-tax_round_at_subtotal').textContent).toContain('Round tax at subtotal level');
    expect(screen.getAllByText('Set in WooCommerce')).toHaveLength(3);
    expect(screen.queryAllByRole('link')).toHaveLength(0);
    cleanup();
    setup({ shippingTaxClass: 'reduced-rate' });
    expect(value('shipping_tax_class')).toBe('Reduced rate');
    cleanup();
    setup({ shippingTaxClass: 'standard' });
    expect(value('shipping_tax_class')).toBe('Standard');
  });

  it('a row whose prop is undefined is absent', () => {
    setup({ pricesIncludeTax: false });
    expect(screen.getByTestId('settings-tax-locked-prices_include_tax')).toBeTruthy();
    expect(screen.queryByTestId('settings-tax-locked-shipping_tax_class')).toBeNull();
    expect(screen.queryByTestId('settings-tax-locked-tax_round_at_subtotal')).toBeNull();
  });

  it('"Set in WooCommerce" is a link that calls onOpenStoreTaxSettings when given', () => {
    const onOpenStoreTaxSettings = vi.fn();
    setup({ pricesIncludeTax: true, taxRoundAtSubtotal: true, onOpenStoreTaxSettings });
    const links = screen.getAllByRole('link', { name: 'Set in WooCommerce' });
    expect(links).toHaveLength(2);
    fireEvent.click(links[1]);
    expect(onOpenStoreTaxSettings).toHaveBeenCalledTimes(1);
  });
});
