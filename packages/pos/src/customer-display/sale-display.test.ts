import { describe, it, expect } from 'vitest';
import { createOrderBuilder, type Order, type Payment } from '../order';
import type { PosOrder } from '../pos-order';
import type { ReceiptData } from '../receipt/types';
import type { SaleStage } from '../sale/use-sale';
import { createDisplayLink, type DisplayClock, type DisplayLink } from './display-link';
import type { DisplayConfig, DisplayEnvelope, DisplayPayment } from './protocol';
import { createSaleDisplayPublisher, derivePaymentEvent } from './sale-display';

const pay = (id: string, status?: Payment['status'], amountMinor = 1000, method = 'card'): Payment =>
  ({ id, method, amountMinor, ...(status ? { status } : {}) });
const leg = (amountMinor = 1000, method = 'card') => ({ method, amountMinor });

describe('derivePaymentEvent', () => {
  it('1: a sale that becomes completed is complete, with the last captured leg', () => {
    const next = [pay('a', 'captured', 400, 'cash'), pay('b', undefined, 600), pay('c', 'failed', 50)];
    expect(derivePaymentEvent(next, next, false, true, 0)).toEqual({ state: 'complete', leg: leg(600) });
  });
  it('1: a completed sale with no captured leg is complete with no leg', () => {
    expect(derivePaymentEvent([], [pay('a', 'voided')], false, true, 1000)).toEqual({ state: 'complete' });
  });
  it('2: no leg changed status is no event', () => {
    const rows = [pay('a', 'pending')];
    expect(derivePaymentEvent(rows, rows.map((row) => ({ ...row })), false, false, 1000)).toBeNull();
    expect(derivePaymentEvent([pay('a')], [pay('a', 'captured')], false, false, 1000)).toBeNull();
  });
  it('3: the last changed leg captured with nothing due is complete', () => {
    expect(derivePaymentEvent([pay('a', 'pending')], [pay('a', 'captured')], false, false, 0))
      .toEqual({ state: 'complete', leg: leg() });
  });
  it('4: a failed or voided leg is declined, with the message only when given', () => {
    expect(derivePaymentEvent([pay('a', 'pending')], [pay('a', 'failed')], false, false, 1000))
      .toEqual({ state: 'declined', leg: leg() });
    expect(derivePaymentEvent([pay('a', 'authorized')], [pay('a', 'voided')], false, false, 1000, { declinedMessage: 'Declined' }))
      .toEqual({ state: 'declined', leg: leg(), message: 'Declined' });
  });
  it('5: an authorized or captured leg with a balance due is approved, never paid', () => {
    expect(derivePaymentEvent([pay('a', 'pending')], [pay('a', 'authorized')], false, false, 0))
      .toEqual({ state: 'approved', leg: leg() });
    expect(derivePaymentEvent([], [pay('a', 'captured', 400)], false, false, 600)).toEqual({ state: 'approved', leg: leg(400) });
  });
  it('6: a new pending leg is started', () => {
    expect(derivePaymentEvent([], [pay('a', 'pending')], false, false, 1000)).toEqual({ state: 'started', leg: leg() });
  });
  it('7: a known leg that changed to pending is no event', () => {
    expect(derivePaymentEvent([pay('a', 'authorized')], [pay('a', 'pending')], false, false, 1000)).toBeNull();
  });
  it('maps the method through methodTitle', () => {
    expect(derivePaymentEvent([], [pay('a', 'pending', 1000, 'stripe')], false, false, 1000, { methodTitle: (id) => `T:${id}` }))
      .toEqual({ state: 'started', leg: leg(1000, 'T:stripe') });
  });

  describe('v2 ledger.test.ts cases', () => {
    it('derives started when a pending row appears', () => {
      expect(derivePaymentEvent([], [pay('p1', 'pending')], false, false, 1000)).toMatchObject({ state: 'started', leg: leg() });
    });
    it('derives approved when a row succeeds with a balance remaining (and an authorization shows the balance due)', () => {
      expect(derivePaymentEvent([pay('p1', 'pending')], [pay('p1', 'authorized')], false, false, 1000)).toMatchObject({ state: 'approved' });
    });
    it('derives declined with the given message, and omits it when none is given', () => {
      const prev = [pay('p1', 'pending')], next = [pay('p1', 'failed')];
      expect(derivePaymentEvent(prev, next, false, false, 1000, { declinedMessage: 'Payment declined' })?.message).toBe('Payment declined');
      expect(derivePaymentEvent(prev, next, false, false, 1000)).not.toHaveProperty('message');
    });
    it('derives complete for a captured cash-only sale', () => {
      expect(derivePaymentEvent([], [pay('p1', 'captured', 1000, 'cash')], false, true, 0)).toMatchObject({ state: 'complete' });
    });
    it('derives a newly failed leg as declined even when an earlier leg already paid the order', () => {
      const paid = pay('paid', 'captured');
      expect(derivePaymentEvent([paid], [paid, pay('failed', 'failed', 10)], false, false, 0))
        .toMatchObject({ state: 'declined', leg: leg(10) });
    });
    it('returns no event when rows did not change', () => {
      const rows = [pay('p1', 'captured')];
      expect(derivePaymentEvent(rows, rows.map((row) => ({ ...row })), true, true, 0)).toBeNull();
    });
    it('derives complete from a completion without a row change', () => {
      const rows = [pay('captured', 'captured'), pay('pending', 'pending', 500)];
      expect(derivePaymentEvent(rows, rows, false, true, 1000)).toMatchObject({ state: 'complete', leg: leg() });
    });
    it('derives complete without a leg when an empty order becomes completed', () => {
      expect(derivePaymentEvent([], [], false, true, 0)).toEqual({ state: 'complete' });
    });
  });
});

