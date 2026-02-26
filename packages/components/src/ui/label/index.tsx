import * as React from 'react';
import { Text } from 'react-native';
import { Label as LabelPrimitive } from '@tallyui/primitives';
import { cn } from '@tallyui/theme';

type LabelProps = React.ComponentPropsWithoutRef<typeof LabelPrimitive.Root>;

const Label = React.forwardRef<React.ComponentRef<typeof Text>, LabelProps>(
  function Label({ className, ...props }, ref) {
    return (
      <LabelPrimitive.Root
        ref={ref}
        className={cn(
          'text-sm font-medium leading-none text-foreground web:peer-disabled:cursor-not-allowed web:peer-disabled:opacity-70',
          className,
        )}
        {...props}
      />
    );
  }
);

Label.displayName = 'Label';

export { Label };
export type { LabelProps };
