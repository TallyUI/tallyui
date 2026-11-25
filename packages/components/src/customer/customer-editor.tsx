/** Adds or edits a customer: CustomerForm with its AddressEditor, an explicit Save and Cancel, and the store call.
 * v2 saves its edit form as you type (customers/edit/form.tsx); here Save is explicit and online-only (desk ruling, 10.1 vet). */
import { useEffect, useRef, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import type { Customer, CustomerInput, CustomerPatch } from '@tallyui/core';
import { shipsToBilling, toCustomerInput, toCustomerPatch, type CustomerEditValues } from '@tallyui/pos';
import { cn } from '@tallyui/theme';
import { useT } from '../i18n';
import { CustomerForm, type CustomerFormProps } from './customer-form';
import { customerEmailError, customerErrorText } from './customer-picker';

export interface CustomerEditorProps {
  /** Edit this customer; absent means add a new one. */
  customer?: Customer;
  /** Add mode's store call. */
  create?: (input: CustomerInput) => Promise<Customer>;
  /** Edit mode's store call. */
  update?: (id: string, patch: CustomerPatch) => Promise<Customer>;
  /** Called with the store's customer after a save, or with `customer` when an edit changed nothing. */
  onSaved: (customer: Customer) => void;
  onCancel: () => void;
  /** Save is disabled while offline (desk ruling: online-only Save). */
  online: boolean;
  countries?: CustomerFormProps['countries'];
  statesFor?: CustomerFormProps['statesFor'];
  defaultCountry?: CustomerFormProps['defaultCountry'];
  className?: string;
  /** Default 'customer-editor'. */
  testID?: string;
}

function initialValues(customer: Customer | undefined): CustomerEditValues {
  if (!customer) return { firstName: '', lastName: '', email: '', phone: '' };
  return {
    firstName: customer.firstName ?? '', lastName: customer.lastName ?? '', email: customer.email ?? '', phone: customer.phone ?? '',
    company: customer.company, billing: customer.billing,
    // undefined is "Same as billing" (ShippingAddressFields' convention).
    shipping: shipsToBilling(customer.shipping, customer.billing) ? undefined : customer.shipping,
  };
}

export function CustomerEditor({ customer, create, update, onSaved, onCancel, online, countries, statesFor, defaultCountry, className, testID = 'customer-editor' }: CustomerEditorProps) {
  const t = useT();
  const [values, setValues] = useState<CustomerEditValues>(() => initialValues(customer));
  const [emailError, setEmailError] = useState<string | undefined>();
  const [saveError, setSaveError] = useState<string | undefined>();
  const [saving, setSaving] = useState(false);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const disabled = !online || saving || !values.email.trim();

  async function save() {
    if (disabled) return;
    const trimmed: CustomerEditValues = { ...values, firstName: values.firstName.trim(), lastName: values.lastName.trim(),
      email: values.email.trim(), phone: values.phone.trim(), company: values.company?.trim() };
    const error = customerEmailError(trimmed.email, t);
    if (error) return setEmailError(error);
    let call: Promise<Customer> | undefined;
    if (!customer) call = create?.(toCustomerInput(trimmed));
    else {
      const patch = toCustomerPatch(customer, trimmed);
      if (Object.keys(patch).length === 0) return onSaved(customer);
      call = update?.(customer.id, patch);
    }
    if (!call) return;
    setSaving(true);
    setSaveError(undefined);
    try {
      const result = await call;
      if (mounted.current) onSaved(result);
    } catch (failure) {
      if (mounted.current) setSaveError(customerErrorText(failure));
    } finally {
      if (mounted.current) setSaving(false);
    }
  }

  const change = (next: Partial<CustomerEditValues>) => {
    setValues((current) => ({ ...current, ...next }));
    setEmailError(undefined);
    setSaveError(undefined);
  };
  const button = 'items-center rounded-lg px-4 py-3';
  return <View className={cn('gap-3', className)}>
    <CustomerForm values={{ ...values, address: '' }} onChangeField={(field, value) => change({ [field]: value })}
      addresses={{ billing: values.billing, shipping: values.shipping }} onChangeAddresses={(next) => change(next)} showCompany
      countries={countries} statesFor={statesFor} defaultCountry={defaultCountry} emailError={emailError} testID={`${testID}-form`} />
    {saveError ? <Text role="alert" testID={`${testID}-error`} className="px-4 text-sm text-destructive">{saveError}</Text> : null}
    <View className="flex-row justify-end gap-3 px-4">
      <Pressable accessibilityRole="button" testID={`${testID}-cancel`} onPress={onCancel} className={cn(button, 'border border-border')}>
        <Text className="text-sm font-semibold text-foreground">{t('common.cancel')}</Text>
      </Pressable>
      <Pressable accessibilityRole="button" testID={`${testID}-save`} disabled={disabled} accessibilityState={{ disabled, busy: saving }}
        onPress={save} className={cn(button, 'bg-primary', disabled && 'opacity-50')}>
        <Text className="text-sm font-semibold text-primary-foreground">{customer ? t('common.save') : t('customers.add_customer')}</Text>
      </Pressable>
    </View>
  </View>;
}
