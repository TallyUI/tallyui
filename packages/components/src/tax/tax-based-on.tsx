// Port of WCPOS v2 (monorepo next) packages/core/src/components/product/tax-based-on/ (index.tsx and
// display-current-tax-rates.tsx) and packages/components/src/derivation/; MIT, WCPOS. The copy is v2's core.json English.
import { useState, type ReactNode } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import type { woocommerceTax } from '@tallyui/core';
import type { TaxDerivation, TaxRateWhy } from '@tallyui/pos';
import { Popover } from '@tallyui/primitives';
import { cn } from '@tallyui/theme';
import { Button } from '../ui/button';
import { XIcon } from '../ui/icon/x-icon';
import { Text } from '../ui/text';

type TaxBasedOn = woocommerceTax.TaxBasedOn;
type StepState = 'fact' | 'result' | 'failed' | 'quiet';

export interface TaxBasedOnProps {
  derivation: TaxDerivation;
  /** "Change in Settings › Tax"; the link shows only when given. */
  onChangeSetting?: () => void;
  /** "View all tax rates"; the footer shows only when given. */
  onViewAllRates?: () => void;
  /** Country code to display name; defaults to Intl.DisplayNames('en', region) as "{Name} ({CODE})", the code alone if Intl lacks it. */
  countryName?: (code: string) => string;
  className?: string;
}

const SETTING_LABEL: Record<TaxBasedOn, string> = {
  shipping: 'Customer shipping address', billing: 'Customer billing address', base: 'Shop base address',
};
const VALUE_LABEL: Record<TaxBasedOn, string> = { ...SETTING_LABEL, base: 'Shop base' };
const FALLBACK_NOTE: Record<NonNullable<TaxDerivation['fallback']>, string> = {
  'shipping-to-billing': 'This order has no shipping address, so tax uses the billing address',
  'shipping-to-shop': 'This order has no shipping or billing address, so tax uses the shop address',
  'billing-to-shop': 'This order has no billing address, so tax uses the shop address',
};
const BEAD: Record<StepState, string> = {
  fact: 'bg-muted-foreground', result: 'bg-foreground', failed: 'bg-destructive', quiet: 'border-2 border-border',
};
/** v2's TABLE_HEAD_TEXT, as cart-columns' heads draw it. */
const CAPTION = 'text-xs font-medium uppercase tracking-wide text-muted-foreground';
const FIELDS = [['country', 'Country'], ['state', 'State'], ['city', 'City'], ['postcode', 'Postcode']] as const;

function intlCountryName(code: string): string {
  try {
    const name = new Intl.DisplayNames(['en'], { type: 'region' }).of(code.toUpperCase());
    return name && name !== code.toUpperCase() ? `${name} (${code.toUpperCase()})` : code;
  } catch {
    return code;
  }
}

function whyText(why: TaxRateWhy, countryName: (code: string) => string): string {
  switch (why.field) {
    case 'postcode': return `postcode ${why.pattern}`;
    case 'country': return `anywhere in ${countryName(why.country)}`;
    case 'anywhere': return 'anywhere';
    default: return why.field;
  }
}

function postalLine(location: woocommerceTax.TaxAddress, countryName: (code: string) => string): string {
  const local = [location.city, location.state, location.postcode].filter(Boolean).join(' ');
  return [local, location.country ? countryName(location.country) : ''].filter(Boolean).join(', ') || '—';
}

function Step({ n, state, label, title, detail, last, children }: { n: number; state: StepState; label: string;
  title?: string; detail?: string; last?: boolean; children?: ReactNode }) {
  return (
    <View testID={`tax-based-on-step-${n}`} dataSet={{ state }} className="flex-row gap-3">
      <View className="items-center pt-0.5">
        <View className={cn('size-4 items-center justify-center rounded-full', BEAD[state])}>
          {state === 'failed' ? <View className="text-destructive-foreground"><XIcon size={10} strokeWidth={3} /></View> : null}
        </View>
        {last ? null : <View className={cn('mt-1 w-0.5 flex-1 bg-border', (state === 'failed' || state === 'quiet') && 'opacity-50')} />}
      </View>
      <View className={cn('min-w-0 flex-1 gap-0.5', !last && 'pb-4')}>
        <Text className={CAPTION}>{label}</Text>
        {title ? <Text className="text-base font-semibold text-foreground">{title}</Text> : null}
        {detail ? <Text className="text-sm text-muted-foreground">{detail}</Text> : null}
        {children}
      </View>
    </View>
  );
}

function RateLine({ testID, name, why, percent, strong }: { testID: string; name: string; why?: string; percent: string; strong?: boolean }) {
  return (
    <View testID={testID} className={cn('flex-row items-baseline gap-3', strong ? 'min-h-8' : 'min-h-6')}>
      <Text className={cn('min-w-0 flex-1 text-base', strong ? 'font-semibold text-foreground' : 'pl-3 text-muted-foreground')}>
        {name}{why ? <Text className="text-muted-foreground">{` · ${why}`}</Text> : null}
      </Text>
      <Text className={cn('w-16 text-right text-base tabular-nums', strong ? 'font-semibold text-foreground' : 'text-muted-foreground')}>{percent}</Text>
    </View>
  );
}

