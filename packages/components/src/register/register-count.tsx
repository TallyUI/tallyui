import { useEffect, useRef, useState } from 'react';
import { Platform, Pressable, ScrollView, useWindowDimensions, View } from 'react-native';
import type { useRegisterSession } from '@tallyui/pos';
import {
  closeNeedsApproval,
  countVariance,
  denominationTotal,
  denominations,
  minorToDecimal,
  parseMinor,
  validAmount,
  varianceText,
} from '@tallyui/pos';

import { currencySymbol, formatMoney, minorUnitDigits } from '@tallyui/core';
import { cn } from '@tallyui/theme';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Text } from '../ui/text';

const AMOUNT_LABEL_ID = 'count-amount-label';

/** The exact refusal shown when Close is over `varianceThreshold` and the host gives no `approve` (the Front desk, 2026-09-28). */
export const APPROVAL_REQUIRED_TEXT = 'Manager approval needed. Ask a manager to approve, or count again.';

/** `varianceText`'s `t`: TallyUI has no i18n system, so this maps its three keys to plain English directly. Shared with `ClosureSheet`. */
export function varianceWord(key: string): string {
  if (key === 'register.exact') return 'Exact';
  if (key === 'register.short') return 'short';
  return 'over';
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * A tile's face value as a locale-aware whole amount ('€500', '€1') or fraction ('€0.50'), never
 * a bare '.00' — `Intl`'s `trailingZeroDisplay` (`@tallyui/core`'s `formatMoney` has nothing
 * like it yet, so this stays local rather than inventing a second money formatter there).
 */
type TileFormatOptions = Intl.NumberFormatOptions & { trailingZeroDisplay?: 'auto' | 'stripIfInteger' };
const tileFormatters = new Map<string, Intl.NumberFormat>();
function tileLabel(value: number, currency: string): string {
  let formatter = tileFormatters.get(currency);
  if (!formatter) {
    const options: TileFormatOptions = { style: 'currency', currency, trailingZeroDisplay: 'stripIfInteger' };
    formatter = new Intl.NumberFormat(undefined, options);
    tileFormatters.set(currency, formatter);
  }
  return formatter.format(value / 10 ** minorUnitDigits(currency));
}

/** Title-cases a tender method key ('card' -> 'Card') for a plain-English label. Shared with `ClosureSheet`. */
export const tenderLabel = (method: string) => method.charAt(0).toUpperCase() + method.slice(1);

interface DenominationTileProps {
  value: number;
  count: number;
  currency: string;
  onAdd: (pieces: number) => void;
}

/**
 * One denomination face. A tap adds one; a 400 ms hold adds ten, repeating every 150 ms, with
 * no release tap on top (LEDGER 60): `held` claims the hold before `onPress` can also fire for
 * the same gesture, and the interval is cleared on release and on unmount.
 */
function DenominationTile({ value, count, currency, onAdd }: DenominationTileProps) {
  const label = tileLabel(value, currency);
  const held = useRef(false);
  const timer = useRef<ReturnType<typeof setInterval> | undefined>(undefined);
  const stop = () => {
    if (timer.current !== undefined) clearInterval(timer.current);
    timer.current = undefined;
  };
  useEffect(() => stop, []);
  return (
    <Pressable
      testID={`den-tile-${value}`}
      accessibilityRole="button"
      accessibilityLabel={label}
      className="border-border bg-muted active:bg-accent h-16 flex-1 items-center justify-center gap-0.5 overflow-hidden rounded-md border px-1"
      // Web adds its own ~50ms press-in delay, which would otherwise pad the 400ms hold.
      {...(Platform.OS === 'web' ? { delayPressIn: 0 } : {})}
      delayLongPress={400}
      onPressIn={() => {
        held.current = false;
      }}
      onLongPress={() => {
        held.current = true;
        onAdd(10);
        timer.current = setInterval(() => onAdd(10), 150);
      }}
      onPressOut={stop}
      onPress={() => {
        if (!held.current) onAdd(1);
      }}
    >
      <Text className="text-sm tabular-nums" numberOfLines={1}>{label}</Text>
      <Text testID={`den-count-${value}`} className="bg-background min-w-6 rounded-full px-1.5 text-center text-xs tabular-nums">
        {count}
      </Text>
    </Pressable>
  );
}

