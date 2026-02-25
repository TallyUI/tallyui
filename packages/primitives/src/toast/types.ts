import type { SlottablePressableProps, SlottableTextProps, SlottableViewProps, PressableRef, ViewRef, TextRef } from '../types';

interface RootProps extends SlottableViewProps {
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  type?: 'foreground' | 'background';
  children?: React.ReactNode;
  ref?: ViewRef;
}

interface TitleProps extends SlottableTextProps {
  ref?: TextRef;
}

interface DescriptionProps extends SlottableTextProps {
  ref?: TextRef;
}

interface ActionProps extends SlottablePressableProps {
  altText: string;
  ref?: PressableRef;
}

interface CloseProps extends SlottablePressableProps {
  ref?: PressableRef;
}

interface RootContext {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  type: 'foreground' | 'background';
}

export type { RootProps, TitleProps, DescriptionProps, ActionProps, CloseProps, RootContext };
