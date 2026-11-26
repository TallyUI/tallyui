// @vitest-environment node
import { expect, it } from 'vitest';
import { precheckCommand } from '@tallyui/core/server';
import { createOrderBuilder, finalizeOrder, toOrderCreateEnvelope } from '@tallyui/pos';

const supported = { orderCreate: Array.from({ length: 12 }, (_, index) => index + 1), register: [1], chargeTaxMode: true };

function sell(pricesIncludeTax: boolean) {
  const builder = createOrderBuilder({ currency: 'EUR', taxContext: { pricesIncludeTax, getTaxRatePpm: () => 250000 } });
  builder.addLine({ productId: 'p', name: 'Item', unitPrice: { amount: pricesIncludeTax ? 1000 : 800, currency: 'EUR' } });
  const charge = { amountMinor: pricesIncludeTax ? 800 : 1002, amountIncludesTax: !pricesIncludeTax, taxClass: 'standard' };
  builder.addFee({ name: 'Fee', ...charge });
  if (!pricesIncludeTax) builder.addShipping({ name: 'Shipping', ...charge });
  builder.addPayment({ method: 'cash', amountMinor: builder.getSnapshot().totalMinor });
  const order = finalizeOrder(builder.getSnapshot(), { capabilities: { orderCreate: 12, chargeTaxMode: true } });
  return toOrderCreateEnvelope(order, 'device-1383', 1, { maxVersion: 12 });
}

const exclusiveSale = sell(false);
it('I1 accepts gross fee and shipping on a tax-exclusive sale', () => {
  expect(exclusiveSale.payload.fees?.[0]).toMatchObject({ amountIncludesTax: true, amountMinor: 1002 });
  expect(precheckCommand(exclusiveSale, supported)).toBeUndefined();
});
it('I2 refuses the same envelope when the server disables chargeTaxMode', () => {
  expect(precheckCommand(exclusiveSale, { ...supported, chargeTaxMode: false })).toEqual({ id: exclusiveSale.id, status: 'rejected',
    error: { code: 'invalid_payload', message: 'amountIncludesTax requires the chargeTaxMode capability, which this server does not declare' } });
});
it('I3 accepts a net fee on a tax-inclusive sale', () => {
  expect(precheckCommand(sell(true), supported)).toBeUndefined();
});
