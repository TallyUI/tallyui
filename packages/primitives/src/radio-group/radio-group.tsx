import * as React from 'react';
import { Pressable, View, type GestureResponderEvent } from 'react-native';
import { useControllableState } from '../hooks';
import { Slot } from '../slot';
import type {
  RootProps,
  ItemProps,
  IndicatorProps,
  RootContext as RootContextType,
  ItemContext as ItemContextType,
} from './types';

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

const RootContext = React.createContext<RootContextType | null>(null);

function useRootContext(): RootContextType {
  const context = React.useContext(RootContext);
  if (!context) {
    throw new Error(
      'RadioGroup compound components cannot be rendered outside the RadioGroup.Root component'
    );
  }
  return context;
}

const ItemContext = React.createContext<ItemContextType | null>(null);

function useItemContext(): ItemContextType {
  const context = React.useContext(ItemContext);
  if (!context) {
    throw new Error(
      'RadioGroup.Indicator must be rendered inside a RadioGroup.Item component'
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
    value: valueProp,
    defaultValue,
    onValueChange: onValueChangeProp,
    disabled = false,
    ...props
  },
  ref
) {
  const [value, setValue] = useControllableState({
    prop: valueProp,
    defaultProp: defaultValue,
    onChange: onValueChangeProp,
  });

  const onValueChange = React.useCallback(
    (itemValue: string) => {
      setValue(itemValue);
    },
    [setValue]
  );

  const Component = asChild ? Slot : View;

  return (
    <RootContext.Provider value={{ value, disabled, onValueChange }}>
      <Component ref={ref} role="radiogroup" {...props} />
    </RootContext.Provider>
  );
});

Root.displayName = 'RadioGroupRoot';

// ---------------------------------------------------------------------------
// Item
// ---------------------------------------------------------------------------

const Item = React.forwardRef<View, ItemProps>(function Item(
  {
    asChild,
    value: itemValue,
    disabled: disabledProp = false,
    onPress: onPressProp,
    ...props
  },
  ref
) {
  const { disabled: rootDisabled, value: rootValue, onValueChange } = useRootContext();

  const isDisabled = rootDisabled || disabledProp;
  const checked = rootValue === itemValue;

  const onPress = React.useCallback(
    (ev: GestureResponderEvent) => {
      if (isDisabled) return;
      onValueChange(itemValue);
      onPressProp?.(ev);
    },
    [isDisabled, onValueChange, itemValue, onPressProp]
  );

  const Component = asChild ? Slot : Pressable;

  return (
    <ItemContext.Provider value={{ value: itemValue, checked, disabled: isDisabled }}>
      <Component
        ref={ref}
        role="radio"
        aria-checked={checked}
        aria-disabled={isDisabled || undefined}
        onPress={onPress}
        disabled={isDisabled || undefined}
        {...props}
      />
    </ItemContext.Provider>
  );
});

Item.displayName = 'RadioGroupItem';

// ---------------------------------------------------------------------------
// Indicator
// ---------------------------------------------------------------------------

const Indicator = React.forwardRef<View, IndicatorProps>(function Indicator(
  { asChild, forceMount, ...props },
  ref
) {
  const { checked, disabled } = useItemContext();

  if (!forceMount && !checked) {
    return null;
  }

  const Component = asChild ? Slot : View;

  return (
    <Component
      ref={ref}
      role="presentation"
      aria-hidden={!(forceMount || checked)}
      aria-disabled={disabled || undefined}
      {...props}
    />
  );
});

Indicator.displayName = 'RadioGroupIndicator';

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

export { Root, Item, Indicator, useRootContext, useItemContext };
