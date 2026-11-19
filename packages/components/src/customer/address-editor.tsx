/** An order's billing and shipping as WCPOS v2's address rows (`components/customer/address-rows.tsx:100-140`, MIT, WCPOS):
 * an add button until the address is present, then a row with a summary, Edit and Remove, the parts opening beneath it. */
import { useState, type JSX } from 'react';
import { View } from 'react-native';
import type { CustomerAddress } from '@tallyui/core';
import { useT } from '../i18n';
import { Button } from '../ui/button';
import { Text } from '../ui/text';
import { AddressFields, ShippingAddressFields, type AddressFieldsProps } from './address-fields';

export interface AddressEditorValue { billing?: CustomerAddress; shipping?: CustomerAddress }

export interface AddressEditorProps {
  value: AddressEditorValue;
  onChange: (next: AddressEditorValue) => void;
  countries?: AddressFieldsProps['countries'];
  statesFor?: AddressFieldsProps['statesFor'];
  /** The store's country: a new address starts with it (v2 address-rows.tsx:115-119). */
  defaultCountry?: string;
  /** Prefix for every testID. Default 'address-editor'. */
  testID?: string;
}

const SUMMARY_PARTS = ['address1', 'address2', 'city', 'state', 'postcode', 'country'] as const;

/** The set address parts joined with ", "; with none, the name, else the company, else ''. */
function summary(address: CustomerAddress): string {
  const parts = SUMMARY_PARTS.map((part) => address[part]).filter(Boolean);
  if (parts.length) return parts.join(', ');
  return [address.firstName, address.lastName].filter(Boolean).join(' ') || address.company || '';
}

function AddressRow({ id, heading, address, open, onEdit, onRemove }: {
  id: string;
  heading: string;
  address: CustomerAddress;
  open: boolean;
  onEdit: () => void;
  onRemove: () => void;
}) {
  const t = useT();
  const text = summary(address);
  const verb = (name: string, copy: string, onPress: () => void, expanded?: boolean) => <Button variant="link" size="sm"
    testID={`${id}-${name}`} onPress={onPress} aria-expanded={expanded}
    className="h-11 px-2"><Text>{copy}</Text></Button>;
  return <View className="gap-1">
    <Text className="text-sm font-medium text-foreground">{heading}</Text>
    <View className="flex-row items-center gap-1">
      <Text testID={`${id}-summary`} numberOfLines={1} className={`flex-1 text-sm ${text ? 'text-foreground' : 'text-muted-foreground'}`}>{text}</Text>
      {verb('edit', t('common.edit'), onEdit, open)}
      {verb('remove', t('common.remove'), onRemove)}
    </View>
  </View>;
}

/** A controlled editor for an order's billing and shipping. No dialog: the app places it in its own. */
export function AddressEditor({ value, onChange, countries, statesFor, defaultCountry, testID = 'address-editor' }: AddressEditorProps): JSX.Element {
  const t = useT();
  const [open, setOpen] = useState({ billing: false, shipping: false });
  const { billing, shipping } = value;
  const toggle = (name: 'billing' | 'shipping') => () => setOpen((current) => ({ ...current, [name]: !current[name] }));
  const add = (name: 'billing' | 'shipping', label: string) => <Button variant="link" size="sm" testID={`${testID}-${name}-add`}
    onPress={() => { onChange({ ...value, [name]: defaultCountry ? { country: defaultCountry } : {} }); setOpen((current) => ({ ...current, [name]: true })); }}
    className="h-11 self-start px-0"><Text>{t('common.add_value', { label })}</Text></Button>;
  const remove = (name: 'billing' | 'shipping') => () => {
    onChange({ ...value, [name]: undefined });
    setOpen((current) => ({ ...current, [name]: false }));
  };

  return <View className="gap-4">
    {billing ? <View className="gap-3">
      <AddressRow id={`${testID}-billing`} heading={t('common.billing_address')} address={billing} open={open.billing}
        onEdit={toggle('billing')} onRemove={remove('billing')} />
      {open.billing && <AddressFields value={billing} showEmail onChange={(next) => onChange({ ...value, billing: next })}
        countries={countries} statesFor={statesFor} testID={`${testID}-billing`} />}
    </View> : add('billing', t('common.billing_address'))}
    {/* Not re-keyed: ShippingAddressFields reads its link once, at mount (address-fields.tsx). */}
    {billing ? <ShippingAddressFields billing={billing} value={shipping} onChange={(next) => onChange({ ...value, shipping: next })}
      countries={countries} statesFor={statesFor} testID={`${testID}-shipping`} />
      : shipping ? <View className="gap-3">
        <AddressRow id={`${testID}-shipping`} heading={t('common.shipping_address')} address={shipping} open={open.shipping}
          onEdit={toggle('shipping')} onRemove={remove('shipping')} />
        {open.shipping && <AddressFields value={shipping} onChange={(next) => onChange({ ...value, shipping: next })}
          countries={countries} statesFor={statesFor} testID={`${testID}-shipping`} />}
      </View> : add('shipping', t('common.shipping_address'))}
  </View>;
}
