import * as React from 'react';
import { View } from 'react-native';
import { Slider as SliderPrimitive } from '@tallyui/primitives';
import { cn } from '@tallyui/theme';

type SliderProps = React.ComponentPropsWithoutRef<typeof SliderPrimitive.Root>;

const Slider = React.forwardRef<
  React.ComponentRef<typeof SliderPrimitive.Root>,
  SliderProps
>(function Slider({ className, ...props }, ref) {
  return (
    <SliderPrimitive.Root
      ref={ref}
      className={cn('relative flex w-full touch-none select-none items-center', className)}
      {...props}
    >
      <SliderPrimitive.Track className="relative h-2 w-full grow overflow-hidden rounded-full bg-secondary">
        <SliderPrimitive.Range className="absolute h-full bg-primary" />
      </SliderPrimitive.Track>
      <SliderPrimitive.Thumb className="block h-5 w-5 rounded-full border-2 border-primary bg-background web:ring-offset-background web:transition-colors web:focus-visible:outline-none web:focus-visible:ring-2 web:focus-visible:ring-ring web:focus-visible:ring-offset-2" />
    </SliderPrimitive.Root>
  );
});
Slider.displayName = 'Slider';

export { Slider };
export type { SliderProps };
