import * as React from 'react';
import { Switch as SwitchPrimitive } from '@tallyui/primitives';
import { cn } from '@tallyui/theme';

const Switch = React.forwardRef<
  React.ComponentRef<typeof SwitchPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof SwitchPrimitive.Root>
>(function Switch({ className, ...props }, ref) {
  return (
    <SwitchPrimitive.Root
      ref={ref}
      className={cn(
        'web:peer inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent web:transition-colors web:focus-visible:outline-none web:focus-visible:ring-2 web:focus-visible:ring-ring web:focus-visible:ring-offset-2 web:focus-visible:ring-offset-background',
        props.checked ? 'bg-primary' : 'bg-input',
        props.disabled && 'web:cursor-not-allowed opacity-50',
        className,
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb
        className={cn(
          'pointer-events-none block h-5 w-5 rounded-full bg-background shadow-lg ring-0 web:transition-transform',
          props.checked ? 'translate-x-5' : 'translate-x-0',
        )}
      />
    </SwitchPrimitive.Root>
  );
});
Switch.displayName = 'Switch';

export { Switch };
