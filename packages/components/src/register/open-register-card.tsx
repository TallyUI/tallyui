import { useState } from 'react';
import { View } from 'react-native';
import type { useRegisterSession } from '@tallyui/pos';
import { parseMinor, validAmount } from '@tallyui/pos';

import { currencySymbol, formatMoney, minorUnitDigits } from '@tallyui/core';
import { cn } from '@tallyui/theme';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Text } from '../ui/text';

const AMOUNT_LABEL_ID = 'open-register-amount-label';

export interface OpenRegisterCardProps {
  /** `useRegisterSession`'s return value: opens the session through `register.actions.openSession`. */
  register: ReturnType<typeof useRegisterSession>;
  /** ISO 4217 code, for parsing and formatting the typed amount. */
  currency: string;
  /** The store's configured opening float, minor units; preferred over the last counted cash. */
  configuredFloatMinor?: number | null;
  className?: string;
}

/**
 * Opens a register session, prefilled with the configured float or the last counted cash.
 * Port provenance (ADR-032 amendment 1): WCPOS `next` `3b5331b5c` `open-register-card.tsx`
 * (LEDGER 52).
 *
 * The chip choices are already resolved once `expectedFloatMinor` is computed: a late-arriving
 * `configuredFloatMinor` or `register.lastClosure` never overwrites what the cashier already
 * typed, because `enteredAmount` only ever starts from it, never re-derives from it.
 */
export function OpenRegisterCard({ register, currency, configuredFloatMinor, className }: OpenRegisterCardProps) {
  const digits = minorUnitDigits(currency);
  const lastCountedMinor = register.lastClosure?.counted?.cash ?? null;
  const expectedFloatMinor = configuredFloatMinor ?? lastCountedMinor ?? null;
  const [enteredAmount, setEnteredAmount] = useState<string | null>(null);
  const amount = enteredAmount ?? (expectedFloatMinor != null ? decimal(expectedFloatMinor, digits) : '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const valid = validAmount(amount, digits);
  const countedMinor = valid ? parseMinor(amount, digits) : NaN;
  const open = async () => {
    if (busy || !valid) return;
    setBusy(true);
    setError('');
    try {
      await register.actions.openSession({ expectedFloatMinor, countedFloatMinor: countedMinor });
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  };
  const amountLabel = `Cash in the drawer to start (${currencySymbol(currency)})`;
  return (
    <View testID="open-register-card" className={cn('bg-card gap-3 rounded-md p-4', className)}>
      <Text className="text-lg font-semibold">Open register</Text>
      <Label testID="open-register-amount-label" nativeID={AMOUNT_LABEL_ID}>
        {amountLabel}
      </Label>
      <Input>
        <Input.Field
          testID="open-register-amount"
          value={amount}
          onChangeText={setEnteredAmount}
          keyboardType="decimal-pad"
          accessibilityLabel={amountLabel}
          accessibilityLabelledBy={AMOUNT_LABEL_ID}
        />
      </Input>
      {configuredFloatMinor != null && (
        <Button
          testID="open-register-chip-configured"
          variant="outline"
          className="min-h-11"
          onPress={() => setEnteredAmount(decimal(configuredFloatMinor, digits))}
        >
          <Text>Use the configured float ({formatMoney({ amount: configuredFloatMinor, currency })})</Text>
        </Button>
      )}
      {lastCountedMinor != null && (
        <Button
          testID="open-register-chip-last"
          variant="outline"
          className="min-h-11"
          onPress={() => setEnteredAmount(decimal(lastCountedMinor, digits))}
        >
          <Text>Use the last counted cash ({formatMoney({ amount: lastCountedMinor, currency })})</Text>
        </Button>
      )}
      {expectedFloatMinor !== null && valid && countedMinor !== expectedFloatMinor && (
        <Text testID="opening-variance">
          {formatMoney({ amount: countedMinor - expectedFloatMinor, currency })} vs the expected float
        </Text>
      )}
      {!!error && <Text className="text-destructive">{error}</Text>}
      <Button testID="open-register-button" className="min-h-14" disabled={busy || !valid} onPress={open}>
        <Text>{busy ? 'Opening…' : 'Open register'}</Text>
      </Button>
    </View>
  );
}

function decimal(minor: number, digits: number): string {
  const scale = 10 ** digits;
  return (minor / scale).toFixed(digits);
}
