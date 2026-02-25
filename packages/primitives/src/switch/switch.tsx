import * as React from 'react';
import { Pressable, View, type GestureResponderEvent } from 'react-native';
import { useControllableState } from '../hooks';
import { Slot } from '../slot';
import type { RootContext as RootContextType, RootProps, ThumbProps } from './types';

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

const RootContext = React.createContext<RootContextType | null>(null);

function useRootContext(): RootContextType {
  const context = React.useContext(RootContext);
  if (!context) {
    throw new Error(
      'Switch compound components cannot be rendered outside the Switch.Root component'
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
    <RootContext.Provider value={{ checked, disabled }}>
      <Component
        ref={ref}
        role="switch"
        aria-checked={checked}
        aria-disabled={disabled || undefined}
        onPress={onPress}
        disabled={disabled || undefined}
        {...props}
      />
    </RootContext.Provider>
  );
});

Root.displayName = 'SwitchRoot';

// ---------------------------------------------------------------------------
// Thumb
// ---------------------------------------------------------------------------

const Thumb = React.forwardRef<View, ThumbProps>(function Thumb(
  { asChild, ...props },
  ref
) {
  useRootContext(); // Ensure Thumb is used within Root
  const Component = asChild ? Slot : View;
  return <Component ref={ref} role="presentation" {...props} />;
});

Thumb.displayName = 'SwitchThumb';

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

export { Root, Thumb, useRootContext };
