import type {
  ForceMountable,
  PositionedContentProps,
  SlottablePressableProps,
  SlottableViewProps,
} from '../types';

interface RootProps {
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  delayDuration?: number;
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

interface RootContext {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  triggerPosition: LayoutPosition | null;
  setTriggerPosition: (position: LayoutPosition | null) => void;
  contentLayout: LayoutRectangle | null;
  setContentLayout: (layout: LayoutRectangle | null) => void;
}

// Re-export from hooks for convenience
import type { LayoutPosition } from '../hooks';
import type { LayoutRectangle } from 'react-native';

export type {
  ContentProps,
  OverlayProps,
  PortalProps,
  RootContext,
  RootProps,
  TriggerProps,
};