const taxContext = { getTaxRatePpm: () => 0, pricesIncludeTax: false };
function newSale(lines = ['Tea']) {
  const builder = createOrderBuilder({ currency: 'USD', taxContext });
  for (const name of lines) builder.addLine({ productId: name, name, unitPrice: { amount: 1000, currency: 'USD' } });
  return builder;
}
const cart: SaleStage = { kind: 'cart' };
const tender: SaleStage = { kind: 'tender', method: 'external' };
const receiptStage = (order: Order): SaleStage => ({ kind: 'receipt', order, posOrder: {} as PosOrder });

type Call = ['cart', ReceiptData | null] | ['payment', ReceiptData, DisplayPayment];
function recorder() {
  const calls: Call[] = [];
  const link: DisplayLink = {
    showCart: (receipt) => { calls.push(['cart', receipt]); },
    showPayment: (receipt, payment) => { calls.push(['payment', receipt, payment]); },
    close: () => {},
  };
  return { link, calls, payments: () => calls.map((call) => (call[0] === 'payment' ? call[2] : call[0])) };
}

const config: DisplayConfig = {
  contract: '1.0', display: { id: 'd1', name: 'Counter' },
  store: { id: 's1', name: 'Corner Shop', currency: 'USD', locale: 'en-US' },
  presentation_hints: {}, i18n: {}, idle: { afterCompleteMs: 8000 },
};
function realLink() {
  const sent: DisplayEnvelope[] = [];
  const timers: { run: () => void; ms: number; live: boolean }[] = [];
  const clock: DisplayClock = {
    setTimeout: (run, ms) => { const timer = { run, ms, live: true }; timers.push(timer); return timer; },
    clearTimeout: (timer) => { (timer as { live: boolean }).live = false; },
  };
  const link = createDisplayLink({ send: (envelope) => (sent.push(envelope), true), onMessage: () => () => {}, close: () => {} },
    { config, clock });
  const fire = () => timers.filter((timer) => timer.live).forEach((timer) => { timer.live = false; timer.run(); });
  return { link, sent, timers, fire, actions: () => sent.map(({ action }) => action) };
}

