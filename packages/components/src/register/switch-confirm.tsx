import { View } from 'react-native';
import type { SwitchKind, SwitchWarning, SwitchWarnings } from '@tallyui/pos';

import { Button } from '../ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '../ui/dialog';
import { Text } from '../ui/text';

/** `{n} {one}` or `{n} {other}`; shared with `HandoverSlip`, not exported from the package. */
export const countLine = (n: number, one: string, other: string) => `${n} ${n === 1 ? one : other}`;

const WARNING_LINES: Record<Exclude<SwitchWarning['code'], 'openSession'>, (n: number) => string> = {
  unsentSales: (n) => countLine(n, 'unsent sale', 'unsent sales'),
  unsentTillUpdates: (n) => countLine(n, 'unsent till update', 'unsent till updates'),
  parkedSales: (n) => countLine(n, 'parked sale', 'parked sales'),
  partlyPaidSale: () => 'A sale is partly paid',
};

export interface SwitchConfirmProps {
  kind: SwitchKind;
  warnings: SwitchWarnings;
  /** The cashier or register switched to; unused for `signOut`. */
  targetName?: string;
  /** The bound register's name, for the descriptions and the sign-out title. */
  registerName?: string;
  /** A formatted expected cash amount for the sign-out title; omit while blind. */
  amount?: string;
  onConfirm: () => void;
  onCancel: () => void;
  /** Sign-out with an open session: renders "Close register", which calls this. */
  onCloseRegister?: () => void;
  /** Cashier switch: renders "Print hand-over slip", which calls this. */
  onPrintHandover?: () => void;
}

/**
 * Confirms a cashier switch, a register switch or a sign-out, naming what it leaves behind (v2 parity A12). Port
 * provenance: WCPOS v2 monorepo `main` 51e7c4351 `packages/core/src/screens/main/pos/cart/switch-confirm.tsx`, with
 * its English copy (`locales/en/core.json`, `register.*`). Not ported: the store switch and its drawer carry, and
 * v2's "The POS reloads as …" lines (a TallyUI app's switch is its platform's own). New here: unsent sales add
 * "anyway" to the confirm, and till updates, parked sales and a partly paid sale are listed too.
 */
export function SwitchConfirm({
  kind, warnings, targetName = '', registerName, amount, onConfirm, onCancel, onCloseRegister, onPrintHandover,
}: SwitchConfirmProps) {
  const anyway = warnings.unsentSales > 0 ? ' anyway' : '';
  let title: string;
  let description = '';
  let confirm: string;
  if (kind === 'cashier') {
    title = `Hand the till to ${targetName}?`;
    if (registerName) description = `The drawer stays open on ${registerName}.`;
    confirm = `Hand over to ${targetName}${anyway}`;
  } else if (kind === 'register') {
    title = `Switch to ${targetName}?`;
    description = warnings.sessionOpen && registerName
      ? `This device moves to ${targetName}. ${registerName}'s drawer stays open for whoever is there.`
      : `This device moves to ${targetName}.`;
    confirm = `Switch to ${targetName}${anyway}`;
  } else if (warnings.sessionOpen) {
    const name = registerName ?? 'The register';
    title = amount ? `${name} is still open at ${amount}. Close it first?` : `${name} is still open. Close it first?`;
    description = 'A till left open stays open for the next cashier. The closure records who closed it.';
    confirm = 'Sign out anyway';
  } else {
    title = 'Sign out?';
    confirm = `Sign out${anyway}`;
  }
  const lines = warnings.warnings.flatMap((w) =>
    w.code === 'openSession' ? [] : [{ code: w.code, text: WARNING_LINES[w.code]('count' in w ? w.count : 0) }],
  );
  return (
    <Dialog open onOpenChange={(open) => { if (!open) onCancel(); }}>
      <DialogContent testID="switch-confirm">
        <DialogTitle testID="switch-confirm-title">{title}</DialogTitle>
        {!!description && <DialogDescription testID="switch-confirm-description">{description}</DialogDescription>}
        {lines.length > 0 && (
          <View testID="switch-confirm-warnings" className="gap-1">
            {lines.map((line) => (
              <Text key={line.code} testID={`switch-warning-${line.code}`} className="text-muted-foreground">{line.text}</Text>
            ))}
          </View>
        )}
        <Button testID="switch-confirm-confirm" className="min-h-14" onPress={onConfirm}>
          <Text>{confirm}</Text>
        </Button>
        {kind === 'signOut' && warnings.sessionOpen && !!onCloseRegister && (
          <Button testID="switch-confirm-close-register" variant="outline" className="min-h-14" onPress={onCloseRegister}>
            <Text>Close register</Text>
          </Button>
        )}
        {kind === 'cashier' && !!onPrintHandover && (
          <Button testID="switch-confirm-handover" variant="outline" className="min-h-14" onPress={onPrintHandover}>
            <Text>Print hand-over slip</Text>
          </Button>
        )}
        <Button testID="switch-confirm-cancel" variant="ghost" className="min-h-14" onPress={onCancel}>
          <Text>Cancel</Text>
        </Button>
      </DialogContent>
    </Dialog>
  );
}
