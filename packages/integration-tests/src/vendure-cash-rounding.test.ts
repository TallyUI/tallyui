// @vitest-environment node
import { afterEach, expect, it, vi } from 'vitest';
import { createVendureConnector } from '@tallyui/connector-vendure';
import { paymentMethodOf } from '@tallyui/core';
import { changeMinor, createOrderBuilder, finalizeOrder, tenderRounding, toOrderCreateEnvelope } from '@tallyui/pos';

const INFO = { contracts: { 'order.create': [1, 10, 11], 'order.refund': [1], register: [1] },
  taxRounding: { granularity: 'per_rate_group_items', mode: 'half_up' }, coupons: true };
afterEach(() => vi.restoreAllMocks());

async function sale(advertised: boolean) {
  const baseUrl = 'https://shop.example.com', headers = { Authorization: 'Bearer t' };
  const fetch = vi.spyOn(globalThis, 'fetch').mockResolvedValue(Response.json(advertised ? { ...INFO, cashRounding: { v: 1 } } : INFO));
  const capabilities = (await createVendureConnector({ pricesIncludeTax: false }).capabilities!({
    connectorId: 'vendure', baseUrl, headers, signal: new AbortController().signal,
  }))!;
  expect(fetch).toHaveBeenCalledExactlyOnceWith(`${baseUrl}/tally/v1/info`, expect.objectContaining({ headers }));
  expect(capabilities).toMatchObject({ orderCreate: 11, taxRounding: INFO.taxRounding });
  if (advertised) expect(capabilities.cashRounding).toBe(true);
  else expect(capabilities).not.toHaveProperty('cashRounding');
  const builder = createOrderBuilder({ currency: 'EUR', taxContext: { getTaxRatePpm: () => 190000, pricesIncludeTax: false } });
  builder.addLine({ productId: 'p', name: 'Item', unitPrice: { amount: 800, currency: 'EUR' } });
  builder.addFee({ name: 'Service', amountMinor: 100 });
  builder.addShipping({ name: 'Courier', amountMinor: 200 });
  expect(builder.getSnapshot().totalMinor).toBe(1309);
  return { builder, capabilities };
}

const register = { registerId: 'register-1', cashierRef: 'cashier@example.com' };
it.each([
  ['R1', 'nearest', 2000, 1310, 1, 690],
  ['R2', 'down', 1305, 1305, -4, 0],
  ['R3', null, 2000, 1309, 0, 691],
] as const)('%s finalizes and sends the cash sale (%s)', async (_row, mode, tenderedMinor, totalMinor, minor, change) => {
  const { builder, capabilities } = await sale(mode !== null);
  if (capabilities.cashRounding && mode) {
    const cash = paymentMethodOf('cash');
    cash.defaults.rounding = { incrementMinor: 5, mode };
    const leg = tenderRounding({ entryMinor: 1309, entryDirty: false }, 1309, cash);
    builder.addPayment({ method: 'cash', methodId: 'cash', amountMinor: leg.appliedMinor, tenderedMinor,
      changeMinor: changeMinor(tenderedMinor, leg.appliedMinor, true) }, leg.roundingMinor !== 0 ? { minor: leg.roundingMinor } : undefined);
  } else {
    builder.addPayment({ method: 'cash', methodId: 'cash', amountMinor: 1309, tenderedMinor, changeMinor: changeMinor(tenderedMinor, 1309, true) });
  }
  const order = finalizeOrder(builder.getSnapshot(), { ...register, capabilities });
  const { payload } = toOrderCreateEnvelope(order, 'device-1', 1, { maxVersion: capabilities.orderCreate });
  for (const result of [order, payload]) {
    expect(result).toMatchObject({ totalMinor, payments: [{ amountMinor: totalMinor, tenderedMinor, changeMinor: change }] });
    if (minor !== 0) expect(result.cashRoundings).toEqual([{ paymentId: order.payments[0].id, minor }]);
    else expect(result).not.toHaveProperty('cashRoundings');
  }
});

it('R4 refuses a hand-built rounded sale without the capability', async () => {
  const { builder, capabilities } = await sale(false);
  builder.addPayment({ method: 'cash', methodId: 'cash', amountMinor: 1310 }, { minor: 1 });
  expect(() => finalizeOrder(builder.getSnapshot(), { ...register, capabilities })).toThrow(
    'finalize: cash rounding needs a store whose connector declares the cashRounding capability');
});
