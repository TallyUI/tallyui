import { expect, it } from 'vitest';
import { tillPayments } from './till-payments';
import type { PosOrderPayment } from './types';

it("keeps the till's payments and drops the store's locked legs", () => {
  const cash: PosOrderPayment = { id: 'c', method: 'cash', amountMinor: 500 };
  const card: PosOrderPayment = { id: 'k', method: 'external', amountMinor: 300, reference: 'stripe' };
  const locked: PosOrderPayment = { id: 's', method: 'external', amountMinor: 700, storePaymentId: '901' };
  expect(tillPayments([cash, locked, card])).toEqual([cash, card]);
  expect(tillPayments([locked])).toEqual([]);
});
