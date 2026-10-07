import type { CommandError, OrderRefundEnvelope, OrderRefundResult } from '@tallyui/core';
import type { RxCollection, RxJsonSchema } from 'rxdb';

export type PosRefundStatus = 'pending' | 'applied' | 'rejected' | 'unsent';
export interface PosRefund {
  id: string; commandId: string; orderId: string; sessionId: string; registerId: string;
  envelope: OrderRefundEnvelope;
  status: PosRefundStatus;
  result?: OrderRefundResult;
  duplicate?: boolean;
  error?: CommandError;
  createdAt: string; updatedAt: string;
}
export type PosRefundCollection = RxCollection<PosRefund>;

export const posRefundSchema: RxJsonSchema<PosRefund> = {
  title: 'POS refunds', version: 0, primaryKey: 'id', type: 'object', additionalProperties: false,
  properties: {
    id: { type: 'string', maxLength: 64 }, commandId: { type: 'string', maxLength: 64 },
    orderId: { type: 'string', maxLength: 64 }, sessionId: { type: 'string', maxLength: 64 },
    registerId: { type: 'string', maxLength: 64 },
    envelope: { type: 'object', additionalProperties: true },
    status: { type: 'string', enum: ['pending', 'applied', 'rejected', 'unsent'], maxLength: 10 },
    result: { type: 'object', additionalProperties: true }, duplicate: { type: 'boolean' },
    error: { type: 'object', properties: {
      code: { type: 'string' }, message: { type: 'string' }, data: { type: 'object', additionalProperties: true },
    }, required: ['code', 'message'], additionalProperties: false },
    createdAt: { type: 'string' }, updatedAt: { type: 'string' },
  },
  required: ['id', 'commandId', 'orderId', 'sessionId', 'registerId', 'envelope', 'status', 'createdAt', 'updatedAt'],
  indexes: [['sessionId']],
};
/** Local-only, never replicated (ADR-080 amendment 1).
 * Added with addCollections like cash_movements. */
export const posRefundCollection = () => ({ schema: posRefundSchema });
