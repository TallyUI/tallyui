import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PortalHost } from '@tallyui/primitives';
import type { TaxDerivation } from '@tallyui/pos';
import { TaxBasedOn, type TaxBasedOnProps } from '../tax';

afterEach(cleanup);

const sydney = { country: 'AU', state: 'NSW', city: 'Sydney', postcode: '2000' };
const base: TaxDerivation = {
  taxBasedOn: 'base', addressUsed: 'base', fromOrder: false, location: sydney, fallback: null, failure: null, noRateCause: null,
  classes: [
    { slug: 'standard', name: 'Standard', percent: '10%', rates: [{ id: 1, name: 'GST', percent: '10%', why: { field: 'country', country: 'AU' } }] },
    { slug: 'reduced-rate', name: 'Reduced rate', percent: '5.04%', rates: [
      { id: 4, name: 'NY State', percent: '4%', why: { field: 'state' } },
      { id: 5, name: 'NY Local', percent: '1%', why: { field: 'postcode', pattern: '90*, 100*' } }] },
  ],
};
const failed = (extra: Partial<TaxDerivation>): TaxDerivation => ({ ...base, failure: 'rates', classes: [], ...extra });

function open(derivation: TaxDerivation, props: Partial<TaxBasedOnProps> = {}) {
  render(<><TaxBasedOn derivation={derivation} {...props} /><PortalHost /></>);
  fireEvent.click(screen.getByTestId('tax-based-on-trigger'));
}
const state = (n: number) => screen.getByTestId(`tax-based-on-step-${n}`).getAttribute('data-state');
const step = (n: number) => screen.getByTestId(`tax-based-on-step-${n}`).textContent;

