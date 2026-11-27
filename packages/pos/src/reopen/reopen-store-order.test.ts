import { describe, expect, it, vi } from 'vitest';
import type { OrderReopenEnvelope, StoreOrder, StoreOrderLine } from '@tallyui/core';
import { STORE_ORDER_REBUILD_REFUSALS } from '../order/from-store-order';
import type { CommandTransport } from '../outbox/types';
import { TAX_EXEMPT_REOPEN_REFUSED } from './reopen-entry';
import { reopenStoreOrder, REOPENED_NOT_LOADED, STORE_ORDER_OPEN_HERE } from './reopen-store-order';

const taxContext = { getTaxRatePpm: () => 100000, pricesIncludeTax: false };

function fixture(status: 'applied' | 'duplicate' = 'applied') {
  const read: StoreOrder = {
    id: '41', reference: '41', clientOrderId: 'u-1', revision: 'sha256:e9770195141c0459c5c766e9094d71e66766563f967c134c3a5449243749e298', status: 'completed',
    placedAt: '2026-11-17T10:00:00.000Z', currency: 'EUR', pricesIncludeTax: false, customer: null,
    lines: [
      { id: '7', productId: 'coffee', name: 'Coffee', quantity: 2,
        subtotalMinor: 2000, totalMinor: 2000, subtotalTaxMinor: 200, taxMinor: 200 },
      { id: '8', productId: 'tea', name: 'Tea', quantity: 1,
        subtotalMinor: 1000, totalMinor: 1000, subtotalTaxMinor: 100, taxMinor: 100 },
    ],
    fees: [], shipping: [], coupons: [], refunds: [], discountMinor: 0, discountTaxMinor: 0, taxLines: [],
    taxMinor: 300, totalMinor: 3300,
    payments: [{ id: 'p1', method: 'pos_cash', amountMinor: 1000 }],
  };
  const reread: StoreOrder = { ...read, status: 'pos-open', revision: 'sha256:0dde575797fdab13e429b1132686c07af48e46096a03ea7adc6c3027082b8d2a' };
  const send = vi.fn<CommandTransport<OrderReopenEnvelope>['send']>().mockImplementation(async ([envelope]) => ({
    kind: 'results', results: [{
      id: envelope.id, status, reopen: { orderId: '41', status: 'pos-open', revision: 'sha256:0dde575797fdab13e429b1132686c07af48e46096a03ea7adc6c3027082b8d2a' },
    }],
  }));
  const getOrders = vi.fn<(ids: readonly string[]) => Promise<StoreOrder[]>>().mockResolvedValue([reread]);
  const deps = {
    transport: { send }, getOrders, openHere: vi.fn().mockReturnValue(false),
    identity: { cashierRef: '7', registerId: 'register-1', deviceId: 'till-1' },
    currency: 'EUR', taxContext, catalogue: (_line: StoreOrderLine) => ({}),
    now: () => Date.parse('2026-11-17T10:00:00.000Z'),
  };
  return { read, reread, send, getOrders, deps };
}

