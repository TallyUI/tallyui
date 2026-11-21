// Needs attention's Reopen (desk 2026-11-21), with the real reopenRefusedOrder from @tallyui/pos wired as onReopen.
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRxDatabase, type RxCollection, type RxDatabase } from 'rxdb';
import { getRxStorageMemory } from 'rxdb/plugins/storage-memory';
import { wrappedValidateAjvStorage } from 'rxdb/plugins/validate-ajv';
import { formatMoney } from '@tallyui/core';
import {
  addRegisterSessionCollection, couponPricingBasis, createOrderBuilder, finalizeOrder, orderDraftSchema, posOrderCollection,
  reopenRefusedOrder, uuidv7, type Order, type PosOrder, type RegisterSessionCollection, type TaxContext,
} from '@tallyui/pos';
import { OrdersList } from '../sale/orders-list';
import { orderReference } from '../sale/order-reference';

const currency = 'GBP';
/** reopen-carry.test.ts's taxContext(false, 'per_order'). */
const taxContext: TaxContext = { getTaxRatePpm: () => 200000, pricesIncludeTax: false, rounding: { granularity: 'per_order', mode: 'half_away_from_zero' } };
let db: RxDatabase<{ pos_orders: RxCollection<PosOrder>; order_drafts: RxCollection; register_sessions: RegisterSessionCollection }>;

beforeEach(async () => {
  // register-harness.tsx's createRegisterDb: an untyped database for addRegisterSessionCollection, typed once it is built.
  const raw: RxDatabase = await createRxDatabase({ name: `ordersreopen${uuidv7().replaceAll('-', '')}`,
    storage: wrappedValidateAjvStorage({ storage: getRxStorageMemory() }), multiInstance: false });
  await raw.addCollections({ pos_orders: posOrderCollection(), order_drafts: { schema: orderDraftSchema } });
  await addRegisterSessionCollection(raw);
  db = raw as unknown as typeof db;
});
afterEach(async () => { cleanup(); await db.remove(); });

/** reopen-carry's E7 shape (twoLines, exclusive), as use-sale-reopened-legs.test.tsx's refused(): a store-priced coupon, paid in full in cash. */
function build(coupons = true): Order {
  const builder = createOrderBuilder({ currency, taxContext });
  builder.addLine({ productId: 'p1', name: 'Shirt', unitPrice: { amount: 1000, currency }, quantity: 2 });
  const second = builder.addLine({ productId: 'p2', name: 'Cap', unitPrice: { amount: 500, currency } });
  builder.applyLineDiscount(second, { type: 'fixed', value: 40, label: 'Staff' });
  builder.applyOrderDiscount({ type: 'fixed', value: 150 });
  const ids = builder.getSnapshot().lineItems.map((line) => line.id);
  if (coupons) builder.setCoupons(['save'], { kind: 'store-priced', basis: couponPricingBasis(builder.getSnapshot()),
    priced: new Map([['save', { couponId: 'c1', lines: [{ lineId: ids[0], amountMinor: 120 }, { lineId: ids[1], amountMinor: 30 }] }]]) });
  builder.addPayment({ method: 'cash', amountMinor: builder.getSnapshot().totalMinor });
  return builder.getSnapshot();
}
async function refused(overrides: Partial<PosOrder> = {}): Promise<PosOrder> {
  // The JSON round trip drops an override set to undefined, as the stored row would.
  const order: PosOrder = JSON.parse(JSON.stringify({ ...finalizeOrder(build(), { capabilities: { orderCreate: 12 }, now: new Date('2026-11-21T10:00:00.000Z') }),
    syncStatus: 'rejected', error: { code: 'coupon_invalid', message: 'x' }, ...overrides }));
  await db.pos_orders.insert(order);
  return order;
}
/** The coupon's effect: the same sale's total without its coupons, less its total with them (reopen-carry's effect()). */
const effect = () => build(false).totalMinor - build().totalMinor;
const deps = (orderCreate: number) => ({ orders: db.pos_orders, drafts: db.order_drafts, sessions: db.register_sessions, taxContext,
  now: () => new Date('2026-11-21T12:00:00.000Z'), capabilities: { orderCreate } });
const wired = (orderCreate: number) => vi.fn((order: PosOrder, options?: { withoutCoupons: true }) =>
  reopenRefusedOrder(order.id, { ...deps(12), capabilities: { orderCreate } }, options).then(() => {}));
