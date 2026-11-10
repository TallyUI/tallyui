/**
 * The opening float the open-register card suggests (v2 parity A4): the register's default float, else the cash
 * counted at the last close, else none. Port provenance: WCPOS v2 monorepo `main` `5ac185b0e`,
 * `packages/core/src/screens/main/pos/cart/open-register-card.tsx:40-50` (`defaultFloat ?? lastCount ?? null`), with
 * `seedAmount` from `packages/core/src/services/register-session/count-money.ts`. Money is TallyUI's integer
 * minor-units convention, so `seedAmount`'s rounding of four-decimal server strings has no counterpart here.
 */
import type { RegisterInfo } from '@tallyui/core';

export type FloatSuggestion =
  | { amountMinor: number; source: 'default' | 'last_count' }
  | { amountMinor: null; source: null };

/** A default float of zero is still the default, as in v2 (`??`, not `||`). */
export function suggestFloat({ register, lastCountedCashMinor }: {
  register?: Pick<RegisterInfo, 'defaultFloatMinor'> | null;
  lastCountedCashMinor?: number | null;
}): FloatSuggestion {
  if (register?.defaultFloatMinor != null) return { amountMinor: register.defaultFloatMinor, source: 'default' };
  if (lastCountedCashMinor != null) return { amountMinor: lastCountedCashMinor, source: 'last_count' };
  return { amountMinor: null, source: null };
}
