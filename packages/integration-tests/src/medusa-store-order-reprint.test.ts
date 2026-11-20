import { describe, expect, it } from 'vitest';
import { toMedusaStoreOrder } from '@tallyui/connector-medusa';
import { buildReceiptDataFromStoreOrder, type ReceiptConfig } from '@tallyui/pos';
import fixture from '../../../connectors/medusa/src/orders.fixture.json';

const config: ReceiptConfig = { storeName: 'Test Store', storeAddress: '1 Main St', cashier: 'Bob', register: 'POS-1' };
const total = (rows: Array<{ amountMinor: number }>) => rows.reduce((sum, row) => sum + row.amountMinor, 0);

describe('a Medusa store order reprints with balanced totals', () => {
  it.each(fixture.list.body.orders.map((raw) => [raw.display_id, raw] as const))('order #%s', (_display, raw) => {
    const storeOrder = toMedusaStoreOrder(raw);
    const receipt = buildReceiptDataFromStoreOrder(storeOrder, config);
    expect(receipt.fiscal.is_reprint).toBe(true);
    const { totals } = receipt;
    expect(totals.totalMinor).toBe(storeOrder.totalMinor);
    expect(totals.subtotalMinor - totals.discountMinor + total(receipt.fees) + total(receipt.shipping) + total(totals.taxLines))
      .toBe(totals.totalMinor);
  });
});
