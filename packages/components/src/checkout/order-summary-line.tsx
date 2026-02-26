import { cn } from '@tallyui/theme';
import { Text, HStack, type HStackProps } from '../ui';

export interface OrderSummaryLineProps extends Omit<HStackProps, 'children'> {
  label: string;
  amount: string;
  bold?: boolean;
  className?: string;
}

export function OrderSummaryLine({ label, amount, bold = false, className, ...props }: OrderSummaryLineProps) {
  return (
    <HStack space="none" className={cn('justify-between', className)} {...props}>
      <Text className={cn('text-sm', bold ? 'font-bold' : 'text-muted-foreground')}>
        {label}
      </Text>
      <Text className={cn('text-sm', bold && 'font-bold')}>
        {amount}
      </Text>
    </HStack>
  );
}
