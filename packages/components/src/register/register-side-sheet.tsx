import { useState } from 'react';
import { View } from 'react-native';
import { Path, Rect } from 'react-native-svg';
import type { DrawerTerms, RegisterSession } from '@tallyui/pos';

import { formatMoney } from '@tallyui/core';
import { Button } from '../ui/button';
import { DialogDescription, DialogTitle } from '../ui/dialog';
import { createSvgIcon } from '../ui/icon/svg-icon';
import { Text } from '../ui/text';
import { tenderLabel } from './register-count';

/** The panel header's register mark (v2 `ToneDisc icon="register"`). */
export const RegisterIcon = createSvgIcon('RegisterIcon', () => (
  <>
    <Rect x={6} y={3} width={12} height={6} rx={1} />
    <Path d="M12 9v3" />
    <Rect x={3} y={12} width={18} height={9} rx={1} />
    <Path d="M3 16h18" />
  </>
));

const clock = (date: Date) => `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;

/**
 * v2's header line (`register-panel.tsx:318-326`): store · open since {time} (or closed {time})
 * · age · opener. The session row holds only the opener's id, never a name, so the opener is
 * v2's own fallback, "Cashier" (`register.unknown_cashier`).
 */
export function describeSession(session: RegisterSession | null, storeName: string | undefined, now: Date) {
  const parts = [storeName];
  if (session) {
    const opened = new Date(session.opened_at_gmt);
    const closed = session.status === 'closed' && session.closed_at_gmt ? new Date(session.closed_at_gmt) : null;
    const minutes = Math.max(0, Math.floor(((closed ?? now).getTime() - opened.getTime()) / 60_000));
    parts.push(closed ? `closed ${clock(closed)}` : `open since ${clock(opened)}`,
      minutes >= 60 ? `${Math.floor(minutes / 60)} h ${minutes % 60} m` : `${minutes} m`, 'Cashier');
  }
  return parts.filter(Boolean).join(' · ');
}

/** The sheet's title block: the register mark, the register's name and the header line. */
export function RegisterSideHeader({ session, registerName, storeName, now }: {
  session: RegisterSession | null; registerName?: string; storeName?: string; now?: () => Date;
}) {
  return (
    <View className="flex-1 flex-row items-center gap-3">
      <View className="h-9 w-9 items-center justify-center rounded-md bg-muted">
        <RegisterIcon size={18} />
      </View>
      <View className="flex-1 gap-1">
        <DialogTitle testID="register-panel-title">{registerName ?? 'Register'}</DialogTitle>
        <DialogDescription testID="register-panel-description">
          {describeSession(session, storeName, now ? now() : new Date())}
        </DialogDescription>
      </View>
    </View>
  );
}

/**
 * The fixed footer: Print X-report (when the host prints one; off while blind, without a
 * session or while printing, and v2's "Printing failed. Try again." on a rejection) and Close
 * register. v2's overdue label needs the close time, which `useRegisterSession` does not return.
 */
export function RegisterSideFooter({ canPrint, onPrintXReport, canClose, onClose }: {
  canPrint: boolean; onPrintXReport?: () => void | Promise<void>; canClose: boolean; onClose: () => void;
}) {
  const [printing, setPrinting] = useState(false);
  const [failed, setFailed] = useState(false);
  const print = async (run: () => void | Promise<void>) => {
    setPrinting(true);
    setFailed(false);
    try {
      await run();
    } catch {
      setFailed(true);
    } finally {
      setPrinting(false);
    }
  };
  return (
    <View testID="register-panel-footer" className="gap-2 border-t border-border pt-4">
      {failed && <Text testID="register-panel-print-error" className="text-destructive">Printing failed. Try again.</Text>}
      <View className="flex-row gap-2">
        {onPrintXReport && (
          <Button
            testID="register-panel-print"
            variant="outline"
            className="min-h-11 flex-1"
            disabled={!canPrint || printing}
            onPress={() => void print(onPrintXReport)}
          >
            <Text>Print X-report</Text>
          </Button>
        )}
        <Button testID="register-panel-close" className="min-h-11 flex-1" disabled={!canClose} onPress={onClose}>
          <Text>Close register</Text>
        </Button>
      </View>
    </View>
  );
}

function Line({ label, amount, testID, strong }: { label: string; amount?: string; testID?: string; strong?: boolean }) {
  const weight = strong ? 'font-semibold' : '';
  return (
    <View testID={testID} className="min-h-11 flex-row items-center justify-between gap-2 border-b border-border">
      <Text className={weight}>{label}</Text>
      {amount !== undefined && <Text className={`tabular-nums ${weight}`}>{amount}</Text>}
    </View>
  );
}

interface FiguresProps {
  terms: DrawerTerms | null;
  blind: boolean;
  currency: string;
}

/** The hero (cash expected, "in the drawer") and the session sales line; `—` and no sales while blind. */
export function RegisterSideHero({ terms, blind, currency, salesCount }: FiguresProps & { salesCount: number }) {
  const shown = !blind && terms ? terms : null;
  return (
    <View className="gap-1">
      <View testID="register-panel-hero" className="flex-row flex-wrap items-baseline gap-2">
        <Text className="text-4xl font-semibold tabular-nums">
          {shown ? formatMoney({ amount: shown.expected.cash ?? 0, currency }) : '—'}
        </Text>
        <Text className="text-muted-foreground">in the drawer</Text>
      </View>
      {shown && (
        <View testID="register-panel-session-sales" className="flex-row flex-wrap gap-2">
          <Text className="text-muted-foreground">Session sales</Text>
          <Text className="font-semibold tabular-nums">
            {`${formatMoney({ amount: shown.sessionSalesMinor, currency })} · ${salesCount} sale${salesCount === 1 ? '' : 's'}`}
          </Text>
        </View>
      )}
    </View>
  );
}

/** The drawer ledger (v2 `register-panel.tsx:450-536`) and Other tenders; nothing while blind. */
export function RegisterSideLedger({ terms, blind, currency }: FiguresProps) {
  if (blind || !terms) return null;
  const money = (amount: number) => formatMoney({ amount, currency }) ?? '';
  const rows = [
    { label: 'Cash sales', term: terms.cashSales, sign: '' },
    { label: 'Cash refunds', term: terms.cashRefunds, sign: '−' },
    { label: 'Paid in', term: terms.paidIn, sign: '' },
    { label: 'Paid out', term: terms.paidOut, sign: '−' },
  ].filter((row) => row.term.count > 0);
  const others = Object.entries(terms.otherTenders);
  return (
    <>
      <View testID="register-panel-ledger">
        <Line label="Float" amount={money(terms.floatMinor)} />
        {rows.map(({ label, term, sign }) => (
          <Line key={label} label={`${label} · ${term.count}`} amount={`${sign}${money(term.amountMinor)}`} />
        ))}
        {terms.noSales > 0 && <Line label={`No sale · ${terms.noSales}`} />}
        <Line testID="register-panel-expected" label="Expected in the drawer" amount={money(terms.expected.cash ?? 0)} strong />
      </View>
      {others.length > 0 && (
        <View testID="register-panel-other-tenders">
          <Text className="text-muted-foreground text-sm font-semibold">Other tenders</Text>
          {others.map(([method, term]) => (
            <Line key={method} label={`${tenderLabel(method)} · ${term.count}`} amount={money(term.amountMinor)} />
          ))}
        </View>
      )}
    </>
  );
}
