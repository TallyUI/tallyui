import type { ReactNode } from 'react';
import { Pressable, View } from 'react-native';
import type { useRegisterSession } from '@tallyui/pos';

import { cn } from '@tallyui/theme';
import { MinTargetBand, useMinTarget } from '../scale/min-target';
import { usePointer } from '../scale/use-pointer';
import { useShell } from '../shell/shell-context';
import { Avatar, avatarInitials } from '../ui/avatar';
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
  /** Sales taken that the store has still to hear: "Offline · N sales to send" offline, "N sales awaiting store" online when no other pill shows (v2). */
  awaitingStore?: number;
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

// v2's StatusBadge (packages/components/src/status-badge): the dot carries the warning colour, the word stays in
// the foreground, so the state never reads by colour alone. MIT, WCPOS.
function PillDot({ label, testID }: { label: string; testID?: string }) {
  return (
    <View testID={testID} className="shrink flex-row items-center gap-1.5">
      <View aria-hidden className="size-2 shrink-0 rounded-full bg-warning" />
      <Text className="shrink text-sm text-foreground" numberOfLines={1}>{label}</Text>
    </View>
  );
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
  awaitingStore,
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
  // h-12 is 42 px at Compact, which clips the menu button's band: under a coarse pointer the bar is the band's height.
  const band = useMinTarget();
  const coarse = usePointer() === 'coarse';
  const pill = describeRegisterBarPill({
    registerId,
    online,
    awaitingStore,
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
    <HStack testID="register-bar" className={cn('bg-card border-border h-12 gap-2 border-b px-2', className)}
      style={coarse ? { minHeight: band } : undefined}>
      {openMenu && (
        <IconButton testID="register-bar-menu" accessibilityLabel="Open menu" onPress={openMenu}>
          <View className="text-foreground">
            <MenuIcon size={24} />
          </View>
          <MinTargetBand square />
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
          <PillDot label={pill} />
        </Pressable>
      ) : (
        <PillDot testID="register-bar-pill" label={pill} />
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
          <Text className={overdue ? 'text-warning-text' : undefined}>Register ›</Text>
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
