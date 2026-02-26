import * as React from 'react';
import { Pressable, type PressableProps } from 'react-native';
import { Slot } from '@tallyui/primitives';
import { cn } from '@tallyui/theme';
import { cva, type VariantProps } from 'class-variance-authority';

const iconButtonVariants = cva(
  'inline-flex items-center justify-center rounded-md web:transition-colors web:focus-visible:outline-none web:focus-visible:ring-2 web:focus-visible:ring-ring',
  {
    variants: {
      variant: {
        default: 'bg-primary active:opacity-90',
        destructive: 'bg-destructive active:opacity-90',
        outline: 'border border-input bg-background active:bg-accent',
        secondary: 'bg-secondary active:opacity-80',
        ghost: 'active:bg-accent',
      },
      size: {
        sm: 'h-8 w-8',
        md: 'h-10 w-10',
        lg: 'h-12 w-12',
      },
    },
    defaultVariants: {
      variant: 'ghost',
      size: 'md',
    },
  }
);

type IconButtonProps = PressableProps & VariantProps<typeof iconButtonVariants> & {
  asChild?: boolean;
};

const IconButton = React.forwardRef<React.ComponentRef<typeof Pressable>, IconButtonProps>(
  function IconButton({ className, variant, size, asChild = false, disabled, ...props }, ref) {
    const Component = asChild ? Slot : Pressable;

    return (
      <Component
        ref={ref}
        role="button"
        disabled={disabled}
        className={cn(
          iconButtonVariants({ variant, size }),
          disabled && 'opacity-50 web:pointer-events-none',
          className,
        )}
        {...props}
      />
    );
  }
);

IconButton.displayName = 'IconButton';

export { IconButton, iconButtonVariants };
export type { IconButtonProps };
