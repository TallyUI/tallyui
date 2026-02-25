import type { ForceMountable, SlottablePressableProps, SlottableViewProps, PressableRef, ViewRef } from '../types';

interface RootProps extends SlottableViewProps {
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  disabled?: boolean;
  ref?: ViewRef;
}

interface TriggerProps extends SlottablePressableProps {
  ref?: PressableRef;
}

interface ContentProps extends SlottableViewProps, ForceMountable {
  ref?: ViewRef;
}

interface RootContext {
  open: boolean;
  disabled: boolean;
  onOpenChange: (open: boolean) => void;
}

export type { RootProps, TriggerProps, ContentProps, RootContext };
