import * as React from 'react';
import { Pressable, View, type GestureResponderEvent } from 'react-native';
import { useControllableState } from '../hooks';
import { Slot } from '../slot';
import type { RootProps } from './types';

// ---------------------------------------------------------------------------
// Root
// ---------------------------------------------------------------------------

const Root = React.forwardRef<View, RootProps>(function Root(
  {
    asChild,
    pressed: pressedProp,
    defaultPressed,
    onPressedChange: onPressedChangeProp,
    disabled = false,
    onPress: onPressProp,
    ...props
  },
  ref
) {
  const [pressed = false, setPressed] = useControllableState({
    prop: pressedProp,
    defaultProp: defaultPressed,
    onChange: onPressedChangeProp,
  });

  const onPress = React.useCallback(
    (ev: GestureResponderEvent) => {
      if (disabled) return;
      setPressed((prev) => !prev);
      onPressProp?.(ev);
    },
    [disabled, setPressed, onPressProp]
  );

  const Component = asChild ? Slot : Pressable;

  return (
    <Component
      ref={ref}
      role="button"
      aria-pressed={pressed}
      aria-disabled={disabled || undefined}
      onPress={onPress}
      disabled={disabled || undefined}
      {...props}
    />
  );
});

Root.displayName = 'ToggleRoot';

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

export { Root };
