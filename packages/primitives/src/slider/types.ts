import type { SlottablePressableProps, SlottableViewProps, PressableRef, ViewRef } from '../types';

interface RootProps extends SlottableViewProps {
  value?: number;
  defaultValue?: number;
  onValueChange?: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  disabled?: boolean;
  ref?: ViewRef;
}

interface TrackProps extends SlottableViewProps {
  ref?: ViewRef;
}

interface RangeProps extends SlottableViewProps {
  ref?: ViewRef;
}

interface ThumbProps extends SlottablePressableProps {
  ref?: PressableRef;
}

interface RootContext {
  value: number;
  min: number;
  max: number;
  step: number;
  disabled: boolean;
  onValueChange: (value: number) => void;
}

export type { RootProps, TrackProps, RangeProps, ThumbProps, RootContext };
