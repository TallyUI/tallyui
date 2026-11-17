import { describe, expect, it, vi } from 'vitest';
import type { OrderReopenEnvelope, StoreOrder, StoreOrderLine } from '@tallyui/core';
import { STORE_ORDER_REBUILD_REFUSALS } from '../order/from-store-order';
import type { CommandTransport } from '../outbox/types';
import { reopenStoreOrder, REOPENED_NOT_LOADED } from './reopen-store-order';

const taxContext = { getTaxRatePpm: () => 100000, pricesIncludeTax: false };

function fixture(status: 'applied' | 'duplicate' = 'applied') {
  const read: StoreOrder = {
    id: '41', reference: '41', clientOrderId: 'u-1', revision: 'sha256:a', status: 'completed',
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
  const reread: StoreOrder = { ...read, status: 'pos-open', revision: 'sha256:b' };
  const send = vi.fn<CommandTransport<OrderReopenEnvelope>['send']>().mockImplementation(async ([envelope]) => ({
    kind: 'results', results: [{
      id: envelope.id, status, reopen: { orderId: '41', status: 'pos-open', revision: 'sha256:b' },
    }],
  }));
  const getOrders = vi.fn<(ids: readonly string[]) => Promise<StoreOrder[]>>().mockResolvedValue([reread]);
  const deps = {
    transport: { send }, getOrders,
    identity: { cashierRef: '7', registerId: 'register-1', deviceId: 'till-1' },
    currency: 'EUR', taxContext, catalogue: (_line: StoreOrderLine) => ({}),
    now: () => Date.parse('2026-11-17T10:00:00.000Z'),
  };
  return { read, reread, send, getOrders, deps };
}

describe('reopenStoreOrder', () => {
  it('builds the reopened cart from the reread with locked payments', async () => {
    const { read, reread, deps } = fixture();
    const outcome = await reopenStoreOrder(read, deps);
    expect(outcome).toStrictEqual({ kind: 'reopened', duplicate: false, order: expect.any(Object) });
    if (outcome.kind !== 'reopened') throw new Error('Expected reopened');
    expect(outcome.order.storeOrder).toStrictEqual({ id: '41', revision: 'sha256:b', uuid: 'u-1' });
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
        orderId: '41', clientOrderId: 'u-1', baseRevision: 'sha256:a', cashierRef: '7',
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
    expect(await reopenStoreOrder(read, deps)).toStrictEqual({ kind: 'not_reopened', outcome: { kind: 'rejected', error } });
    expect(getOrders).not.toHaveBeenCalled();
  });

  it('returns unknown after a thrown send without reading again', async () => {
    const { read, send, getOrders, deps } = fixture();
    send.mockRejectedValue(new Error('failed'));
    expect(await reopenStoreOrder(read, deps)).toStrictEqual({
      kind: 'not_reopened', outcome: { kind: 'unknown', reason: 'transport_error' },
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
});
