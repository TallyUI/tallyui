/** A CustomerAddress's parts, and shipping linked to billing. Ported from WCPOS v2's `components/customer/address-rows.tsx` (MIT, WCPOS). */
import { useState } from 'react';
import { View } from 'react-native';
import type { CustomerAddress } from '@tallyui/core';
import { useT } from '../i18n';
import { Input } from '../ui/input';
import { Combobox, ComboboxContent, ComboboxEmpty, ComboboxInput, ComboboxItem, ComboboxList, ComboboxTrigger } from '../ui/combobox';
import { Button } from '../ui/button';
import { Text } from '../ui/text';
import { labelOf, type FilterOption } from '../filter/filter-pills';
type Part = keyof CustomerAddress;
// v2 SHIPPING_PARTS (address-rows.tsx:26, ADDRESS_PARTS :17-24); with showEmail, email follows lastName as in v2's BILLING_PARTS (:28).
const PARTS: readonly Part[] = ['firstName', 'lastName', 'company', 'phone', 'address1', 'address2', 'city', 'postcode', 'country', 'state'];
const LABELS: Record<Part, string> = { firstName: 'common.first_name', lastName: 'common.last_name', email: 'common.email',
  company: 'common.company', phone: 'common.phone', address1: 'common.address_1', address2: 'common.address_2', city: 'common.city',
  postcode: 'common.postcode', country: 'common.country', state: 'common.state' };
const KEYBOARD: Partial<Record<Part, 'email-address' | 'phone-pad'>> = { email: 'email-address', phone: 'phone-pad' };

export interface AddressFieldsProps {
  value: CustomerAddress;
  onChange: (next: CustomerAddress) => void;
  /** Country options (ISO alpha-2 value, display label). Absent: Country is a text input. */
  countries?: readonly { value: string; label: string }[];
  /** A country's state options. Absent, or undefined/empty for that country: State is a text input. */
  statesFor?: (country: string) => readonly { value: string; label: string }[] | undefined;
  /** Show the Email part (billing only; v2's shipping has no email, address.tsx:30-33). Default false. */
  showEmail?: boolean;
  /** Prefix for every testID. Default 'address-fields'. */
  testID?: string;
}

/** Every part is optional (v2 address.tsx:11-28): an emptied part leaves the address, never stays as '' or undefined. */
function put(address: CustomerAddress, part: Part, text: string): CustomerAddress {
  const { [part]: _emptied, ...rest } = address;
  return text === '' ? rest : { ...address, [part]: text };
}

/** A new country drops a state its list does not have; a country without a list, or an emptied one, keeps it. */
function withCountry(address: CustomerAddress, next: string, statesFor: AddressFieldsProps['statesFor']): CustomerAddress {
  const list = next ? statesFor?.(next) : undefined;
  const stale = !!list?.length && !!address.state && !list.some((option) => option.value === address.state);
  return put(stale ? put(address, 'state', '') : address, 'country', next);
}

/** ui/combobox as a form field, as sale/discount-form.tsx composes it; ComboboxPill is a chip, not a field. */
function PartPicker({ id, label, placeholder, value, options, onPick }: {
  id: string;
  label: string;
  placeholder: string;
  value?: string;
  options: readonly FilterOption[];
  onPick: (text: string) => void;
}) {
  const [search, setSearch] = useState('');
  const needle = search.trim().toLowerCase();
  const shown = needle ? options.filter((option) => option.label.toLowerCase().includes(needle)) : options;
  const picked = value === undefined ? undefined : { value, label: labelOf([...options], value) };
  return <Combobox value={picked} onValueChange={(next) => onPick(next?.value ?? '')} searchValue={search} onSearchValueChange={setSearch}>
    <ComboboxTrigger testID={id}><Text className={picked ? 'text-foreground' : 'text-muted-foreground'}>{picked?.label ?? placeholder}</Text></ComboboxTrigger>
    <ComboboxContent>
      <View className="border-b border-border px-2 py-1.5"><ComboboxInput testID={`${id}-search`} accessibilityLabel={label} placeholder={placeholder} /></View>
      <ComboboxList>
        {shown.map((option) => <ComboboxItem key={option.value} testID={`${id}-${option.value}`} value={option.value} label={option.label}>
          <Text className="text-sm text-popover-foreground">{option.label}</Text></ComboboxItem>)}
        {shown.length ? null : <ComboboxEmpty />}
      </ComboboxList>
    </ComboboxContent>
  </Combobox>;
}

