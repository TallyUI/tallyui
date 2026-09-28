import { useState, type ReactNode } from 'react';
import { View } from 'react-native';
import type { useRegisterSession } from '@tallyui/pos';

import { Button } from '../ui/button';
import { Text } from '../ui/text';
import { OpenRegisterCard } from './open-register-card';
import { RegisterPicker, type RegisterPickerRegister } from './register-picker';

export interface RegisterColumnProps {
  /** `useRegisterSession`'s return value: decides the picker/open/counting/selling swap. */
  register: ReturnType<typeof useRegisterSession>;
  /** The register this till is bound to, the same value passed into `useRegisterSession`; `null`
   * means unbound, since the hook's own return carries no such field (it's the app's input, not
   * its output). */
  registerId: string | null;
  registers: RegisterPickerRegister[];
  onPick: (id: string) => void;
  /** ISO 4217 code, forwarded to `OpenRegisterCard`. */
  currency: string;
  configuredFloatMinor?: number | null;
  /** Rendered instead of `children` while a session is counting (Job B fills this). */
  countSlot?: ReactNode;
  /** Whether the cart has no lines; gates the overdue Close register offer (LEDGER 53). */
  cartEmpty?: boolean;
  /** The cart, shown once a register is bound, open, and not counting. */
  children: ReactNode;
}

/**
 * Swaps the cart column's content for register selection, opening or counting when the till
 * needs it, offering Close register when an open session runs overdue with nothing left to
 * sell. Port provenance (ADR-032 amendment 1): WCPOS `next` `3b5331b5c`'s cart-column register
 * swap (LEDGER 53), composed here as one small component rather than inline cart-screen logic.
 */
export function RegisterColumn({
  register,
  registerId,
  registers,
  onPick,
  currency,
  configuredFloatMinor,
  countSlot,
  cartEmpty,
  children,
}: RegisterColumnProps) {
  if (registerId === null) {
    return <RegisterPicker registers={registers} onPick={onPick} className="flex-1" />;
  }
  if (register.session?.status === 'closed') {
    return <FinishClose register={register} />;
  }
  if (!register.session) {
    return <OpenRegisterCard register={register} currency={currency} configuredFloatMinor={configuredFloatMinor} className="flex-1" />;
  }
  if (register.session.status === 'counting') {
    return <>{countSlot}</>;
  }
  return (
    <View testID="register-column" className="flex-1">
      {register.overdue && cartEmpty && (
        <View testID="register-column-overdue" className="bg-warning/10 flex-row items-center justify-between gap-2 px-3 py-2">
          <Text className="flex-1">This register is overdue for closing.</Text>
          <Button
            testID="register-column-close-overdue"
            variant="outline"
            className="min-h-11"
            onPress={() => register.actions.startCounting()}
          >
            <Text>Close register</Text>
          </Button>
        </View>
      )}
      {children}
    </View>
  );
}

/**
 * `currentSession` (`use-register-session.ts` ~110-125) can return a closed session whose closure
 * row was never written: an unapplied reservation's session, or a closed session with no closure
 * row. `openSession` then refuses with `RegisterCloseIncompleteError`, so the cashier is stuck
 * behind the cart unless this offers a way to resume the close.
 */
function FinishClose({ register }: { register: ReturnType<typeof useRegisterSession> }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const finish = async () => {
    setBusy(true);
    setError('');
    try {
      // A resumed close: the store keeps the count persisted on the session (a retry's count is
      // ignored for a session already closed), and the approval gate doesn't run again.
      await register.actions.closeSession({ counted: register.session?.counted ?? {} });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <View testID="register-column-finish-close" className="flex-1 gap-3 p-4">
      <Text>The last close didn&apos;t finish.</Text>
      <Button testID="register-column-finish-close-button" disabled={busy} onPress={finish}>
        <Text>Finish closing</Text>
      </Button>
      {!!error && (
        <Text testID="register-column-finish-close-error" className="text-destructive">
          {error}
        </Text>
      )}
    </View>
  );
}
