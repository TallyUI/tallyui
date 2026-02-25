import type { ForceMountable, SlottablePressableProps, SlottableViewProps, PressableRef } from '../types';

interface RootProps extends SlottablePressableProps {
  checked?: boolean;
  defaultChecked?: boolean;
  onCheckedChange?: (checked: boolean) => void;
  disabled?: boolean;
  ref?: PressableRef;
}

interface IndicatorProps extends SlottableViewProps, ForceMountable {}

interface RootContext {
  checked: boolean;
  disabled: boolean;
  onCheckedChange: (checked: boolean) => void;
}

export type { RootProps, IndicatorProps, RootContext };
