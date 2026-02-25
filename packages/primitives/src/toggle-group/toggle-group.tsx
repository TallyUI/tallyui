import * as React from 'react';
import { Pressable, View, type GestureResponderEvent } from 'react-native';
import { useControllableState } from '../hooks';
import { Slot } from '../slot';
import { toggleGroupUtils } from '../utils';
import type {
  RootProps,
  ItemProps,
  RootContext as RootContextType,
} from './types';

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

const RootContext = React.createContext<RootContextType | null>(null);

function useRootContext(): RootContextType {
  const context = React.useContext(RootContext);
  if (!context) {
    throw new Error(
      'ToggleGroup compound components cannot be rendered outside the ToggleGroup.Root component'
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
    type,
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
    onChange: onValueChangeProp as (state: string | string[] | undefined) => void,
  });

  const onValueChange = React.useCallback(
    (newValue: string | string[]) => {
      setValue(newValue);
    },
    [setValue]
  );

  const Component = asChild ? Slot : View;

  return (
    <RootContext.Provider value={{ type, value, disabled, onValueChange }}>
      <Component ref={ref} role="group" {...props} />
    </RootContext.Provider>
  );
});

Root.displayName = 'ToggleGroupRoot';

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
  const { type, disabled: rootDisabled, value, onValueChange } = useRootContext();

  const isDisabled = rootDisabled || disabledProp;
  const isSelected = toggleGroupUtils.getIsSelected(value, itemValue);

  const onPress = React.useCallback(
    (ev: GestureResponderEvent) => {
      if (isDisabled) return;
      if (type === 'single') {
        const newValue = toggleGroupUtils.getNewSingleValue(value, itemValue);
        onValueChange((newValue ?? '') as string & string[]);
      } else {
        const newValue = toggleGroupUtils.getNewMultipleValue(value, itemValue);
        onValueChange(newValue as string[] & string);
      }
      onPressProp?.(ev);
    },
    [isDisabled, type, value, itemValue, onValueChange, onPressProp]
  );

  const Component = asChild ? Slot : Pressable;

  return (
    <Component
      ref={ref}
      role="button"
      aria-pressed={isSelected}
      aria-disabled={isDisabled || undefined}
      onPress={onPress}
      disabled={isDisabled || undefined}
      {...props}
    />
  );
});

Item.displayName = 'ToggleGroupItem';

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

export { Root, Item, useRootContext };
