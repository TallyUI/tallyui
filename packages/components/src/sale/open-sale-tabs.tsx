import { useEffect, useRef, useState, type JSX } from 'react';
import { Animated, Platform, Pressable, ScrollView, View } from 'react-native';
import { useFormatMoney } from '@tallyui/core';
import { isPartlyPaid, type OpenSale } from '@tallyui/pos';
import { cn } from '@tallyui/theme';
import { CROSSFADE, EASE, NEW_TAB_WIDTH, PLUS_WIDTH } from '../lib/motion';
import { useReducedMotion } from '../lib/use-reduced-motion';
import { Text } from '../ui/text';

const AGE_TICK_MS = 60_000; // Ages tick once a minute (v2).
const STALE_AFTER_MS = 60 * 60_000; // A sale parked for an hour is one somebody forgot (v2).

function useNowMs(intervalMs: number): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(timer);
  }, [intervalMs]);
  return now;
}

function staleAge(parkedAt: string | undefined, nowMs: number): string | null {
  if (!parkedAt) return null;
  const parsed = Date.parse(parkedAt);
  if (Number.isNaN(parsed) || nowMs - parsed < STALE_AFTER_MS) return null;
  return `${Math.round((nowMs - parsed) / 3_600_000)} h`;
}

/** Pass `openSales(sale.order, useParkedSales(drafts).parked)`; `onSelect` and `onNew` call `sale.switchSale(id)` and `sale.switchSale(null)`. */
export interface OpenSaleTabsProps {
  sales: OpenSale[];
  currency: string;
  onSelect: (id: string) => void;
  onNew: () => void;
  /** Merged onto the bar's root, after its own classes, so an app can restyle it (for example `border-t-0 border-b` at the top). */
  className?: string;
}

/** v2 cart/tab-who.ts: the customer, or what is in the cart when the customer is a guest. */
function who(sale: OpenSale): string {
  if (sale.customerName) return sale.customerName;
  if (sale.itemCount === 0) return 'Guest';
  return `Guest · ${sale.itemCount === 1 && sale.firstItem ? sale.firstItem : `${sale.itemCount} ${sale.itemCount === 1 ? 'item' : 'items'}`}`;
}

/**
 * The open sales as cart tabs (v2 cart/tabs.tsx): who, then the Partly paid chip or else the total. The open sale's
 * tab is underlined even when it is the only one; a blank cart has no tab, the + cell is its tab and reads "New".
 */
