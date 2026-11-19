// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { createRxDatabase } from 'rxdb';
import { getRxStorageMemory } from 'rxdb/plugins/storage-memory';
import { wrappedValidateAjvStorage } from 'rxdb/plugins/validate-ajv';
import { toWooOrderPayload } from '@tallyui/connector-woocommerce';
import { createOrderBuilder, finalizeOrder, posOrderCollection, toOrderCreateEnvelope } from '@tallyui/pos';
import type { PosOrder } from '@tallyui/pos';

// 2.10 PR4: an exclusive store, one standard 10% rate, one 30.00 line and a
// charge entered including tax. The store taxes the net it receives, so the sent net must re-tax to the till's figures.
const rates = [{ id: 1, code: 'STD', label: 'Standard', rate: '10.0000', compound: false, priority: 1, order: 1, shipping: true, class: 'standard' }];
const PERCENT = 10n;
interface WooBody { fee_lines?: { total: string }[]; shipping_lines?: { total: string }[] }

async function sale(kind: 'fee' | 'shipping', grossMinor: number) {
  const builder = createOrderBuilder({ currency: 'USD', taxContext: {
    pricesIncludeTax: false, rounding: { granularity: 'woocommerce', roundAtSubtotal: false },
    // Shipping inherits 'standard', a line carries ''; both are the standard class.
    getTaxRates: (taxClass, options) => rates.filter((rate) => rate.class === (taxClass || 'standard') && (!options?.shipping || rate.shipping)),
    getTaxRatePpm: () => 100000,
  } });
  builder.addLine({ productId: '328', name: 'Product', quantity: 1, unitPrice: { amount: 3000, currency: 'USD' }, taxClass: '' });
  const charge = { name: kind === 'fee' ? 'Fee' : 'Post', amountMinor: grossMinor, amountIncludesTax: true };
  if (kind === 'fee') builder.addFee(charge);
  else builder.addShipping(charge);
  builder.addPayment({ method: 'cash', amountMinor: builder.getSnapshot().totalMinor });
  const order = finalizeOrder(builder.getSnapshot(), { capabilities: { orderCreate: 8 } });
  const envelope = toOrderCreateEnvelope(order, 'device-charge-net', 1, { maxVersion: 8 });
  const db = await createRxDatabase({ name: `chargenet${Math.random().toString(36).slice(2)}`,
    storage: wrappedValidateAjvStorage({ storage: getRxStorageMemory() }), multiInstance: false });
  try {
    const { pos_orders: collection } = await db.addCollections({ pos_orders: posOrderCollection() });
    await collection.insert(order);
    const local = (await collection.findOne(order.id).exec())!.toJSON() as PosOrder;
    const result = toWooOrderPayload(envelope, local);
    if ('error' in result) throw new Error(result.error.message);
    const body = result.payload as WooBody;
    const stored = (kind === 'fee' ? local.fees : local.shipping)![0];
    const sentCharge = (kind === 'fee' ? envelope.payload.fees : envelope.payload.shipping)![0];
    return { order, envelope, stored, sentCharge, sent: (kind === 'fee' ? body.fee_lines : body.shipping_lines)![0].total };
  } finally {
    await db.remove();
  }
}

// Half up to cents from millionths of a major unit.
const microsToCents = (micros: bigint) => (micros + 5000n) / 10000n;
const toMicros = (text: string) => { const [whole, fraction = ''] = text.split('.'); return BigInt(whole) * 1000000n + BigInt(fraction.padEnd(6, '0')); };

describe('exclusive store, a charge entered including tax, sent at its 6-dp net (2.10 PR4)', () => {
  it.each(['fee', 'shipping'] as const)('%s of 10.50: the store re-taxes the sent net to the till\'s tax and total', async (kind) => {
    const { order, envelope, stored, sentCharge, sent } = await sale(kind, 1050);
    const cent = (stored.amountMinor / 100).toFixed(2);
    console.info(`${kind} 10.50 incl.: sent ${sent}, cent figure ${cent}, stored netMicros ${stored.netMicros}`);
    expect(stored.netMicros).toBeDefined();
    expect(sent).toMatch(/^\d+\.\d{6}$/);
    expect(sent).not.toBe(cent);

    const lineNetMicros = BigInt(envelope.payload.lines[0].unitPriceMinor) * 10000n;
    const lineTaxCents = microsToCents(lineNetMicros * PERCENT / 100n);
    const sentMicros = toMicros(sent);
    // WooCommerce: charge tax = calc_tax(sent net, 10%) rounded half up to cents.
    const chargeTaxCents = (sentMicros * PERCENT + 50n * 10000n) / (100n * 10000n);
    expect(chargeTaxCents).toBe(BigInt(sentCharge.taxMinor));
    // The cent figure the old code sent re-taxes to a different tax: the store's +0.01.
    expect((toMicros(cent) * PERCENT + 50n * 10000n) / (100n * 10000n)).not.toBe(chargeTaxCents);
    expect(BigInt(order.taxMinor)).toBe(lineTaxCents + chargeTaxCents);
    // calculate_totals: fees are summed raw, shipping is rounded to cents first; the total is rounded to cents.
    const chargeMicros = kind === 'fee' ? sentMicros : microsToCents(sentMicros) * 10000n;
    expect(BigInt(order.totalMinor)).toBe(microsToCents(lineNetMicros + lineTaxCents * 10000n + chargeMicros + chargeTaxCents * 10000n));
  });

  it.each(['fee', 'shipping'] as const)('%s of 11.00 including tax, a whole-cent net of 10.00, sends \'10.00\'', async (kind) => {
    const { stored, sent } = await sale(kind, 1100);
    expect(stored.netMicros).toBe('1000000000');
    expect(sent).toBe('10.00');
  });
});
