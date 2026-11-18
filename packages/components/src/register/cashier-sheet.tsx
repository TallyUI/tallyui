import { View } from 'react-native';
import { useFormatMoney } from '@tallyui/core';

import { Avatar, avatarInitials } from '../ui/avatar';
import { Button } from '../ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '../ui/dialog';
import { Text } from '../ui/text';

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
}

/**
 * The cashier's sheet on the right edge: the header, "Your sales today" and Sign out (v2 parity S9a). The app
 * mounts it while open, as `SwitchConfirm` and `MovementSheet` are mounted. Port provenance: WCPOS v2 monorepo
 * `main` ec022c989 `packages/core/src/screens/main/pos/cart/user-sheet.tsx` (:632 the container, :654-676 the
 * header, :680-687 the sales row, :800-821 Sign out), with its English copy (`core.json` `register.*`). Literal
 * English, as the other register components carry it. Not here: the drawer door, "Hand the till to", the Store and
 * Register rows and the Woo footer.
 */
export function CashierSheet({ cashier, description, salesToday, onSignOut, signOutDisabled = false, onOpenChange }: CashierSheetProps) {
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
