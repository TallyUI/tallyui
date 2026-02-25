import type { SlottablePressableProps, PressableRef } from '../types';

interface RootProps extends SlottablePressableProps {
  pressed?: boolean;
  defaultPressed?: boolean;
  onPressedChange?: (pressed: boolean) => void;
  disabled?: boolean;
  ref?: PressableRef;
}

export type { RootProps };
