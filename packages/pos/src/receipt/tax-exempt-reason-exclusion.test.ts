import { afterEach, expect, it, vi } from 'vitest';
import type { DisplayCall, DisplayLink } from '../customer-display/display-link';
import { createSaleDisplayPublisher } from '../customer-display/sale-display';
import { createOrderBuilder, type Order } from '../order';
import { finalizeOrder, withSentForm } from '../pos-order/finalize';
import { buildReceiptData } from './build-receipt-data';
import { buildReceiptDataFromPosOrder } from './reprint';

const reason = { text: 'Charity, form ST-5 on file', certificateId: 'ST5-0042' };
const config = { storeName: 'Shop' };
const now = new Date('2026-11-20T12:00:00Z');
afterEach(() => { vi.useRealTimers(); });

function pairedSales() {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(now);
  const builder = createOrderBuilder({ currency: 'USD', taxContext: { pricesIncludeTax: false, getTaxRatePpm: () => 100000 } });
  builder.addLine({ productId: '10', name: 'Shirt', unitPrice: { currency: 'USD', amount: 1000 } });
  builder.setTaxExempt(true);
  const cart = builder.getSnapshot();
  builder.setTaxExemptReason(reason);
  const reasonCart = builder.getSnapshot();
  builder.addPayment({ method: 'cash', amountMinor: cart.totalMinor });
  const paid = builder.getSnapshot();
  function finish(live: Order, order: Order) {
    let next = 0;
    const posOrder = finalizeOrder(order, { capabilities: { orderCreate: 13, taxExempt: true, taxExemptReason: 'optional' },
      now, newId: () => `id-${++next}` });
    return { live, order, posOrder, sent: withSentForm(order, posOrder) };
  }
  builder.setTaxExemptReason(null);
  const withReason = finish(reasonCart, paid), plain = finish(cart, builder.getSnapshot());
  expect(withReason.posOrder.taxExemptReason).toStrictEqual(reason);
  expect(plain.posOrder).not.toHaveProperty('taxExemptReason');
  return { withReason, plain };
}

function expectPrivate(actual: unknown, plain: unknown) {
  expect(actual).toStrictEqual(plain);
  const serialized = JSON.stringify(actual);
  expect(serialized).not.toContain('Charity');
  expect(serialized).not.toContain('ST5-0042');
}

it('excludes the reason and certificate from the sent order’s receipt', () => {
  const { withReason, plain } = pairedSales();
  expectPrivate(buildReceiptData(withReason.sent, config), buildReceiptData(plain.sent, config));
});

it('excludes the reason and certificate from cart, tender and receipt display calls', () => {
  function publish(sale: ReturnType<typeof pairedSales>['plain']) {
    const calls: DisplayCall[] = [];
    const link: DisplayLink = {
      showCart: receipt => { calls.push(['cart', receipt]); },
      showPayment: (receipt, payment) => { calls.push(['payment', receipt, payment]); },
      close: () => {},
    };
    const publisher = createSaleDisplayPublisher(link);
    publisher.update({ order: sale.live, stage: { kind: 'cart' } });
    publisher.update({ order: sale.live, stage: { kind: 'tender', method: 'cash' } });
    publisher.update({ order: sale.order, stage: { kind: 'receipt', order: sale.sent, posOrder: sale.posOrder } });
    return calls;
  }
  const { withReason, plain } = pairedSales(), calls = publish(withReason);
  expect(calls.map(call => call[0] === 'cart' ? 'cart' : call[2].state)).toEqual(['cart', 'started', 'complete']);
  expectPrivate(calls, publish(plain));
});

it('excludes the reason and certificate from the stored order’s reprint', () => {
  const { withReason, plain } = pairedSales();
  expectPrivate(buildReceiptDataFromPosOrder(withReason.posOrder, config), buildReceiptDataFromPosOrder(plain.posOrder, config));
});
