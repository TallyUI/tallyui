import { useState } from 'react';
import { ScrollView, useWindowDimensions, View } from 'react-native';
import type { MovementType, useRegisterSession } from '@tallyui/pos';

import { formatMoney } from '@tallyui/core';
import { Button } from '../ui/button';
import { Dialog, DialogContent, DialogTitle } from '../ui/dialog';
import { Text } from '../ui/text';
import { MovementSheet } from './movement-sheet';

/** Margin kept clear above and below the dialog (LEDGER-free layout fix, 2026-09-28 review):
 * a phone-height viewport must never let the panel's top go under the page header. */
const DIALOG_VERTICAL_MARGIN = 64;

export interface RegisterPanelProps {
  /** `useRegisterSession`'s return value: movements, `expected`, `blind`, and every action used here. */
  register: ReturnType<typeof useRegisterSession>;
  /** ISO 4217 code, for money display and movement amounts. */
  currency: string;
  /** Shown as the panel's title while blind counting hides the expected amount. */
  registerName?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  className?: string;
}

/**
 * The register's drawer panel: expected figures, cash movements with Undo, and Close register.
 * Port provenance (ADR-032 amendment 1): WCPOS `next` `3b5331b5c` `register-panel.tsx` (LEDGER
 * 54, 56, 58).
 *
 * Leaves out (registers job c2 or a later job, per `useRegisterSession`'s own "Not ported"
 * note): refused-movement Retry and "Unsynced" (no outbox here to refuse a movement), the
 * X-report, Z and print/reprint, and the Reports deep link.
 */
export function RegisterPanel({ register, currency, registerName, open, onOpenChange, className }: RegisterPanelProps) {
  const { session, expected, salesCount, blind, movements, lastClosure, actions } = register;
  const { height: windowHeight } = useWindowDimensions();
  const maxHeight = Math.max(280, windowHeight - DIALOG_VERTICAL_MARGIN);
  const [movementType, setMovementType] = useState<MovementType | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [error, setError] = useState('');
  const attempt = async (action: () => Promise<unknown>) => {
    try {
      await action();
    } catch (e) {
      setError(String(e));
    }
  };
  // Refused cash keeps a panel open on its own in WCPOS; there is no outbox here to refuse a
  // movement, so a session or a written closure is always what keeps this panel worth showing.
  if (!session && !lastClosure) return null;
  // Voided and reversal rows are hidden from the active list (LEDGER 58): the audit trail keeps
  // them, but the cashier sees only what's still standing.
  const activeMovements = movements.filter(
    (row) => row.type !== 'void' && !row.voided_by && !movements.some((entry) => entry.voids === row.id),
  );
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        testID="register-panel"
        className={`flex-col overflow-hidden ${className ?? ''}`}
        style={{ maxHeight }}
      >
        {/* The heading stays visible; a phone-height viewport must never push it under the page
            header (the Front desk review, 2026-09-28) — only the body below it scrolls. */}
        <DialogTitle testID="register-panel-amount">{registerName ?? 'Register'}</DialogTitle>
        <Text testID="register-panel-sales-count">{salesCount} sale{salesCount === 1 ? '' : 's'} this session</Text>
        <ScrollView testID="register-panel-body" className="flex-1" contentContainerClassName="gap-3">
          <View className="flex-row gap-2">
            {(['paid_in', 'paid_out', 'no_sale'] as const).map((type) => (
              <Button
                key={type}
                testID={`register-panel-${type.replace('_', '-')}`}
                className="min-h-14 flex-1"
                variant="outline"
                disabled={session?.status !== 'open'}
                onPress={() => setMovementType(type)}
              >
                <Text>{type === 'paid_in' ? 'Paid in' : type === 'paid_out' ? 'Paid out' : 'No sale'}</Text>
              </Button>
            ))}
          </View>
          {!blind && (
            <View testID="register-panel-expected" className="gap-1">
              <Text className="text-muted-foreground text-sm font-semibold">Expected in the drawer</Text>
              {Object.entries(expected).map(([method, amount]) => (
                <View key={method} className="min-h-11 flex-row items-center justify-between">
                  <Text className="capitalize">{method === 'cash' ? 'Cash' : method}</Text>
                  <Text className="tabular-nums">{formatMoney({ amount, currency })}</Text>
                </View>
              ))}
            </View>
          )}
          <Button
            testID="register-panel-movements"
            variant="ghost"
            className="min-h-11"
            onPress={() => setExpanded(!expanded)}
          >
            <Text>Paid in / out</Text>
          </Button>
          {expanded &&
            activeMovements.map((row) => (
              <View key={row.id} className="min-h-11 flex-row items-center gap-2">
                <Text testID={`movement-row-${row.id}`} className="flex-1">
                  {row.type === 'paid_in' ? 'Paid in' : row.type === 'paid_out' ? 'Paid out' : 'No sale'}
                  {!blind ? ` · ${formatMoney({ amount: row.amountMinor, currency })} · ${row.reason}` : ''}
                </Text>
                <Button
                  variant="ghost"
                  className="min-h-11"
                  testID={`movement-void-${row.id}`}
                  disabled={session?.status !== 'open'}
                  onPress={() => attempt(() => actions.voidMovement(row.id))}
                >
                  <Text>Undo</Text>
                </Button>
              </View>
            ))}
          {!!error && <Text className="text-destructive">{error}</Text>}
          <Button
            testID="register-panel-close"
            disabled={!session}
            variant="outline"
            className="min-h-14"
            onPress={() =>
              attempt(async () => {
                await actions.startCounting();
                onOpenChange(false);
              })
            }
          >
            <Text>Close register</Text>
          </Button>
        </ScrollView>
        {movementType && (
          <MovementSheet
            register={register}
            type={movementType}
            currency={currency}
            onOpenChange={(value) => {
              if (!value) setMovementType(null);
            }}
            onDone={() => setMovementType(null)}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
