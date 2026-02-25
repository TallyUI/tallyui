import type { LayoutRectangle } from 'react-native';
import type { LayoutPosition } from '../hooks';
import type {
  ForceMountable,
  PositionedContentProps,
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
  onValueChange: (option: Option) => void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  triggerPosition: LayoutPosition | null;
  setTriggerPosition: (pos: LayoutPosition | null) => void;
  contentLayout: LayoutRectangle | null;
  setContentLayout: (layout: LayoutRectangle | null) => void;
  nativeID: string;
  disabled?: boolean;
}

interface ItemContext {
  itemValue: string;
  label: string;
}

// ---------------------------------------------------------------------------
// Component props
// ---------------------------------------------------------------------------

interface RootProps {
  value?: Option;
  defaultValue?: Option;
  onValueChange?: (option: Option) => void;
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  disabled?: boolean;
  children?: React.ReactNode;
}

interface TriggerProps extends SlottablePressableProps {}

interface ValueProps extends SlottableTextProps {
  placeholder?: string;
}

interface PortalProps extends ForceMountable {
  hostName?: string;
  children?: React.ReactNode;
}

interface OverlayProps extends SlottablePressableProps, ForceMountable {
  closeOnPress?: boolean;
}

interface ContentProps extends SlottableViewProps, PositionedContentProps {}

interface ItemProps extends SlottablePressableProps {
  value: string;
  label: string;
  closeOnPress?: boolean;
}

interface ItemTextProps extends SlottableTextProps {}

interface ItemIndicatorProps extends SlottableViewProps, ForceMountable {}

interface GroupProps extends SlottableViewProps {}

interface LabelProps extends SlottableTextProps {}

interface SeparatorProps extends SlottableViewProps {
  decorative?: boolean;
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

export type {
  ContentProps,
  GroupProps,
  ItemContext,
  ItemIndicatorProps,
  ItemProps,
  ItemTextProps,
  LabelProps,
  Option,
  OverlayProps,
  PortalProps,
  RootContext,
  RootProps,
  SeparatorProps,
  TriggerProps,
  ValueProps,
};
