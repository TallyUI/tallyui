import { CASH_NOT_PAYABLE, CASH_PICK_LIMIT, CASH_WAITS_FOR_PAYMENT, VOID_LATER_CASH_FIRST } from '@tallyui/pos';
import type { useT } from '../i18n';
/** The sale's error as the cashier reads it: a core refusal with a catalogue key is translated; any other shows as given. */
export function saleErrorText(t: ReturnType<typeof useT>, error: string): string {
  return error === VOID_LATER_CASH_FIRST ? t('pos_checkout.void_later_cash_first')
    : error === CASH_NOT_PAYABLE ? t('pos_checkout.cash_not_payable_typed')
    : error === CASH_WAITS_FOR_PAYMENT ? t('pos_checkout.cash_waits_for_payment')
    : error === CASH_PICK_LIMIT ? t('pos_checkout.cash_pick_limit') : error;
}
