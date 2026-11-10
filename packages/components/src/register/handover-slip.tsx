import { View } from 'react-native';
import type { HandoverSlipData } from '@tallyui/pos';

import { formatMoney } from '@tallyui/core';
import { Text } from '../ui/text';
import { tenderLabel } from './register-count';
import { countLine } from './switch-confirm';

export interface HandoverSlipProps {
  /** `handoverSlip(...)`'s result; `document` is not read here (it is what prints). */
  slip: Omit<HandoverSlipData, 'document'>;
  /** ISO 4217 code, for the expected figures. */
  currency: string;
}

/**
 * The hand-over slip on screen: what a closing cashier hands the next one (v2's "Hand-over slip", the open session's
 * X report naming the cashier; WCPOS v2 monorepo `main` 51e7c4351 `switch-confirm.tsx` and `use-session-report.ts`).
 * No dialog: the host places it, for example in a print preview. No expected figures while blind.
 */
export function HandoverSlip({ slip, currency }: HandoverSlipProps) {
  const register = [slip.registerName, slip.openedAtTime && `open since ${slip.openedAtTime}`, slip.openedByName]
    .filter(Boolean)
    .join(' · ');
  return (
    <View testID="handover-slip" className="gap-2">
      <Text testID="handover-slip-title" className="text-lg font-semibold">Hand-over slip</Text>
      <Text testID="handover-slip-register" className="text-muted-foreground">{register}</Text>
      <Text testID="handover-slip-cashier">{`Handed over by ${slip.cashierName}`}</Text>
      <Text testID="handover-slip-sales">{countLine(slip.salesCount, 'sale', 'sales')}</Text>
      {Object.entries(slip.expected ?? {}).map(([method, amount]) => (
        <Text key={method} testID={`handover-slip-expected-${method}`} className="tabular-nums">
          {`Expected ${tenderLabel(method)} ${formatMoney({ amount, currency })}`}
        </Text>
      ))}
      {slip.unsentSales > 0 && (
        <Text testID="handover-slip-unsent-sales">{countLine(slip.unsentSales, 'unsent sale', 'unsent sales')}</Text>
      )}
      {slip.unsentTillUpdates > 0 && (
        <Text testID="handover-slip-unsent-till-updates">
          {countLine(slip.unsentTillUpdates, 'unsent till update', 'unsent till updates')}
        </Text>
      )}
    </View>
  );
}
