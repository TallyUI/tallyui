import { VOID_LATER_CASH_FIRST } from '@tallyui/pos';
import type { useT } from '../i18n';
/** The sale's error as the cashier reads it: a core refusal with a catalogue key is translated; any other shows as given. */
export function saleErrorText(t: ReturnType<typeof useT>, error: string): string {
  return error === VOID_LATER_CASH_FIRST ? t('pos_checkout.void_later_cash_first') : error;
}
