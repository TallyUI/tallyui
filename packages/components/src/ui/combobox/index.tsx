import * as React from 'react';
import { View, TextInput, Pressable, Text, ScrollView } from 'react-native';
import { Combobox as ComboboxPrimitive, TextClassContext } from '@tallyui/primitives';
import { cn } from '@tallyui/theme';

const Combobox = ComboboxPrimitive.Root;

const ComboboxTrigger = React.forwardRef<
  React.ComponentRef<typeof ComboboxPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof ComboboxPrimitive.Trigger>
>(function ComboboxTrigger({ className, children, ...props }, ref) {
  return (
    <ComboboxPrimitive.Trigger
      ref={ref}
      className={cn(
        'flex h-10 w-full flex-row items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm web:ring-offset-background web:focus:outline-none web:focus:ring-2 web:focus:ring-ring web:focus:ring-offset-2',
        className,
      )}
      {...props}
    >
      {children}
    </ComboboxPrimitive.Trigger>
  );
});
ComboboxTrigger.displayName = 'ComboboxTrigger';

const ComboboxInput = React.forwardRef<
  React.ComponentRef<typeof ComboboxPrimitive.Input>,
  React.ComponentPropsWithoutRef<typeof ComboboxPrimitive.Input>
>(function ComboboxInput({ className, ...props }, ref) {
  return (
    <ComboboxPrimitive.Input
      ref={ref}
      className={cn(
        'flex-1 text-sm text-foreground web:outline-none placeholder:text-muted-foreground',
        className,
      )}
      {...props}
    />
  );
});
ComboboxInput.displayName = 'ComboboxInput';

const ComboboxContent = React.forwardRef<
  React.ComponentRef<typeof ComboboxPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof ComboboxPrimitive.Content>
>(function ComboboxContent({ className, children, ...props }, ref) {
  return (
    <ComboboxPrimitive.Portal>
      <TextClassContext.Provider value="text-popover-foreground">
        <ComboboxPrimitive.Content
          ref={ref}
          className={cn(
            'z-50 min-w-[8rem] overflow-hidden rounded-md border border-border bg-popover p-1 text-popover-foreground shadow-md',
            className,
          )}
          {...props}
        >
          {children}
        </ComboboxPrimitive.Content>
      </TextClassContext.Provider>
    </ComboboxPrimitive.Portal>
  );
});
ComboboxContent.displayName = 'ComboboxContent';

const ComboboxItem = React.forwardRef<
  React.ComponentRef<typeof ComboboxPrimitive.Item>,
  React.ComponentPropsWithoutRef<typeof ComboboxPrimitive.Item>
>(function ComboboxItem({ className, ...props }, ref) {
  return (
    <ComboboxPrimitive.Item
      ref={ref}
      className={cn(
        'relative flex cursor-default select-none flex-row items-center rounded-sm px-2 py-1.5 text-sm outline-none web:focus:bg-accent web:focus:text-accent-foreground',
        className,
      )}
      {...props}
    />
  );
});
ComboboxItem.displayName = 'ComboboxItem';

const ComboboxEmpty = React.forwardRef<
  View,
  React.ComponentPropsWithoutRef<typeof View>
>(function ComboboxEmpty({ className, ...props }, ref) {
  return (
    <View ref={ref} className={cn('py-6 text-center', className)} {...props}>
      <Text className="text-sm text-muted-foreground">No results found.</Text>
    </View>
  );
});
ComboboxEmpty.displayName = 'ComboboxEmpty';

export {
  Combobox, ComboboxTrigger, ComboboxInput, ComboboxContent, ComboboxItem, ComboboxEmpty,
};
