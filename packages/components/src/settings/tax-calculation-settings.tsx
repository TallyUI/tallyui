/**
 * Settings › Tax › Calculation: "Calculate tax based on", and read-only rows for the settings that live in WooCommerce.
 * Port of WCPOS v2 `packages/core/src/screens/main/settings/tax.tsx:139-183` and `option-lists.ts` `taxBasedOn`;
 * the labels are v2's English strings from core.json. StoreSettings has no `calcTaxes`, so v2's "Enable taxes" row is left out.
 */
import { View } from 'react-native';
import type { woocommerceTax } from '@tallyui/core';
import { cn } from '@tallyui/theme';
import { Button } from '../ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Text } from '../ui/text';
import { SettingsGroup } from './settings-group';
import { SettingsRow } from './settings-row';

type TaxBasedOn = woocommerceTax.TaxBasedOn;

export interface TaxCalculationSettingsProps {
  taxBasedOn: TaxBasedOn;
  onTaxBasedOnChange?: (value: TaxBasedOn) => void;
  pricesIncludeTax?: boolean;
  shippingTaxClass?: string;
  taxRoundAtSubtotal?: boolean;
  /** "Set in WooCommerce": a link when given, plain text otherwise. */
  onOpenStoreTaxSettings?: () => void;
  className?: string;
}

const OPTIONS: { value: TaxBasedOn; label: string }[] = [
  { value: 'shipping', label: 'Customer shipping address' },
  { value: 'billing', label: 'Customer billing address' },
  { value: 'base', label: 'Shop base address' },
];

/** The class name rule of @tallyui/pos `taxDerivation` (re-implemented here: components import only types from pos). */
function classLabel(slug: string): string {
  if (slug === '' || slug === 'standard') return 'Standard';
  const words = slug.replace(/-/g, ' ');
  return words.charAt(0).toUpperCase() + words.slice(1);
}

const yesNo = (value: boolean) => (value ? 'Yes' : 'No');

/** A SettingsRow whose description, "Set in WooCommerce", is a link when `onOpen` is given. */
function LockedRow({ id, label, value, onOpen }: { id: string; label: string; value: string; onOpen?: () => void }) {
  return (
    <View testID={`settings-tax-locked-${id}`} className="flex-row items-center gap-3 px-4 py-3">
      <View className="flex-1 gap-0.5">
        <Text className="text-sm font-medium text-foreground">{label}</Text>
        {onOpen ? (
          <Button variant="link" size="sm" role="link" onPress={onOpen} className="h-11 self-start px-0">
            <Text className="text-xs">Set in WooCommerce</Text>
          </Button>
        ) : <Text className="text-xs text-muted-foreground">Set in WooCommerce</Text>}
      </View>
      <Text testID={`settings-tax-locked-${id}-value`} className="text-sm text-foreground">{value}</Text>
    </View>
  );
}

export function TaxCalculationSettings({ taxBasedOn, onTaxBasedOnChange, pricesIncludeTax, shippingTaxClass,
  taxRoundAtSubtotal, onOpenStoreTaxSettings, className }: TaxCalculationSettingsProps) {
  const value = OPTIONS.find((option) => option.value === taxBasedOn);
  const disabled = !onTaxBasedOnChange;
  return (
    <SettingsGroup title="Calculation" className={className}>
      <SettingsRow
        label="Calculate tax based on"
        action={(
          <Select value={value} disabled={disabled}
            onValueChange={(option) => { if (option && option.value !== taxBasedOn) onTaxBasedOnChange?.(option.value as TaxBasedOn); }}>
            <SelectTrigger testID="settings-tax-based-on" accessibilityLabel="Calculate tax based on"
              className={cn('h-11 w-56 gap-2', disabled && 'opacity-50')}>
              <SelectValue placeholder="Select tax based on" className="shrink text-sm text-foreground" numberOfLines={1} />
              <Text className="text-xs text-muted-foreground">▼</Text>
            </SelectTrigger>
            <SelectContent className="w-56">
              {OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value} label={option.label}
                  testID={`settings-tax-based-on-${option.value}`} className="min-h-11">
                  <Text className="text-sm">{option.label}</Text>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      />
      {pricesIncludeTax === undefined ? null
        : <LockedRow id="prices_include_tax" label="Prices entered with tax" value={yesNo(pricesIncludeTax)} onOpen={onOpenStoreTaxSettings} />}
      {shippingTaxClass === undefined ? null : (
        <LockedRow id="shipping_tax_class" label="Shipping tax class" onOpen={onOpenStoreTaxSettings}
          value={shippingTaxClass === 'inherit' ? 'Based on cart items' : classLabel(shippingTaxClass)} />
      )}
      {taxRoundAtSubtotal === undefined ? null
        : <LockedRow id="tax_round_at_subtotal" label="Round tax at subtotal level" value={yesNo(taxRoundAtSubtotal)} onOpen={onOpenStoreTaxSettings} />}
    </SettingsGroup>
  );
}
