import { describe, expect, it, vi } from 'vitest';
import type { CommandError, CommandResult, OrderRefundEnvelope, OrderRefundResult } from '@tallyui/core';
import { parseCommandResult } from '@tallyui/core/server';
import type { CommandTransport, TransportOutcome } from '../outbox/types';
import { sendOrderRefund } from './send-order-refund';

const envelope: OrderRefundEnvelope = {
  id: '019d0e2e-0000-7000-8000-000000000001', type: 'order.refund', version: 1,
  createdAt: '2026-10-07T10:00:00.000Z', deviceId: 'till-1', attempt: 1,
  payload: {
    clientRefundId: '019d0e2e-0000-7000-8000-000000000002', orderId: 'order-1',
    lines: [{ orderLineId: 'line-1', quantity: 1, restock: true }],
    shippingMinor: 0, adjustmentMinor: 0, totalMinor: 1000,
    destination: 'cash', reason: 'Returned item', registerId: 'register-1', sessionId: 'session-1',
    createdAt: '2026-10-07T10:00:00.000Z',
  },
};
const refund: OrderRefundResult = {
  totalMinor: 1000, byMethod: { cash: 1000 },
  refunds: [{ id: 'refund-1', paymentId: 'payment-1', totalMinor: 1000, state: 'Settled' }],
};
const applied: CommandResult = { id: envelope.id, status: 'applied', refund };

describe('sendOrderRefund', () => {
  it('sends one batch containing exactly the same envelope, with no context', async () => {
    const send = vi.fn<CommandTransport<OrderRefundEnvelope>['send']>()
      .mockResolvedValue({ kind: 'results', results: [applied] });
    await sendOrderRefund({ send }, envelope);
    expect(send).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledWith([envelope]);
    expect(send.mock.calls[0][0][0]).toBe(envelope);
  });

  it('returns the parsed applied refund, dropping extra refund fields', async () => {
    const result = { ...applied, refund: { ...refund, extra: 'discard me' } };
    const transport: CommandTransport<OrderRefundEnvelope> = {
      send: async () => ({ kind: 'results', results: [result] }),
    };
    const outcome = await sendOrderRefund(transport, envelope);
    expect(outcome).toStrictEqual({ kind: 'applied', refund: parseCommandResult(result).refund, duplicate: false });
    expect(outcome).toStrictEqual({ kind: 'applied', refund, duplicate: false });
  });

  it('maps a duplicate refund to applied with duplicate true', async () => {
    const transport: CommandTransport<OrderRefundEnvelope> = {
      send: async () => ({ kind: 'results', results: [{ ...applied, status: 'duplicate' }] }),
    };
    expect(await sendOrderRefund(transport, envelope)).toStrictEqual({ kind: 'applied', refund, duplicate: true });
  });

  it.each<CommandError>([
    { code: 'quantity_exceeds', message: 'Too many items',
      data: { lines: [{ orderLineId: 'line-1', quantity: 1, refundableQuantity: 0 }] } },
    { code: 'unsupported_version', message: 'Refunds unsupported', data: { orderRefund: 0 } },
  ])('preserves rejected $code and its data', async (error) => {
    const result: CommandResult = { id: envelope.id, status: 'rejected', error };
    const transport: CommandTransport<OrderRefundEnvelope> = {
      send: async () => ({ kind: 'results', results: [result] }),
    };
    expect(await sendOrderRefund(transport, envelope)).toStrictEqual({ kind: 'rejected', error });
  });

  it.each<CommandResult>([
    { id: envelope.id, status: 'applied', serverRefs: { orderId: 'order-1', totalMinor: 1000 } },
    { id: envelope.id, status: 'duplicate' },
    { ...applied, refund: { ...refund, byMethod: { cash: 999 } } },
  ])('maps a missing or malformed refund to unknown: %j', async (result) => {
    const transport: CommandTransport<OrderRefundEnvelope> = {
      send: async () => ({ kind: 'results', results: [result] }),
    };
    expect(await sendOrderRefund(transport, envelope)).toStrictEqual({ kind: 'unknown', reason: 'bad_result' });
  });

  it.each<{ results: CommandResult[] }>([
    { results: [] },
    { results: [{ ...applied, id: 'other-id' }] },
    { results: [applied, applied] },
  ])('requires exactly one matching result: %j', async ({ results }) => {
    const transport: CommandTransport<OrderRefundEnvelope> = {
      send: async () => ({ kind: 'results', results }),
    };
    expect(await sendOrderRefund(transport, envelope)).toStrictEqual({ kind: 'unknown', reason: 'missing_result' });
  });

  it('ignores another id beside the matching result', async () => {
    const transport: CommandTransport<OrderRefundEnvelope> = {
      send: async () => ({ kind: 'results', results: [{ id: 'other-id', status: 'applied' }, applied] }),
    };
    expect(await sendOrderRefund(transport, envelope)).toStrictEqual({ kind: 'applied', refund, duplicate: false });
  });

  it('maps a timeout retry to unknown with its retry delay', async () => {
    const transport: CommandTransport<OrderRefundEnvelope> = {
      send: async () => ({ kind: 'retry', reason: 'timeout', retryAfterMs: 5000 }),
    };
    expect(await sendOrderRefund(transport, envelope))
      .toStrictEqual({ kind: 'unknown', reason: 'timeout', retryAfterMs: 5000 });
  });

  it('maps a network retry to unknown without a retryAfterMs key', async () => {
    const transport: CommandTransport<OrderRefundEnvelope> = {
      send: async () => ({ kind: 'retry', reason: 'network' }),
    };
    const outcome = await sendOrderRefund(transport, envelope);
    expect(outcome).toStrictEqual({ kind: 'unknown', reason: 'network' });
    expect(outcome).not.toHaveProperty('retryAfterMs');
  });

  it.each<TransportOutcome>([
    { kind: 'refused', status: 403, reason: 'forbidden' },
    { kind: 'unauthorized' },
  ])('passes through $kind', async (outcome) => {
    const transport: CommandTransport<OrderRefundEnvelope> = { send: async () => outcome };
    expect(await sendOrderRefund(transport, envelope)).toStrictEqual(outcome);
  });

  it('maps a thrown transport error to unknown', async () => {
    const send = vi.fn<CommandTransport<OrderRefundEnvelope>['send']>().mockRejectedValue(new Error('failed'));
    expect(await sendOrderRefund({ send }, envelope)).toStrictEqual({ kind: 'unknown', reason: 'transport_error' });
    expect(send).toHaveBeenCalledTimes(1);
  });
});
