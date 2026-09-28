import { Pressable, View } from 'react-native';
import type { useRegisterSession } from '@tallyui/pos';

import { cn } from '@tallyui/theme';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { HStack } from '../ui/hstack';
import { Text } from '../ui/text';
import { describeRegisterBarPill } from './register-bar.helpers';

export interface RegisterBarProps {
  /** `useRegisterSession`'s return value: the session's status, `overdue`, `enabled` and so on. */
  register: ReturnType<typeof useRegisterSession>;
  /** The register this till is bound to, or `null` when no register is chosen yet. */
  registerId: string | null;
  /** `false` when the store, or the app itself, can't be reached — reads to the cashier as offline. */
  online: boolean;
  /** Hidden when `multiRegister` is `false`: a single-register store doesn't need to name it. */
  registerName?: string;
  multiRegister: boolean;
  onOpenPanel: () => void;
  /** Turns the pill into a button (opens the gate/picker or the panel) when given; the plain badge otherwise. */
  onPressPill?: () => void;
  className?: string;
}

/**
 * The till's one status bar: which register (multi-register stores only), one status pill
 * (LEDGER 48), and the button that opens the register panel. Port provenance (ADR-032 amendment
 * 1): WCPOS `next` `3b5331b5c` `register-bar.tsx`.
 *
 * Dropped for this neutral port: the user avatar and user sheet, switch-store, and the
 * WooCommerce OAuth-return rehosting — all app/backend concerns `useRegisterSession` never
 * carries. The drawer/menu button is gone too: TallyUI has no fixed navigation shell to open.
 */
export function RegisterBar({
  register,
  registerId,
  online,
  registerName,
  multiRegister,
  onOpenPanel,
  onPressPill,
  className,
}: RegisterBarProps) {
  const { session, overdue, enabled, lastClosure, closing } = register;
  const pill = describeRegisterBarPill({
    registerId,
    online,
    sessionStatus: session?.status ?? null,
    overdue,
    approvalRequired: session?.approval_required,
    sessionsOn: enabled,
    closing,
  });
  return (
    <HStack testID="register-bar" className={cn('bg-card border-border h-12 border-b px-3', className)}>
      <View className="min-w-0 flex-1 shrink">
        {multiRegister && registerId !== null && (
          <Text testID="register-bar-name" numberOfLines={1}>
            {registerName}
          </Text>
        )}
      </View>
      {pill && (onPressPill ? (
        <Pressable testID="register-bar-pill" accessibilityRole="button" accessibilityLabel={pill} onPress={onPressPill}>
          <Badge label={pill} variant="warning" />
        </Pressable>
      ) : (
        <Badge testID="register-bar-pill" label={pill} variant="warning" />
      ))}
      {(session || lastClosure) && (
        <Button
          variant="ghost"
          size="sm"
          testID="register-bar-open-panel"
          accessibilityLabel="Open register panel"
          onPress={onOpenPanel}
        >
          <Text className={overdue ? 'text-warning' : undefined}>Register ›</Text>
        </Button>
      )}
    </HStack>
  );
}
