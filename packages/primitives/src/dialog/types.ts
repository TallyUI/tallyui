import type {
  ForceMountable,
  SlottablePressableProps,
  SlottableTextProps,
  SlottableViewProps,
} from '../types';

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
  /** Close the dialog when the overlay is pressed. Default true. */
  closeOnPress?: boolean;
}

interface ContentProps extends SlottableViewProps, ForceMountable {
  /** Platform: WEB ONLY. Called on Escape before the dialog closes; call event.preventDefault() to keep it open. */
  onEscapeKeyDown?: (event: KeyboardEvent) => void;
}

interface TitleProps extends SlottableTextProps {}

interface DescriptionProps extends SlottableTextProps {}

interface CloseProps extends SlottablePressableProps {}

interface RootContext {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export type {
  CloseProps,
  ContentProps,
  DescriptionProps,
  OverlayProps,
  PortalProps,
  RootContext,
  RootProps,
  TitleProps,
  TriggerProps,
};
