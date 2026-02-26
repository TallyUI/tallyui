import { Text, View, type ViewProps } from 'react-native';

import { useCustomerTraits } from '@tallyui/core';
import { cn } from '@tallyui/theme';

export interface CustomerCardProps extends Omit<ViewProps, 'children'> {
  doc: any;
  className?: string;
}

export function CustomerCard({ doc, className, ...viewProps }: CustomerCardProps) {
  const traits = useCustomerTraits();
  if (!traits) return null;

  const name = traits.getName(doc);
  const email = traits.getEmail(doc);
  const address = traits.getAddressSummary(doc);

  return (
    <View className={cn('gap-0.5', className)} {...viewProps}>
      <Text className="text-sm font-semibold text-foreground">{name}</Text>
      {email && <Text className="text-xs text-muted-foreground">{email}</Text>}
      {address && <Text className="text-xs text-muted-foreground">{address}</Text>}
    </View>
  );
}