export function OpenSaleTabs({ sales, currency, onSelect, onNew, className }: OpenSaleTabsProps): JSX.Element {
  const formatMoney = useFormatMoney();
  const now = useNowMs(AGE_TICK_MS);
  const blank = !sales.some((sale) => sale.current);
  // v2 cart/tabs.tsx: on a blank cart the active position is the + cell, just past the last sale; no wrap.
  const activeIndex = blank ? sales.length : sales.findIndex((sale) => sale.current);
  const focusPending = useRef(false);
  const reduced = useReducedMotion() !== false; // Reduced or unknown motion jumps, as cart-line-strip.tsx.
  const width = useRef(new Animated.Value(blank ? NEW_TAB_WIDTH : PLUS_WIDTH)).current;
  const fade = useRef(new Animated.Value(blank ? 1 : 0)).current;
  const [label, setLabel] = useState(blank); // "New" stays mounted through its fade out (v2 FadeOut).
  const was = useRef(blank);
  useEffect(() => {
    if (was.current === blank) return; // The values start at their target: nothing animates on mount.
    was.current = blank;
    if (blank) setLabel(true);
    const go = (value: Animated.Value, toValue: number, done = () => {}) => {
      if (reduced) { value.setValue(toValue); done(); return; }
      Animated.timing(value, { toValue, duration: CROSSFADE, easing: EASE, useNativeDriver: false }).start(({ finished }) => { if (finished) done(); });
    };
    go(width, blank ? NEW_TAB_WIDTH : PLUS_WIDTH); // v2 cart/tabs.tsx: the + cell widens to "+ New" on the blank cart.
    go(fade, blank ? 1 : 0, () => { if (!was.current) setLabel(false); });
  }, [blank, reduced, width, fade]);
  const step = (delta: number) => {
    const at = activeIndex + delta;
    if (at < 0 || at > sales.length) return;
    focusPending.current = true;
    if (at === sales.length) onNew(); else onSelect(sales[at].id);
  };
  // Once a key step's tab renders active, it takes focus; a press leaves focus where it is (v2).
  const follow = (active: boolean) => (node: View | null) => {
    if (node && active && focusPending.current) { focusPending.current = false; node.focus?.(); }
  };
  // The arrow keys step from any tab, + included: the strip is their one ancestor (v2, web only).
  const onKeyDown = Platform.OS === 'web' ? (event: { nativeEvent: { key: string }; target: unknown; defaultPrevented: boolean; preventDefault: () => void }) => {
    const key = event.nativeEvent.key;
    const from = (event.target as { getAttribute?: (n: string) => string | null })?.getAttribute?.('role');
    if (from === 'tab' && (key === 'ArrowLeft' || key === 'ArrowRight') && !event.defaultPrevented) {
      event.preventDefault();
      step(key === 'ArrowLeft' ? -1 : 1);
    }
  } : undefined;
  return (
    <View testID="open-sale-tabs" className={cn('h-14 flex-row items-stretch border-t border-border bg-card', className)}
      {...{ onKeyDown } /* RN's View types lack onKeyDown; react-native-web passes it to the div. */}>
      <ScrollView horizontal accessibilityRole="tablist" showsHorizontalScrollIndicator={false} className="min-w-0 flex-1">
        {sales.map((sale) => {
          const partly = isPartlyPaid(sale);
          const age = staleAge(sale.parkedAt, now);
          const status = `Partly paid · ${formatMoney({ amount: sale.balanceDueMinor, currency })} due`;
          return (
            <Pressable key={sale.id} testID={`open-sale-tab-${sale.id}`} ref={follow(sale.current)} accessibilityRole="tab"
              accessibilityState={{ selected: sale.current }} aria-selected={sale.current} onPress={() => onSelect(sale.id)}
              className={`h-full justify-center border-b-2 px-3 ${sale.current ? 'border-primary' : 'border-transparent'}`}>
              <Text testID={`open-sale-tab-${sale.id}-who`} numberOfLines={1}
                className={sale.current ? 'font-semibold text-foreground' : 'font-medium text-muted-foreground'}>{who(sale)}</Text>
              {partly && !sale.current ? (
                // Inactive tabs carry the chip; the open tab keeps only the muted words (v2 TabChip).
                <View testID={`open-sale-chip-${sale.id}`} className="flex-row items-center gap-1 self-start rounded-sm bg-info/15 px-1.5 py-0.5">
                  <View className="h-1.5 w-1.5 rounded-full bg-info" />
                  <Text className="text-xs font-semibold text-foreground">{status}</Text>
                </View>
              ) : partly ? (
                <Text testID={`open-sale-status-${sale.id}`} className="text-xs text-muted-foreground">{status}</Text>
              ) : (
                <Text testID={`open-sale-tab-${sale.id}-amount`} className="text-xs text-muted-foreground tabular-nums">
                  {formatMoney({ amount: sale.totalMinor, currency })}
                  {age !== null && <> · <Text testID={`open-sale-tab-${sale.id}-age`} className="text-xs font-semibold text-warning-text">{age}</Text></>}
                </Text>
              )}
            </Pressable>
          );
        })}
      </ScrollView>
      <Animated.View className="h-full overflow-hidden" style={{ width }}>
      <Pressable testID="new-sale-tab" ref={follow(blank)} accessibilityRole="tab" accessibilityLabel="New order" accessibilityState={{ selected: blank }} aria-selected={blank}
        // Already on the blank cart: + is a place, not an action (v2).
        onPress={() => { if (!blank) onNew(); }}
        className={`h-full w-full flex-row items-center justify-center gap-1.5 px-3 ${blank ? 'border-b-2 border-primary' : ''}`}>
        <Text className={blank ? 'text-primary' : 'text-foreground'}>+</Text>
        {(blank || (!reduced && label)) && <Animated.View style={{ opacity: fade, flexShrink: 0 }}><Text testID="new-sale-tab-label" className="font-semibold">New</Text></Animated.View>}
      </Pressable>
      </Animated.View>
    </View>
  );
}
