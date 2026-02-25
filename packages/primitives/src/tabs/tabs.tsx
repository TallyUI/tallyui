import * as React from 'react';
import { Pressable, View, type GestureResponderEvent } from 'react-native';
import { useControllableState } from '../hooks';
import { Slot } from '../slot';
import type {
  ContentProps,
  ListProps,
  RootContext as RootContextType,
  RootProps,
  TriggerProps,
} from './types';

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

const RootContext = React.createContext<RootContextType | null>(null);

function useRootContext(): RootContextType {
  const context = React.useContext(RootContext);
  if (!context) {
    throw new Error(
      'Tabs compound components cannot be rendered outside the Tabs.Root component'
    );
  }
  return context;
}

// ---------------------------------------------------------------------------
// Root
// ---------------------------------------------------------------------------

function Root({
  value: valueProp,
  defaultValue,
  onValueChange: onValueChangeProp,
  children,
}: RootProps) {
  const nativeID = React.useId();
  const [value = '', onValueChange] = useControllableState({
    prop: valueProp,
    defaultProp: defaultValue,
    onChange: onValueChangeProp,
  });

  return (
    <RootContext.Provider value={{ value, onValueChange, nativeID }}>
      {children}
    </RootContext.Provider>
  );
}

Root.displayName = 'TabsRoot';

// ---------------------------------------------------------------------------
// List
// ---------------------------------------------------------------------------

const List = React.forwardRef<View, ListProps>(function List(
  { asChild, ...props },
  ref
) {
  const Component = asChild ? Slot : View;
  return <Component ref={ref} role="tablist" {...props} />;
});

List.displayName = 'TabsList';

// ---------------------------------------------------------------------------
// Trigger
// ---------------------------------------------------------------------------

const Trigger = React.forwardRef<View, TriggerProps>(function Trigger(
  { asChild, onPress: onPressProp, disabled, value: tabValue, ...props },
  ref
) {
  const { onValueChange, value: rootValue, nativeID } = useRootContext();

  const onPress = React.useCallback(
    (ev: GestureResponderEvent) => {
      if (disabled) return;
      onValueChange(tabValue);
      onPressProp?.(ev);
    },
    [disabled, onValueChange, tabValue, onPressProp]
  );

  const isActive = rootValue === tabValue;
  const Component = asChild ? Slot : Pressable;

  return (
    <Component
      ref={ref}
      nativeID={`${nativeID}-tab-${tabValue}`}
      aria-disabled={disabled || undefined}
      aria-selected={isActive}
      role="tab"
      onPress={onPress}
      disabled={disabled || undefined}
      {...props}
    />
  );
});

Trigger.displayName = 'TabsTrigger';

// ---------------------------------------------------------------------------
// Content
// ---------------------------------------------------------------------------

const Content = React.forwardRef<View, ContentProps>(function Content(
  { asChild, forceMount, value: tabValue, ...props },
  ref
) {
  const { value: rootValue, nativeID } = useRootContext();

  if (!forceMount && rootValue !== tabValue) {
    return null;
  }

  const Component = asChild ? Slot : View;

  return (
    <Component
      ref={ref}
      aria-hidden={rootValue !== tabValue}
      aria-labelledby={`${nativeID}-tab-${tabValue}`}
      role="tabpanel"
      {...props}
    />
  );
});

Content.displayName = 'TabsContent';

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

export { Content, List, Root, Trigger, useRootContext };
