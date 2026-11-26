import { minorUnitDigits, type PaymentMethodKind } from '@tallyui/core';

/**
 * A WCPOS 2.0 ledger `record` body for one payment (`orders/{id}/payments`): the payment id, `pos_cash` or `pos_card`,
 * the amount as Woo's decimal string, the currency, and `tendered` for cash only (change is never sent). `digits` is the
 * decimal places of the amounts, the currency's unless the sale carries a display exponent.
 */
export function paymentRecordBody(payment: { id: string; method: PaymentMethodKind; amountMinor: number; tenderedMinor?: number },
  currency: string, digits = minorUnitDigits(currency)) {
  const major = (minor: number) => (minor / 10 ** digits).toFixed(digits);
  const cash = payment.method === 'cash';
  return { payment: {
    id: payment.id, method_id: cash ? 'pos_cash' : 'pos_card', amount: major(payment.amountMinor), currency,
    ...(cash && payment.tenderedMinor !== undefined ? { tendered: major(payment.tenderedMinor) } : {}),
  } };
}
