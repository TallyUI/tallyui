import { useEffect, useState, type JSX } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { useFormatMoney } from '@tallyui/core';
import { isPartlyPaid, type OpenSale } from '@tallyui/pos';
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
export function OpenSaleTabs({ sales, currency, onSelect, onNew }: OpenSaleTabsProps): JSX.Element {
  const formatMoney = useFormatMoney();
  const now = useNowMs(AGE_TICK_MS);
  const blank = !sales.some((sale) => sale.current);
  return (
    <View testID="open-sale-tabs" className="h-14 flex-row items-stretch border-t border-border bg-card">
      <ScrollView horizontal accessibilityRole="tablist" showsHorizontalScrollIndicator={false} className="min-w-0 flex-1">
        {sales.map((sale) => {
          const partly = isPartlyPaid(sale);
          const age = staleAge(sale.parkedAt, now);
          const status = `Partly paid · ${formatMoney({ amount: sale.balanceDueMinor, currency })} due`;
          return (
            <Pressable key={sale.id} testID={`open-sale-tab-${sale.id}`} accessibilityRole="tab"
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
      <Pressable testID="new-sale-tab" accessibilityRole="tab" accessibilityLabel="New order" accessibilityState={{ selected: blank }} aria-selected={blank}
        // Already on the blank cart: + is a place, not an action (v2).
        onPress={() => { if (!blank) onNew(); }}
        className={`h-full flex-row items-center justify-center gap-1.5 px-3 ${blank ? 'border-b-2 border-primary' : ''}`}>
        <Text className={blank ? 'text-primary' : 'text-foreground'}>+</Text>
        {blank && <Text testID="new-sale-tab-label" className="font-semibold">New</Text>}
      </Pressable>
    </View>
  );
}
