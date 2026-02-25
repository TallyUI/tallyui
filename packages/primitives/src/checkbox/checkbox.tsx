import * as React from 'react';
import { Pressable, View, type GestureResponderEvent } from 'react-native';
import { useControllableState } from '../hooks';
import { Slot } from '../slot';
import type { RootContext as RootContextType, RootProps, IndicatorProps } from './types';

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

const RootContext = React.createContext<RootContextType | null>(null);

function useRootContext(): RootContextType {
  const context = React.useContext(RootContext);
  if (!context) {
    throw new Error(
      'Checkbox compound components cannot be rendered outside the Checkbox.Root component'
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
    checked: checkedProp,
    defaultChecked,
    onCheckedChange: onCheckedChangeProp,
    disabled = false,
    onPress: onPressProp,
    ...props
  },
  ref
) {
  const [checked = false, setChecked] = useControllableState({
    prop: checkedProp,
    defaultProp: defaultChecked,
    onChange: onCheckedChangeProp,
  });

  const onPress = React.useCallback(
    (ev: GestureResponderEvent) => {
      if (disabled) return;
      setChecked(!checked);
      onPressProp?.(ev);
    },
    [disabled, checked, setChecked, onPressProp]
  );

  const Component = asChild ? Slot : Pressable;

  return (
    <RootContext.Provider value={{ checked, disabled, onCheckedChange: setChecked }}>
      <Component
        ref={ref}
        role="checkbox"
        aria-checked={checked}
        aria-disabled={disabled || undefined}
        onPress={onPress}
        disabled={disabled || undefined}
        {...props}
      />
    </RootContext.Provider>
  );
});

Root.displayName = 'CheckboxRoot';

// ---------------------------------------------------------------------------
// Indicator
// ---------------------------------------------------------------------------

const Indicator = React.forwardRef<View, IndicatorProps>(function Indicator(
  { asChild, forceMount, ...props },
  ref
) {
  const { checked, disabled } = useRootContext();

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

Indicator.displayName = 'CheckboxIndicator';

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

export { Root, Indicator, useRootContext };
