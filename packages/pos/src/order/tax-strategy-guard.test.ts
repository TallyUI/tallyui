import { execFileSync } from 'node:child_process';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { TaxRounding } from '@tallyui/core';
import type { createOrderBuilder } from './order-builder';

const guard = vi.hoisted(() => ({ throwing: false }));
vi.mock('@tallyui/core', async (importOriginal) => {
  const core = await importOriginal<typeof import('@tallyui/core')>();
  return { ...core, woocommerceTax: Object.fromEntries(Object.entries(core.woocommerceTax).map(([name, value]) =>
    [name, typeof value !== 'function' ? value : (...args: unknown[]) => {
      if (guard.throwing) throw new Error(`Unexpected WooCommerce tax call: ${name}`);
      return (value as (...args: unknown[]) => unknown)(...args);
    }])) };
});

afterEach(() => { guard.throwing = false; vi.useRealTimers(); vi.resetModules(); });

function build(create: typeof createOrderBuilder, rounding: TaxRounding, inclusive: boolean, mixed: boolean) {
  const builder = create({ id: 'byte-identity', currency: 'EUR', taxContext: {
    pricesIncludeTax: inclusive, rounding,
    getTaxRatePpm: (taxClass) => taxClass === 'reduced' ? 120000 : 200000,
    getTaxRateCode: (taxClass) => taxClass === 'reduced' ? 'Reduced' : 'VAT',
    getTaxRates: () => { throw new Error('Non-WooCommerce strategies must not look up Woo rates'); },
  } });
  const first = builder.addLine({ productId: 'a', name: 'A', unitPrice: { amount: 999, currency: 'EUR' }, quantity: 3 });
  builder.addLine({ productId: 'b', name: 'B', unitPrice: { amount: 333, currency: 'EUR' }, taxClass: 'reduced', quantity: 2 });
  builder.addLine({ productId: 'c', name: 'C', unitPrice: { amount: 201, currency: 'EUR', taxInclusive: mixed ? !inclusive : inclusive },
    taxRates: [{ code: 'City', ratePpm: 100000 }, { code: 'State', ratePpm: 50000 }] });
  builder.applyLineDiscount(first, { type: 'percentage', value: 13, label: 'Line discount' });
  builder.applyOrderDiscount({ type: 'fixed', value: 101, label: 'Order discount' });
  builder.addFee({ name: 'Fee', amountMinor: 17, taxClass: 'reduced' });
  builder.addShipping({ name: 'Post', amountMinor: 105, methodId: 'post' });
  builder.addPayment({ method: 'cash', amountMinor: 5000 });
  return builder.getSnapshot();
}

describe.each(['per_order', 'per_line_items', 'per_rate_group_items'] as const)('%s stays in the integer path', (granularity) => {
  it.each([[false, false], [true, false], [false, true], [true, true]])('has a byte-identical snapshot with every Woo export throwing (inclusive: %s, mixed: %s)', async (inclusive, mixed) => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-06T12:00:00Z'));
    const rounding: TaxRounding = { granularity, mode: 'half_away_from_zero' };
    vi.resetModules();
    const actual = await import('./order-builder');
    const before = build(actual.createOrderBuilder, rounding, inclusive, mixed);
    const beforeReceipt = (await import('../receipt/build-receipt-data')).buildReceiptData(before, { storeName: 'Guard' });
    guard.throwing = true;
    vi.resetModules();
    const core = await import('@tallyui/core');
    for (const [name, value] of Object.entries(core.woocommerceTax)) {
      if (typeof value === 'function') expect(() => (value as () => unknown)()).toThrow(`Unexpected WooCommerce tax call: ${name}`);
    }
    const mocked = await import('./order-builder');
    const after = build(mocked.createOrderBuilder, rounding, inclusive, mixed);
    expect(after).toStrictEqual(before);
    expect(JSON.stringify(after)).toBe(JSON.stringify(before));
    expect((await import('../receipt/build-receipt-data')).buildReceiptData(after, { storeName: 'Guard' })).toStrictEqual(beforeReceipt);
  });
});

it('leaves every existing golden test unchanged from the job base', () => {
  const changed = execFileSync('git', ['diff', '--name-only', '65db5d05f97da12fa7c5409e86947020046ae4a4', '--'], { encoding: 'utf8' });
  expect(changed.split('\n').filter((file) => /\.test\.[cm]?[jt]sx?$/.test(file)
    && !['packages/pos/src/order/woocommerce-tax.test.ts', 'packages/pos/src/order/tax-strategy-guard.test.ts'].includes(file))).toEqual([]);
});
