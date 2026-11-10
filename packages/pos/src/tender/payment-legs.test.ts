import { describe, expect, it } from 'vitest';
import { paymentMethodOf } from '@tallyui/core';
import { legStatus, countsTowardPaid, isInMotion, capturedMinor, inMotionMinor, canMoveLeg, canVoidLeg, type PaymentLegStatus } from './payment-legs';

const statuses: PaymentLegStatus[] = ['pending', 'authorized', 'captured', 'failed', 'voided'];

describe('payment legs', () => {
  it('defaults an absent status to captured', () => {
    expect(legStatus({})).toBe('captured');
    expect(legStatus({ status: 'pending' })).toBe('pending');
  });

  it.each([undefined, ...statuses])('counts only captured legs toward paid: %s', (status) => {
    expect(countsTowardPaid(status === undefined ? {} : { status })).toBe(status === undefined || status === 'captured');
  });

  it.each([undefined, ...statuses])('identifies legs in motion: %s', (status) => {
    expect(isInMotion(status === undefined ? {} : { status })).toBe(status === 'pending' || status === 'authorized');
  });

  it('sums captured money and holds separately in minor units', () => {
    const legs = [
      { amountMinor: 1000, status: 'captured' as const },
      { amountMinor: 200, status: 'pending' as const },
      { amountMinor: 300, status: 'authorized' as const },
      { amountMinor: 400, status: 'failed' as const },
      { amountMinor: 500, status: 'voided' as const },
      { amountMinor: 600 },
    ];
    expect(capturedMinor(legs)).toBe(1600);
    expect(inMotionMinor(legs)).toBe(500);
  });

  it.each(statuses.flatMap((from) => statuses.map((to) => ({ from, to }))))('allows only the specified move $from → $to', ({ from, to }) => {
    const allowed = [
      'pending:authorized', 'pending:captured', 'pending:failed', 'pending:voided',
      'authorized:captured', 'authorized:failed', 'authorized:voided', 'captured:voided',
    ];
    expect(canMoveLeg(from, to)).toBe(allowed.includes(`${from}:${to}`));
  });

  it.each([undefined, ...statuses])('voids live manual cash legs: %s', (status) => {
    expect(canVoidLeg(status === undefined ? {} : { status }, paymentMethodOf('cash')))
      .toBe(status === undefined || status === 'pending' || status === 'authorized' || status === 'captured');
  });

  it('requires the void capability', () => {
    const method = paymentMethodOf('external');
    expect(canVoidLeg({ status: 'pending' }, { ...method, capabilities: { ...method.capabilities, void: false } })).toBe(false);
  });

  it('allows device authorizations to be voided but refuses captured device legs', () => {
    const method = { ...paymentMethodOf('external'), capture: { mode: 'device' as const, provider: null, hardware: null } };
    expect(canVoidLeg({ status: 'captured' }, method)).toBe(false);
    expect(canVoidLeg({ status: 'authorized' }, method)).toBe(true);
  });
});
