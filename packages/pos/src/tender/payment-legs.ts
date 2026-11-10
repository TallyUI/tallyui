/** Local sale state; the order.create wire does not carry payment status yet. */
import type { PaymentMethodDescriptor } from '@tallyui/core';

export type PaymentLegStatus = 'pending' | 'authorized' | 'captured' | 'failed' | 'voided';
type Leg = { amountMinor: number; status?: PaymentLegStatus };

const moves: Record<PaymentLegStatus, readonly PaymentLegStatus[]> = {
  pending: ['authorized', 'captured', 'failed', 'voided'],
  authorized: ['captured', 'failed', 'voided'],
  captured: ['voided'],
  failed: [],
  voided: [],
};

/** Defaults legacy legs to captured using v2 payments/types.ts PaymentStatus. */
export function legStatus(leg: { status?: PaymentLegStatus }): PaymentLegStatus {
  return leg.status ?? 'captured';
}

/** Only captured money is paid: v2 payments/derive.ts countsTowardPaid (ADR 0040 D6). */
export function countsTowardPaid(leg: { status?: PaymentLegStatus }): boolean {
  return legStatus(leg) === 'captured';
}

/** Pending and authorized are in motion: v2 payments/ledger.ts isInMotionPaymentStatus. */
export function isInMotion(leg: { status?: PaymentLegStatus }): boolean {
  return legStatus(leg) === 'pending' || legStatus(leg) === 'authorized';
}

/** Sums integer minor units using v2 payments/derive.ts countsTowardPaid. */
export function capturedMinor(legs: readonly Leg[]): number {
  return legs.reduce((sum, leg) => sum + (countsTowardPaid(leg) ? leg.amountMinor : 0), 0);
}

/** Sums holds in integer minor units using v2 payments/ledger.ts isInMotionPaymentStatus. */
export function inMotionMinor(legs: readonly Leg[]): number {
  return legs.reduce((sum, leg) => sum + (isInMotion(leg) ? leg.amountMinor : 0), 0);
}

/** Local transitions for v2 payments/ledger.ts isInMotionPaymentStatus and isFinalPaymentStatus. */
export function canMoveLeg(from: PaymentLegStatus, to: PaymentLegStatus): boolean {
  return moves[from].includes(to);
}

/** Voids live legs, captured only manually: v2 payments/ledger.ts partitionVoidableRows. */
export function canVoidLeg(leg: { status?: PaymentLegStatus }, method: PaymentMethodDescriptor): boolean {
  return method.capabilities.void && (isInMotion(leg) || (legStatus(leg) === 'captured' && method.capture.mode === 'manual'));
}
