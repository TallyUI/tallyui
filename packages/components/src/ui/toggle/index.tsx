import * as React from 'react';
import { Toggle as TogglePrimitive, TextClassContext } from '@tallyui/primitives';
import { cn } from '@tallyui/theme';
import { cva, type VariantProps } from 'class-variance-authority';

const toggleVariants = cva(
  'inline-flex items-center justify-center rounded-md text-sm font-medium web:ring-offset-background web:transition-colors web:hover:bg-muted web:hover:text-muted-foreground web:focus-visible:outline-none web:focus-visible:ring-2 web:focus-visible:ring-ring web:focus-visible:ring-offset-2',
  {
    variants: {
      variant: {
        default: 'bg-transparent',
        outline: 'border border-input bg-transparent web:hover:bg-accent web:hover:text-accent-foreground',
      },
      size: {
        default: 'h-10 px-3',
        sm: 'h-9 px-2.5',
        lg: 'h-11 px-5',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  }
);

const toggleTextVariants = cva('text-sm font-medium', {
  variants: {
    variant: {
      default: '',
      outline: '',
    },
    size: {
      default: '',
      sm: '',
      lg: '',
    },
  },
  defaultVariants: {
    variant: 'default',
    size: 'default',
  },
});

type ToggleProps = React.ComponentPropsWithoutRef<typeof TogglePrimitive.Root> &
  VariantProps<typeof toggleVariants>;

const Toggle = React.forwardRef<
  React.ComponentRef<typeof TogglePrimitive.Root>,
  ToggleProps
>(function Toggle({ className, variant, size, ...props }, ref) {
  return (
    <TextClassContext.Provider value={toggleTextVariants({ variant, size })}>
      <TogglePrimitive.Root
        ref={ref}
        className={cn(
          toggleVariants({ variant, size }),
          props.pressed && 'bg-accent text-accent-foreground',
          className,
        )}
        {...props}
      />
    </TextClassContext.Provider>
  );
});
Toggle.displayName = 'Toggle';

export { Toggle, toggleVariants, toggleTextVariants };
export type { ToggleProps };