describe('createSaleDisplayPublisher', () => {
  it('1: shows a cart with one line', () => {
    const { link, calls } = recorder();
    createSaleDisplayPublisher(link, { receipt: { storeName: 'Corner Shop' } }).update({ order: newSale().getSnapshot(), stage: cart });
    expect(calls).toEqual([['cart', expect.objectContaining({ header: expect.objectContaining({ storeName: 'Corner Shop' }) })]]);
    expect((calls[0][1] as ReceiptData).lineItems.map(({ name }) => name)).toEqual(['Tea']);
  });

  it('2: the tender stage with no legs shows the payment as started', () => {
    const { link, calls } = recorder();
    createSaleDisplayPublisher(link).update({ order: newSale().getSnapshot(), stage: tender });
    expect(calls).toEqual([['payment', expect.objectContaining({ lineItems: [expect.objectContaining({ name: 'Tea' })] }), { state: 'started' }]]);
  });

  it('3: follows a leg from started to approved, and the leg that pays the balance to complete', () => {
    const { link, payments } = recorder();
    const publisher = createSaleDisplayPublisher(link);
    const sale = newSale();
    const show = () => publisher.update({ order: sale.getSnapshot(), stage: tender });
    const card = sale.addPayment({ method: 'card', amountMinor: 600, status: 'pending' });
    show();
    sale.setPaymentStatus(card, 'authorized');
    show();
    expect(payments()).toEqual([{ state: 'started', leg: leg(600) }, { state: 'approved', leg: leg(600) }]);
    // Captured with a balance due is approved again: the receipt carries no leg status, so the call is the same one.
    sale.setPaymentStatus(card, 'captured');
    show();
    expect(payments()).toEqual([{ state: 'started', leg: leg(600) }, { state: 'approved', leg: leg(600) }]);
    sale.addPayment({ method: 'cash', amountMinor: 400, status: 'captured' });
    show();
    expect(payments().slice(2)).toEqual([{ state: 'complete', leg: leg(400, 'cash') }]);
  });

  it('4: a failed leg is declined, with the configured message', () => {
    const { link, payments } = recorder();
    const publisher = createSaleDisplayPublisher(link, { declinedMessage: 'Payment declined' });
    const sale = newSale();
    const card = sale.addPayment({ method: 'card', amountMinor: 1000, status: 'pending' });
    publisher.update({ order: sale.getSnapshot(), stage: tender });
    sale.setPaymentStatus(card, 'failed');
    publisher.update({ order: sale.getSnapshot(), stage: tender });
    expect(payments()).toEqual([{ state: 'started', leg: leg() }, { state: 'declined', leg: leg(), message: 'Payment declined' }]);
  });

  it('5: in tender, an update that changes no leg sends nothing again', () => {
    const { link, calls } = recorder();
    const publisher = createSaleDisplayPublisher(link);
    const sale = newSale();
    publisher.update({ order: sale.getSnapshot(), stage: tender });
    publisher.update({ order: { ...sale.getSnapshot() }, stage: { ...tender } });
    expect(calls).toHaveLength(1);
    sale.addPayment({ method: 'card', amountMinor: 1000, status: 'pending' });
    publisher.update({ order: sale.getSnapshot(), stage: tender });
    publisher.update({ order: { ...sale.getSnapshot() }, stage: tender });
    expect(calls.map((call) => call[2])).toEqual([{ state: 'started' }, { state: 'started', leg: leg() }]);
  });

  it('6: the receipt stage is complete with the last captured leg', () => {
    const { link, payments } = recorder();
    const publisher = createSaleDisplayPublisher(link);
    const sale = newSale();
    publisher.update({ order: sale.getSnapshot(), stage: tender });
    sale.addPayment({ method: 'card', amountMinor: 600, status: 'captured' });
    sale.addPayment({ method: 'cash', amountMinor: 400 });
    const done = sale.getSnapshot();
    publisher.update({ order: done, stage: receiptStage(done) });
    expect(payments()).toEqual([{ state: 'started' }, { state: 'complete', leg: leg(400, 'cash') }]);
  });

  it('7: through the link, a receipt then a new empty sale goes idle only after afterCompleteMs', () => {
    const { link, sent, timers, fire, actions } = realLink();
    const publisher = createSaleDisplayPublisher(link);
    const sale = newSale();
    sale.addPayment({ method: 'cash', amountMinor: 1000 });
    const done = sale.getSnapshot();
    publisher.update({ order: done, stage: receiptStage(done) });
    publisher.update({ order: createOrderBuilder({ currency: 'USD', taxContext }).getSnapshot(), stage: cart });
    expect(actions()).toEqual(['payment.state']);
    expect(sent[0].payload).toMatchObject({ state: 'complete', leg: leg(1000, 'cash') });
    expect(timers.map(({ ms }) => ms)).toEqual([8000]);
    fire();
    expect(actions()).toEqual(['payment.state', 'display.idle']);
  });

  it('8: an empty new sale with no complete before it shows idle at once', () => {
    const { link, calls } = recorder();
    createSaleDisplayPublisher(link).update({ order: newSale([]).getSnapshot(), stage: cart });
    expect(calls).toEqual([['cart', null]]);
    const real = realLink();
    createSaleDisplayPublisher(real.link).update({ order: newSale([]).getSnapshot(), stage: cart });
    expect(real.actions()).toEqual(['display.idle']);
  });

  it('9: the same update twice calls the link once', () => {
    const { link, calls } = recorder();
    const publisher = createSaleDisplayPublisher(link);
    const input = { order: newSale().getSnapshot(), stage: cart };
    publisher.update(input);
    publisher.update(input);
    expect(calls).toHaveLength(1);
  });

  it('10: a switch to another order shows its cart, and its later leg change gives its event', () => {
    const { link, payments } = recorder();
    const publisher = createSaleDisplayPublisher(link);
    const first = newSale();
    first.addPayment({ method: 'card', amountMinor: 500, status: 'pending' });
    publisher.update({ order: first.getSnapshot(), stage: tender });
    const second = newSale(['Cake']);
    const card = second.addPayment({ method: 'card', amountMinor: 300, status: 'pending' });
    publisher.update({ order: second.getSnapshot(), stage: cart });
    second.setPaymentStatus(card, 'authorized');
    publisher.update({ order: second.getSnapshot(), stage: cart });
    expect(payments()).toEqual([{ state: 'started', leg: leg(500) }, 'cart', { state: 'approved', leg: leg(300) }]);
  });

  it('11: close shows idle once, and later calls do nothing', () => {
    const { link, calls } = recorder();
    const publisher = createSaleDisplayPublisher(link);
    publisher.close();
    publisher.close();
    publisher.update({ order: newSale().getSnapshot(), stage: cart });
    expect(calls).toEqual([['cart', null]]);
  });

  it('12: on the receipt, a new live order snapshot keeps the complete up, idle on the original timer', () => {
    const real = realLink();
    const { link: spy, calls } = recorder();
    const link: DisplayLink = {
      showCart: (receipt) => { spy.showCart(receipt); real.link.showCart(receipt); },
      showPayment: (receipt, payment) => { spy.showPayment(receipt, payment); real.link.showPayment(receipt, payment); },
      close: () => real.link.close(),
    };
    const publisher = createSaleDisplayPublisher(link);
    const sale = newSale();
    sale.addPayment({ method: 'cash', amountMinor: 1000 });
    const done = sale.getSnapshot();
    const stage = receiptStage(done);
    publisher.update({ order: done, stage });
    sale.setNote('after the receipt');
    expect(sale.getSnapshot()).not.toBe(done);
    publisher.update({ order: sale.getSnapshot(), stage });
    expect(calls).toHaveLength(1);
    expect(real.actions()).toEqual(['payment.state']);
    expect(real.timers.map(({ ms }) => ms)).toEqual([8000]);
    real.fire();
    expect(real.actions()).toEqual(['payment.state', 'display.idle']);
  });

  it.each(['fees', 'shipping'] as const)('an order with no lines but one line in %s is a cart, not empty', (key) => {
    const sale = newSale([]);
    if (key === 'fees') sale.addFee({ name: 'Bag', amountMinor: 10 });
    else sale.addShipping({ name: 'Courier', amountMinor: 500 });
    const { link, calls } = recorder();
    createSaleDisplayPublisher(link).update({ order: sale.getSnapshot(), stage: cart });
    expect(calls).toEqual([['cart', expect.objectContaining({ lineItems: [], [key]: [expect.anything()] })]]);
  });

  it('the receipt of another order than the one shown is complete with no leg', () => {
    const { link, payments } = recorder();
    const publisher = createSaleDisplayPublisher(link);
    publisher.update({ order: newSale().getSnapshot(), stage: cart });
    const other = newSale(['Cake']);
    other.addPayment({ method: 'cash', amountMinor: 1000 });
    const done = other.getSnapshot();
    publisher.update({ order: done, stage: receiptStage(done) });
    expect(payments()).toEqual(['cart', { state: 'complete' }]);
  });
});
