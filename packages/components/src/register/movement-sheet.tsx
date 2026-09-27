import { useRef, useState } from 'react';
import type { MovementType, useRegisterSession } from '@tallyui/pos';
import { movementFieldError, normalizeAmount, parseMinor } from '@tallyui/pos';

import { minorUnitDigits } from '@tallyui/core';
import { Button } from '../ui/button';
import { Dialog, DialogContent, DialogTitle } from '../ui/dialog';
import { Input } from '../ui/input';
import { Text } from '../ui/text';

const LABELS: Record<MovementType, string> = {
  paid_in: 'Paid in',
  paid_out: 'Paid out',
  no_sale: 'No sale',
};

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
}

/**
 * Records a paid-in, paid-out or no-sale cash movement. Port provenance (ADR-032 amendment 1):
 * WCPOS `next` `3b5331b5c` `movement-sheet.tsx` (LEDGER 55, 56, 66).
 *
 * The cash moves the moment the cashier confirms, so validation happens before the tap, never
 * after: a refusal afterwards would mean cash already moved with no record of it. A no-sale
 * hides the amount field, always records zero, and opens the drawer once the row is written.
 */
export function MovementSheet({ register, type, currency, onDone, onOpenChange, onOpenDrawer }: MovementSheetProps) {
  const digits = minorUnitDigits(currency);
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  // Two taps before a render must not mint two rows (LEDGER 56): a synchronous ref, not only
  // the rendered busy state, claims the submission the instant the first tap runs.
  const busyRef = useRef(false);
  const [error, setError] = useState('');
  const invalid = movementFieldError({ type, amount, reason });
  const confirm = async () => {
    if (invalid || busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setError('');
    const normalized = type === 'no_sale' ? '0' : normalizeAmount(amount);
    const trimmedReason = reason.trim();
    try {
      const amountMinor = parseMinor(normalized, digits);
      const row = await register.actions.recordMovement({ type, amountMinor, reason: trimmedReason });
      onDone?.(row.id, type, amountMinor);
      if (type === 'no_sale') onOpenDrawer?.();
      onOpenChange(false);
    } catch (e) {
      setError(String(e));
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
          <Input>
            <Input.Field testID="movement-amount" value={amount} onChangeText={setAmount} keyboardType="decimal-pad" />
          </Input>
        )}
        <Input>
          <Input.Field testID="movement-reason" placeholder="Reason" value={reason} onChangeText={setReason} />
        </Input>
        {!!error && <Text className="text-destructive">{error}</Text>}
        {!!invalid && (
          <Text testID="movement-invalid" className="text-muted-foreground">
            {invalid === 'amount' ? 'Enter a valid amount.' : 'Enter a reason.'}
          </Text>
        )}
        <Button testID="movement-confirm" disabled={!!invalid || busy} onPress={confirm}>
          <Text>{busy ? 'Recording…' : 'Record'}</Text>
        </Button>
      </DialogContent>
    </Dialog>
  );
}
