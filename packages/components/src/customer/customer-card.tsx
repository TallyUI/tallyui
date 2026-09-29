import { useCustomerTraits, type CustomerTraits } from '@tallyui/core';
import { cn } from '@tallyui/theme';
import { Text, VStack, type VStackProps } from '../ui';

export interface CustomerCardProps<Doc = any> extends Omit<VStackProps, 'children'> {
  doc: Doc;
  traits?: CustomerTraits<Doc>;
  className?: string;
}

function CustomerCardFromContext<Doc>(props: CustomerCardProps<Doc>) {
  const traits = useCustomerTraits();
  return traits ? <CustomerCard {...props} traits={traits} /> : null;
}

export function CustomerCard<Doc>({ doc, traits, className, ...props }: CustomerCardProps<Doc>) {
  if (!traits) return <CustomerCardFromContext doc={doc} className={className} {...props} />;

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
