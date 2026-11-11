import type { ReactNode } from 'react';
import { Pressable, View } from 'react-native';
import type { useRegisterSession } from '@tallyui/pos';

import { cn } from '@tallyui/theme';
import { useShell } from '../shell/shell-context';
import { Avatar, avatarInitials } from '../ui/avatar';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { HStack } from '../ui/hstack';
import { IconButton } from '../ui/icon-button';
import { MenuIcon } from '../ui/icon/menu-icon';
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
  /** The store's name. With `multiRegister` and a bound register the bar reads "Store · Register". */
  storeName?: string;
  /** The signed-in cashier: an initials avatar, pressable when `onPress` is given. */
  cashier?: { name: string; onPress?: () => void };
  /** The app's sync state (a badge or a line), drawn before the cashier. */
  syncStatus?: ReactNode;
  /** Opens the navigation; inside a phone `AppShell` the shell supplies it. Hidden when neither. */
  onOpenMenu?: () => void;
  className?: string;
}

/**
 * The till's one status bar: the menu (phones), the place (the store, and the register for
 * multi-register stores), one status pill (LEDGER 48), the sync state, the button that opens the
 * register panel, and the cashier. Port provenance (ADR-032 amendment 1): WCPOS `next` `3b5331b5c`
 * `register-bar.tsx`; the menu, the place and the cashier from v2 `main` `51e7c4351`
 * `packages/core/src/screens/main/pos/cart/register-bar.tsx` and `components/bar-controls`, MIT, WCPOS.
 *
 * Dropped for this neutral port: the user sheet, switch-store, the notification bell and the
 * WooCommerce OAuth-return rehosting — all app/backend concerns `useRegisterSession` never carries.
 */
export function RegisterBar({
  register,
  registerId,
  online,
  registerName,
  multiRegister,
  onOpenPanel,
  onPressPill,
  storeName,
  cashier,
  syncStatus,
  onOpenMenu,
  className,
}: RegisterBarProps) {
  const { session, overdue, enabled, lastClosure, closing } = register;
  const shell = useShell();
  const openMenu = onOpenMenu ?? shell?.openMenu;
  const pill = describeRegisterBarPill({
    registerId,
    online,
    sessionStatus: session?.status ?? null,
    overdue,
    approvalRequired: session?.approval_required,
    sessionsOn: enabled,
    closing,
  });
  const named = multiRegister && registerId !== null && registerName ? registerName : '';
  // Store · Register: the larger container first, as every v2 line that names both reads.
  const place = storeName ? (named ? `${storeName} · ${named}` : storeName) : named;
  return (
    <HStack testID="register-bar" className={cn('bg-card border-border h-12 gap-2 border-b px-2', className)}>
      {openMenu && (
        <IconButton testID="register-bar-menu" accessibilityLabel="Open menu" onPress={openMenu}>
          <View className="text-foreground">
            <MenuIcon size={24} />
          </View>
        </IconButton>
      )}
      <View className="min-w-0 flex-1 shrink">
        {place ? (
          <Text testID="register-bar-name" className={storeName ? 'font-semibold' : undefined} numberOfLines={1}>
            {place}
          </Text>
        ) : null}
      </View>
      {pill && (onPressPill ? (
        <Pressable testID="register-bar-pill" accessibilityRole="button" accessibilityLabel={pill} onPress={onPressPill}>
          <Badge label={pill} variant="warning" />
        </Pressable>
      ) : (
        <Badge testID="register-bar-pill" label={pill} variant="warning" />
      ))}
      {syncStatus}
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
      {cashier && (
        <Pressable
          testID="register-bar-cashier"
          accessibilityRole={cashier.onPress ? 'button' : undefined}
          accessibilityLabel={`Cashier: ${cashier.name}`}
          disabled={!cashier.onPress}
          onPress={cashier.onPress}
        >
          <Avatar size="sm" fallback={avatarInitials(cashier.name)} />
        </Pressable>
      )}
    </HStack>
  );
}
