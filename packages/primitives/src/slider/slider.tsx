import * as React from 'react';
import { Pressable, View, type GestureResponderEvent } from 'react-native';
import { useControllableState } from '../hooks';
import { Slot, composeRefs, mergeProps } from '../slot';
import type { RootContext as RootContextType, RootProps, TrackProps, RangeProps, ThumbProps } from './types';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEFAULT_MIN = 0;
const DEFAULT_MAX = 100;
const DEFAULT_STEP = 1;
/** PageUp/PageDown move this many steps. */
const PAGE_STEPS = 10;

// ---------------------------------------------------------------------------
// Value helpers
// ---------------------------------------------------------------------------

function decimalsOf(n: number): number {
  return (String(n).split('.')[1] ?? '').length;
}

/**
 * Clamps to min..max and snaps to the nearest `min + k*step`, rounding off
 * float noise. `max` stays reachable when it is not on the step grid.
 */
function snapValue(raw: number, min: number, max: number, step: number): number {
  if (max <= min) return min;
  const clamped = Math.min(max, Math.max(min, raw));
  if (!(step > 0)) return clamped;
  const snapped = Math.min(max, min + Math.round((clamped - min) / step) * step);
  if (max - clamped < Math.abs(clamped - snapped)) return max;
  return Number(snapped.toFixed(Math.max(decimalsOf(step), decimalsOf(min))));
}

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

const RootContext = React.createContext<RootContextType | null>(null);
/** The Thumb's key handler; internal, so the public context stays unchanged. */
const InternalContext = React.createContext<(event: React.KeyboardEvent) => void>(() => {});

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

  const percent = max > min ? ((Math.min(max, Math.max(min, value)) - min) / (max - min)) * 100 : 0;

  // Latest values for the gesture handlers, which outlive a single render.
  const valueRef = React.useRef(value);
  valueRef.current = value;
  const rootRef = React.useRef<View>(null);
  const composedRef = React.useMemo(() => composeRefs(ref, rootRef), [ref]);
  // Root's page-relative left edge and width, measured when a gesture starts.
  const rectRef = React.useRef<{ left: number; width: number } | null>(null);
  const pointerXRef = React.useRef(0);

  const commitValue = (raw: number) => {
    if (disabled) return;
    const next = snapValue(raw, min, max, step);
    if (next === valueRef.current) return;
    valueRef.current = next;
    onValueChange(next);
  };

  const updateFromPointer = () => {
    const rect = rectRef.current;
    if (!rect || rect.width <= 0) return;
    commitValue(min + ((pointerXRef.current - rect.left) / rect.width) * (max - min));
  };

  // The responder system drives the drag on native and on web, where
  // react-native-web tracks the pointer on `document` once a gesture starts.
  // The capture phase lets a press on the Thumb (a Pressable) start the drag.
  const responderProps = {
    onStartShouldSetResponderCapture: () => !disabled,
    onResponderTerminationRequest: () => false,
    onResponderGrant: (event: GestureResponderEvent) => {
      pointerXRef.current = event.nativeEvent.pageX;
      rectRef.current = null;
      const node = rootRef.current as (View & { getBoundingClientRect?: () => DOMRect }) | null;
      if (typeof node?.getBoundingClientRect === 'function') {
        const rect = node.getBoundingClientRect();
        rectRef.current = { left: rect.left + window.scrollX, width: rect.width };
        updateFromPointer();
      } else {
        node?.measure((_x, _y, width, _height, pageX) => {
          rectRef.current = { left: pageX, width };
          updateFromPointer();
        });
      }
    },
    onResponderMove: (event: GestureResponderEvent) => {
      pointerXRef.current = event.nativeEvent.pageX;
      updateFromPointer();
    },
    onResponderRelease: () => {
      rectRef.current = null;
    },
    onResponderTerminate: () => {
      rectRef.current = null;
    },
  };

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.defaultPrevented) return;
    const current = valueRef.current;
    const next: number | undefined = ({
      ArrowRight: current + step,
      ArrowUp: current + step,
      ArrowLeft: current - step,
      ArrowDown: current - step,
      PageUp: current + step * PAGE_STEPS,
      PageDown: current - step * PAGE_STEPS,
      Home: min,
      End: max,
    } as Record<string, number>)[event.key];
    if (next === undefined) return;
    event.preventDefault();
    commitValue(next);
  };

  const Component = asChild ? Slot : View;

  return (
    <RootContext.Provider value={{ value, min, max, step, disabled, onValueChange, percent }}>
      <InternalContext.Provider value={onKeyDown}>
        <Component ref={composedRef} role="group" {...responderProps} {...props} />
      </InternalContext.Provider>
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
  { asChild, style, ...props },
  ref
) {
  const { percent } = useRootContext();

  const Component = asChild ? Slot : View;

  return <Component ref={ref} style={[{ width: `${percent}%` }, style]} {...props} />;
});

Range.displayName = 'SliderRange';

// ---------------------------------------------------------------------------
// Thumb
// ---------------------------------------------------------------------------

const Thumb = React.forwardRef<View, ThumbProps>(function Thumb(
  { asChild, ...props },
  ref
) {
  const { value, min, max, disabled, percent } = useRootContext();
  const onKeyDown = React.useContext(InternalContext);

  const Component = asChild ? Slot : Pressable;

  // Caller's style wins over the default position; caller's onKeyDown runs first.
  const merged = mergeProps(
    { style: { position: 'absolute', left: `${percent}%` }, onKeyDown },
    props
  );

  return (
    <Component
      ref={ref}
      role="slider"
      aria-valuemin={min}
      aria-valuemax={max}
      aria-valuenow={value}
      disabled={disabled || undefined}
      aria-disabled={disabled || undefined}
      {...merged}
    />
  );
});

Thumb.displayName = 'SliderThumb';

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

export { Root, Track, Range, Thumb, useRootContext };
