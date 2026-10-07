// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRxDatabase, type RxDatabase } from 'rxdb';
import { getRxStorageMemory } from 'rxdb/plugins/storage-memory';
import { wrappedValidateAjvStorage } from 'rxdb/plugins/validate-ajv';
import type { CommandError, CommandResult, OrderRefundEnvelope, OrderRefundResult } from '@tallyui/core';
import type { CommandTransport, TransportOutcome } from '../outbox/types';
import { posRefundCollection, type PosRefundCollection } from './pos-refund';
import { sendOrderRefund } from './send-order-refund';
import { RefundAnswerPendingError, submitOrderRefund } from './submit-order-refund';

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
const nextEnvelope: OrderRefundEnvelope = { ...envelope, id: '019d0e2e-0000-7000-8000-000000000003', attempt: 2 };
const refund: OrderRefundResult = {
  totalMinor: 1000, byMethod: { cash: 1000 },
  refunds: [{ id: 'refund-1', paymentId: 'payment-1', totalMinor: 1000, state: 'Settled' }],
};
const applied: CommandResult = { id: envelope.id, status: 'applied', refund };
const error: CommandError = { code: 'quantity_exceeds', message: 'x', data: { lines: [] } };
const rejected: CommandResult = { id: envelope.id, status: 'rejected', error };
const firstAt = '2026-10-07T10:00:00.000Z';
const secondAt = '2026-10-07T10:00:01.000Z';
let db: RxDatabase<{ pos_refunds: PosRefundCollection }>;
let refunds: PosRefundCollection;
let send: ReturnType<typeof vi.fn<CommandTransport<OrderRefundEnvelope>['send']>>;
let now: () => string;

beforeEach(async () => {
  db = await createRxDatabase({
    name: `refund${Math.random().toString(36).slice(2)}`,
    storage: wrappedValidateAjvStorage({ storage: getRxStorageMemory() }), multiInstance: false,
  });
  await db.addCollections({ pos_refunds: posRefundCollection() });
  refunds = db.pos_refunds;
  send = vi.fn<CommandTransport<OrderRefundEnvelope>['send']>()
    .mockResolvedValue({ kind: 'results', results: [applied] });
  let tick = 0;
  now = () => new Date(Date.parse(firstAt) + tick++ * 1000).toISOString();
});
afterEach(async () => { await db.remove(); });

