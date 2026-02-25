import * as React from 'react';
import { Pressable, View, type GestureResponderEvent } from 'react-native';
import { useControllableState } from '../hooks';
import { Slot } from '../slot';
import type { RootProps, TriggerProps, ContentProps, RootContext as RootContextType } from './types';

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

const RootContext = React.createContext<RootContextType | null>(null);

function useRootContext(): RootContextType {
  const context = React.useContext(RootContext);
  if (!context) {
    throw new Error(
      'Collapsible compound components cannot be rendered outside the Collapsible.Root component'
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
    disabled = false,
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

  const Component = asChild ? Slot : View;

  return (
    <RootContext.Provider value={{ open, disabled, onOpenChange }}>
      <Component
        ref={ref}
        aria-disabled={disabled || undefined}
        {...props}
      />
    </RootContext.Provider>
  );
});

Root.displayName = 'CollapsibleRoot';

// ---------------------------------------------------------------------------
// Trigger
// ---------------------------------------------------------------------------

const Trigger = React.forwardRef<View, TriggerProps>(function Trigger(
  { asChild, onPress: onPressProp, disabled: disabledProp, ...props },
  ref
) {
  const { open, disabled: rootDisabled, onOpenChange } = useRootContext();

  const isDisabled = rootDisabled || disabledProp;

  const onPress = React.useCallback(
    (ev: GestureResponderEvent) => {
      if (isDisabled) return;
      onOpenChange(!open);
      onPressProp?.(ev);
    },
    [isDisabled, open, onOpenChange, onPressProp]
  );

  const Component = asChild ? Slot : Pressable;

  return (
    <Component
      ref={ref}
      role="button"
      aria-expanded={open}
      aria-disabled={isDisabled || undefined}
      onPress={onPress}
      disabled={isDisabled || undefined}
      {...props}
    />
  );
});

Trigger.displayName = 'CollapsibleTrigger';

// ---------------------------------------------------------------------------
// Content
// ---------------------------------------------------------------------------

const Content = React.forwardRef<View, ContentProps>(function Content(
  { asChild, forceMount, ...props },
  ref
) {
  const { open } = useRootContext();

  if (!forceMount && !open) {
    return null;
  }

  const Component = asChild ? Slot : View;

  return (
    <Component
      ref={ref}
      role="region"
      {...props}
    />
  );
});

Content.displayName = 'CollapsibleContent';

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

export { Root, Trigger, Content, useRootContext };
