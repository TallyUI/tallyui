// Port of WCPOS v2 (monorepo main) packages/components/src/quantity-keypad/ and price-keypad/ (index.tsx and
// reducer.ts), lib/decimal-entry.ts and keypad/index.tsx's decimalRow, as the cart cells open them
// (packages/core/src/screens/main/pos/cart/cells/quantity-keypad.tsx and cells/price.tsx); MIT, WCPOS.
import { useEffect, useId, useRef, useState, type ReactNode, type RefObject } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useFormatMoney, minorUnitDigits } from '@tallyui/core';
import { Popover } from '@tallyui/primitives';
import { cn } from '@tallyui/theme';
import { decimalRows, typeDecimal } from '../input/decimal-entry';
import { Keypad } from '../input/keypad';
import { lessPercent, parsePrice, QuickDiscountKeys, quickKeys } from './price-form';

/** nav-drawer.tsx's focus targets. */
const FOCUSABLE = 'button, [href], input, [tabindex]:not([tabindex="-1"])';
const button = 'min-h-11 flex-1 items-center justify-center rounded-md border border-border px-3 py-2';

export interface LinePopoverProps {
  /** `quantity` takes whole numbers only, with no decimal key (decimal quantities need an ADR first, TallyUI#486). */
  kind: 'quantity' | 'price';
  lineName: string;
  /** The order's currency: the price's format and its decimal places. */
  currency: string;
  /** The stored quantity, or the unit price in integer minor units. */
  value: number;
  /** Writes the new value; returns a refusal to show, or null once applied. */
  onApply: (value: number) => string | null;
  /** Price only: v2's quick-discount keys, the first three valid percentages (as PriceForm's). */
  quickDiscounts?: readonly number[];
  /** The trigger's text classes (the cell's alignment and tone). */
  textClassName?: string;
  /** Price only: the regular unit price in minor units; shown struck through above the value when it is above `value`. */
  regularValue?: number;
  /** Buttons drawn in the open panel above Apply / Cancel, e.g. the cart line's Discount and Remove. Pressing one closes
   * the popover, then calls its `onPress`. `destructive` draws it in the destructive colour. */
  actions?: ReadonlyArray<{ id: string; label: string; onPress: () => void; destructive?: boolean }>;
  /** `apply` (default): today's Apply / Cancel. `close`: v2's grow keypad. There is no Apply or Cancel, and a full-width
   * Done writes what was typed. Escape closes without writing, and any other close (a press outside, the overlay) writes
   * it; a refusal on that path has nowhere to show, as the popover is already closing. A quantity also gets v2's − / +
   * steppers, which write at once. */
  commit?: 'apply' | 'close';
  /** Quantity with `commit="close"` only: − becomes Remove at a shown quantity of 1 or less, closes without writing and calls this. */
  onRemove?: () => void;
}

/**
 * A cart line's quantity or price that opens v2's keypad: the cashier types (or picks a quick discount),
 * Apply writes through `onApply`, and Cancel, Escape or a press outside close without writing (`commit="close"` differs).
 */
