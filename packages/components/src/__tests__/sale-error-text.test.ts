import { describe, expect, it } from 'vitest';
import { CASH_NOT_PAYABLE, CASH_PICK_LIMIT, CASH_WAITS_FOR_PAYMENT, VOID_LATER_CASH_FIRST } from '@tallyui/pos';
import { saleErrorText } from '../sale/sale-error-text';
import en from '../i18n/locales/en/components.json';

const t = ((key: string) => `T:${key}`) as never;

describe('saleErrorText', () => {
  it('translates the cash waiting refusal through its matching English catalogue key', () => {
    expect(saleErrorText(t, CASH_WAITS_FOR_PAYMENT)).toBe('T:pos_checkout.cash_waits_for_payment');
    expect((en as Record<string, string>)['pos_checkout.cash_waits_for_payment']).toBe(CASH_WAITS_FOR_PAYMENT);
  });
  it('translates the cash payable refusal through its matching English catalogue key', () => {
    const english = (en as Record<string, string>)['pos_checkout.cash_not_payable_typed'];
    expect(english).toBeTypeOf('string');
    expect(english).toBe(CASH_NOT_PAYABLE);
    expect(saleErrorText(t, CASH_NOT_PAYABLE)).toBe('T:pos_checkout.cash_not_payable_typed');
  });
  it('translates the cash pick limit through its matching English catalogue key', () => {
    expect(saleErrorText(t, CASH_PICK_LIMIT)).toBe('T:pos_checkout.cash_pick_limit');
    expect((en as Record<string, string>)['pos_checkout.cash_pick_limit']).toBe(CASH_PICK_LIMIT);
  });
  it('translates the core void refusal through its catalogue key', () => {
    expect(saleErrorText(t, VOID_LATER_CASH_FIRST)).toBe('T:pos_checkout.void_later_cash_first');
  });
  it('shows any other sale error as given', () => {
    expect(saleErrorText(t, 'Something else.')).toBe('Something else.');
  });
  it('the catalogue English is the core string', () => {
    expect((en as Record<string, string>)['pos_checkout.void_later_cash_first']).toBe(VOID_LATER_CASH_FIRST);
  });
});
