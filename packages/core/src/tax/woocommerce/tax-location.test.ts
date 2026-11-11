import { describe, expect, it } from 'vitest';
import { normalizeTaxBasedOn, orderTaxLocation, TAX_BASED_ON_META_KEY } from './tax-location';
import type { TaxAddress } from './tax-location';

const base: TaxAddress = { country: 'US', state: 'OR', city: 'Portland', postcode: '97201' };
const billing = { country: 'US', state: 'CA', city: 'Beverly Hills', postcode: '90210' };
const shipping = { country: 'GB', state: '', city: 'London', postcode: 'SW1A 1AA' };

describe('orderTaxLocation', () => {
	it('uses the shop base without an order, whatever the setting', () => {
		for (const setting of ['base', 'billing', 'shipping']) {
			expect(orderTaxLocation(base, setting)).toEqual({ taxBasedOn: setting, location: base, addressUsed: 'base' });
		}
	});

	it('shipping uses shipping, then billing, then the shop base', () => {
		expect(orderTaxLocation(base, 'shipping', { billing, shipping })).toEqual({ taxBasedOn: 'shipping', location: shipping, addressUsed: 'shipping' });
		expect(orderTaxLocation(base, 'shipping', { billing, shipping: { country: '' } })).toEqual({ taxBasedOn: 'shipping', location: billing, addressUsed: 'billing' });
		expect(orderTaxLocation(base, 'shipping', {})).toEqual({ taxBasedOn: 'shipping', location: base, addressUsed: 'base' });
	});

	it('billing with only a shipping address uses the shop base, not shipping', () => {
		expect(orderTaxLocation(base, 'billing', { shipping })).toEqual({ taxBasedOn: 'billing', location: base, addressUsed: 'base' });
		expect(orderTaxLocation(base, 'billing', { billing, shipping })).toEqual({ taxBasedOn: 'billing', location: billing, addressUsed: 'billing' });
	});

	it('base ignores the order addresses', () => {
		expect(orderTaxLocation(base, 'base', { billing, shipping })).toEqual({ taxBasedOn: 'base', location: base, addressUsed: 'base' });
	});

	it('a valid override beats the store setting; an invalid one is ignored', () => {
		expect(orderTaxLocation(base, 'shipping', { billing, shipping, taxBasedOnOverride: 'billing' }))
			.toEqual({ taxBasedOn: 'billing', location: billing, addressUsed: 'billing' });
		expect(orderTaxLocation(base, 'shipping', { billing, shipping, taxBasedOnOverride: 'foo' }))
			.toEqual({ taxBasedOn: 'shipping', location: shipping, addressUsed: 'shipping' });
		expect(TAX_BASED_ON_META_KEY).toBe('_woocommerce_pos_tax_based_on');
	});

	it('turns non-string fields into empty strings, and counts an empty country as missing', () => {
		expect(orderTaxLocation(base, 'billing', { billing: { country: 'AU', state: null, city: 42, postcode: undefined } }).location)
			.toEqual({ country: 'AU', state: '', city: '', postcode: '' });
		expect(orderTaxLocation(base, 'billing', { billing: { country: '', state: 'CA', city: 'LA', postcode: '90001' } }))
			.toEqual({ taxBasedOn: 'billing', location: base, addressUsed: 'base' });
		expect(orderTaxLocation(base, 'shipping', { shipping: { country: 7 }, billing: { country: null } }).addressUsed).toBe('base');
	});
});

describe('normalizeTaxBasedOn', () => {
	it("gives 'base' for anything but the three values", () => {
		for (const value of [undefined, '', 'Base', 42, null]) expect(normalizeTaxBasedOn(value)).toBe('base');
		for (const value of ['base', 'billing', 'shipping']) expect(normalizeTaxBasedOn(value)).toBe(value);
	});

	it('normalizes the store setting through it', () => {
		expect(orderTaxLocation(base, 'Shipping', { shipping })).toEqual({ taxBasedOn: 'base', location: base, addressUsed: 'base' });
	});
});
