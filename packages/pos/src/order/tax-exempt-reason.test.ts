import { expect, it } from 'vitest';
import { finalizeOrder, withSentForm } from '../pos-order/finalize';
import { createOrderBuilder, normalizeTaxExemptReason, restoreOrderDraft } from './index';

const options = { currency: 'USD', taxContext: { pricesIncludeTax: false, getTaxRatePpm: () => 100000 } };
const reason = { text: 'Charity', certificateId: 'ST5-0042' };

it.each([
  [null, null],
  [{}, null],
  [{ text: '  ' }, null],
  [{ text: ' Charity ' }, { text: 'Charity' }],
  [{ text: 'Charity', certificateId: '  ' }, { text: 'Charity' }],
  [{ text: '\u0000', certificateId: 'ST5' }, 'needs_text'],
  [{ text: ' Charity\u0000', certificateId: ' ST5-0042 ' }, reason],
  [{ text: 'A'.repeat(201), certificateId: ' ST\u00005 ' }, { text: 'A'.repeat(201), certificateId: 'ST5' }],
] as const)('normalizes exemption reason %#', (input, expected) => {
  expect(normalizeTaxExemptReason(input)).toStrictEqual(expected);
});

it('keeps a copy only on the exempt snapshot, without changing the figures or note', () => {
  const builder = createOrderBuilder(options);
  builder.addLine({ productId: '1', name: 'Shirt', unitPrice: { currency: 'USD', amount: 1000 } });
  builder.setNote('Collect at counter');
  expect(() => builder.setTaxExemptReason(reason)).toThrow('A tax-exempt reason needs a tax-exempt sale');
  builder.setTaxExempt(true);
  const before = builder.getSnapshot(), input = { ...reason };
  builder.setTaxExemptReason(input);
  input.text = 'Changed';
  const snapshot = builder.getSnapshot();
  expect(snapshot.taxExemptReason).toStrictEqual(reason);
  expect(snapshot.exemptedFrom).not.toHaveProperty('taxExemptReason');
  expect(snapshot).toMatchObject({ totalMinor: before.totalMinor, subtotalMinor: before.subtotalMinor,
    taxMinor: before.taxMinor, display: before.display, note: before.note });
  builder.setTaxExemptReason(null);
  expect(builder.getSnapshot()).not.toHaveProperty('taxExemptReason');
  builder.setTaxExemptReason(reason);
  builder.setTaxExempt(false);
  expect(builder.getSnapshot()).not.toHaveProperty('taxExemptReason');
  builder.setTaxExempt(true);
  expect(builder.getSnapshot()).not.toHaveProperty('taxExemptReason');
  builder.setTaxExemptReason(reason);
  builder.clear();
  builder.setTaxExempt(true);
  expect(builder.getSnapshot()).not.toHaveProperty('taxExemptReason');
});

it('restores a reason from the serialized exempt draft only', () => {
  const builder = createOrderBuilder(options);
  const restore = () => restoreOrderDraft(JSON.parse(JSON.stringify(builder.getSnapshot())), options).getSnapshot();
  expect(restore()).not.toHaveProperty('taxExemptReason');
  builder.setTaxExempt(true);
  builder.setTaxExemptReason(reason);
  expect(restore().taxExemptReason).toStrictEqual(reason);
});

it('uses only the frozen tax-exempt reason in the sent form', () => {
  const builder = createOrderBuilder(options);
  builder.addLine({ productId: '1', name: 'Shirt', unitPrice: { currency: 'USD', amount: 1000 } });
  builder.setTaxExempt(true);
  builder.addPayment({ method: 'cash', amountMinor: builder.getSnapshot().totalMinor });
  for (const text of [`  ${'a'.repeat(300)}  `, '  ']) {
    builder.setTaxExemptReason({ text });
    const order = builder.getSnapshot();
    const stored = finalizeOrder(order, { capabilities: { orderCreate: 13, taxExempt: true, taxExemptReason: 'optional' } });
    const sent = withSentForm(order, stored);
    if (text.trim()) {
      expect(stored.taxExemptReason).toStrictEqual({ text: 'a'.repeat(199) + '…' });
      expect(sent.taxExemptReason).toStrictEqual(stored.taxExemptReason);
    } else expect(sent).not.toHaveProperty('taxExemptReason');
  }
});
