import type { SlottablePressableProps, SlottableViewProps, PressableRef } from '../types';

interface RootProps extends SlottablePressableProps {
  checked?: boolean;
  defaultChecked?: boolean;
  onCheckedChange?: (checked: boolean) => void;
  disabled?: boolean;
  ref?: PressableRef;
}

interface ThumbProps extends SlottableViewProps {}

interface RootContext {
  checked: boolean;
  disabled: boolean;
}

export type { RootProps, ThumbProps, RootContext };
