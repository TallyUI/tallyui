import { useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import { parsePrice } from './price-form';

export interface ChargeFormProps {
  currency: string;
  lineTax?: { none: boolean; classes: boolean };
  taxClasses?: ReadonlyArray<{ id: string; label: string }>;
  shippingTaxFromStore?: boolean;
  onApply: (charge: { kind: 'fee' | 'shipping' | 'custom'; name: string; amountMinor: number;
    taxStatus?: 'none'; taxClass?: string }) => string | null;
  onClose: () => void;
}

const button = 'rounded-md border border-border px-3 py-2 min-h-11 items-center justify-center';

/** `onApply` returns a refusal to show inline, or null once applied. */
export function ChargeForm({ currency, lineTax, taxClasses, shippingTaxFromStore, onApply, onClose }: ChargeFormProps) {
  const [kind, setKind] = useState<'fee' | 'shipping' | 'custom'>('fee');
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
  return <View testID="charge-form" role="group" accessibilityLabel="Add charge" className="gap-2 px-3 py-2">
    <Text className="font-semibold text-foreground">Add charge</Text>
    <View className="flex-row gap-2">
      {(['fee', 'shipping', 'custom'] as const).map((option) => <Pressable key={option} accessibilityRole="button"
        accessibilityState={{ selected: kind === option }} aria-selected={kind === option} onPress={() => setKind(option)}
        className={`${button} ${kind === option ? 'bg-primary' : 'bg-card'}`}>
        <Text className={kind === option ? 'text-primary-foreground' : 'text-foreground'}>
          {option === 'fee' ? 'Fee' : option === 'shipping' ? 'Shipping' : 'Custom item'}</Text>
      </Pressable>)}
    </View>
    <TextInput accessibilityLabel="Name" placeholder="Name" value={name} onChangeText={setName}
      className="min-w-0 rounded-md border border-border bg-background px-3 py-2 text-foreground" />
    <TextInput accessibilityLabel="Amount" value={text} onChangeText={setText} onSubmitEditing={apply}
      inputMode="decimal" placeholder={currency}
      className="min-w-0 rounded-md border border-border bg-background px-3 py-2 text-foreground" />
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