/**
 * v2's "Tax based on" trigger under the product table, and its popover: how the cart's tax rates were derived, from the
 * setting, through the address used, to the rates that match it. A popover, not a hover card: a touch screen has no hover.
 * Rate names show as the store gives them (this package has no HTML-entity decoder yet).
 */
export function TaxBasedOn({ derivation, onChangeSetting, onViewAllRates, countryName = intlCountryName, className }: TaxBasedOnProps) {
  const [open, setOpen] = useState(false);
  const { taxBasedOn, failure, classes, location } = derivation;
  const setting = SETTING_LABEL[taxBasedOn];
  const none = classes.length === 0;
  const country = () => countryName(location.country);
  const ratesTitle = derivation.noRateCause === 'not-covered' ? `The store's rates for ${country()} don't cover this address`
    : derivation.noRateCause === 'no-rate-for-country' ? `The store has no tax rate for ${country()}`
    : 'The store has no tax rate for this address';

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger testID="tax-based-on-trigger" dataSet={{ tone: none ? 'bad' : 'normal' }} accessibilityLabel={`Tax based on: ${setting}`}
        className={cn('min-h-11 min-w-0 shrink flex-row items-center gap-1 rounded-md px-1', className)}>
        {none
          ? <Text testID="tax-based-on-warning" className="text-sm font-bold text-destructive">!</Text>
          : <Text testID="tax-based-on-percent" className="text-sm text-muted-foreground">%</Text>}
        <Text testID="tax-based-on-value" numberOfLines={1} className={cn('shrink text-sm', none ? 'text-destructive' : 'text-foreground')}>
          {VALUE_LABEL[taxBasedOn]}
        </Text>
        <Text className="text-xs text-muted-foreground">▼</Text>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Overlay style={StyleSheet.absoluteFill} />
        <Popover.Content testID="tax-based-on-content" side="top" align="start" sideOffset={4}
          aria-label="Tax based on" aria-labelledby={undefined} aria-describedby={undefined}
          className="max-h-full w-96 max-w-full rounded-md border border-border bg-popover p-2 shadow-md">
          <ScrollView className="min-h-0 shrink" contentContainerClassName="p-2">
            <Step n={1} state="fact" label="Calculated from" title={setting}>
              {onChangeSetting ? (
                <Button variant="link" size="sm" role="link" testID="tax-based-on-change-setting" onPress={onChangeSetting}
                  className="h-11 self-start px-0">
                  <Text>Change in Settings › Tax</Text>
                </Button>
              ) : null}
            </Step>
            {failure === 'address' ? (
              <Step n={2} state="failed" label="No address on the order"
                title={`This order has no ${taxBasedOn === 'billing' ? 'billing' : 'shipping'} address, so no rate can match`}
                detail="Add a customer with an address, or change the setting">
                <AddressFields location={location} />
              </Step>
            ) : (
              <Step n={2} state="fact" label={derivation.fromOrder ? 'Address on the order' : 'Shop address'}
                title={postalLine(location, countryName)} detail={derivation.fallback ? FALLBACK_NOTE[derivation.fallback] : undefined}>
                <AddressFields location={location} />
              </Step>
            )}
            {failure === 'address' ? <Step n={3} last state="quiet" label="Rates that match it" detail="None" />
              : failure === 'rates' ? <Step n={3} last state="failed" label="No rate matches it" title={ratesTitle}
                detail="Add one in WooCommerce › Tax, or change the setting" />
              : (
                <Step n={3} last state="result" label="Rates that match it">
                  <View className="mt-2">
                    {classes.map((group, index) => (
                      <View key={group.slug} className={index > 0 ? 'mt-1' : undefined}>
                        <RateLine strong testID={`tax-based-on-class-${group.slug}`} name={group.name} percent={group.percent} />
                        {group.rates.map((rate) => (
                          <RateLine key={rate.id} testID={`tax-based-on-rate-${rate.id}`} name={rate.name}
                            why={whyText(rate.why, countryName)} percent={rate.percent} />
                        ))}
                      </View>
                    ))}
                  </View>
                </Step>
              )}
          </ScrollView>
          {onViewAllRates ? (
            <View className="mt-1 border-t border-border pt-1">
              <Button variant="ghost" testID="tax-based-on-view-all" className="h-11 w-full justify-between px-2"
                onPress={() => { setOpen(false); onViewAllRates(); }}>
                <Text>View all tax rates</Text>
                <Text className="text-muted-foreground">›</Text>
              </Button>
            </View>
          ) : null}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

function AddressFields({ location }: { location: woocommerceTax.TaxAddress }) {
  return (
    <View className="mt-2 flex-row gap-3">
      {FIELDS.map(([field, label]) => (
        <View key={field} className="min-w-0 flex-1">
          <Text className={CAPTION} numberOfLines={1}>{label}</Text>
          <Text testID={`tax-based-on-field-${field}`} numberOfLines={1}
            className={cn('text-base', location[field] ? 'text-foreground' : 'text-muted-foreground')}>{location[field] || '—'}</Text>
        </View>
      ))}
    </View>
  );
}
