import { useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import { currencySymbol } from '@tallyui/core';
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
  onApply: (charge: { kind: 'fee' | 'shipping' | 'custom'; name: string; amountMinor: number;
    taxStatus?: 'none'; taxClass?: string }) => string | null;
  onClose: () => void;
}

const NAME_LABEL_ID = 'charge-form-name-label';
const AMOUNT_LABEL_ID = 'charge-form-amount-label';

const button = 'rounded-md border border-border px-3 py-2 min-h-11 items-center justify-center';

/** `onApply` returns a refusal to show inline, or null once applied. */
export function ChargeForm({ currency, lineTax, taxClasses, shippingTaxFromStore, kind: fixedKind, onApply, onClose }: ChargeFormProps) {
  const t = useT();
  const [stateKind, setKind] = useState<'fee' | 'shipping' | 'custom'>('fee');
  const kind = fixedKind ?? stateKind;
  const title = fixedKind === undefined ? 'Add charge'
    : fixedKind === 'fee' ? 'Add fee' : fixedKind === 'shipping' ? 'Add shipping' : 'Add custom item';
  const [name, setName] = useState('');
  const [text, setText] = useState('');
  const [noTax, setNoTax] = useState(false);
  const [taxClass, setTaxClass] = useState('');
  const [error, setError] = useState<string | null>(null);
  const storeShipping = kind === 'shipping' && shippingTaxFromStore;
  function apply() {
    const parsed = parsePrice(text, currency);
    const refused = !name.trim() ? 'Enter a name.' : typeof parsed === 'string' ? parsed : onApply({
      kind, name: name.trim(), amountMinor: parsed,
      taxStatus: !storeShipping && lineTax?.none && noTax ? 'none' : undefined,
      taxClass: !storeShipping && lineTax?.classes && taxClasses?.length ? taxClass || undefined : undefined,
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
      <Text testID="charge-form-currency" className="pl-3 text-muted-foreground">{currencySymbol(currency)}</Text>
      <TextInput accessibilityLabelledBy={AMOUNT_LABEL_ID} accessibilityLabel={t('common.amount')} value={text} onChangeText={setText} onSubmitEditing={apply}
        inputMode="decimal" className="min-w-0 flex-1 px-3 py-2 text-foreground" />
    </View>
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
