import * as React from 'react';
import { View, Text } from 'react-native';
import { Checkbox as CheckboxPrimitive } from '@tallyui/primitives';
import { cn } from '@tallyui/theme';

const Checkbox = React.forwardRef<
  React.ComponentRef<typeof CheckboxPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof CheckboxPrimitive.Root>
>(function Checkbox({ className, ...props }, ref) {
  return (
    <CheckboxPrimitive.Root
      ref={ref}
      className={cn(
        'h-4 w-4 shrink-0 rounded-sm border border-primary web:ring-offset-background web:focus-visible:outline-none web:focus-visible:ring-2 web:focus-visible:ring-ring web:focus-visible:ring-offset-2',
        props.checked && 'bg-primary',
        props.disabled && 'web:cursor-not-allowed opacity-50',
        className,
      )}
      {...props}
    >
      <CheckboxPrimitive.Indicator className="flex items-center justify-center text-current">
        <Text className="text-xs text-primary-foreground">{'\u2713'}</Text>
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  );
});
Checkbox.displayName = 'Checkbox';

export { Checkbox };