export function LinePopover({ kind, lineName, currency, value, onApply, quickDiscounts, textClassName, regularValue,
  actions, commit = 'apply', onRemove }: LinePopoverProps) {
  const formatMoney = useFormatMoney();
  const [open, setOpen] = useState(false);
  // v2's entry: the typed buffer (`.` as its separator), or the lit quick key, a percentage off `value`.
  const [entry, setEntry] = useState<{ buffer: string; percent?: number }>({ buffer: '' });
  const [error, setError] = useState<string | null>(null);
  const titleId = useId();
  const price = kind === 'price';
  const places = price ? minorUnitDigits(currency) : 0;
  const format = (amount: number) => price ? formatMoney({ amount, currency }) ?? '—' : String(amount);
  const keys = price ? quickKeys(quickDiscounts) : [];
  const regular = price && regularValue !== undefined && regularValue > value ? format(regularValue) : null;
  const { buffer, percent } = entry;
  // A lone `0.` is not typing, so a stray tap never zeroes the line (v2's draftPrice); a typed 0 quantity writes nothing.
  const typed = buffer === '0.' ? '' : buffer.replace(/\.$/, '');
  const draft = !price ? (Number.parseInt(typed, 10) > 0 ? Number.parseInt(typed, 10) : undefined)
    : percent !== undefined ? lessPercent(value, percent) : typed ? parsePrice(typed, currency) : undefined;
  const title = `${price ? 'Price' : 'Quantity'} for ${lineName}`;
  const rows = decimalRows(places);
  const close = commit === 'close';
  const shown = typeof draft === 'number' ? draft : value;
  // v2's trash: at 1 or less, − removes the line when the host can; without onRemove it stops at 1.
  const trash = shown <= 1 && onRemove !== undefined;
  // Set by Escape and Remove: the close that follows writes nothing.
  const discard = useRef(false);

  const openChange = (next: boolean) => {
    if (next) { setEntry({ buffer: '' }); setError(null); discard.current = false; }
    else if (close && !discard.current && typeof draft === 'number' && draft !== value) onApply(draft);
    setOpen(next);
  };
  const press = (name: string) => {
    setEntry((now) => ({ buffer: typeDecimal(now.percent === undefined ? now.buffer : '', name, places) }));
    setError(null);
  };
  const quick = (key: number) => {
    setEntry((now) => (now.percent === key ? { buffer: '' } : { buffer: '', percent: key }));
    setError(null);
  };
  function apply() {
    if (draft === undefined || draft === value) return setOpen(false);
    const refused = typeof draft === 'string' ? draft : onApply(draft);
    setError(refused);
    if (refused === null) setOpen(false);
  }
  // A step writes at once; the display then follows `value`, or shows it again after a refusal.
  const step = (to: number) => {
    setError(onApply(to));
    setEntry({ buffer: '' });
  };
  const remove = () => {
    discard.current = true;
    setOpen(false);
    onRemove?.();
  };
  const onKey = (key: string) => {
    if (key === 'Escape') { discard.current = true; setOpen(false); }
    else if (/^[0-9]$/.test(key)) press(key);
    else if (key === 'Backspace') press('backspace');
    else if ((key === '.' || key === ',') && places) press('decimal');
  };

  return <Popover.Root open={open} onOpenChange={openChange}>
    <Popover.Trigger testID={`${kind}-popover-trigger`} accessibilityLabel={`Edit ${kind} of ${lineName}`}
      className="min-h-11 justify-center rounded-md px-1">
      <Text className={cn('text-sm tabular-nums text-foreground', textClassName)}>{format(value)}</Text>
    </Popover.Trigger>
    <Popover.Portal>
      <Popover.Overlay testID={`${kind}-popover-overlay`} style={StyleSheet.absoluteFill} />
      <Popover.Content testID={`${kind}-popover`} align={price ? 'end' : 'start'} sideOffset={4}
        aria-labelledby={titleId} aria-describedby={undefined} onEscapeKeyDown={() => { discard.current = true; }}
        className="w-64 rounded-md border border-border bg-popover p-4 shadow-md">
        <Panel onKey={onKey}>
          <Text nativeID={titleId} className="font-semibold text-popover-foreground">{title}</Text>
          <View className="items-end">
            {regular ? <Text accessibilityLabel={`Regular price ${regular}`} style={{ textDecorationLine: 'line-through' }}
              className="text-sm tabular-nums text-muted-foreground line-through">{regular}</Text> : null}
            {percent !== undefined ? <Text className="text-sm text-muted-foreground">{`${format(value)} −${percent}%`}</Text> : null}
            <Text testID={`${kind}-popover-value`} numberOfLines={1} className="text-2xl font-semibold tabular-nums text-popover-foreground">
              {buffer || format(shown)}</Text>
          </View>
          {close && !price ? <View className="flex-row items-center gap-2">
            {trash ? <Pressable testID="quantity-popover-remove" accessibilityRole="button" accessibilityLabel="Remove"
              onPress={remove} className={`${button} bg-card`}><Text className="text-destructive">Remove</Text></Pressable>
              : <Pressable testID="quantity-popover-step-down" accessibilityRole="button" accessibilityLabel="One fewer"
                disabled={shown <= 1} accessibilityState={{ disabled: shown <= 1 }} onPress={() => { if (shown > 1) step(shown - 1); }}
                className={cn(button, 'bg-card', shown <= 1 && 'opacity-50')}><Text className="text-foreground">−</Text></Pressable>}
            <Text className="flex-1 text-center tabular-nums text-popover-foreground">{format(shown)}</Text>
            <Pressable testID="quantity-popover-step-up" accessibilityRole="button" accessibilityLabel="One more"
              onPress={() => step(shown + 1)} className={`${button} bg-card`}><Text className="text-foreground">+</Text></Pressable>
          </View> : null}
          {keys.length ? <QuickDiscountKeys keys={keys} percent={percent} onPress={quick} /> : null}
          <Keypad testID={`${kind}-popover-keypad`} rows={rows} onPress={press} />
          {error ? <Text accessibilityRole="alert" className="text-destructive">{error}</Text> : null}
          {actions?.length ? <View className="flex-row flex-wrap gap-2">
            {actions.map((action) => <Pressable key={action.id} testID={`${kind}-popover-action-${action.id}`}
              accessibilityRole="button" accessibilityLabel={`${action.label} ${lineName}`}
              onPress={() => { setOpen(false); action.onPress(); }} className={`${button} bg-card`}>
              <Text className={action.destructive ? 'text-destructive' : 'text-foreground'}>{action.label}</Text>
            </Pressable>)}
          </View> : null}
          {close ? <View className="flex-row">
            <Pressable testID={`${kind}-popover-done`} accessibilityRole="button" onPress={apply} className={`${button} bg-primary`}>
              <Text className="font-semibold text-primary-foreground">Done</Text></Pressable>
          </View> : <View className="flex-row gap-2">
            <Pressable testID={`${kind}-popover-apply`} accessibilityRole="button" onPress={apply} className={`${button} bg-primary`}>
              <Text className="font-semibold text-primary-foreground">Apply</Text></Pressable>
            <Pressable testID={`${kind}-popover-cancel`} accessibilityRole="button" onPress={() => setOpen(false)} className={`${button} bg-card`}>
              <Text className="text-foreground">Cancel</Text></Pressable>
          </View>}
        </Panel>
      </Popover.Content>
    </Popover.Portal>
  </Popover.Root>;
}

/** The open panel. Web: focus moves into it and back to where it was on close; keys go to `onKey` (nav-drawer's pattern). */
function Panel({ onKey, children }: { onKey: (key: string) => void; children: ReactNode }) {
  const panel = useRef<View>(null);
  useKeys(panel, onKey);
  return <View ref={panel} className="gap-3">{children}</View>;
}

function useKeys(panel: RefObject<View | null>, onKey: (key: string) => void) {
  const latest = useRef(onKey);
  latest.current = onKey;
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') return;
    const previous = document.activeElement as HTMLElement | null;
    (panel.current as unknown as HTMLElement | null)?.querySelector<HTMLElement>(FOCUSABLE)?.focus();
    const onKeyDown = (event: KeyboardEvent) => latest.current(event.key);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      previous?.focus?.();
    };
  }, [panel]);
}
