// Port of WCPOS v2 (monorepo next) packages/core/src/screens/main/pos/products/variations-popover/ (variations.tsx,
// buttons.tsx, select.tsx, stock-status.tsx): one option per attribute group, the match's stock, and Add; MIT, WCPOS.
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import type { StockLevel, VariantOptionGroup, VariantSummary } from '@tallyui/core';
import { disabledOptions, matchVariant, variantPriceLabel } from '@tallyui/pos';
import { cn } from '@tallyui/theme';
import { Button } from '../ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Text } from '../ui/text';

export interface VariationPickerProps {
  /** The product name. */
  title: string;
  groups: VariantOptionGroup[];
  variants: VariantSummary[];
  currency: string;
  /** Called with the matched variant and the picks for the variant's "Any" groups (empty when it has none). */
  onAdd: (variant: VariantSummary, anyPicks: Record<string, string>) => void | Promise<void>;
  /** Stock refuses Add when the variant is out of stock and this is true (v2 preventOverselling). Default false. */
  preventOverselling?: boolean;
  testID?: string;
}

// v2 shows buttons when a group's values total fewer than this many characters, a Select otherwise.
const CHIP_CHARACTERS = 15;

// ProductStockBadge's label vocabulary; v2 shows nothing for stock it does not track.
function stockLabel({ status, quantity }: StockLevel): string | null {
  if (status === 'out_of_stock') return 'Out of Stock';
  if (status === 'backorder') return 'On Backorder';
  if (status === 'in_stock' && quantity != null) return `In Stock (${quantity})`;
  return null;
}

/**
 * v2's variations popover body: the cashier picks one value per option group (values no variant allows are
 * dimmed), sees the matched variant's stock, and presses Add; a full match never adds on its own.
 */
export function VariationPicker({ title, groups, variants, currency, onAdd, preventOverselling = false,
  testID = 'variation-popover' }: VariationPickerProps) {
  const [picks, setPicks] = useState<Record<string, string>>({});
  const [adding, setAdding] = useState(false);
  const disabled = useMemo(() => disabledOptions(variants, groups, picks), [variants, groups, picks]);
  const complete = groups.every(({ name }) => picks[name] !== undefined);
  const variant = complete ? matchVariant(variants, groups, picks) : undefined;
  const stock = variant ? stockLabel(variant.stock) : null;
  const price = variant ? variantPriceLabel(variant, currency) : undefined;
  const refused = preventOverselling && variant?.stock.status === 'out_of_stock';

  const pick = (name: string, value: string, toggle: boolean) => {
    if (disabled[name]?.has(value)) return;
    setPicks((current) => {
      const { [name]: previous, ...rest } = current;
      return toggle && previous === value ? rest : { ...rest, [name]: value };
    });
  };

  const add = async () => {
    if (!variant || adding || refused) return;
    const anyPicks = Object.fromEntries(groups.filter(({ name }) =>
      !Object.prototype.hasOwnProperty.call(variant.options ?? {}, name)).map(({ name }) => [name, picks[name]]));
    const pending = onAdd(variant, anyPicks);
    if (!(pending instanceof Promise)) return;
    setAdding(true);
    try {
      await pending;
    } finally {
      setAdding(false);
    }
  };

  return (
    <View testID={testID} className="min-h-0 min-w-52 shrink gap-3">
      <Text className="text-sm font-semibold">{title}</Text>
      <ScrollView testID="variation-popover-options" className="shrink grow-0" contentContainerClassName="gap-3">
        {groups.map(({ name, values }) => (
          <View key={name} className="gap-1.5">
            <Text className="text-xs font-semibold text-muted-foreground">{name}</Text>
            {values.join('').length < CHIP_CHARACTERS ? (
              <View className="flex-row flex-wrap gap-2">
                {values.map((value) => {
                  const active = picks[name] === value;
                  const off = disabled[name]?.has(value) ?? false;
                  return (
                    <Pressable key={value} testID={`variation-option-${value}`} accessibilityRole="button"
                      accessibilityState={{ selected: active, disabled: off }} disabled={off}
                      onPress={() => pick(name, value, true)}
                      className={cn('rounded-lg border px-3 py-1.5', active ? 'border-primary bg-primary/10' : 'border-border bg-card',
                        off && 'opacity-40')}>
                      <Text className={cn('text-sm font-medium', active ? 'text-primary' : 'text-foreground')}>{value}</Text>
                    </Pressable>
                  );
                })}
              </View>
            ) : (
              <Select value={picks[name] ? { value: picks[name], label: picks[name] } : undefined}
                onValueChange={(option) => { if (option) pick(name, option.value, false); }}>
                <SelectTrigger testID={`variation-select-${name}`} accessibilityLabel={name}>
                  <SelectValue placeholder="Select an option" className="text-sm text-foreground" />
                </SelectTrigger>
                <SelectContent>
                  {values.map((value) => (
                    <SelectItem key={value} value={value} label={value} disabled={disabled[name]?.has(value)}
                      className={cn(disabled[name]?.has(value) && 'opacity-40')}>
                      <Text className="text-sm">{value}</Text>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </View>
        ))}
      </ScrollView>
      {complete && !variant ? (
        <Text testID="variation-popover-unavailable" className="text-sm text-muted-foreground">Variant not available</Text>
      ) : null}
      {variant ? (
        <View className="gap-2">
          {stock ? <Text testID="variation-popover-stock-badge" className="self-start text-xs font-semibold">{stock}</Text> : null}
          <Button testID="variation-popover-add-to-cart" disabled={adding || refused} onPress={() => { void add(); }}>
            <Text>{price ? `Add to Cart: ${price}` : 'Add to Cart'}</Text>
          </Button>
        </View>
      ) : null}
    </View>
  );
}
