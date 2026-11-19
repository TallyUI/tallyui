import { Pressable, Text, TextInput, View, type ViewProps } from 'react-native';

import { cn } from '@tallyui/theme';

import { useT } from '../i18n';
import { AddressEditor, type AddressEditorProps, type AddressEditorValue } from './address-editor';

export interface CustomerFormValues {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  address: string;
  company?: string;
}

export interface CustomerFormProps extends Omit<ViewProps, 'children'> {
  values: CustomerFormValues;
  onChangeField: (field: keyof CustomerFormValues, value: string) => void;
  onSubmit?: () => void;
  submitLabel?: string;
  showAddress?: boolean;
  /** Billing and shipping. With `onChangeAddresses` too, an `AddressEditor` replaces the free-text Address field. */
  addresses?: AddressEditorValue;
  /** Receives the next billing and shipping; the `AddressEditor` shows only when this and `addresses` are both set. */
  onChangeAddresses?: (next: AddressEditorValue) => void;
  /** Passed through to `AddressEditor`. */
  countries?: AddressEditorProps['countries'];
  /** Passed through to `AddressEditor`. */
  statesFor?: AddressEditorProps['statesFor'];
  /** Passed through to `AddressEditor`: a new address starts in this country. */
  defaultCountry?: AddressEditorProps['defaultCountry'];
  /** A Company field after Email and Phone (v2 customer-form.tsx:171-172). Default false. */
  showCompany?: boolean;
  /** Shown as an alert under the Email field. The form does not validate; the caller decides. */
  emailError?: string;
  className?: string;
}

function FormField({
  label,
  value,
  onChangeText,
  ...props
}: { label: string; value: string; onChangeText: (t: string) => void } & Record<string, any>) {
  return (
    <View className="gap-1">
      <Text className="text-xs font-medium text-muted-foreground">{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholderTextColorClassName="accent-muted-foreground"
        className="rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground"
        {...props}
      />
    </View>
  );
}

export function CustomerForm({
  values,
  onChangeField,
  onSubmit,
  submitLabel = 'Save Customer',
  showAddress = true,
  addresses,
  onChangeAddresses,
  countries,
  statesFor,
  defaultCountry,
  showCompany = false,
  emailError,
  className,
  ...viewProps
}: CustomerFormProps) {
  const t = useT();
  const id = viewProps.testID ?? 'customer-form';
  return (
    <View className={cn('gap-3 p-4', className)} {...viewProps}>
      <View className="flex-row gap-3">
        <View className="flex-1">
          <FormField label={t('common.first_name')} value={values.firstName} onChangeText={(v) => onChangeField('firstName', v)} placeholder="First name" />
        </View>
        <View className="flex-1">
          <FormField label={t('common.last_name')} value={values.lastName} onChangeText={(v) => onChangeField('lastName', v)} placeholder="Last name" />
        </View>
      </View>
      <FormField label={t('common.email')} value={values.email} onChangeText={(v) => onChangeField('email', v)} placeholder="email@example.com" keyboardType="email-address" />
      {emailError ? <Text role="alert" testID={`${id}-email-error`} className="text-xs text-destructive">{emailError}</Text> : null}
      <FormField label={t('common.phone')} value={values.phone} onChangeText={(v) => onChangeField('phone', v)} placeholder="Phone number" keyboardType="phone-pad" />
      {showCompany && <FormField label={t('common.company')} value={values.company ?? ''} onChangeText={(v) => onChangeField('company', v)} />}
      {addresses && onChangeAddresses ? (
        <AddressEditor value={addresses} onChange={onChangeAddresses} countries={countries} statesFor={statesFor}
          defaultCountry={defaultCountry} testID={`${id}-addresses`} />
      ) : (
        showAddress && <FormField label="Address" value={values.address} onChangeText={(v) => onChangeField('address', v)} placeholder="Street address" multiline />
      )}

      {onSubmit && (
        <Pressable onPress={onSubmit} className="items-center rounded-lg bg-primary px-4 py-3">
          <Text className="text-sm font-semibold text-primary-foreground">{submitLabel}</Text>
        </Pressable>
      )}
    </View>
  );
}
