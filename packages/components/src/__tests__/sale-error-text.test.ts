import { describe, expect, it } from 'vitest';
import { VOID_LATER_CASH_FIRST } from '@tallyui/pos';
import { saleErrorText } from '../sale/sale-error-text';
import en from '../i18n/locales/en/components.json';

const t = ((key: string) => `T:${key}`) as never;

describe('saleErrorText', () => {
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