describe('submitOrderRefund', () => {
  it('stores the full applied record and returns the sendOrderRefund outcome', async () => {
    const expectedOutcome = await sendOrderRefund({ send: async () => ({ kind: 'results', results: [applied] }) }, envelope);
    const answer = await submitOrderRefund({ refunds, transport: { send }, envelope, now });
    expect(send).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledWith([envelope]);
    expect(answer.outcome).toStrictEqual(expectedOutcome);
    expect(answer.record).toStrictEqual({
      id: envelope.payload.clientRefundId, commandId: envelope.id, orderId: 'order-1',
      sessionId: 'session-1', registerId: 'register-1', envelope, status: 'applied',
      result: refund, duplicate: false, createdAt: firstAt, updatedAt: secondAt,
    });
    expect((await refunds.findOne(envelope.payload.clientRefundId).exec())!.toJSON()).toStrictEqual(answer.record);
    expect(answer.record).not.toHaveProperty('error');
  });

  it('persists pending and the exact envelope before calling the transport', async () => {
    send.mockImplementation(async ([sent]) => {
      const record = (await refunds.findOne(sent.payload.clientRefundId).exec())!.toJSON();
      expect(record.status).toBe('pending');
      expect(record.envelope).toStrictEqual(sent);
      return { kind: 'results', results: [applied] };
    });
    await submitOrderRefund({ refunds, transport: { send }, envelope, now });
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('stores a duplicate result as applied with duplicate true', async () => {
    send.mockResolvedValue({ kind: 'results', results: [{ ...applied, status: 'duplicate' }] });
    const { outcome, record } = await submitOrderRefund({ refunds, transport: { send }, envelope, now });
    expect(outcome).toStrictEqual({ kind: 'applied', refund, duplicate: true });
    expect(record.status).toBe('applied');
    expect(record.result).toStrictEqual(refund);
    expect(record.duplicate).toBe(true);
  });

  it('stores the exact rejection error', async () => {
    send.mockResolvedValue({ kind: 'results', results: [rejected] });
    const { outcome, record } = await submitOrderRefund({ refunds, transport: { send }, envelope, now });
    expect(outcome).toStrictEqual({ kind: 'rejected', error });
    expect(record.status).toBe('rejected');
    expect(record.error).toStrictEqual(error);
    expect(record.updatedAt).toBe(secondAt);
  });

  it.each<{ response: TransportOutcome; expectedError: CommandError }>([
    { response: { kind: 'refused', status: 409, reason: 'conflict' },
      expectedError: { code: 'refused', message: 'conflict', data: { status: 409 } } },
    { response: { kind: 'unauthorized' }, expectedError: { code: 'unauthorized', message: 'unauthorized' } },
  ])('stores $response.kind as unsent', async ({ response, expectedError }) => {
    send.mockResolvedValue(response);
    const { outcome, record } = await submitOrderRefund({ refunds, transport: { send }, envelope, now });
    expect(outcome).toStrictEqual(response);
    expect(record.status).toBe('unsent');
    expect(record.error).toStrictEqual(expectedError);
    expect(record).not.toHaveProperty('result');
    expect(record.updatedAt).toBe(secondAt);
  });

  it('leaves a thrown transport answer pending without an answer write, then resends the same envelope', async () => {
    send.mockRejectedValueOnce(new Error('network'));
    const first = await submitOrderRefund({ refunds, transport: { send }, envelope, now });
    expect(first.outcome).toStrictEqual({ kind: 'unknown', reason: 'transport_error' });
    expect(first.record.status).toBe('pending');
    expect(first.record.createdAt).toBe(firstAt);
    expect(first.record.updatedAt).toBe(first.record.createdAt);
    const second = await submitOrderRefund({ refunds, transport: { send }, envelope, now });
    expect(send).toHaveBeenCalledTimes(2);
    expect(send).toHaveBeenNthCalledWith(2, [envelope]);
    expect(second.record.status).toBe('applied');
    expect(second.record.result).toStrictEqual(refund);
    expect(second.record.updatedAt).toBe(secondAt);
  });

  it.each([envelope, nextEnvelope])('keeps an applied record final for envelope $id', async (attempt) => {
    const first = await submitOrderRefund({ refunds, transport: { send }, envelope, now });
    const second = await submitOrderRefund({ refunds, transport: { send }, envelope: attempt, now });
    expect(second.outcome).toStrictEqual({ kind: 'applied', refund, duplicate: true });
    expect(second.record).toStrictEqual(first.record);
    expect(send).toHaveBeenCalledTimes(1);
    expect((await refunds.findOne(first.record.id).exec())!.toJSON()).toStrictEqual(first.record);
  });

  it('refuses a new command id while the first answer is pending', async () => {
    send.mockRejectedValueOnce(new Error('network'));
    const first = await submitOrderRefund({ refunds, transport: { send }, envelope, now });
    const pending = submitOrderRefund({ refunds, transport: { send }, envelope: nextEnvelope, now });
    await expect(pending).rejects.toBeInstanceOf(RefundAnswerPendingError);
    await expect(pending).rejects.toMatchObject({
      name: 'RefundAnswerPendingError', code: 'REFUND_ANSWER_PENDING',
      message: "This refund's answer is still unknown. Send it again before trying a new refund attempt.",
      record: { commandId: envelope.id },
    });
    expect(send).toHaveBeenCalledTimes(1);
    expect((await refunds.findOne(first.record.id).exec())!.toJSON()).toStrictEqual(first.record);
  });

  it('returns the stored rejection for the same command id without sending', async () => {
    send.mockResolvedValueOnce({ kind: 'results', results: [rejected] });
    const first = await submitOrderRefund({ refunds, transport: { send }, envelope, now });
    const second = await submitOrderRefund({ refunds, transport: { send }, envelope, now });
    expect(second.outcome).toStrictEqual({ kind: 'rejected', error });
    expect(second.record).toStrictEqual(first.record);
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('replaces a rejected attempt with a new command and removes the old error', async () => {
    send.mockResolvedValueOnce({ kind: 'results', results: [rejected] })
      .mockImplementationOnce(async () => {
        const stored = (await refunds.findOne(envelope.payload.clientRefundId).exec())!.toJSON();
        expect(stored.status).toBe('pending');
        expect(stored.commandId).toBe(nextEnvelope.id);
        expect(stored).not.toHaveProperty('error');
        expect(stored).not.toHaveProperty('result');
        expect(stored).not.toHaveProperty('duplicate');
        return { kind: 'results', results: [{ ...applied, id: nextEnvelope.id }] };
      });
    await submitOrderRefund({ refunds, transport: { send }, envelope, now });
    const { record } = await submitOrderRefund({ refunds, transport: { send }, envelope: nextEnvelope, now });
    expect(send).toHaveBeenCalledTimes(2);
    expect(send).toHaveBeenNthCalledWith(2, [nextEnvelope]);
    expect(record.commandId).toBe(nextEnvelope.id);
    expect(record.envelope).toStrictEqual(nextEnvelope);
    expect(record.status).toBe('applied');
    expect(record.result).toStrictEqual(refund);
    expect(record).not.toHaveProperty('error');
    expect(record.createdAt).toBe(firstAt);
    expect(record.updatedAt).toBe('2026-10-07T10:00:03.000Z');
  });

  it('resends an unsent envelope after storing pending without its error', async () => {
    send.mockResolvedValueOnce({ kind: 'unauthorized' });
    await submitOrderRefund({ refunds, transport: { send }, envelope, now });
    send.mockImplementationOnce(async () => {
      const record = (await refunds.findOne(envelope.payload.clientRefundId).exec())!.toJSON();
      expect(record.status).toBe('pending');
      expect(record).not.toHaveProperty('error');
      expect(record.updatedAt).toBe('2026-10-07T10:00:02.000Z');
      return { kind: 'results', results: [applied] };
    });
    const { record } = await submitOrderRefund({ refunds, transport: { send }, envelope, now });
    expect(send).toHaveBeenCalledTimes(2);
    expect(send).toHaveBeenNthCalledWith(2, [envelope]);
    expect(record.status).toBe('applied');
    expect(record.result).toStrictEqual(refund);
    expect(record).not.toHaveProperty('error');
  });

  it('replaces an unsent attempt with a new envelope', async () => {
    send.mockResolvedValueOnce({ kind: 'refused', status: 409, reason: 'conflict' })
      .mockImplementationOnce(async () => {
        const stored = (await refunds.findOne(envelope.payload.clientRefundId).exec())!.toJSON();
        expect(stored.status).toBe('pending');
        expect(stored.commandId).toBe(nextEnvelope.id);
        expect(stored).not.toHaveProperty('error');
        expect(stored).not.toHaveProperty('result');
        expect(stored).not.toHaveProperty('duplicate');
        return { kind: 'results', results: [{ ...applied, id: nextEnvelope.id }] };
      });
    await submitOrderRefund({ refunds, transport: { send }, envelope, now });
    const { record } = await submitOrderRefund({ refunds, transport: { send }, envelope: nextEnvelope, now });
    expect(send).toHaveBeenCalledTimes(2);
    expect(send).toHaveBeenNthCalledWith(2, [nextEnvelope]);
    expect(record.commandId).toBe(nextEnvelope.id);
    expect(record.envelope).toStrictEqual(nextEnvelope);
    expect(record.status).toBe('applied');
    expect(record.result).toStrictEqual(refund);
    expect(record).not.toHaveProperty('error');
  });

  it('sends only one of two concurrent replacement attempts', async () => {
    send.mockResolvedValueOnce({ kind: 'results', results: [rejected] });
    await submitOrderRefund({ refunds, transport: { send }, envelope, now });
    let resolveSend!: () => void;
    const release = new Promise<void>((resolve) => { resolveSend = resolve; });
    send.mockImplementation(async ([sent]) => {
      await release;
      return { kind: 'results', results: [{ ...applied, id: sent.id }] };
    });
    const otherEnvelope: OrderRefundEnvelope = {
      ...envelope, id: '019d0e2e-0000-7000-8000-000000000004', attempt: 3,
    };
    const settled = Promise.allSettled([
      submitOrderRefund({ refunds, transport: { send }, envelope: nextEnvelope, now }),
      submitOrderRefund({ refunds, transport: { send }, envelope: otherEnvelope, now }),
    ]);
    await vi.waitFor(() => expect(send).toHaveBeenCalledTimes(2));
    await new Promise<void>((resolve) => { setTimeout(resolve, 20); });
    expect(send).toHaveBeenCalledTimes(2);
    resolveSend();
    const answers = await settled;
    const fulfilled = answers.filter((answer) => answer.status === 'fulfilled');
    const failed = answers.filter((answer) => answer.status === 'rejected');
    expect(fulfilled).toHaveLength(1);
    expect(failed).toHaveLength(1);
    expect(failed[0].reason).toBeInstanceOf(RefundAnswerPendingError);
    expect(send).toHaveBeenCalledTimes(2);
    const sentEnvelope = answers[0].status === 'fulfilled' ? nextEnvelope : otherEnvelope;
    expect((await refunds.findOne(envelope.payload.clientRefundId).exec())!.toJSON().commandId).toBe(sentEnvelope.id);
  });

  it('does not write a late answer over a newer pending attempt', async () => {
    let resolveSend!: (outcome: TransportOutcome) => void;
    const response = new Promise<TransportOutcome>((resolve) => { resolveSend = resolve; });
    let enteredSend!: () => void;
    const sending = new Promise<void>((resolve) => { enteredSend = resolve; });
    send.mockImplementationOnce(() => { enteredSend(); return response; });
    const pending = submitOrderRefund({ refunds, transport: { send }, envelope, now });
    await sending;
    const doc = (await refunds.findOne(envelope.payload.clientRefundId).exec())!;
    const injected = await doc.incrementalModify((stored) => ({
      ...stored, commandId: nextEnvelope.id, envelope: nextEnvelope,
    }));
    resolveSend({ kind: 'results', results: [applied] });
    await pending;
    const stored = (await refunds.findOne(doc.id).exec())!.toJSON();
    expect(stored).toStrictEqual(injected.toJSON());
    expect(stored.status).toBe('pending');
    expect(stored.commandId).toBe(nextEnvelope.id);
    expect(stored).not.toHaveProperty('result');
  });

  it('does not write a late answer over an applied record of the same attempt', async () => {
    let resolveSend!: (outcome: TransportOutcome) => void;
    const response = new Promise<TransportOutcome>((resolve) => { resolveSend = resolve; });
    let enteredSend!: () => void;
    const sending = new Promise<void>((resolve) => { enteredSend = resolve; });
    send.mockImplementationOnce(() => { enteredSend(); return response; });
    const pending = submitOrderRefund({ refunds, transport: { send }, envelope, now });
    await sending;
    const doc = (await refunds.findOne(envelope.payload.clientRefundId).exec())!;
    const injected = await doc.incrementalModify((stored) => ({
      ...stored, status: 'applied', result: refund, duplicate: false,
    }));
    resolveSend({ kind: 'results', results: [rejected] });
    await pending;
    const stored = (await refunds.findOne(doc.id).exec())!.toJSON();
    expect(stored).toStrictEqual(injected.toJSON());
    expect(stored.status).toBe('applied');
    expect(stored).not.toHaveProperty('error');
  });

  it('never overwrites an applied record with a late rejected answer', async () => {
    let resolveSend!: (outcome: TransportOutcome) => void;
    const response = new Promise<TransportOutcome>((resolve) => { resolveSend = resolve; });
    let enteredSend!: () => void;
    const sending = new Promise<void>((resolve) => { enteredSend = resolve; });
    send.mockImplementationOnce(() => { enteredSend(); return response; });
    const pending = submitOrderRefund({ refunds, transport: { send }, envelope, now });
    await sending;
    const doc = (await refunds.findOne(envelope.payload.clientRefundId).exec())!;
    const otherResult: OrderRefundResult = {
      totalMinor: 500, byMethod: { cash: 500 },
      refunds: [{ id: 'refund-2', paymentId: 'payment-1', totalMinor: 500, state: 'Settled' }],
    };
    const injected = await doc.incrementalModify((stored) => ({
      ...stored, status: 'applied', commandId: nextEnvelope.id, result: otherResult, duplicate: true, updatedAt: secondAt,
    }));
    resolveSend({ kind: 'results', results: [rejected] });
    const answer = await pending;
    expect(answer.outcome).toStrictEqual({ kind: 'rejected', error });
    expect(answer.record).toStrictEqual(injected.toJSON());
    expect((await refunds.findOne(doc.id).exec())!.toJSON()).toStrictEqual(injected.toJSON());
  });

  it('resolves concurrent first submits to applied with exactly one document', async () => {
    const answers = await Promise.all([
      submitOrderRefund({ refunds, transport: { send }, envelope, now }),
      submitOrderRefund({ refunds, transport: { send }, envelope, now }),
    ]);
    for (const answer of answers) {
      expect(answer.outcome.kind).toBe('applied');
      expect(answer.record.status).toBe('applied');
      expect(answer.record.result).toStrictEqual(refund);
    }
    expect(await refunds.find().exec()).toHaveLength(1);
    expect(send).toHaveBeenCalled();
  });

  it('rethrows an insert error other than a conflict without sending', async () => {
    const disk = new Error('disk');
    const broken = {
      findOne: vi.fn(() => ({ exec: vi.fn().mockResolvedValue(null) })),
      insert: vi.fn().mockRejectedValue(disk),
    } as unknown as PosRefundCollection;
    await expect(submitOrderRefund({ refunds: broken, transport: { send }, envelope, now })).rejects.toBe(disk);
    expect(send).not.toHaveBeenCalled();
  });
});
