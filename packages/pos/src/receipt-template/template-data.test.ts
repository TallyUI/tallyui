import { formatMoney } from '@tallyui/core';
import { expect, it } from 'vitest';
import { createOrderBuilder } from '../order/order-builder';
import { buildReceiptData } from '../receipt/build-receipt-data';
import { receiptTemplateData } from './template-data';

it('R7 replaces the tax rows with one formatted Tax exempt row', () => {
  const builder = createOrderBuilder({ currency: 'EUR', taxContext: { pricesIncludeTax: false, getTaxRatePpm: () => 190000 } });
  builder.addLine({ name: 'Item', productId: 'p', unitPrice: { amount: 1000, currency: 'EUR' } }); // 1 × €10
  builder.setTaxExempt(true);
  const receipt = buildReceiptData(builder.getSnapshot(), { storeName: 'Shop' });
  const data = receiptTemplateData(receipt);
  expect(data.taxes).toEqual([{ label: 'Tax exempt', amount: formatMoney({ amount: 0, currency: receipt.currency }) }]); // 1000 × 0%
});

it('G4 keeps the charged tax rows even when receipt totals say exempt', () => {
  const builder = createOrderBuilder({ currency: 'EUR', taxContext: { pricesIncludeTax: false, getTaxRatePpm: () => 190000 } });
  builder.addLine({ name: 'Item', productId: 'p', unitPrice: { amount: 1000, currency: 'EUR' } }); // 1 × €10, 1000 × 19% = 190 tax
  const receipt = buildReceiptData(builder.getSnapshot(), { storeName: 'Shop' });
  const { taxes } = receiptTemplateData({ ...receipt, totals: { ...receipt.totals, taxExempt: true as const } });
  expect(receipt.totals.taxLines.length).toBeGreaterThan(0);
  expect(taxes).toHaveLength(receipt.totals.taxLines.length);
  expect(taxes.map((tax) => tax.label)).not.toContain('Tax exempt');
});
