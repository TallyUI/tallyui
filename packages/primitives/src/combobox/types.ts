import type {
  ForceMountable,
  SlottablePressableProps,
  SlottableTextProps,
  SlottableViewProps,
} from '../types';

// ---------------------------------------------------------------------------
// Option type
// ---------------------------------------------------------------------------

interface Option {
  value: string;
  label: string;
}

// ---------------------------------------------------------------------------
// Context types
// ---------------------------------------------------------------------------

interface RootContext {
  value: Option | undefined;
  onValueChange: (value: Option | undefined) => void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  searchValue: string;
  onSearchValueChange: (search: string) => void;
  nativeID: string;
}

// ---------------------------------------------------------------------------
// Component props
// ---------------------------------------------------------------------------

interface RootProps {
  value?: Option | undefined;
  defaultValue?: Option | undefined;
  onValueChange?: (value: Option | undefined) => void;
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  searchValue?: string;
  onSearchValueChange?: (search: string) => void;
  children?: React.ReactNode;
}

interface InputProps extends SlottableViewProps {
  placeholder?: string;
}

interface TriggerProps extends SlottablePressableProps {}

interface PortalProps extends ForceMountable {
  hostName?: string;
  children?: React.ReactNode;
}

interface ContentProps extends SlottableViewProps, ForceMountable {}

interface ItemProps extends SlottablePressableProps {
  value: string;
  label: string;
}

interface ItemTextProps extends SlottableTextProps {}

interface EmptyProps extends SlottableViewProps {}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

export type {
  ContentProps,
  EmptyProps,
  InputProps,
  ItemProps,
  ItemTextProps,
  Option,
  PortalProps,
  RootContext,
  RootProps,
  TriggerProps,
};
