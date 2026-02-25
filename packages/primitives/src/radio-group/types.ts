import type { ForceMountable, SlottablePressableProps, SlottableViewProps, PressableRef, ViewRef } from '../types';

interface RootProps extends SlottableViewProps {
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  disabled?: boolean;
  ref?: ViewRef;
}

interface ItemProps extends SlottablePressableProps {
  value: string;
  disabled?: boolean;
  ref?: PressableRef;
}

interface IndicatorProps extends SlottableViewProps, ForceMountable {}

interface RootContext {
  value: string | undefined;
  disabled: boolean;
  onValueChange: (value: string) => void;
}

interface ItemContext {
  value: string;
  checked: boolean;
  disabled: boolean;
}

export type { RootProps, ItemProps, IndicatorProps, RootContext, ItemContext };
