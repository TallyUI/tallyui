// Port of WCPOS v2 (monorepo main) packages/components/src/quantity-keypad/ and price-keypad/ (index.tsx and
// reducer.ts), lib/decimal-entry.ts and keypad/index.tsx's decimalRow, as the cart cells open them
// (packages/core/src/screens/main/pos/cart/cells/quantity-keypad.tsx and cells/price.tsx); MIT, WCPOS.
import { useEffect, useId, useRef, useState, type ReactNode, type RefObject } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { formatMoney, minorUnitDigits } from '@tallyui/core';
import { Popover } from '@tallyui/primitives';
import { cn } from '@tallyui/theme';
import { DIGIT_ROWS, Keypad, type KeypadKey } from '../input/keypad';
import { lessPercent, parsePrice, QuickDiscountKeys, quickKeys } from './price-form';

/** nav-drawer.tsx's focus targets. */
const FOCUSABLE = 'button, [href], input, [tabindex]:not([tabindex="-1"])';
const BACKSPACE: KeypadKey = { name: 'backspace', label: 'Delete last digit', text: '⌫' };
const button = 'min-h-11 flex-1 items-center justify-center rounded-md border border-border px-3 py-2';

/** v2's typeDecimal: `.` once and only with places, a digit past the places refused, a lone 0 replaced. */
function typeDecimal(buffer: string, key: string, places: number): string {
  if (key === 'backspace') return buffer.slice(0, -1);
  if (key === 'decimal') return places > 0 && !buffer.includes('.') ? `${buffer || '0'}.` : buffer;
  if (!/^[0-9]$/.test(key)) return buffer;
  const point = buffer.indexOf('.');
  if (point >= 0) return buffer.length - point > places ? buffer : buffer + key;
  return buffer === '0' ? key : buffer + key;
}

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
}

/**
 * A cart line's quantity or price that opens v2's keypad: the cashier types (or picks a quick discount),
 * Apply writes through `onApply`, and Cancel, Escape or a press outside close without writing.
 */
export function LinePopover({ kind, lineName, currency, value, onApply, quickDiscounts, textClassName }: LinePopoverProps) {
  const [open, setOpen] = useState(false);
  // v2's entry: the typed buffer (`.` as its separator), or the lit quick key, a percentage off `value`.
  const [entry, setEntry] = useState<{ buffer: string; percent?: number }>({ buffer: '' });
  const [error, setError] = useState<string | null>(null);
  const titleId = useId();
  const price = kind === 'price';
  const places = price ? minorUnitDigits(currency) : 0;
  const format = (amount: number) => price ? formatMoney({ amount, currency }) ?? '—' : String(amount);
  const keys = price ? quickKeys(quickDiscounts) : [];
  const { buffer, percent } = entry;
  // A lone `0.` is not typing, so a stray tap never zeroes the line (v2's draftPrice); a typed 0 quantity writes nothing.
  const typed = buffer === '0.' ? '' : buffer.replace(/\.$/, '');
  const draft = !price ? (Number.parseInt(typed, 10) > 0 ? Number.parseInt(typed, 10) : undefined)
    : percent !== undefined ? lessPercent(value, percent) : typed ? parsePrice(typed, currency) : undefined;
  const title = `${price ? 'Price' : 'Quantity'} for ${lineName}`;
  const rows = [...DIGIT_ROWS, places
    ? [{ name: 'decimal', label: 'Decimal point', text: '.' }, { name: '0', label: '0' }, BACKSPACE]
    : [{ name: '0', label: '0', span: 2 }, BACKSPACE]];

  const openChange = (next: boolean) => {
    if (next) { setEntry({ buffer: '' }); setError(null); }
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
  const onKey = (key: string) => {
    if (key === 'Escape') setOpen(false);
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
      <Popover.Overlay style={StyleSheet.absoluteFill} />
      <Popover.Content testID={`${kind}-popover`} align={price ? 'end' : 'start'} sideOffset={4}
        aria-labelledby={titleId} aria-describedby={undefined}
        className="w-64 rounded-md border border-border bg-popover p-4 shadow-md">
        <Panel onKey={onKey}>
          <Text nativeID={titleId} className="font-semibold text-popover-foreground">{title}</Text>
          <View className="items-end">
            {percent !== undefined ? <Text className="text-sm text-muted-foreground">{`${format(value)} −${percent}%`}</Text> : null}
            <Text testID={`${kind}-popover-value`} numberOfLines={1} className="text-2xl font-semibold tabular-nums text-popover-foreground">
              {buffer || format(typeof draft === 'number' ? draft : value)}</Text>
          </View>
          {keys.length ? <QuickDiscountKeys keys={keys} percent={percent} onPress={quick} /> : null}
          <Keypad testID={`${kind}-popover-keypad`} rows={rows} onPress={press} />
          {error ? <Text accessibilityRole="alert" className="text-destructive">{error}</Text> : null}
          <View className="flex-row gap-2">
            <Pressable testID={`${kind}-popover-apply`} accessibilityRole="button" onPress={apply} className={`${button} bg-primary`}>
              <Text className="font-semibold text-primary-foreground">Apply</Text></Pressable>
            <Pressable testID={`${kind}-popover-cancel`} accessibilityRole="button" onPress={() => setOpen(false)} className={`${button} bg-card`}>
              <Text className="text-foreground">Cancel</Text></Pressable>
          </View>
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
