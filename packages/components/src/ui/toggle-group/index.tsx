import * as React from 'react';
import { ToggleGroup as ToggleGroupPrimitive, TextClassContext } from '@tallyui/primitives';
import { cn } from '@tallyui/theme';
import { type VariantProps } from 'class-variance-authority';
import { toggleVariants, toggleTextVariants } from '../toggle';

type ToggleGroupProps = React.ComponentPropsWithoutRef<typeof ToggleGroupPrimitive.Root> &
  VariantProps<typeof toggleVariants>;

const ToggleGroupContext = React.createContext<VariantProps<typeof toggleVariants>>({
  size: 'default',
  variant: 'default',
});

const ToggleGroup = React.forwardRef<
  React.ComponentRef<typeof ToggleGroupPrimitive.Root>,
  ToggleGroupProps
>(function ToggleGroup({ className, variant, size, children, ...props }, ref) {
  return (
    <ToggleGroupPrimitive.Root
      ref={ref}
      className={cn('flex flex-row items-center justify-center gap-1', className)}
      {...props}
    >
      <ToggleGroupContext.Provider value={{ variant, size }}>
        {children}
      </ToggleGroupContext.Provider>
    </ToggleGroupPrimitive.Root>
  );
});
ToggleGroup.displayName = 'ToggleGroup';

type ToggleGroupItemProps = React.ComponentPropsWithoutRef<typeof ToggleGroupPrimitive.Item> &
  VariantProps<typeof toggleVariants>;

const ToggleGroupItem = React.forwardRef<
  React.ComponentRef<typeof ToggleGroupPrimitive.Item>,
  ToggleGroupItemProps
>(function ToggleGroupItem({ className, variant, size, ...props }, ref) {
  const context = React.useContext(ToggleGroupContext);

  return (
    <TextClassContext.Provider
      value={toggleTextVariants({
        variant: variant || context.variant,
        size: size || context.size,
      })}
    >
      <ToggleGroupPrimitive.Item
        ref={ref}
        className={cn(
          toggleVariants({
            variant: variant || context.variant,
            size: size || context.size,
          }),
          className,
        )}
        {...props}
      />
    </TextClassContext.Provider>
  );
});
ToggleGroupItem.displayName = 'ToggleGroupItem';

export { ToggleGroup, ToggleGroupItem };
export type { ToggleGroupProps, ToggleGroupItemProps };
