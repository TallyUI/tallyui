/**
 * One record per voided tender leg: its v2 ledger row plus the provenance a v2 `void`
 * fiscal record carries (TallyUI#479). Write-once: insert only, never update or delete;
 * a replay of a known `paymentId` is a no-op for the caller to handle.
 * Local only, never replicated. No device-side number or checksum:
 * v2 numbers records on the server.
 */
import type { PaymentMethodKind } from '@tallyui/core';
import type { RxJsonSchema } from 'rxdb';

export interface TenderVoid {
  /** The voided leg's client-minted id (the `clientPaymentId` order.create would send). Primary key, write-once. */
  paymentId: string;
  /** The sale's id (`PosOrder.saleId`). */
  saleId: string;
  type: 'void';
  method: PaymentMethodKind;
  amountMinor: number;
  /** Cash only: what the customer handed over. */
  tenderedMinor?: number;
  /** An external terminal's reference. */
  reference?: string;
  /** ISO 4217 code. */
  currency: string;
  /** `removed`: the cashier removed this one leg. `cancelled`: the cashier backed out of tendering. */
  reason: 'removed' | 'cancelled';
  /** Device clock at the void, ISO 8601. */
  deviceTime: string;
  /** The device's IANA time zone. */
  deviceTz: string;
  /** The bound register's id, `''` when no register is bound. */
  registerId: string;
  sessionId?: string;
  /** The cashier, as the backend's user id string. */
  cashierRef: string;
}

export const tenderVoidSchema: RxJsonSchema<TenderVoid> = {
  title: 'Tender voids', version: 0, primaryKey: 'paymentId', type: 'object', additionalProperties: false,
  properties: {
    paymentId: { type: 'string', maxLength: 64 },
    saleId: { type: 'string', maxLength: 64 },
    type: { type: 'string', enum: ['void'], maxLength: 4 },
    method: { type: 'string', enum: ['cash', 'external'] },
    amountMinor: { type: 'integer' },
    tenderedMinor: { type: 'integer' },
    reference: { type: 'string' },
    currency: { type: 'string', maxLength: 3 },
    reason: { type: 'string', enum: ['removed', 'cancelled'] },
    deviceTime: { type: 'string', maxLength: 40 },
    deviceTz: { type: 'string' },
    registerId: { type: 'string' },
    sessionId: { type: 'string' },
    cashierRef: { type: 'string' },
  },
  required: [
    'paymentId', 'saleId', 'type', 'method', 'amountMinor', 'currency', 'reason',
    'deviceTime', 'deviceTz', 'registerId', 'cashierRef',
  ],
  indexes: [['saleId'], ['deviceTime']],
};

export function tenderVoidCollection(): { readonly schema: RxJsonSchema<TenderVoid> } {
  return { schema: tenderVoidSchema } as const;
}
