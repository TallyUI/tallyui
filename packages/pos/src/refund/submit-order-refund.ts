import type { OrderRefundEnvelope } from '@tallyui/core';
import { RxError } from 'rxdb';
import type { CommandTransport } from '../outbox/types';
import type { PosRefund, PosRefundCollection } from './pos-refund';
import { sendOrderRefund, type OrderRefundOutcome } from './send-order-refund';

export class RefundAnswerPendingError extends Error {
  readonly code = 'REFUND_ANSWER_PENDING';
  constructor(public readonly record: PosRefund) {
    super("This refund's answer is still unknown. Send it again before trying a new refund attempt.");
    this.name = 'RefundAnswerPendingError';
  }
}

/** Online only, never queued; the record is written before the send.
 * An applied record is final; a pending one is resent only with its own envelope
 * (ADR-080 amendment 1). */
export async function submitOrderRefund({ refunds, transport, envelope, now = () => new Date().toISOString() }: {
  refunds: PosRefundCollection; transport: CommandTransport<OrderRefundEnvelope>;
  envelope: OrderRefundEnvelope; now?: () => string;
}): Promise<{ outcome: OrderRefundOutcome; record: PosRefund }> {
  const id = envelope.payload.clientRefundId;
  let doc = await refunds.findOne(id).exec();
  if (!doc) {
    const at = now();
    const { orderId, sessionId, registerId } = envelope.payload;
    try {
      doc = await refunds.insert({
        id, commandId: envelope.id, orderId, sessionId, registerId, envelope,
        status: 'pending', createdAt: at, updatedAt: at,
      });
    } catch (error) {
      if (!(error instanceof RxError) || error.code !== 'CONFLICT') throw error;
      doc = (await refunds.findOne(id).exec())!;
    }
  }
  let record = doc.toJSON() as PosRefund;
  // Re-evaluate the stored state at most once after a guarded attempt write.
  for (let pass = 0; ; pass++) {
    if (pass === 2) throw new RefundAnswerPendingError(record);
    if (record.status === 'applied') {
      return { outcome: { kind: 'applied', refund: record.result!, duplicate: true }, record };
    }
    if (record.status === 'pending') {
      if (record.commandId !== envelope.id) throw new RefundAnswerPendingError(record);
      break;
    }
    if (record.status === 'rejected' && record.commandId === envelope.id) {
      return { outcome: { kind: 'rejected', error: record.error! }, record };
    }
    if (record.status === 'unsent' && record.commandId === envelope.id) {
      doc = await doc.incrementalModify((stored) => {
        if (stored.status !== 'unsent' || stored.commandId !== envelope.id) return stored;
        const { error, ...rest } = stored;
        return { ...rest, status: 'pending', updatedAt: now() };
      });
      record = doc.toJSON() as PosRefund;
      continue;
    }
    doc = await doc.incrementalModify((stored) => {
      if (stored.status !== 'rejected' && stored.status !== 'unsent') return stored;
      const { result, duplicate, error, ...rest } = stored;
      return { ...rest, commandId: envelope.id, envelope, status: 'pending', updatedAt: now() };
    });
    record = doc.toJSON() as PosRefund;
    if (record.commandId === envelope.id) break;
  }
  const outcome = await sendOrderRefund(transport, envelope);
  if (outcome.kind !== 'unknown') {
    doc = await doc.incrementalModify((stored) => {
      if (stored.status !== 'pending' || stored.commandId !== envelope.id) return stored;
      const updatedAt = now();
      if (outcome.kind === 'applied') {
        const { error, ...rest } = stored;
        return { ...rest, status: 'applied', result: outcome.refund, duplicate: outcome.duplicate, updatedAt };
      }
      if (outcome.kind === 'rejected') return { ...stored, status: 'rejected', error: outcome.error, updatedAt };
      const error = outcome.kind === 'refused'
        ? { code: 'refused', message: outcome.reason, data: { status: outcome.status } }
        : { code: 'unauthorized', message: 'unauthorized' };
      return { ...stored, status: 'unsent', error, updatedAt };
    });
  }
  return { outcome, record: doc.getLatest().toJSON() as PosRefund };
}