/** A controlled CustomerAddress form, one column. Country and State are pickers when the app passes their options. */
export function AddressFields({ value, onChange, countries, statesFor, showEmail = false, testID = 'address-fields' }: AddressFieldsProps) {
  const t = useT();
  const states = value.country ? statesFor?.(value.country) : undefined;
  const parts: readonly Part[] = showEmail ? [...PARTS.slice(0, 2), 'email', ...PARTS.slice(2)] : PARTS;
  return <View className="gap-3">{parts.map((part) => {
    const label = t(LABELS[part]);
    const placeholder = t('common.add_value', { label });
    const write = (text: string) => onChange(part === 'country' ? withCountry(value, text, statesFor) : put(value, part, text));
    const options = part === 'country' ? countries : part === 'state' && states?.length ? states : undefined;
    return <View key={part} className="gap-1">
      <Text className="text-xs font-medium text-muted-foreground">{label}</Text>
      {options ? <PartPicker id={`${testID}-${part}`} label={label} placeholder={placeholder} value={value[part]} options={options} onPick={write} />
        : <Input><Input.Field testID={`${testID}-${part}`} accessibilityLabel={label} value={value[part] ?? ''} placeholder={placeholder}
          keyboardType={KEYBOARD[part]} onChangeText={write} /></Input>}
    </View>;
  })}</View>;
}

export interface ShippingAddressFieldsProps {
  billing: CustomerAddress | undefined;
  value: CustomerAddress | undefined;
  /** `undefined` is "Same as billing": shipping folds back to billing. */
  onChange: (next: CustomerAddress | undefined) => void;
  countries?: AddressFieldsProps['countries'];
  statesFor?: AddressFieldsProps['statesFor'];
  /** Default 'shipping-address'. */
  testID?: string;
}

/** v2 shipsToBilling (address-rows.tsx:41-48): no part set, or billing's copy; email is not compared, absent reads as ''. */
const sameAsBilling = (value: CustomerAddress | undefined, billing: CustomerAddress | undefined) =>
  !PARTS.some((part) => value?.[part]) || PARTS.every((part) => (value?.[part] ?? '') === (billing?.[part] ?? ''));

/** Shipping reads "Same as billing" until the cashier uses a different address. The link is read once, at mount, so a copy of
 * billing stays open: key the component by order to read it again, as v2 keys its form by the order's uuid (pos/cart/customer.tsx:59). */
export function ShippingAddressFields({ billing, value, onChange, countries, statesFor, testID = 'shipping-address' }: ShippingAddressFieldsProps) {
  const t = useT();
  const [linked, setLinked] = useState(() => sameAsBilling(value, billing));
  const { email: _email, ...own } = billing ?? {}; // v2 asShipping: shipping has no email.
  const link = (on: boolean) => { onChange(on ? undefined : own); setLinked(on); };
  const button = (id: string, copy: string, on: boolean) => <Button variant="link" size="sm" testID={`${testID}-${id}`}
    onPress={() => link(on)} className="h-11 self-start px-0"><Text>{copy}</Text></Button>;
  return <View className="gap-3">
    <Text className="text-sm font-medium text-foreground">{t('common.shipping_address')}</Text>
    {linked ? <Text testID={`${testID}-linked`} className="text-sm text-muted-foreground">{t('pos_cart.same_as_billing')}</Text>
      : <AddressFields value={value ?? {}} onChange={onChange} countries={countries} statesFor={statesFor} testID={`${testID}-fields`} />}
    {linked ? button('different', t('pos_cart.use_different_address'), false) : button('same', t('pos_cart.same_as_billing'), true)}
  </View>;
}
