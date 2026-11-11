import * as React from 'react';
import { Switch as SwitchPrimitive } from '@tallyui/primitives';
import { cn } from '@tallyui/theme';

// Track, thumb and checked travel per size. Both keep border-2, so travel = inner width - thumb.
const sizes = {
  default: { track: 'h-6 w-11', thumb: 'h-5 w-5', on: 'translate-x-5' },
  sm: { track: 'h-5 w-9', thumb: 'h-4 w-4', on: 'translate-x-4' },
} as const;

type SwitchProps = React.ComponentPropsWithoutRef<typeof SwitchPrimitive.Root> & {
  size?: keyof typeof sizes;
};

const Switch = React.forwardRef<React.ComponentRef<typeof SwitchPrimitive.Root>, SwitchProps>(function Switch(
  { className, size = 'default', ...props },
  ref,
) {
  const s = sizes[size];
  return (
    <SwitchPrimitive.Root
      ref={ref}
      className={cn(
        `web:peer inline-flex ${s.track} shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent web:transition-colors web:focus-visible:outline-none web:focus-visible:ring-2 web:focus-visible:ring-ring web:focus-visible:ring-offset-2 web:focus-visible:ring-offset-background`,
        props.checked ? 'bg-primary' : 'bg-input',
        props.disabled && 'web:cursor-not-allowed opacity-50',
        className,
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb
        className={cn(
          `pointer-events-none block ${s.thumb} rounded-full bg-background shadow-lg ring-0 web:transition-transform`,
          props.checked ? s.on : 'translate-x-0',
        )}
      />
    </SwitchPrimitive.Root>
  );
});
Switch.displayName = 'Switch';

export { Switch };
