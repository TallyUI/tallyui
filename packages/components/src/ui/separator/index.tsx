import * as React from 'react';
import { View } from 'react-native';
import { Separator as SeparatorPrimitive } from '@tallyui/primitives';
import { cn } from '@tallyui/theme';

type SeparatorProps = React.ComponentPropsWithoutRef<typeof SeparatorPrimitive.Root>;

const Separator = React.forwardRef<React.ComponentRef<typeof View>, SeparatorProps>(
  function Separator({ className, orientation = 'horizontal', decorative = true, ...props }, ref) {
    return (
      <SeparatorPrimitive.Root
        ref={ref}
        decorative={decorative}
        orientation={orientation}
        className={cn(
          'shrink-0 bg-border',
          orientation === 'horizontal' ? 'h-[1px] w-full' : 'h-full w-[1px]',
          className,
        )}
        {...props}
      />
    );
  }
);

Separator.displayName = 'Separator';

export { Separator };
export type { SeparatorProps };
