import { useRef, useState } from 'react';
import { Pressable, View, type TextInput } from 'react-native';
import type { MovementType, useRegisterSession } from '@tallyui/pos';
import { movementFieldError, normalizeAmount, parseMinor } from '@tallyui/pos';

import { useCurrencySymbol, useFormatMoney, minorUnitDigits } from '@tallyui/core';
import { cn } from '@tallyui/theme';
import { useT } from '../i18n';
import { errorText } from '../lib/error-text';
import { Button } from '../ui/button';
import { Dialog, DialogContent, DialogTitle } from '../ui/dialog';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Text } from '../ui/text';

const LABELS: Record<MovementType, string> = {
  paid_in: 'Paid in',
  paid_out: 'Paid out',
  no_sale: 'No sale',
};

// v2's `REASONS` (`movement-sheet.tsx:39`): the store's common reasons per type, v2's keys and order.
const REASONS: Record<MovementType, readonly { key: string; label: string }[]> = {
  paid_out: [{ key: 'supplier', label: 'Supplier' }, { key: 'petty_cash', label: 'Petty cash' }, { key: 'bank', label: 'Bank' },
    { key: 'tips', label: 'Tips' }, { key: 'change', label: 'Change' }],
  paid_in: [{ key: 'float', label: 'Float' }, { key: 'change', label: 'Change' }, { key: 'bank', label: 'Bank' }],
  no_sale: [{ key: 'change', label: 'Change' }, { key: 'mistake', label: 'Mistake' }, { key: 'drawer_check', label: 'Drawer check' }],
};

const AMOUNT_LABEL_ID = 'movement-amount-label';
const REASON_LABEL_ID = 'movement-reason-label';

export interface MovementSheetProps {
  /** `useRegisterSession`'s return value: records the movement through `register.actions.recordMovement`. */
  register: ReturnType<typeof useRegisterSession>;
  /** The caller mounts this only once a type is chosen, so the sheet always has one to record. */
  type: MovementType;
  /** ISO 4217 code, for parsing the typed amount into minor units. */
  currency: string;
  onDone?: (id: string, type: MovementType, amountMinor: number) => void;
  onOpenChange: (open: boolean) => void;
  /** A no-sale opens the drawer once recorded (LEDGER 66); there is nothing to open otherwise. */
  onOpenDrawer?: () => void;
  /** Replaces the default reason chips for this type; `[]` shows only "Other…". */
  reasons?: readonly string[];
}

/**
 * Records a paid-in, paid-out or no-sale cash movement. Port provenance (ADR-032 amendment 1):
 * WCPOS `next` `3b5331b5c` `movement-sheet.tsx` (LEDGER 55, 56, 66).
 *
 * The cash moves the moment the cashier confirms, so validation happens before the tap, never
 * after: a refusal afterwards would mean cash already moved with no record of it. A no-sale
 * hides the amount field, always records zero, and opens the drawer once the row is written.
 */