describe('TaxBasedOn', () => {
  it('the trigger shows the value label, names the setting, and opens nothing until pressed', () => {
    render(<><TaxBasedOn derivation={base} /><PortalHost /></>);
    const trigger = screen.getByTestId('tax-based-on-trigger');
    expect(trigger.getAttribute('aria-label')).toBe('Tax based on: Shop base address');
    expect(screen.getByTestId('tax-based-on-value').textContent).toBe('Shop base');
    expect(screen.getByTestId('tax-based-on-percent')).toBeTruthy();
    expect(screen.queryByTestId('tax-based-on-warning')).toBeNull();
    expect(screen.getByTestId('tax-based-on-trigger').getAttribute('data-tone')).toBe('normal');
    expect(screen.queryByTestId('tax-based-on-content')).toBeNull();
  });

  it('with no classes the trigger warns in the bad tone', () => {
    render(<TaxBasedOn derivation={failed({ taxBasedOn: 'shipping' })} />);
    expect(screen.getByTestId('tax-based-on-warning')).toBeTruthy();
    expect(screen.queryByTestId('tax-based-on-percent')).toBeNull();
    expect(screen.getByTestId('tax-based-on-trigger').getAttribute('data-tone')).toBe('bad');
    expect(screen.getByTestId('tax-based-on-value').textContent).toBe('Customer shipping address');
  });

  it('opens on the derivation: the setting, the shop address, and each class and rate with its why', () => {
    open(base);
    expect(screen.getByTestId('tax-based-on-content')).toBeTruthy();
    expect([state(1), state(2), state(3)]).toEqual(['fact', 'fact', 'result']);
    expect(step(1)).toBe('Calculated fromShop base address');
    expect(step(2)).toContain('Shop addressSydney NSW 2000, Australia (AU)');
    expect(screen.getByTestId('tax-based-on-field-country').textContent).toBe('AU');
    expect(screen.getByTestId('tax-based-on-field-city').textContent).toBe('Sydney');
    expect(screen.getByTestId('tax-based-on-class-standard').textContent).toBe('Standard10%');
    expect(screen.getByTestId('tax-based-on-rate-1').textContent).toBe('GST · anywhere in Australia (AU)10%');
    expect(screen.getByTestId('tax-based-on-class-reduced-rate').textContent).toBe('Reduced rate5.04%');
    expect(screen.getByTestId('tax-based-on-rate-4').textContent).toBe('NY State · state4%');
    expect(screen.getByTestId('tax-based-on-rate-5').textContent).toBe('NY Local · postcode 90*, 100*1%');
  });

  it("an order address says so; an empty field shows —; countryName overrides Intl", () => {
    open({ ...base, taxBasedOn: 'shipping', addressUsed: 'shipping', fromOrder: true,
      location: { country: 'US', state: 'OR', city: '', postcode: '97201' },
      classes: [{ slug: 'standard', name: 'Standard', percent: '0%', rates: [{ id: 2, name: 'Any', percent: '0%', why: { field: 'anywhere' } }] }],
    }, { countryName: (code) => `Land ${code}` });
    expect(step(2)).toContain('Address on the orderOR 97201, Land US');
    expect(screen.getByTestId('tax-based-on-field-city').textContent).toBe('—');
    expect(screen.getByTestId('tax-based-on-rate-2').textContent).toBe('Any · anywhere0%');
  });

  it.each([
    ['shipping-to-billing', 'shipping', 'This order has no shipping address, so tax uses the billing address'],
    ['shipping-to-shop', 'shipping', 'This order has no shipping or billing address, so tax uses the shop address'],
    ['billing-to-shop', 'billing', 'This order has no billing address, so tax uses the shop address'],
  ] as const)('the %s fallback shows its note', (fallback, taxBasedOn, note) => {
    open({ ...base, taxBasedOn, fallback });
    expect(step(2)).toContain(note);
  });

  it.each([['shipping', 'This order has no shipping address, so no rate can match'],
    ['billing', 'This order has no billing address, so no rate can match']] as const)(
    'an address failure on %s fails step 2 and quiets step 3', (taxBasedOn, title) => {
      open(failed({ taxBasedOn, failure: 'address', location: { country: '', state: '', city: '', postcode: '' } }));
      expect([state(2), state(3)]).toEqual(['failed', 'quiet']);
      expect(step(2)).toContain(`No address on the order${title}Add a customer with an address, or change the setting`);
      expect(screen.getByTestId('tax-based-on-field-postcode').textContent).toBe('—');
      expect(step(3)).toBe('Rates that match itNone');
    });

  it.each([
    ['no-country', 'The store has no tax rate for this address'],
    ['not-covered', "The store's rates for Australia (AU) don't cover this address"],
    ['no-rate-for-country', 'The store has no tax rate for Australia (AU)'],
  ] as const)('a %s rate failure fails step 3 with its title', (noRateCause, title) => {
    open(failed({ noRateCause }));
    expect([state(2), state(3)]).toEqual(['fact', 'failed']);
    expect(step(3)).toBe(`No rate matches it${title}Add one in WooCommerce › Tax, or change the setting`);
  });

  it('"Change in Settings › Tax" calls onChangeSetting, and is absent without it', () => {
    const onChangeSetting = vi.fn();
    open(base, { onChangeSetting });
    const link = screen.getByTestId('tax-based-on-change-setting');
    expect(link.textContent).toBe('Change in Settings › Tax');
    fireEvent.click(link);
    expect(onChangeSetting).toHaveBeenCalledTimes(1);
    cleanup();
    open(base);
    expect(screen.queryByTestId('tax-based-on-change-setting')).toBeNull();
  });

  it('"View all tax rates" closes the popover, then calls onViewAllRates; absent without it', () => {
    const onViewAllRates = vi.fn();
    open(base, { onViewAllRates });
    const button = screen.getByTestId('tax-based-on-view-all');
    expect(button.textContent).toContain('View all tax rates');
    fireEvent.click(button);
    expect(onViewAllRates).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId('tax-based-on-content')).toBeNull();
    cleanup();
    open(base);
    expect(screen.queryByTestId('tax-based-on-view-all')).toBeNull();
  });
});
