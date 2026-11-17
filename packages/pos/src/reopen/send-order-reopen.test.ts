import { describe, expect, it, vi } from 'vitest';
import type { CommandError, CommandResult, OrderReopenEnvelope, OrderReopenResult } from '@tallyui/core';
import { parseCommandResult } from '@tallyui/core/server';
import type { CommandTransport, TransportOutcome } from '../outbox/types';
import { sendOrderReopen, isOrderReopenInFlight, isReopenOffered } from './send-order-reopen';

const envelope: OrderReopenEnvelope = {
  id: '019d0e2e-0000-7000-8000-000000000001', type: 'order.reopen', version: 1,
  createdAt: '2026-10-07T10:00:00.000Z', deviceId: 'till-1', attempt: 1,
  payload: {
    orderId: 'order-1', baseRevision: 'rev-1', cashierRef: '7', registerId: 'register-1',
    createdAt: '2026-10-07T10:00:00.000Z',
  },
};
const reopen: OrderReopenResult = { orderId: 'order-1', status: 'pos-open', revision: 'rev-2' };
const applied: CommandResult = { id: envelope.id, status: 'applied', reopen };

describe('sendOrderReopen', () => {
  it('sends one batch containing exactly the same envelope, with no context', async () => {
    const send = vi.fn<CommandTransport<OrderReopenEnvelope>['send']>()
      .mockResolvedValue({ kind: 'results', results: [applied] });
    await sendOrderReopen({ send }, envelope);
    expect(send).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledWith([envelope]);
    expect(send.mock.calls[0][0][0]).toBe(envelope);
  });

  it('returns the parsed applied reopen, dropping extra reopen fields', async () => {
    const result = { ...applied, reopen: { ...reopen, extra: 'discard me' } };
    const transport: CommandTransport<OrderReopenEnvelope> = {
      send: async () => ({ kind: 'results', results: [result] }),
    };
    const outcome = await sendOrderReopen(transport, envelope);
    expect(outcome).toStrictEqual({ kind: 'applied', reopen: parseCommandResult(result).reopen, duplicate: false });
    expect(outcome).toStrictEqual({ kind: 'applied', reopen, duplicate: false });
  });

  it('maps a duplicate reopen to applied with duplicate true', async () => {
    const transport: CommandTransport<OrderReopenEnvelope> = {
      send: async () => ({ kind: 'results', results: [{ ...applied, status: 'duplicate' }] }),
    };
    expect(await sendOrderReopen(transport, envelope)).toStrictEqual({ kind: 'applied', reopen, duplicate: true });
  });

  it.each<CommandError>([
    { code: 'payment_in_motion', message: 'Payment pending', data: { paymentId: 'pay-1' } },
    { code: 'unsupported_version', message: 'Reopen unsupported', data: { orderReopen: 0 } },
  ])('preserves rejected $code and its data', async (error) => {
    const result: CommandResult = { id: envelope.id, status: 'rejected', error };
    const transport: CommandTransport<OrderReopenEnvelope> = {
      send: async () => ({ kind: 'results', results: [result] }),
    };
    expect(await sendOrderReopen(transport, envelope)).toStrictEqual({ kind: 'rejected', error });
  });

  it.each<CommandResult>([
    { id: envelope.id, status: 'applied', serverRefs: { orderId: 'order-1', totalMinor: 1000 } },
    { id: envelope.id, status: 'duplicate' },
    { ...applied, reopen: { orderId: '', status: 'pos-open' } },
  ])('maps a missing or malformed reopen to unknown: %j', async (result) => {
    const transport: CommandTransport<OrderReopenEnvelope> = {
      send: async () => ({ kind: 'results', results: [result] }),
    };
    expect(await sendOrderReopen(transport, envelope)).toStrictEqual({ kind: 'unknown', reason: 'bad_result' });
  });

  it.each<{ results: CommandResult[] }>([
    { results: [] },
    { results: [{ ...applied, id: 'other-id' }] },
    { results: [applied, applied] },
  ])('requires exactly one matching result: %j', async ({ results }) => {
    const transport: CommandTransport<OrderReopenEnvelope> = {
      send: async () => ({ kind: 'results', results }),
    };
    expect(await sendOrderReopen(transport, envelope)).toStrictEqual({ kind: 'unknown', reason: 'missing_result' });
  });

  it('ignores another id beside the matching result', async () => {
    const transport: CommandTransport<OrderReopenEnvelope> = {
      send: async () => ({ kind: 'results', results: [{ id: 'other-id', status: 'applied' }, applied] }),
    };
    expect(await sendOrderReopen(transport, envelope)).toStrictEqual({ kind: 'applied', reopen, duplicate: false });
  });

  it('maps a timeout retry to unknown with its retry delay', async () => {
    const transport: CommandTransport<OrderReopenEnvelope> = {
      send: async () => ({ kind: 'retry', reason: 'timeout', retryAfterMs: 5000 }),
    };
    expect(await sendOrderReopen(transport, envelope))
      .toStrictEqual({ kind: 'unknown', reason: 'timeout', retryAfterMs: 5000 });
    expect(isOrderReopenInFlight('order-1')).toBe(false);
  });

  it('maps a network retry to unknown without a retryAfterMs key', async () => {
    const transport: CommandTransport<OrderReopenEnvelope> = {
      send: async () => ({ kind: 'retry', reason: 'network' }),
    };
    const outcome = await sendOrderReopen(transport, envelope);
    expect(outcome).toStrictEqual({ kind: 'unknown', reason: 'network' });
    expect(outcome).not.toHaveProperty('retryAfterMs');
    expect(isOrderReopenInFlight('order-1')).toBe(false);
  });

  it.each<TransportOutcome>([
    { kind: 'refused', status: 403, reason: 'forbidden' },
    { kind: 'unauthorized' },
  ])('passes through $kind', async (outcome) => {
    const transport: CommandTransport<OrderReopenEnvelope> = { send: async () => outcome };
    expect(await sendOrderReopen(transport, envelope)).toStrictEqual(outcome);
  });

  it('maps a thrown transport error to unknown', async () => {
    const send = vi.fn<CommandTransport<OrderReopenEnvelope>['send']>().mockRejectedValue(new Error('failed'));
    expect(await sendOrderReopen({ send }, envelope)).toStrictEqual({ kind: 'unknown', reason: 'transport_error' });
    expect(send).toHaveBeenCalledTimes(1);
    expect(isOrderReopenInFlight('order-1')).toBe(false);
  });

  it('blocks a second send of the same order until the first resolves', async () => {
    let resolve!: (outcome: TransportOutcome) => void;
    const send = vi.fn<CommandTransport<OrderReopenEnvelope>['send']>()
      .mockImplementationOnce(() => new Promise((done) => { resolve = done; }))
      .mockResolvedValue({ kind: 'results', results: [applied] });
    const first = sendOrderReopen({ send }, envelope);
    expect(isOrderReopenInFlight('order-1')).toBe(true);
    expect(isReopenOffered({ orderReopen: 1, orderCreate: 5, online: true, storageDegraded: false, orderId: 'order-1' })).toBe(false);
    expect(await sendOrderReopen({ send }, { ...envelope, id: '019d0e2e-0000-7000-8000-000000000002' }))
      .toStrictEqual({ kind: 'in_flight' });
    expect(send).toHaveBeenCalledTimes(1);
    expect(isOrderReopenInFlight('order-1')).toBe(true);
    resolve({ kind: 'results', results: [applied] });
    expect(await first).toStrictEqual({ kind: 'applied', reopen, duplicate: false });
    expect(isOrderReopenInFlight('order-1')).toBe(false);
    expect(await sendOrderReopen({ send }, envelope)).toStrictEqual({ kind: 'applied', reopen, duplicate: false });
    expect(send).toHaveBeenCalledTimes(2);
  });

  it('does not block a different order while order-1 is pending', async () => {
    let resolve!: (outcome: TransportOutcome) => void;
    const other = { ...envelope, payload: { ...envelope.payload, orderId: 'order-2' } };
    const otherReopen = { ...reopen, orderId: 'order-2' };
    const send = vi.fn<CommandTransport<OrderReopenEnvelope>['send']>()
      .mockImplementationOnce(() => new Promise((done) => { resolve = done; }))
      .mockResolvedValue({ kind: 'results', results: [{ ...applied, reopen: otherReopen }] });
    const first = sendOrderReopen({ send }, envelope);
    expect(await sendOrderReopen({ send }, other))
      .toStrictEqual({ kind: 'applied', reopen: otherReopen, duplicate: false });
    expect(send).toHaveBeenCalledTimes(2);
    expect(send).toHaveBeenNthCalledWith(2, [other]);
    expect(isOrderReopenInFlight('order-1')).toBe(true);
    expect(isOrderReopenInFlight('order-2')).toBe(false);
    resolve({ kind: 'results', results: [applied] });
    await first;
    expect(isOrderReopenInFlight('order-1')).toBe(false);
  });
});

describe('isReopenOffered', () => {
  const input = { online: true, storageDegraded: false, orderId: 'order-1' };
  it('offers reopening when supported, online, storage healthy and no reopen pending', () => {
    expect(isReopenOffered({ ...input, orderReopen: 1, orderCreate: 5 })).toBe(true);
    expect(isReopenOffered({ ...input, orderReopen: 1, orderCreate: 9 })).toBe(true);
  });
  it.each([
    {},
    { orderReopen: 0 },
    { orderReopen: 1, orderCreate: 5, online: false },
    { orderReopen: 1, orderCreate: 5, storageDegraded: true },
    { orderReopen: 1, orderCreate: 4 },
    { orderReopen: 1 },
  ])('does not offer reopening with %j', (overrides) => {
    expect(isReopenOffered({ ...input, ...overrides })).toBe(false);
  });
});
