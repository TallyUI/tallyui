import type {
  ForceMountable,
  SlottablePressableProps,
  SlottableViewProps,
} from '../types';

interface RootProps {
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  children?: React.ReactNode;
}

interface ListProps extends SlottableViewProps {}

interface TriggerProps extends SlottablePressableProps {
  value: string;
}

interface ContentProps extends SlottableViewProps, ForceMountable {
  value: string;
}

interface RootContext {
  value: string;
  onValueChange: (value: string) => void;
  nativeID: string;
}

export type {
  ContentProps,
  ListProps,
  RootContext,
  RootProps,
  TriggerProps,
};