async function draft(id: string): Promise<Order> {
  const row = await db.order_drafts.findOne(id).exec();
  expect(row).not.toBeNull();
  return JSON.parse(row!.data);
}
/** Presses a button and lets its awaited onReopen settle. */
async function press(testID: string) {
  await act(async () => { fireEvent.click(screen.getByTestId(testID)); });
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
}
/** The labels of the first row's (Needs attention's) buttons: everything but the row toggle itself. */
const actions = (id: string) => within(screen.getAllByTestId(`order-row-${id}`)[0].parentElement!).getAllByRole('button')
  .filter((button) => button.getAttribute('data-testid') !== `order-row-${id}`).map((button) => button.textContent);

describe('OrdersList Reopen (desk 2026-11-21)', () => {
  it('R1 an inexact carry offers the drop, never takes it; the drop parks the sale at its total plus the coupon effect', async () => {
    const order = await refused();
    const onReopen = wired(3);
    const { rerender } = render(<OrdersList orders={[order]} onRetry={async () => 0} onReopen={onReopen} />);
    expect(screen.getByTestId(`order-${order.id}-reopen`).getAttribute('aria-label')).toBe(`Reopen order ${orderReference(order)}`);
    await press(`order-${order.id}-reopen`);
    expect(onReopen).toHaveBeenCalledTimes(1);
    expect(onReopen.mock.calls[0][1]).toBeUndefined();
    expect(await db.order_drafts.count().exec()).toBe(0);
    expect(effect()).toBeGreaterThan(0);
    expect(screen.getByTestId(`order-${order.id}-reopen-without-coupon`).textContent)
      .toBe(`Reopen without the coupon: ${formatMoney({ amount: effect(), currency })} to collect`);
    await press(`order-${order.id}-reopen-without-coupon`);
    expect(onReopen).toHaveBeenCalledTimes(2);
    expect(onReopen.mock.calls[1]).toEqual([order, { withoutCoupons: true }]);
    const saved = await draft(order.id);
    expect(saved.coupons).toBeUndefined();
    expect(saved.totalMinor - order.totalMinor).toBe(effect());
    // The app's orders update brings reopenedAt: the row reads Reopened.
    rerender(<OrdersList orders={[(await db.pos_orders.findOne(order.id).exec())!.toJSON() as PosOrder]} onRetry={async () => 0} onReopen={onReopen} />);
    expect(screen.getByTestId(`order-${order.id}-reopened`).textContent).toBe('Reopened as a parked sale.');
    expect(screen.queryByTestId(`order-${order.id}-reopen`)).toBeNull();
    expect(screen.queryByTestId(`order-${order.id}-reopen-without-coupon`)).toBeNull();
  });

  it('R1 Reopen is disabled while its call is in flight, and a second press is a no-op', async () => {
    const order = await refused();
    let settle!: () => void;
    const onReopen = vi.fn(() => new Promise<void>((resolve) => { settle = resolve; }));
    render(<OrdersList orders={[order]} onRetry={async () => 0} onReopen={onReopen} />);
    await press(`order-${order.id}-reopen`);
    expect(screen.getByTestId(`order-${order.id}-reopen`).getAttribute('aria-disabled')).toBe('true');
    await press(`order-${order.id}-reopen`);
    expect(onReopen).toHaveBeenCalledTimes(1);
    await act(async () => { settle(); });
    expect(screen.getByTestId(`order-${order.id}-reopen`).getAttribute('aria-disabled')).not.toBe('true');
  });

  it('R2 an exact carry reopens on the first press, with no without-coupon button', async () => {
    const order = await refused();
    const onReopen = wired(12);
    render(<OrdersList orders={[order]} onRetry={async () => 0} onReopen={onReopen} />);
    await press(`order-${order.id}-reopen`);
    expect(onReopen).toHaveBeenCalledTimes(1);
    expect((await draft(order.id)).coupons).toEqual([expect.objectContaining({ code: 'save', carried: true })]);
    expect(screen.queryByTestId(`order-${order.id}-reopen-without-coupon`)).toBeNull();
    expect(screen.queryByTestId(`order-${order.id}-reopen-error`)).toBeNull();
  });

  it.each([
    ['a requeueable code', { error: { code: 'insufficient_stock', message: 'x' } }],
    ['a store order', { storeOrderId: '41' }],
    ['a pending row', { syncStatus: 'pending' as const, error: undefined }],
    ['an applied row', { syncStatus: 'applied' as const, error: undefined }],
    ['a reopened row', { reopenedAt: '2026-11-21T12:00:00.000Z' }],
  ])('R3 no Reopen on %s', async (_name, overrides: Partial<PosOrder>) => {
    const order = await refused(overrides);
    render(<OrdersList orders={[order]} onRetry={async () => 0} onReopen={wired(12)} />);
    expect(screen.queryByTestId(`order-${order.id}-reopen`)).toBeNull();
    if (overrides.error?.code === 'insufficient_stock') expect(actions(order.id)).toContain('Retry');
  });

  it('R3 no Reopen without onReopen', async () => {
    const order = await refused();
    render(<OrdersList orders={[order]} onRetry={async () => 0} />);
    expect(screen.queryByTestId(`order-${order.id}-reopen`)).toBeNull();
  });

  it('R4 a reopened row reads Reopened; Resume passes its order, and is absent without onResume', async () => {
    const order = await refused({ reopenedAt: '2026-11-21T12:00:00.000Z' });
    const onResume = vi.fn();
    const { rerender } = render(<OrdersList orders={[order]} onRetry={async () => 0} onReopen={wired(12)} onResume={onResume} />);
    expect(screen.getByTestId(`order-${order.id}-reopened`).textContent).toBe('Reopened as a parked sale.');
    expect(screen.getByTestId(`order-${order.id}-resume`).getAttribute('aria-label')).toBe(`Resume order ${orderReference(order)}`);
    fireEvent.click(screen.getByTestId(`order-${order.id}-resume`));
    expect(onResume).toHaveBeenCalledWith(order);
    rerender(<OrdersList orders={[order]} onRetry={async () => 0} onReopen={wired(12)} />);
    expect(screen.getByTestId(`order-${order.id}-reopened`)).toBeTruthy();
    expect(screen.queryByTestId(`order-${order.id}-resume`)).toBeNull();
  });

  it('R5 any other refusal shows its reason and offers no drop', async () => {
    const order = await refused();
    const onReopen = vi.fn(async () => { throw Object.assign(new Error('closed'), { reason: 'session_closed' }); });
    render(<OrdersList orders={[order]} onRetry={async () => 0} onReopen={onReopen} />);
    await press(`order-${order.id}-reopen`);
    expect(screen.getByTestId(`order-${order.id}-reopen-error`).textContent).toBe("This sale can't be reopened here (session_closed).");
    expect(screen.queryByTestId(`order-${order.id}-reopen-without-coupon`)).toBeNull();
  });

  it('R5 a refusal with no reason ends at "here."', async () => {
    const order = await refused();
    render(<OrdersList orders={[order]} onRetry={async () => 0} onReopen={vi.fn(async () => { throw new Error('boom'); })} />);
    await press(`order-${order.id}-reopen`);
    expect(screen.getByTestId(`order-${order.id}-reopen-error`).textContent).toBe("This sale can't be reopened here.");
  });

  it.each([
    ['coupon_invalid', "The online store refused this sale: a coupon on it isn't valid now. Reopen it to sell it again."],
    ['total_mismatch', "The online store refused this sale: its total didn't match the store's. Reopen it to sell it again."],
  ])('R6 %s reads its own sentence, not the platform_error fallback', async (code, sentence) => {
    const order = await refused({ error: { code, message: 'x' } });
    render(<OrdersList orders={[order]} onRetry={async () => 0} />);
    expect(screen.getAllByText(sentence).length).toBeGreaterThan(0);
    expect(screen.queryByText("The online store refused this sale. Ask the store owner to look at the till's sync log.")).toBeNull();
  });

  it('R7 without onReopen or onResume a rejected coupon_invalid row has the buttons of today: no Retry, no Reopen', async () => {
    const order = await refused();
    render(<OrdersList orders={[order]} onRetry={async () => 0} />);
    for (const row of screen.getAllByTestId(`order-row-${order.id}`)) {
      expect(within(row.parentElement!).getAllByRole('button').map((button) => button.getAttribute('data-testid'))).toEqual([`order-row-${order.id}`]);
    }
  });
});
