import { useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import { minorUnitDigits, useCurrencySymbol } from '@tallyui/core';
import { useT } from '../i18n';
import { Label } from '../ui/label';
import { parsePrice } from './price-form';

export interface ChargeFormProps {
  currency: string;
  lineTax?: { none: boolean; classes: boolean };
  taxClasses?: ReadonlyArray<{ id: string; label: string }>;
  shippingTaxFromStore?: boolean;
  /** Given, the form is that kind only and the kind row is not shown (v2's separate Add Fee / Add Shipping /
   * Add Miscellaneous Product entries); absent, the form opens on Fee with the row. */
  kind?: 'fee' | 'shipping' | 'custom';
  /** Given, the form edits that charge: prefilled, titled `Edit <name>` as v2's record dialog. */
  initial?: { name: string; amountMinor: number; taxStatus?: 'taxable' | 'none'; taxClass?: string; percent?: number; amountIncludesTax?: boolean };
  /** Shows the amount-unit toggle (currency symbol or %) on the fee kind, as v2's AmountUnitToggle. */
  allowPercent?: boolean;
  /** The store's tax mode. Given, the fee and shipping kinds show the "Amount Includes Tax" switch, which starts at this
   * value (Desk Q4: default = store tax mode, ADR-075). */
  pricesIncludeTax?: boolean;
  onApply: (charge: { kind: 'fee' | 'shipping' | 'custom'; name: string; amountMinor: number;
    taxStatus?: 'none'; taxClass?: string; percent?: number; amountIncludesTax?: boolean }) => string | null;
  onClose: () => void;
}

const NAME_LABEL_ID = 'charge-form-name-label';
const AMOUNT_LABEL_ID = 'charge-form-amount-label';

const button = 'rounded-md border border-border px-3 py-2 min-h-11 items-center justify-center';
/** A blank name takes v2's default for the kind: add-fee.tsx:71 (`pos_cart.fee`), add-shipping.tsx:73
 * (`common.shipping`) and add-misc-product.tsx:91 (`common.product`), WCPOS monorepo packages/core/src/screens/main/pos/cart. */
const DEFAULT_NAME: Record<'fee' | 'shipping' | 'custom', string> = { fee: 'Fee', shipping: 'Shipping', custom: 'Product' };

/** `onApply` returns a refusal to show inline, or null once applied. */
export function ChargeForm({ currency, lineTax, taxClasses, shippingTaxFromStore, kind: fixedKind, initial, allowPercent, pricesIncludeTax,
  onApply, onClose }: ChargeFormProps) {
  const currencySymbol = useCurrencySymbol();
  const t = useT();
  const [stateKind, setKind] = useState<'fee' | 'shipping' | 'custom'>('fee');
  const kind = fixedKind ?? stateKind;
  const title = initial ? `Edit ${initial.name}` : fixedKind === undefined ? 'Add charge'
    : fixedKind === 'fee' ? 'Add fee' : fixedKind === 'shipping' ? 'Add shipping' : 'Add custom item';
  const digits = minorUnitDigits(currency);
  const [name, setName] = useState(initial?.name ?? '');
  const [unitPercent, setUnitPercent] = useState(Boolean(allowPercent) && initial?.percent !== undefined);
  const [text, setText] = useState(allowPercent && initial?.percent !== undefined ? String(initial.percent)
    : initial ? (initial.amountMinor / 10 ** digits).toFixed(digits) : '');
  const [noTax, setNoTax] = useState(initial?.taxStatus === 'none');
  const [includesTax, setIncludesTax] = useState(initial?.amountIncludesTax ?? pricesIncludeTax ?? false);
  const [taxClass, setTaxClass] = useState(initial?.taxClass ?? '');
  const [error, setError] = useState<string | null>(null);
  const storeShipping = kind === 'shipping' && shippingTaxFromStore;
  const showUnit = Boolean(allowPercent) && kind === 'fee';
  const percentMode = showUnit && unitPercent;
  const showIncludesTax = pricesIncludeTax !== undefined && kind !== 'custom';
  function apply() {
    // v2's fee rules (add-fee.tsx:48-55): `pos_cart.fee_amount_negative`, and zero refused with
    // `pos_cart.discount_amount_invalid` (climb F28). Shipping and custom items accept zero.
    // The negative check comes first, so a fee never shows parsePrice's "0 or more".
    // A percent's range and decimal places are the builder's to refuse, shown inline as its other refusals.
    const number = Number(text.trim().replace(',', '.'));
    const price = percentMode ? (Number.isNaN(number) ? 0 : number) : parsePrice(text, currency);
    const parsed = kind === 'fee' && number < 0 ? 'A fee cannot be negative. Use Add Discount instead.'
      : kind === 'fee' && price === 0 ? 'Enter an amount greater than zero' : price;
    // A control that is not shown keeps the edited charge's own value. The new keys go only when they carry a value,
    // so a form without allowPercent or pricesIncludeTax sends the same object as before.
    const refused = typeof parsed === 'string' ? parsed : onApply({
      kind, name: name.trim() || DEFAULT_NAME[kind], amountMinor: percentMode ? 0 : parsed,
      taxStatus: !storeShipping && lineTax?.none ? (noTax ? 'none' : undefined) : initial?.taxStatus === 'none' ? 'none' : undefined,
      taxClass: !storeShipping && lineTax?.classes && taxClasses?.length ? taxClass || undefined : initial?.taxClass,
      ...(percentMode ? { percent: parsed } : !showUnit && initial?.percent !== undefined ? { percent: initial.percent } : {}),
      ...(showIncludesTax ? includesTax !== pricesIncludeTax ? { amountIncludesTax: includesTax } : {}
        : initial?.amountIncludesTax !== undefined ? { amountIncludesTax: initial.amountIncludesTax } : {}),
    });
    setError(refused);
    if (refused === null) onClose();
  }
  return <View testID="charge-form" role="group" accessibilityLabel={title} className="gap-2 px-3 py-2">
    <Text className="font-semibold text-foreground">{title}</Text>
    {fixedKind === undefined ? <View className="flex-row gap-2">
      {(['fee', 'shipping', 'custom'] as const).map((option) => <Pressable key={option} accessibilityRole="button"
        accessibilityState={{ selected: kind === option }} aria-selected={kind === option} onPress={() => setKind(option)}
        className={`${button} ${kind === option ? 'bg-primary' : 'bg-card'}`}>
        <Text className={kind === option ? 'text-primary-foreground' : 'text-foreground'}>
          {option === 'fee' ? 'Fee' : option === 'shipping' ? 'Shipping' : 'Custom item'}</Text>
      </Pressable>)}
    </View> : null}
    <Label nativeID={NAME_LABEL_ID}>{t('common.name')}</Label>
    <TextInput accessibilityLabelledBy={NAME_LABEL_ID} accessibilityLabel={t('common.name')} value={name} onChangeText={setName}
      className="min-w-0 rounded-md border border-border bg-background px-3 py-2 text-foreground" />
    <Label nativeID={AMOUNT_LABEL_ID}>{t('common.amount')}</Label>
    <View className="flex-row items-center rounded-md border border-border bg-background">
      <Text testID="charge-form-currency" className="pl-3 text-muted-foreground">{percentMode ? '%' : currencySymbol(currency)}</Text>
      <TextInput accessibilityLabelledBy={AMOUNT_LABEL_ID} accessibilityLabel={t('common.amount')} value={text} onChangeText={setText} onSubmitEditing={apply}
        inputMode="decimal" className="min-w-0 flex-1 px-3 py-2 text-foreground" />
    </View>
    {/* v2's AmountUnitToggle (amount-unit-toggle.tsx): the currency symbol or %, on Add Fee only. */}
    {showUnit ? <View role="group" accessibilityLabel="Amount unit" className="flex-row gap-2">
      {([false, true] as const).map((option) => <Pressable key={String(option)} testID={option ? 'charge-form-unit-percent' : 'charge-form-unit-amount'}
        accessibilityRole="button" accessibilityState={{ selected: unitPercent === option }} aria-selected={unitPercent === option}
        onPress={() => setUnitPercent(option)} className={`${button} ${unitPercent === option ? 'bg-primary' : 'bg-card'}`}>
        <Text className={unitPercent === option ? 'text-primary-foreground' : 'text-foreground'}>{option ? '%' : currencySymbol(currency)}</Text>
      </Pressable>)}
    </View> : null}
    {/* v2's "Amount Includes Tax" switch on Add Fee and Add Shipping (add-fee.tsx, add-shipping.tsx). */}
    {showIncludesTax ? <Pressable accessibilityRole="switch" accessibilityLabel={t('pos_cart.amount_includes_tax')}
      accessibilityState={{ checked: includesTax }} aria-checked={includesTax} onPress={() => setIncludesTax(!includesTax)}
      className={`${button} ${includesTax ? 'bg-primary' : 'bg-card'}`}>
      <Text className={includesTax ? 'text-primary-foreground' : 'text-foreground'}>{t('pos_cart.amount_includes_tax')}</Text></Pressable> : null}
    {storeShipping ? <Text className="text-muted-foreground">Shipping is taxed at the store's shipping tax class.</Text> : <>
      {lineTax?.none ? <Pressable accessibilityRole="switch" accessibilityLabel="No tax"
        accessibilityState={{ checked: noTax }} aria-checked={noTax} onPress={() => setNoTax(!noTax)} className={`${button} ${noTax ? 'bg-primary' : 'bg-card'}`}>
        <Text className={noTax ? 'text-primary-foreground' : 'text-foreground'}>No tax</Text></Pressable> : null}
      {lineTax?.classes && taxClasses?.length ? <View role="group" accessibilityLabel="Tax class" className="flex-row flex-wrap gap-2">
        {[{ id: '', label: 'No class' }, ...taxClasses].map((option) => <Pressable key={option.id} accessibilityRole="button"
          accessibilityState={{ selected: taxClass === option.id }} aria-selected={taxClass === option.id} onPress={() => setTaxClass(option.id)}
          className={`${button} ${taxClass === option.id ? 'bg-primary' : 'bg-card'}`}>
          <Text className={taxClass === option.id ? 'text-primary-foreground' : 'text-foreground'}>{option.label}</Text>
        </Pressable>)}
      </View> : null}
    </>}
    {error ? <Text accessibilityRole="alert" className="text-destructive">{error}</Text> : null}
    <View className="flex-row gap-2">
      <Pressable accessibilityRole="button" onPress={apply} className={`${button} bg-primary`}>
        <Text className="font-semibold text-primary-foreground">Apply</Text></Pressable>
      <Pressable accessibilityRole="button" onPress={onClose} className={`${button} bg-card`}>
        <Text className="text-foreground">Cancel</Text></Pressable>
    </View>
  </View>;
}
