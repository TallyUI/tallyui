import { Pressable, View } from 'react-native';
import { useFormatMoney } from '@tallyui/core';

import { PressVeil } from '../product/press-veil';
import { Avatar, avatarInitials } from '../ui/avatar';
import { Button } from '../ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '../ui/dialog';
import { ChevronRightIcon } from '../ui/icon/chevron-right-icon';
import { Text } from '../ui/text';
import { ToneDisc } from '../ui/tone-disc';
import { RegisterIcon } from './register-side-sheet';

export type CashierSheetDrawer = {
  /** The door was pressed: the app opens its register panel. */ onOpen: () => void;
  /** v2's `busy` (a payment in progress, a busy switch): the door cannot be pressed. */ disabled?: boolean;
} & (
  | { state: 'closed'; /** The last closure's number, the store's own when acknowledged. Default "—". */ lastClosure?: string | number }
  | {
      state: 'open' | 'counting';
      /** Expected cash in integer minor units, a blind count's number of sales, or pending figures. */
      figure: { kind: 'cash'; amountMinor: number; currency: string } | { kind: 'blind'; salesCount: number } | { kind: 'pending' };
      /** The open time, already formatted ("HH:mm" in the store's zone). */
      openedAt: string;
      opener: { name: string; avatar?: string };
      /** Only when there is more than one register (v2 :182-185). */ registerName?: string;
      /** state "counting" only: when the count began, already formatted. Default "—". */ countingSince?: string;
    }
);

export interface CashierSheetProps {
  cashier: { name: string; avatar?: string };
  /** The header line, already joined: store · register (when there are several) · "since HH:mm". Hidden when absent. */
  description?: string;
  /** "Your sales today", in integer minor units. Hidden when absent. */
  salesToday?: { amountMinor: number; currency: string };
  /** Sign out pressed. The sheet stays open; the app decides, after its `SwitchConfirm`. */
  onSignOut: () => void;
  /** v2's holds (a payment in progress, a busy switch): Sign out is disabled. */
  signOutDisabled?: boolean;
  onOpenChange: (open: boolean) => void;
  /** v2's drawer door under "Your sales today": the app's figures; pressing it opens the app's register panel. Hidden when absent. */
  drawer?: CashierSheetDrawer;
}

/**
 * The cashier's sheet on the right edge: the header, "Your sales today", the drawer door and Sign out (v2 parity S9a, S9b). The app
 * mounts it while open, as `SwitchConfirm` and `MovementSheet` are mounted. Port provenance: WCPOS v2 monorepo
 * `main` ec022c989 `packages/core/src/screens/main/pos/cart/user-sheet.tsx` (:632 the container, :654-676 the
 * header, :680-687 the sales row, :688-691 the drawer door from :120-165 and :180-229, :800-821 Sign out), with its English copy (`core.json` `register.*`). Literal
 * English, as the other register components carry it. Not here: "Hand the till to", the Store and
 * Register rows and the Woo footer.
 */
export function CashierSheet({ cashier, description, salesToday, onSignOut, signOutDisabled = false, onOpenChange, drawer }: CashierSheetProps) {
  const formatMoney = useFormatMoney();
  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent side="right" testID="cashier-sheet" className="flex-col">
        <DialogHeader className="flex-row items-center gap-3">
          <Avatar size="lg" src={cashier.avatar} alt={cashier.name} fallback={avatarInitials(cashier.name)} />
          <View className="min-w-0 flex-1 gap-1">
            <DialogTitle numberOfLines={1}>{cashier.name}</DialogTitle>
            {!!description && <DialogDescription testID="cashier-sheet-description">{description}</DialogDescription>}
          </View>
        </DialogHeader>
        <View className="flex-1">
          {salesToday && (
            <View testID="cashier-sheet-sales-today" className="flex-row items-center justify-between px-3 py-2.5">
              <Text className="font-medium">Your sales today</Text>
              <Text className="text-xl font-semibold tabular-nums">
                {formatMoney({ amount: salesToday.amountMinor, currency: salesToday.currency })}
              </Text>
            </View>
          )}
          {drawer && <DrawerDoor drawer={drawer} />}
        </View>
        <DialogFooter bordered>
          <Button variant="destructive" testID="cashier-sheet-sign-out" disabled={signOutDisabled} onPress={onSignOut}>
            <Text>Sign out</Text>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** v2 `DrawerDoor` (user-sheet.tsx:180-229) with `useDrawerFigure`'s lines (:120-165), from the app's figures. */
function DrawerDoor({ drawer }: { drawer: CashierSheetDrawer }) {
  const formatMoney = useFormatMoney();
  const open = drawer.state !== 'closed';
  const f = open ? drawer.figure : undefined;
  const amount = drawer.state === 'closed' ? `Register closed · last closure ${drawer.lastClosure ?? '—'}`
    : !f || f.kind === 'pending' ? '—'
    : f.kind === 'blind' ? `${f.salesCount} ${f.salesCount === 1 ? 'sale' : 'sales'}`
    : formatMoney({ amount: f.amountMinor, currency: f.currency });
  const verbs = drawer.state === 'counting' ? `Counting since ${drawer.countingSince ?? '—'} · back to the count`
    : open ? 'Pay in · Pay out · Close register' : 'Last closure · Open register';
  return (
    <Pressable testID="cashier-sheet-drawer" accessibilityRole="button" disabled={drawer.disabled} onPress={drawer.onOpen} className="mx-3 rounded-lg border border-border">
      {({ pressed }) => <>
        <View className="flex-row items-center gap-3 px-3 py-2.5">
          <ToneDisc tone="muted" icon={RegisterIcon} size="sm" />
          <View className="min-w-0 flex-1">
            <Text className="font-medium">In the drawer</Text>
            {open && <View className="flex-row items-center gap-1">
              <Text testID="cashier-sheet-drawer-opener" className="text-sm text-muted-foreground">{f?.kind === 'pending' ? 'Figures arrive with the next sync.'
                : `${drawer.registerName ? `${drawer.registerName} · ` : ''}opened ${drawer.openedAt} by`}</Text>
              {f?.kind !== 'pending' && <Avatar size="sm" src={drawer.opener.avatar} alt={drawer.opener.name} fallback={avatarInitials(drawer.opener.name)} />}
            </View>}
          </View>
          <Text testID="cashier-sheet-drawer-figure" className={f ? 'text-xl font-semibold tabular-nums' : undefined}>{amount}</Text>
        </View>
        <View testID="cashier-sheet-drawer-verbs" className="flex-row items-center justify-between border-t border-border px-3 py-2">
          <Text className="text-primary">{verbs}</Text>
          <View className="text-primary"><ChevronRightIcon size={18} /></View>
        </View>
        <PressVeil pressed={pressed} className="rounded-lg" />
      </>}
    </Pressable>
  );
}
