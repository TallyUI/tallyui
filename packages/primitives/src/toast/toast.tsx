import * as React from 'react';
import { Pressable, Text, View, type GestureResponderEvent } from 'react-native';
import { useControllableState } from '../hooks';
import { Slot } from '../slot';
import type { RootProps, TitleProps, DescriptionProps, ActionProps, CloseProps, RootContext as RootContextType } from './types';

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

const RootContext = React.createContext<RootContextType | null>(null);

function useRootContext(): RootContextType {
  const context = React.useContext(RootContext);
  if (!context) {
    throw new Error(
      'Toast compound components cannot be rendered outside the Toast.Root component'
    );
  }
  return context;
}

// ---------------------------------------------------------------------------
// Root
// ---------------------------------------------------------------------------

const Root = React.forwardRef<View, RootProps>(function Root(
  {
    asChild,
    open: openProp,
    defaultOpen,
    onOpenChange: onOpenChangeProp,
    type = 'foreground',
    ...props
  },
  ref
) {
  const [open = false, setOpen] = useControllableState({
    prop: openProp,
    defaultProp: defaultOpen,
    onChange: onOpenChangeProp,
  });

  const onOpenChange = React.useCallback(
    (value: boolean) => {
      setOpen(value);
    },
    [setOpen]
  );

  if (!open) {
    return null;
  }

  const Component = asChild ? Slot : View;

  return (
    <RootContext.Provider value={{ open, onOpenChange, type }}>
      <Component
        ref={ref}
        role="status"
        aria-live={type === 'foreground' ? 'assertive' : 'polite'}
        {...props}
      />
    </RootContext.Provider>
  );
});

Root.displayName = 'ToastRoot';

// ---------------------------------------------------------------------------
// Title
// ---------------------------------------------------------------------------

const Title = React.forwardRef<Text, TitleProps>(function Title(
  { asChild, ...props },
  ref
) {
  useRootContext();

  const Component = asChild ? Slot : Text;

  return <Component ref={ref} {...props} />;
});

Title.displayName = 'ToastTitle';

// ---------------------------------------------------------------------------
// Description
// ---------------------------------------------------------------------------

const Description = React.forwardRef<Text, DescriptionProps>(function Description(
  { asChild, ...props },
  ref
) {
  useRootContext();

  const Component = asChild ? Slot : Text;

  return <Component ref={ref} {...props} />;
});

Description.displayName = 'ToastDescription';

// ---------------------------------------------------------------------------
// Action
// ---------------------------------------------------------------------------

const Action = React.forwardRef<View, ActionProps>(function Action(
  {
    asChild,
    altText: _altText,
    disabled = false,
    onPress: onPressProp,
    ...props
  },
  ref
) {
  useRootContext();

  const onPress = React.useCallback(
    (ev: GestureResponderEvent) => {
      if (disabled) return;
      onPressProp?.(ev);
    },
    [disabled, onPressProp]
  );

  const Component = asChild ? Slot : Pressable;

  return (
    <Component
      ref={ref}
      role="button"
      aria-disabled={disabled || undefined}
      onPress={onPress}
      disabled={disabled || undefined}
      {...props}
    />
  );
});

Action.displayName = 'ToastAction';

// ---------------------------------------------------------------------------
// Close
// ---------------------------------------------------------------------------

const Close = React.forwardRef<View, CloseProps>(function Close(
  {
    asChild,
    disabled = false,
    onPress: onPressProp,
    ...props
  },
  ref
) {
  const { onOpenChange } = useRootContext();

  const onPress = React.useCallback(
    (ev: GestureResponderEvent) => {
      if (disabled) return;
      onOpenChange(false);
      onPressProp?.(ev);
    },
    [disabled, onOpenChange, onPressProp]
  );

  const Component = asChild ? Slot : Pressable;

  return (
    <Component
      ref={ref}
      role="button"
      aria-disabled={disabled || undefined}
      onPress={onPress}
      disabled={disabled || undefined}
      {...props}
    />
  );
});

Close.displayName = 'ToastClose';

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

export { Root, Title, Description, Action, Close, useRootContext };
