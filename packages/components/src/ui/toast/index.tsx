import * as React from 'react';
import { View, Text, Pressable } from 'react-native';
import { Toast as ToastPrimitive } from '@tallyui/primitives';
import { cn } from '@tallyui/theme';
import { cva, type VariantProps } from 'class-variance-authority';

const toastVariants = cva(
  'group pointer-events-auto relative flex w-full flex-row items-center justify-between gap-4 overflow-hidden rounded-md border p-6 pr-8 shadow-lg',
  {
    variants: {
      variant: {
        default: 'border-border bg-background text-foreground',
        destructive: 'border-destructive bg-destructive text-destructive-foreground',
        success: 'border-success bg-success text-success-foreground',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  }
);

type ToastProps = React.ComponentPropsWithoutRef<typeof View> & VariantProps<typeof toastVariants>;

function Toast({ className, variant, ...props }: ToastProps) {
  return <View className={cn(toastVariants({ variant }), className)} {...props} />;
}

function ToastTitle({ className, ...props }: React.ComponentPropsWithoutRef<typeof Text>) {
  return <Text className={cn('text-sm font-semibold', className)} {...props} />;
}

function ToastDescription({ className, ...props }: React.ComponentPropsWithoutRef<typeof Text>) {
  return <Text className={cn('text-sm opacity-90', className)} {...props} />;
}

function ToastClose({ className, ...props }: React.ComponentPropsWithoutRef<typeof Pressable>) {
  return (
    <Pressable
      className={cn(
        'absolute right-2 top-2 rounded-md p-1 opacity-0 web:transition-opacity web:hover:opacity-100 web:focus:opacity-100 web:group-hover:opacity-100',
        className,
      )}
      {...props}
    >
      <Text className="text-sm">✕</Text>
    </Pressable>
  );
}

export { Toast, ToastTitle, ToastDescription, ToastClose, toastVariants };
export type { ToastProps };
