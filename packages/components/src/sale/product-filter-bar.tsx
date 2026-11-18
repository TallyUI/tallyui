import { Pressable, ScrollView, Text, View } from 'react-native';
import { cn } from '@tallyui/theme';
import { ComboboxPill, type FilterOption } from '../filter/filter-pills';
import { XIcon } from '../ui/icon/x-icon';

export type { FilterOption };

// v2's built-in pills, in its order: packages/core/src/screens/main/pos/products/filter-bar/filter-bar-layout.ts
// `BUILT_IN_PILL_IDS` (MIT, WCPOS).
export type ProductFilterChip = 'inStock' | 'featured' | 'onSale' | 'category' | 'tag' | 'brand';
type ToggleChip = 'inStock' | 'featured' | 'onSale';
type TermChip = 'category' | 'tag' | 'brand';

export interface ProductFilters { inStock: boolean; featured: boolean; onSale: boolean }

/** In Stock starts on, as v2's `stock_status: 'instock'` does while "show out-of-stock products" is off (its default). */
export const DEFAULT_PRODUCT_FILTERS: ProductFilters = { inStock: true, featured: false, onSale: false };
export const PRODUCT_FILTER_CHIPS: readonly ProductFilterChip[] = ['inStock', 'featured', 'onSale', 'category', 'tag', 'brand'];

const LABELS: Record<ProductFilterChip, string> = {
  inStock: 'In Stock', featured: 'Featured', onSale: 'On Sale', category: 'Category', tag: 'Tag', brand: 'Brand',
};
const SEARCH: Record<TermChip, string> = { category: 'Search categories', tag: 'Search tags', brand: 'Search brands' };

export interface ProductTermFilter {
  /** The app's terms for this taxonomy. */
  options: readonly FilterOption[];
  /** The picked term's value; undefined when none is picked. */
  value?: string;
  onChange: (next: string | undefined) => void;
  /** Search the app's terms server-side; without it the pill filters `options` by label. */
  onSearch?: (text: string) => void;
}

export interface ProductFilterBarProps {
  value: ProductFilters;
  onChange: (next: ProductFilters) => void;
  /** Which chips to show, in this order. Default PRODUCT_FILTER_CHIPS. */
  chips?: readonly ProductFilterChip[];
  /** Picker pills for Category, Tag and Brand (v2 filter-bar/*-pill.tsx). A chip with an entry here opens its own
   *  picker. A chip without one falls back to `onTermPress`, and is hidden when neither is given. */
  terms?: Partial<Record<TermChip, ProductTermFilter>>;
  /** Opens the app's term picker for a term chip that has no entry in `terms`. */
  onTermPress?: (chip: TermChip) => void;
  className?: string;
}

function isToggle(chip: ProductFilterChip): chip is ToggleChip {
  return chip === 'inStock' || chip === 'featured' || chip === 'onSale';
}

/**
 * v2's always-on filter chips above the product grid: In Stock, Featured and On Sale toggle; Category, Tag
 * and Brand open a term picker, the bar's own (`terms`) or the app's (`onTermPress`). Ported from WCPOS v2
 * `FilterBar`, packages/core/src/screens/main/pos/products/filter-bar/filter-bar.tsx (MIT, WCPOS).
 */
export function ProductFilterBar({ value, onChange, chips = PRODUCT_FILTER_CHIPS, terms, onTermPress, className }: ProductFilterBarProps) {
  const shown = chips.filter((chip) => isToggle(chip) || terms?.[chip] || onTermPress);
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} className={className} contentContainerClassName="flex-row gap-2">
      {shown.map((chip) => {
        const t = isToggle(chip) ? undefined : terms?.[chip];
        if (t) {
          return (
            <ComboboxPill key={chip} id={`filter-chip-${chip}`} offLabel={LABELS[chip]} placeholder={SEARCH[chip as TermChip]}
              value={t.value} options={[...t.options]} onSearch={t.onSearch} onPick={t.onChange} onClear={() => t.onChange(undefined)} />
          );
        }
        const on = isToggle(chip) && value[chip];
        return (
          <Pressable key={chip} testID={`filter-chip-${chip}`} role="button" aria-pressed={isToggle(chip) ? on : undefined}
            onPress={() => (isToggle(chip) ? onChange({ ...value, [chip]: !value[chip] }) : onTermPress?.(chip))}
            className={cn('min-h-11 flex-row items-center gap-1.5 rounded-full border px-3',
              on ? 'border-primary/30 bg-primary/10' : 'border-border bg-card')}>
            <Text className={cn('text-sm', on ? 'text-primary' : 'text-foreground')}>{LABELS[chip]}</Text>
            {on && chip === 'inStock' ? <View className="text-primary"><XIcon size={14} /></View> : null}
          </Pressable>
        );
      })}
    </ScrollView>
  );
}
