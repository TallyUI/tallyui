import { useCustomerTraits } from '@tallyui/core';
import { cn } from '@tallyui/theme';
import { Text, VStack, type VStackProps } from '../ui';

export interface CustomerCardProps extends Omit<VStackProps, 'children'> {
  doc: any;
  className?: string;
}

export function CustomerCard({ doc, className, ...props }: CustomerCardProps) {
  const traits = useCustomerTraits();
  if (!traits) return null;

  const name = traits.getName(doc);
  const email = traits.getEmail(doc);
  const address = traits.getAddressSummary(doc);

  return (
    <VStack space="none" className={cn('gap-0.5', className)} {...props}>
      <Text className="text-sm font-semibold">{name}</Text>
      {email && <Text className="text-xs text-muted-foreground">{email}</Text>}
      {address && <Text className="text-xs text-muted-foreground">{address}</Text>}
    </VStack>
  );
}