describe('reopenStoreOrder', () => {
  it('A4 refuses an exempt order without sending or rereading', async () => {
    const { read, send, getOrders, deps } = fixture();
    expect(await reopenStoreOrder({ ...read, taxExempt: true }, deps)).toEqual({ kind: 'refused', reason: 'tax_exempt', message: TAX_EXEMPT_REOPEN_REFUSED });
    expect(send).not.toHaveBeenCalled();
    expect(getOrders).not.toHaveBeenCalled();
  });

  it('A5 cannot load an order that is exempt on the reread', async () => {
    const { read, reread, deps } = fixture();
    reread.taxExempt = true;
    expect(await reopenStoreOrder(read, deps)).toMatchObject({ kind: 'reopened_unloadable', reason: 'tax_exempt' });
  });

  it('builds the reopened cart from the reread with locked payments', async () => {
    const { read, reread, deps } = fixture();
    const outcome = await reopenStoreOrder(read, deps);
    expect(outcome).toStrictEqual({ kind: 'reopened', duplicate: false, order: expect.any(Object) });
    if (outcome.kind !== 'reopened') throw new Error('Expected reopened');
    expect(outcome.order.storeOrder).toStrictEqual({ id: '41', revision: 'sha256:0dde575797fdab13e429b1132686c07af48e46096a03ea7adc6c3027082b8d2a', uuid: 'u-1' });
    expect(outcome.order.totalMinor).toBe(reread.totalMinor);
    expect(outcome.order.taxMinor).toBe(reread.taxMinor);
    expect(outcome.order.payments).toHaveLength(1);
    expect(outcome.order.payments[0]).toMatchObject({ storePaymentId: 'p1', amountMinor: 1000, locked: true });
  });

  it('sends exactly one envelope with the detail revision and supplied time', async () => {
    const { read, send, deps } = fixture();
    await reopenStoreOrder(read, deps);
    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0]).toStrictEqual([[{
      id: expect.stringMatching(/^[0-9a-f]{8}-[0-9a-f]{4}-7/), type: 'order.reopen', version: 1,
      createdAt: '2026-11-17T10:00:00.000Z', deviceId: 'till-1', attempt: 1,
      payload: {
        orderId: '41', clientOrderId: 'u-1', baseRevision: 'sha256:e9770195141c0459c5c766e9094d71e66766563f967c134c3a5449243749e298', cashierRef: '7',
        registerId: 'register-1', createdAt: '2026-11-17T10:00:00.000Z',
      },
    }]]);
  });

  it('includes storeId when supplied', async () => {
    const { read, send, deps } = fixture();
    await reopenStoreOrder(read, { ...deps, identity: { ...deps.identity, storeId: 's1' } });
    expect(send.mock.calls[0][0][0].payload).toHaveProperty('storeId', 's1');
  });

  it('omits clientOrderId when absent from the detail read', async () => {
    const { read, send, deps } = fixture();
    delete read.clientOrderId;
    await reopenStoreOrder(read, deps);
    expect(send.mock.calls[0][0][0].payload).not.toHaveProperty('clientOrderId');
  });

  it('reads the order once, only after sending', async () => {
    const { read, send, getOrders, deps } = fixture();
    await reopenStoreOrder(read, deps);
    expect(getOrders).toHaveBeenCalledTimes(1);
    expect(getOrders).toHaveBeenCalledWith(['41']);
    expect(getOrders.mock.invocationCallOrder[0]).toBeGreaterThan(send.mock.invocationCallOrder[0]);
  });

  it('loads a duplicate result with duplicate true', async () => {
    const { read, deps } = fixture('duplicate');
    expect(await reopenStoreOrder(read, deps)).toMatchObject({ kind: 'reopened', duplicate: true });
  });

  it.each([
    { reason: 'status', message: 'An order that is cancelled cannot be reopened' },
    { reason: 'catalogue', message: '"Tea" is no longer in the till\'s catalogue' },
    { reason: 'refund', message: STORE_ORDER_REBUILD_REFUSALS.refund },
  ])('refuses $reason before sending or reading again', async ({ reason, message }) => {
    const { read, send, getOrders, deps } = fixture();
    if (reason === 'status') read.status = 'cancelled';
    if (reason === 'refund') read.refunds = [{ id: 'r1', amountMinor: 100 }];
    const catalogue = (line: StoreOrderLine) => reason === 'catalogue' && line.id === '8' ? null : {};
    expect(await reopenStoreOrder(read, { ...deps, catalogue })).toStrictEqual({ kind: 'refused', reason, message });
    expect(send).not.toHaveBeenCalled();
    expect(getOrders).not.toHaveBeenCalled();
  });

  it('returns a rejected outcome unchanged without reading again', async () => {
    const { read, send, getOrders, deps } = fixture();
    const error = { code: 'order_state', message: 'x', data: { state: 'not_found' } };
    send.mockImplementation(async ([envelope]) => ({
      kind: 'results', results: [{ id: envelope.id, status: 'rejected', error }],
    }));
    expect(await reopenStoreOrder(read, deps)).toStrictEqual({ kind: 'not_reopened', outcome: { kind: 'rejected', error }, envelope: expect.objectContaining({ type: 'order.reopen' }) });
    expect(getOrders).not.toHaveBeenCalled();
  });

  it('returns unknown after a thrown send without reading again', async () => {
    const { read, send, getOrders, deps } = fixture();
    send.mockRejectedValue(new Error('failed'));
    expect(await reopenStoreOrder(read, deps)).toStrictEqual({
      kind: 'not_reopened', outcome: { kind: 'unknown', reason: 'transport_error' },
      envelope: expect.objectContaining({ type: 'order.reopen' }),
    });
    expect(getOrders).not.toHaveBeenCalled();
  });

  it.each(['rejected', 'empty', 'another id'])('reports an unloadable reopened order when the reread is %s', async (mode) => {
    const { read, reread, getOrders, deps } = fixture();
    if (mode === 'rejected') getOrders.mockRejectedValue(new Error('failed'));
    else getOrders.mockResolvedValue(mode === 'empty' ? [] : [{ ...reread, id: '42' }]);
    expect(await reopenStoreOrder(read, deps)).toStrictEqual({
      kind: 'reopened_unloadable', reason: 'reread',
      message: `${REOPENED_NOT_LOADED} The order could not be read again.`,
    });
  });

  it('reports a refund refusal after the store has reopened', async () => {
    const { read, reread, deps } = fixture();
    reread.refunds = [{ id: 'r1', amountMinor: 100 }];
    expect(await reopenStoreOrder(read, deps)).toStrictEqual({
      kind: 'reopened_unloadable', reason: 'refund',
      message: `${REOPENED_NOT_LOADED} ${STORE_ORDER_REBUILD_REFUSALS.refund}`,
    });
  });

  it('reports an overpaid reread as unloadable', async () => {
    const { read, reread, deps } = fixture();
    reread.payments = [{ id: 'p1', method: 'pos_cash', amountMinor: reread.totalMinor + 1 }];
    expect(await reopenStoreOrder(read, deps)).toStrictEqual({
      kind: 'reopened_unloadable', reason: 'overpaid',
      message: `${REOPENED_NOT_LOADED} This order is paid more than its total`,
    });
  });

  it('rethrows a non-entry error without sending', async () => {
    const { read, send, getOrders, deps } = fixture();
    const boom = new Error('boom');
    await expect(reopenStoreOrder(read, { ...deps, catalogue: () => { throw boom; } })).rejects.toBe(boom);
    expect(send).not.toHaveBeenCalled();
    expect(getOrders).not.toHaveBeenCalled();
  });

  it('carries the sent envelope when the answer is unknown', async () => {
    const { read, send, deps } = fixture();
    send.mockRejectedValue(new Error('failed'));
    const outcome = await reopenStoreOrder(read, deps);
    expect(outcome).toMatchObject({ kind: 'not_reopened', outcome: { kind: 'unknown' } });
    if (outcome.kind !== 'not_reopened') throw new Error('Expected not_reopened');
    expect(outcome.envelope).toStrictEqual(send.mock.calls[0][0][0]);
  });

  it('resends the same envelope with an incremented attempt without calling now', async () => {
    const { read, send, deps } = fixture('duplicate');
    send.mockRejectedValueOnce(new Error('failed'));
    const first = await reopenStoreOrder(read, deps);
    if (first.kind !== 'not_reopened') throw new Error('Expected not_reopened');
    const now = vi.fn();
    const outcome = await reopenStoreOrder(read, { ...deps, resend: first.envelope, now });
    expect(send.mock.calls[1][0][0]).toStrictEqual({ ...first.envelope, attempt: 2 });
    expect(outcome).toMatchObject({ kind: 'reopened', duplicate: true });
    expect(now).not.toHaveBeenCalled();
  });

  it('throws without sending when the resend is for another order', async () => {
    const { read, send, deps } = fixture();
    const resend: OrderReopenEnvelope = {
      id: '019a9295-dd00-7000-8000-000000000001', type: 'order.reopen', version: 1,
      createdAt: '2026-11-17T10:00:00.000Z', deviceId: 'till-1', attempt: 1,
      payload: { orderId: '42', baseRevision: 'sha256:e9770195141c0459c5c766e9094d71e66766563f967c134c3a5449243749e298', cashierRef: '7', registerId: 'register-1', createdAt: '2026-11-17T10:00:00.000Z' },
    };
    await expect(reopenStoreOrder(read, { ...deps, resend })).rejects.toThrow('reopenStoreOrder: resend is for another order');
    expect(send).not.toHaveBeenCalled();
  });

  it.each([false, true])('refuses an order already open here before sending (async: %s)', async (async) => {
    const { read, send, getOrders, deps } = fixture();
    if (async) deps.openHere.mockResolvedValue(true);
    else deps.openHere.mockReturnValue(true);
    expect(await reopenStoreOrder(read, deps)).toStrictEqual({ kind: 'refused', reason: 'open_here', message: STORE_ORDER_OPEN_HERE });
    expect(deps.openHere).toHaveBeenCalledWith('41');
    expect(send).not.toHaveBeenCalled();
    expect(getOrders).not.toHaveBeenCalled();
  });

  it('runs the pre-check before checking whether the order is already open here', async () => {
    const { read, deps } = fixture();
    read.status = 'cancelled';
    deps.openHere.mockReturnValue(true);
    expect(await reopenStoreOrder(read, deps)).toMatchObject({ kind: 'refused', reason: 'status' });
    expect(deps.openHere).not.toHaveBeenCalled();
  });

  it('pre-checks both reads in the customer tax context', async () => {
    const { read, reread, send, deps } = fixture();
    read.customer = { id: 'c1', name: 'Ada' };
    read.lines = read.lines.map((line) => ({ ...line, subtotalTaxMinor: line.subtotalMinor / 5, taxMinor: line.totalMinor / 5 }));
    read.taxMinor = 600;
    read.totalMinor = 3600;
    Object.assign(reread, { customer: read.customer, lines: read.lines, taxMinor: read.taxMinor, totalMinor: read.totalMinor });
    const taxContextFor = vi.fn(() => ({ taxContext: { getTaxRatePpm: () => 200000, pricesIncludeTax: false } }));
    expect(await reopenStoreOrder(read, { ...deps, taxContextFor })).toMatchObject({ kind: 'reopened' });
    expect(taxContextFor).toHaveBeenCalledTimes(2);
    expect(taxContextFor).toHaveBeenNthCalledWith(1, { id: 'c1', name: 'Ada' });
    expect(taxContextFor).toHaveBeenNthCalledWith(2, { id: 'c1', name: 'Ada' });
    send.mockClear();
    expect(await reopenStoreOrder(read, deps)).toMatchObject({ kind: 'refused', reason: 'totals' });
    expect(send).not.toHaveBeenCalled();
  });

  it('passes no customer to taxContextFor for a customer the rebuild refuses', async () => {
    const { read, send, deps } = fixture();
    read.customer = { id: 'x'.repeat(65), name: 'Ada' };
    const taxContextFor = vi.fn(() => ({ taxContext }));
    expect(await reopenStoreOrder(read, { ...deps, taxContextFor })).toMatchObject({ kind: 'refused', reason: 'customer' });
    expect(taxContextFor).toHaveBeenCalledTimes(1);
    expect(taxContextFor).toHaveBeenCalledWith(null);
    expect(send).not.toHaveBeenCalled();
  });

  it('builds the cart from the reread when a line has been removed', async () => {
    const { read, reread, deps } = fixture();
    reread.lines = reread.lines.filter((line) => line.id === '7');
    reread.taxMinor = 200;
    reread.totalMinor = 2200;
    const outcome = await reopenStoreOrder(read, deps);
    expect(outcome.kind).toBe('reopened');
    if (outcome.kind !== 'reopened') throw new Error('Expected reopened');
    expect(outcome.order.lineItems).toHaveLength(1);
    expect(outcome.order.lineItems[0]).toMatchObject({ storeLineId: '7' });
    expect(outcome.order.totalMinor).toBe(2200);
    expect(outcome.order.payments).toMatchObject([{ storePaymentId: 'p1', amountMinor: 1000, locked: true }]);
  });

  it('checks the catalogue again for the reread', async () => {
    const { read, send, deps } = fixture();
    const catalogue = (line: StoreOrderLine) => send.mock.calls.length > 0 && line.id === '8' ? null : {};
    expect(await reopenStoreOrder(read, { ...deps, catalogue })).toMatchObject({ kind: 'reopened_unloadable', reason: 'catalogue' });
  });

  it('refuses a stale reread', async () => {
    const { read, reread, deps } = fixture();
    reread.revision = 'sha256:8750ca58e4ac509f76e614b0359eaa93454a56c95ea0c6c690729fb5a5498099';
    expect(await reopenStoreOrder(read, deps)).toStrictEqual({
      kind: 'reopened_unloadable', reason: 'reread',
      message: `${REOPENED_NOT_LOADED} The order read back does not match the reopen.`,
    });
  });

  it('loads any reread revision when the reopen result has no revision', async () => {
    const { read, reread, send, deps } = fixture();
    reread.revision = 'sha256:8750ca58e4ac509f76e614b0359eaa93454a56c95ea0c6c690729fb5a5498099';
    send.mockImplementation(async ([envelope]) => ({
      kind: 'results', results: [{ id: envelope.id, status: 'applied', reopen: { orderId: '41', status: 'pos-open' } }],
    }));
    expect(await reopenStoreOrder(read, deps)).toMatchObject({ kind: 'reopened', order: { storeOrder: { revision: 'sha256:8750ca58e4ac509f76e614b0359eaa93454a56c95ea0c6c690729fb5a5498099' } } });
  });
});
