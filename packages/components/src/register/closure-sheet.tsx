import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, View } from 'react-native';
import type { useRegisterSession } from '@tallyui/pos';
import { countVariance, varianceText } from '@tallyui/pos';

import { formatMoney, minorUnitDigits } from '@tallyui/core';
import { Button } from '../ui/button';
import { Dialog, DialogContent, DialogTitle } from '../ui/dialog';
import { Text } from '../ui/text';
import { tenderLabel, varianceWord } from './register-count';

/**
 * The completion checkmark's entrance: fades and scales in over 180ms unless the platform
 * reports reduced motion (`AccessibilityInfo.isReduceMotionEnabled`; on web, react-native-web
 * resolves it from `matchMedia('(prefers-reduced-motion: reduce)')`), in which case it appears
 * at once. Plain `Animated`, not `react-native-reanimated`: no new dependency.
 */
function useCompletionMotion() {
  const opacity = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(0.6)).current;
  useEffect(() => {
    let cancelled = false;
    AccessibilityInfo.isReduceMotionEnabled().then((reduced) => {
      if (cancelled) return;
      if (reduced) {
        opacity.setValue(1);
        scale.setValue(1);
        return;
      }
      Animated.parallel([
        Animated.timing(opacity, { toValue: 1, duration: 180, useNativeDriver: false }),
        Animated.timing(scale, { toValue: 1, duration: 180, useNativeDriver: false }),
      ]).start();
    });
    return () => {
      cancelled = true;
    };
  }, [opacity, scale]);
  return { opacity, scale };
}

export interface ClosureSheetProps {
  /** `useRegisterSession`'s return value: reads `lastClosure` and `blind`. */
  register: ReturnType<typeof useRegisterSession>;
  /** ISO 4217 code, for the figures. */
  currency: string;
  /** Renders no print button when absent — printing is a later job (registers c2). */
  onPrint?: () => void | Promise<void>;
  onDone: () => void;
}

/**
 * Confirms a closed session from `register.lastClosure`: the local closure number always, and
 * the counted figures and variance per tender unless `blind`. Port provenance (ADR-032
 * amendment 1): WCPOS `next` `3b5331b5c` `closure-sheet.tsx` (LEDGER 54, 62). Leaves out the
 * Z-report preview, print/reprint and the server-number adoption (registers c2) — `onPrint` is
 * an optional hook for a host that later wires up printing; without it, no button renders.
 * Unlike WCPOS (which still shows counted cash to a blind cashier), every figure here is hidden
 * while blind, per the register-screens-b design, since TallyUI's closure lists every tender.
 */
export function ClosureSheet({ register, currency, onPrint, onDone }: ClosureSheetProps) {
  const { lastClosure: closure, blind } = register;
  const digits = minorUnitDigits(currency);
  const { opacity, scale } = useCompletionMotion();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  if (!closure) return null;
  const methods = Object.keys(closure.counted);
  const approvedByName = closure.breakdowns.approved_by_name;
  const approvedById = closure.breakdowns.approved_by;
  const approvedBy =
    typeof approvedByName === 'string' && approvedByName
      ? approvedByName
      : typeof approvedById === 'string' && approvedById
        ? approvedById
        : '';
  const print = async () => {
    if (!onPrint) return;
    setBusy(true);
    setError('');
    try {
      await onPrint();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onDone();
      }}
    >
      <DialogContent testID="closure-sheet">
        <Animated.View
          testID="closure-check"
          style={{ opacity, transform: [{ scale }] }}
          className="bg-success/10 h-10 w-10 items-center justify-center rounded-full"
        >
          <Text className="text-success text-lg font-bold" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
            {'✓'}
          </Text>
        </Animated.View>
        <DialogTitle testID="closure-title">Register closed</DialogTitle>
        {/* The number stays visible, blind or not: the Z report references it (the Front desk, 2026-09-28). */}
        <Text testID="closure-number" className="text-muted-foreground min-h-11">{`Closure #${closure.number}`}</Text>
        {!blind && (
          <View testID="closure-figures" className="gap-3">
            {methods.map((method) => {
              const countedMinor = closure.counted[method] ?? 0;
              const expectedMinor = closure.expected[method] ?? 0;
              const varianceMinor = closure.variance[method] ?? countVariance(countedMinor, expectedMinor);
              return (
                <View key={method} className="gap-1">
                  <Text className="text-muted-foreground text-xs font-semibold">{tenderLabel(method)}</Text>
                  <Text testID={`closure-counted-${method}`} className="min-h-11 tabular-nums">
                    {`Counted ${formatMoney({ amount: countedMinor, currency })}`}
                  </Text>
                  <Text testID={`closure-expected-${method}`} className="min-h-11 tabular-nums">
                    {`Expected ${formatMoney({ amount: expectedMinor, currency })}`}
                  </Text>
                  <Text testID={`closure-variance-${method}`} className="min-h-11 tabular-nums">
                    {varianceText(
                      varianceMinor,
                      digits,
                      (major) => formatMoney({ amount: Math.round(major * 10 ** digits), currency }) ?? '',
                      varianceWord,
                    )}
                  </Text>
                </View>
              );
            })}
          </View>
        )}
        {/* Not a figure: shows who approved the close even while blind. */}
        {!!approvedBy && <Text testID="closure-approved-by">Approved by {approvedBy}</Text>}
        {/* Not a figure either (#287). The wording is proposed to the Front desk, not yet ruled. */}
        {closure.breakdowns.tax_rounding_mixed === true && (
          <Text testID="closure-tax-rounding-mixed" className="text-muted-foreground">
            {"This register's sales used more than one tax rounding method. Each sale's tax is as its receipt showed."}
          </Text>
        )}
        {!!error && (
          <Text testID="closure-print-error" className="text-destructive">
            {error}
          </Text>
        )}
        {!blind && !!onPrint && (
          <Button testID="closure-print" className="min-h-14" disabled={busy} onPress={print}>
            <Text>{busy ? 'Printing…' : 'Print the Z report'}</Text>
          </Button>
        )}
        <Button testID="closure-done" variant="outline" className="min-h-14" onPress={onDone}>
          <Text>Done</Text>
        </Button>
      </DialogContent>
    </Dialog>
  );
}