export function MovementSheet({ register, type, currency, onDone, onOpenChange, onOpenDrawer, reasons }: MovementSheetProps) {
  const t = useT();
  const currencySymbol = useCurrencySymbol();
  const formatMoney = useFormatMoney();
  const digits = minorUnitDigits(currency);
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  // Two taps before a render must not mint two rows (LEDGER 56): a synchronous ref, not only
  // the rendered busy state, claims the submission the instant the first tap runs.
  const busyRef = useRef(false);
  const [error, setError] = useState('');
  const reasonRef = useRef<TextInput>(null);
  const chips = reasons
    ? reasons.map((label) => ({ key: label.toLowerCase().replace(/[^a-z0-9]+/g, '-'), label }))
    : REASONS[type];
  const fieldError = movementFieldError({ type, amount, reason });
  const typed = normalizeAmount(amount);
  const amountMinor = type === 'no_sale' ? 0 : fieldError === 'amount' ? NaN : parseMinor(typed, digits);
  // The server's grammar allows any decimal places and 15 integer digits; the currency and a safe integer allow fewer.
  // recordMovement refuses anything but a safe integer (ADR-068 6a) after the cash has moved, so the same test gates
  // the tap. The amount is checked before the reason.
  const invalid = type === 'no_sale' || fieldError === 'amount' ? fieldError
    : Number.isNaN(amountMinor) ? 'places'
    : !Number.isSafeInteger(amountMinor) ? 'amount'
    : fieldError;
  // v2's confirm label (`movement-sheet.tsx:126`): it names the minor amount `confirm` records, in the store's format;
  // an amount the gate refuses (blank, zero, invalid, too many places, too large) reads the bare verb. A no sale keeps "Record".
  const figure = type !== 'no_sale' && fieldError !== 'amount' && Number.isSafeInteger(amountMinor)
    ? formatMoney({ amount: amountMinor, currency }) : undefined;
  const verb = type === 'paid_in' ? (figure ? t('register.put_in', { amount: figure }) : t('register.put_cash_in'))
    : type === 'paid_out' ? (figure ? t('register.take_out', { amount: figure }) : t('register.take_cash_out'))
    : 'Record';
  const confirm = async () => {
    if (invalid || busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setError('');
    const trimmedReason = reason.trim();
    try {
      const row = await register.actions.recordMovement({ type, amountMinor, reason: trimmedReason });
      onDone?.(row.id, type, amountMinor);
      if (type === 'no_sale') onOpenDrawer?.();
      onOpenChange(false);
    } catch (e) {
      setError(errorText(e));
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };
  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent testID="movement-sheet">
        <DialogTitle>{LABELS[type]}</DialogTitle>
        {type !== 'no_sale' && (
          <>
            <Label testID="movement-amount-label" nativeID={AMOUNT_LABEL_ID}>
              {`Amount (${currencySymbol(currency)})`}
            </Label>
            <Input>
              <Input.Field
                testID="movement-amount"
                value={amount}
                onChangeText={setAmount}
                keyboardType="decimal-pad"
                accessibilityLabel={`Amount (${currencySymbol(currency)})`}
                accessibilityLabelledBy={AMOUNT_LABEL_ID}
              />
            </Input>
          </>
        )}
        <Label testID="movement-reason-label" nativeID={REASON_LABEL_ID}>
          Reason
        </Label>
        <View testID="movement-reason-chips" className="flex-row flex-wrap gap-2">
          {[...chips, { key: 'other', label: 'Other…' }].map(({ key, label }) => {
            const other = key === 'other';
            const on = !other && reason === label;
            return (
              <Pressable key={key} testID={`movement-reason-${key.replace(/_/g, '-')}`} role="button"
                aria-pressed={other ? undefined : on}
                onPress={() => {
                  setReason(on || other ? '' : label);
                  if (other) reasonRef.current?.focus();
                }}
                className={cn('rounded-full px-3 py-1.5', on ? 'bg-primary' : 'bg-accent')}>
                <Text className={cn('text-xs font-semibold', on ? 'text-primary-foreground' : 'text-muted-foreground')}>
                  {label}
                </Text>
              </Pressable>
            );
          })}
        </View>
        <Input>
          <Input.Field
            ref={reasonRef}
            testID="movement-reason"
            placeholder="Reason"
            value={reason}
            onChangeText={setReason}
            accessibilityLabel="Reason"
            accessibilityLabelledBy={REASON_LABEL_ID}
          />
        </Input>
        {!!error && <Text className="text-destructive">{error}</Text>}
        {!!invalid && (
          <Text testID="movement-invalid" className="text-muted-foreground">
            {invalid === 'amount' ? 'Enter a valid amount.' : invalid !== 'places' ? 'Enter a reason.'
              : digits === 0 ? 'Enter a whole amount.' : `Enter an amount with at most ${digits} decimal places.`}
          </Text>
        )}
        <Button testID="movement-confirm" disabled={!!invalid || busy} onPress={confirm}>
          <Text>{busy ? 'Recording…' : verb}</Text>
        </Button>
      </DialogContent>
    </Dialog>
  );
}
