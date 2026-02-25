import type { ForceMountable, SlottablePressableProps, SlottableViewProps, PressableRef, ViewRef } from '../types';

interface SingleRootProps extends SlottableViewProps {
  type: 'single';
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  collapsible?: boolean;
  disabled?: boolean;
  ref?: ViewRef;
}

interface MultipleRootProps extends SlottableViewProps {
  type: 'multiple';
  value?: string[];
  defaultValue?: string[];
  onValueChange?: (value: string[]) => void;
  disabled?: boolean;
  ref?: ViewRef;
}

type RootProps = SingleRootProps | MultipleRootProps;

interface ItemProps extends SlottableViewProps {
  value: string;
  disabled?: boolean;
  ref?: ViewRef;
}

interface HeaderProps extends SlottableViewProps {
  ref?: ViewRef;
}

interface TriggerProps extends SlottablePressableProps {
  ref?: PressableRef;
}

interface ContentProps extends SlottableViewProps, ForceMountable {
  ref?: ViewRef;
}

interface RootContext {
  type: 'single' | 'multiple';
  value: string | string[] | undefined;
  onValueChange: (value: string | string[]) => void;
  collapsible: boolean;
  disabled: boolean;
}

interface ItemContext {
  value: string;
  isExpanded: boolean;
  disabled: boolean;
}

export type { RootProps, SingleRootProps, MultipleRootProps, ItemProps, HeaderProps, TriggerProps, ContentProps, RootContext, ItemContext };
