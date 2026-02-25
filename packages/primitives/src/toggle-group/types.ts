import type { SlottablePressableProps, SlottableViewProps, PressableRef, ViewRef } from '../types';

interface SingleRootProps extends SlottableViewProps {
  type: 'single';
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
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

interface ItemProps extends SlottablePressableProps {
  value: string;
  disabled?: boolean;
  ref?: PressableRef;
}

interface RootContext {
  type: 'single' | 'multiple';
  value: string | string[] | undefined;
  disabled: boolean;
  onValueChange: (value: string | string[]) => void;
}

export type { RootProps, SingleRootProps, MultipleRootProps, ItemProps, RootContext };
