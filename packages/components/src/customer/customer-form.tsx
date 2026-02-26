import { Pressable, Text, TextInput, View, type ViewProps } from 'react-native';

import { cn } from '@tallyui/theme';

export interface CustomerFormValues {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  address: string;
}

export interface CustomerFormProps extends Omit<ViewProps, 'children'> {
  values: CustomerFormValues;
  onChangeField: (field: keyof CustomerFormValues, value: string) => void;
  onSubmit?: () => void;
  submitLabel?: string;
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
      <Text className="text-xs font-medium text-muted">{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholderTextColor="#9ca3af"
        className="rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground"
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
  className,
  ...viewProps
}: CustomerFormProps) {
  return (
    <View className={cn('gap-3 p-4', className)} {...viewProps}>
      <View className="flex-row gap-3">
        <View className="flex-1">
          <FormField label="First Name" value={values.firstName} onChangeText={(v) => onChangeField('firstName', v)} placeholder="First name" />
        </View>
        <View className="flex-1">
          <FormField label="Last Name" value={values.lastName} onChangeText={(v) => onChangeField('lastName', v)} placeholder="Last name" />
        </View>
      </View>
      <FormField label="Email" value={values.email} onChangeText={(v) => onChangeField('email', v)} placeholder="email@example.com" keyboardType="email-address" />
      <FormField label="Phone" value={values.phone} onChangeText={(v) => onChangeField('phone', v)} placeholder="Phone number" keyboardType="phone-pad" />
      <FormField label="Address" value={values.address} onChangeText={(v) => onChangeField('address', v)} placeholder="Street address" multiline />

      {onSubmit && (
        <Pressable onPress={onSubmit} className="items-center rounded-lg bg-primary px-4 py-3">
          <Text className="text-sm font-semibold text-primary-foreground">{submitLabel}</Text>
        </Pressable>
      )}
    </View>
  );
}
