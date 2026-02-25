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
// Context types
// ---------------------------------------------------------------------------

interface RootContext {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  triggerPosition: LayoutPosition | null;
  setTriggerPosition: (pos: LayoutPosition | null) => void;
  contentLayout: LayoutRectangle | null;
  setContentLayout: (layout: LayoutRectangle | null) => void;
  nativeID: string;
}

// ---------------------------------------------------------------------------
// Component props
// ---------------------------------------------------------------------------

interface RootProps {
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  children?: React.ReactNode;
}

interface TriggerProps extends SlottablePressableProps {}

interface PortalProps extends ForceMountable {
  hostName?: string;
  children?: React.ReactNode;
}

interface OverlayProps extends SlottablePressableProps, ForceMountable {
  closeOnPress?: boolean;
}

interface ContentProps extends SlottableViewProps, PositionedContentProps {}

interface ItemProps extends SlottablePressableProps {
  textValue?: string;
  closeOnPress?: boolean;
}

interface GroupProps extends SlottableViewProps {}

interface LabelProps extends SlottableTextProps {}

interface CheckboxItemProps extends SlottablePressableProps {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  textValue?: string;
  closeOnPress?: boolean;
}

interface RadioGroupProps extends SlottableViewProps {
  value: string | undefined;
  onValueChange: (value: string) => void;
}

interface RadioItemProps extends SlottablePressableProps {
  value: string;
  textValue?: string;
  closeOnPress?: boolean;
}

interface ItemIndicatorProps extends SlottableViewProps, ForceMountable {}

interface SeparatorProps extends SlottableViewProps {
  decorative?: boolean;
}

interface SubProps {
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  children?: React.ReactNode;
}

interface SubTriggerProps extends SlottablePressableProps {
  textValue?: string;
}

interface SubContentProps extends SlottableViewProps, ForceMountable {}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

export type {
  CheckboxItemProps,
  ContentProps,
  GroupProps,
  ItemIndicatorProps,
  ItemProps,
  LabelProps,
  OverlayProps,
  PortalProps,
  RadioGroupProps,
  RadioItemProps,
  RootContext,
  RootProps,
  SeparatorProps,
  SubContentProps,
  SubProps,
  SubTriggerProps,
  TriggerProps,
};
