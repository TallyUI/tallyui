import * as React from 'react';
import { Pressable, type PressableProps } from 'react-native';
import { TextClassContext, Slot } from '@tallyui/primitives';
import { cn } from '@tallyui/theme';
import { cva, type VariantProps } from 'class-variance-authority';

const buttonVariants = cva(
  'inline-flex flex-row items-center justify-center gap-2 rounded-md web:ring-offset-background web:transition-colors web:focus-visible:outline-none web:focus-visible:ring-2 web:focus-visible:ring-ring web:focus-visible:ring-offset-2',
  {
    variants: {
      variant: {
        default: 'bg-primary active:opacity-90',
        destructive: 'bg-destructive active:opacity-90',
        outline: 'border border-input bg-background active:bg-accent',
        secondary: 'bg-secondary active:opacity-80',
        ghost: 'active:bg-accent',
        link: 'web:underline-offset-4 web:hover:underline',
      },
      size: {
        default: 'h-10 px-4 py-2',
        sm: 'h-9 rounded-md px-3',
        lg: 'h-11 rounded-md px-8',
        icon: 'h-10 w-10',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  }
);

const buttonTextVariants = cva(
  'web:whitespace-nowrap text-sm font-medium',
  {
    variants: {
      variant: {
        default: 'text-primary-foreground',
        destructive: 'text-destructive-foreground',
        outline: 'text-foreground',
        secondary: 'text-secondary-foreground',
        ghost: 'text-foreground',
        link: 'text-primary',
      },
      size: {
        default: '',
        sm: '',
        lg: 'text-base',
        icon: '',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  }
);

type ButtonProps = PressableProps & VariantProps<typeof buttonVariants> & {
  asChild?: boolean;
};

const Button = React.forwardRef<React.ComponentRef<typeof Pressable>, ButtonProps>(
  function Button({ className, variant, size, asChild = false, disabled, ...props }, ref) {
    const Component = asChild ? Slot : Pressable;

    return (
      <TextClassContext.Provider
        value={buttonTextVariants({ variant, size })}
      >
        <Component
          ref={ref}
          role="button"
          disabled={disabled}
          className={cn(
            buttonVariants({ variant, size }),
            disabled && 'opacity-50 web:pointer-events-none',
            className,
          )}
          {...props}
        />
      </TextClassContext.Provider>
    );
  }
);

Button.displayName = 'Button';

export { Button, buttonVariants, buttonTextVariants };
export type { ButtonProps };