export interface RegisterCountProps {
  /** `useRegisterSession`'s return value: `expected`, `blind`, `varianceThreshold`, and `backToSelling`/`closeSession`. */
  register: ReturnType<typeof useRegisterSession>;
  /** ISO 4217 code: denomination faces, parsing and display. */
  currency: string;
  /**
   * Above `register.varianceThreshold`, Close asks for this first. `null` refuses and the count
   * stays; without it, Close refuses outright with `APPROVAL_REQUIRED_TEXT`. Its `approvedBy`
   * and `approvedByName` go to `closeSession`, which enforces the same gate and puts them on the Z.
   */
  approve?: () => Promise<{ approvedBy: string; approvedByName?: string } | null>;
  className?: string;
}

/**
 * Counts the drawer at close: denomination tiles or a typed cash amount, other tenders kept as
 * typed, a live variance line, and Close (gated by `approve` over threshold) or Back to selling.
 * Port provenance (ADR-032 amendment 1): WCPOS `next` `3b5331b5c` `register-count.tsx` (LEDGER
 * 59, 60, 65, 67). Leaves out WCPOS's ApproveSheet and server-demanded `approval_required`
 * (registers c2) — `approve` is the host's own gate, and it runs regardless of `blind`: dropping
 * the server flag would otherwise leave a blind count with no gate at all over threshold.
 */
