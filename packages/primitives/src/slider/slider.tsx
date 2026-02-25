import * as React from 'react';
import { Pressable, View } from 'react-native';
import { useControllableState } from '../hooks';
import { Slot } from '../slot';
import type { RootContext as RootContextType, RootProps, TrackProps, RangeProps, ThumbProps } from './types';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEFAULT_MIN = 0;
const DEFAULT_MAX = 100;
const DEFAULT_STEP = 1;

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

const RootContext = React.createContext<RootContextType | null>(null);

function useRootContext(): RootContextType {
  const context = React.useContext(RootContext);
  if (!context) {
    throw new Error(
      'Slider compound components cannot be rendered outside the Slider.Root component'
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
    min = DEFAULT_MIN,
    max = DEFAULT_MAX,
    step = DEFAULT_STEP,
    disabled = false,
    ...props
  },
  ref
) {
  const [value = DEFAULT_MIN, setValue] = useControllableState({
    prop: valueProp,
    defaultProp: defaultValue,
    onChange: onValueChangeProp,
  });

  const onValueChange = React.useCallback(
    (newValue: number) => {
      setValue(newValue);
    },
    [setValue]
  );

  const Component = asChild ? Slot : View;

  return (
    <RootContext.Provider value={{ value, min, max, step, disabled, onValueChange }}>
      <Component ref={ref} role="group" {...props} />
    </RootContext.Provider>
  );
});

Root.displayName = 'SliderRoot';

// ---------------------------------------------------------------------------
// Track
// ---------------------------------------------------------------------------

const Track = React.forwardRef<View, TrackProps>(function Track(
  { asChild, ...props },
  ref
) {
  useRootContext();

  const Component = asChild ? Slot : View;

  return <Component ref={ref} {...props} />;
});

Track.displayName = 'SliderTrack';

// ---------------------------------------------------------------------------
// Range
// ---------------------------------------------------------------------------

const Range = React.forwardRef<View, RangeProps>(function Range(
  { asChild, ...props },
  ref
) {
  useRootContext();

  const Component = asChild ? Slot : View;

  return <Component ref={ref} {...props} />;
});

Range.displayName = 'SliderRange';

// ---------------------------------------------------------------------------
// Thumb
// ---------------------------------------------------------------------------

const Thumb = React.forwardRef<View, ThumbProps>(function Thumb(
  { asChild, ...props },
  ref
) {
  const { value, min, max, disabled } = useRootContext();

  const Component = asChild ? Slot : Pressable;

  return (
    <Component
      ref={ref}
      role="slider"
      aria-valuemin={min}
      aria-valuemax={max}
      aria-valuenow={value}
      disabled={disabled || undefined}
      aria-disabled={disabled || undefined}
      {...props}
    />
  );
});

Thumb.displayName = 'SliderThumb';

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

export { Root, Track, Range, Thumb, useRootContext };