export function RegisterCount({ register, currency, approve, className }: RegisterCountProps) {
  const { session, expected, blind, varianceThreshold, actions } = register;
  const digits = minorUnitDigits(currency);
  const faces = denominations[currency] ?? denominations.default;
  // Below 480px, a note's full label ('€500') and its count badge collide across 4 columns; 3
  // gives each tile room for both without either overflowing into its neighbour.
  const { width } = useWindowDimensions();
  const columns = width < 480 ? 3 : 4;
  const [pieces, setPieces] = useState<Record<number, number>>({});
  // Resumes an interrupted close's persisted count (LEDGER 59); ordinary counting starts blank.
  const [cashText, setCashText] = useState(() =>
    session?.counted?.cash != null ? minorToDecimal(session.counted.cash, digits) : '',
  );
  const [others, setOthers] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      Object.entries(session?.counted ?? {})
        .filter(([method]) => method !== 'cash')
        .map(([method, minor]) => [method, minorToDecimal(minor, digits)]),
    ),
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [refusal, setRefusal] = useState('');

  const usingTiles = Object.keys(pieces).length > 0;
  const tilesTotal = denominationTotal(pieces);
  const displayAmount = usingTiles ? minorToDecimal(tilesTotal, digits) : cashText;
  const valid = usingTiles || validAmount(cashText, digits);
  const amountMinor = usingTiles ? tilesTotal : valid ? parseMinor(cashText, digits) : NaN;
  const variance = countVariance(amountMinor, expected.cash ?? 0);
  const needsApproval = valid && closeNeedsApproval(amountMinor, expected.cash ?? 0, varianceThreshold);

  const otherMethods = Object.keys(expected).filter((method) => method !== 'cash');
  const otherCounted = otherMethods
    .map((method) => [method, others[method] ?? ''] as const)
    .filter(([, value]) => value !== '');
  const otherTendersInvalid = otherCounted.some(([, value]) => !validAmount(value, digits));
  const counted: Record<string, number> = {
    cash: amountMinor,
    ...Object.fromEntries(otherCounted.map(([method, value]) => [method, parseMinor(value, digits)])),
  };

  const attempt = async (action: () => Promise<unknown>) => {
    setBusy(true);
    setError('');
    try {
      await action();
    } catch (e) {
      // The hook's own gate (by name: components import no class from pos, ADR-064).
      if (e instanceof Error && e.name === 'RegisterApprovalRequiredError') setRefusal(APPROVAL_REQUIRED_TEXT);
      else setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const addPieces = (value: number, n: number) =>
    setPieces((previous) => ({ ...previous, [value]: (previous[value] ?? 0) + n }));

  const onClose = () => {
    setRefusal('');
    if (needsApproval && !approve) {
      setRefusal(APPROVAL_REQUIRED_TEXT);
      return;
    }
    if (needsApproval) {
      void attempt(async () => {
        const result = await approve!();
        if (!result) {
          setRefusal('Approval was not granted. The count is unchanged.');
          return;
        }
        await actions.closeSession({ counted, approvedBy: result.approvedBy, approvedByName: result.approvedByName });
      });
      return;
    }
    void attempt(() => actions.closeSession({ counted }));
  };

  // Guarded as RegisterPanel is, for a caller rendering this before the hook's first snapshot.
  if (!session) return null;

  return (
    <View testID="register-count" className={cn('bg-card flex-1 rounded-md', className)}>
      <ScrollView className="flex-1" contentContainerClassName="gap-3 p-4">
        <Text className="min-h-11 text-lg font-semibold">Count the drawer</Text>
        <Label testID="count-amount-label" nativeID={AMOUNT_LABEL_ID}>
          {`Cash counted (${currencySymbol(currency)})`}
        </Label>
        <Input>
          <Input.Field
            testID="count-amount"
            value={displayAmount}
            onChangeText={(value) => {
              // Typing clears the tiles, and a later tile tap replaces the typed amount (LEDGER 65).
              setPieces({});
              setCashText(value);
            }}
            keyboardType="decimal-pad"
            accessibilityLabel={`Cash counted (${currencySymbol(currency)})`}
            accessibilityLabelledBy={AMOUNT_LABEL_ID}
          />
        </Input>
        {!blind && valid && (
          <Text testID="count-variance" className="min-h-11 tabular-nums">
            {`Expected ${formatMoney({ amount: expected.cash ?? 0, currency })} · ${varianceText(
              variance,
              digits,
              (major) => formatMoney({ amount: Math.round(major * 10 ** digits), currency }) ?? '',
              varianceWord,
            )}`}
          </Text>
        )}
        <View testID="count-denominations" className="gap-2">
          {Array.from({ length: Math.ceil(faces.length / columns) }, (_, row) => (
            <View key={row} className="flex-row gap-2">
              {Array.from({ length: columns }, (_, column) => {
                const value = faces[row * columns + column];
                return value ? (
                  <DenominationTile
                    key={value}
                    value={value}
                    count={pieces[value] ?? 0}
                    currency={currency}
                    onAdd={(n) => addPieces(value, n)}
                  />
                ) : (
                  <View key={column} className="flex-1" />
                );
              })}
            </View>
          ))}
          <Button
            testID="count-clear"
            variant="ghost"
            className="min-h-11 self-end"
            onPress={() => {
              setPieces({});
              setCashText(minorToDecimal(0, digits));
            }}
          >
            <Text>Clear</Text>
          </Button>
        </View>
        {otherMethods.map((method) => {
          const labelId = `count-tender-${method}-label`;
          const label = `${tenderLabel(method)} counted (${currencySymbol(currency)})`;
          return (
            <View key={method} className="gap-2">
              <Label testID={labelId} nativeID={labelId}>
                {label}
              </Label>
              <Input>
                <Input.Field
                  testID={`count-tender-${method}`}
                  value={others[method] ?? ''}
                  onChangeText={(value) => setOthers((previous) => ({ ...previous, [method]: value }))}
                  keyboardType="decimal-pad"
                  accessibilityLabel={label}
                  accessibilityLabelledBy={labelId}
                />
              </Input>
            </View>
          );
        })}
        {!!refusal && (
          <Text testID="count-manager-line" className="text-warning min-h-11">
            {refusal}
          </Text>
        )}
        {!!error && (
          <Text testID="count-error" className="text-destructive min-h-11">
            {error}
          </Text>
        )}
      </ScrollView>
      {/* Pinned below the scroll, not inside it: at phone height the tiles alone can push these
          past the fold, and the Front desk asked for Close to stay reachable without hunting. */}
      <View className="gap-2 border-t border-border p-4">
        <Button
          testID="count-back"
          variant="outline"
          className="min-h-11"
          disabled={busy}
          onPress={() => attempt(actions.backToSelling)}
        >
          <Text>Back to selling</Text>
        </Button>
        <Button
          testID="count-close"
          className="min-h-14"
          disabled={!valid || otherTendersInvalid || busy}
          onPress={onClose}
        >
          <Text>{busy ? 'Closing…' : 'Close register'}</Text>
        </Button>
      </View>
    </View>
  );
}
