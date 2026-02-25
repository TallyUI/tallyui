import type {
  Image,
  ImageProps,
  PressableProps,
  Text,
  TextProps,
  View,
  ViewProps,
  ViewStyle,
} from 'react-native';

/**
 * Flattens intersection types into a single object type for better
 * readability in IDE tooltips and error messages.
 */
type Prettify<T> = {
  [K in keyof T]: T[K];
} & {};

/**
 * Adds the `asChild` prop to any type. When true, the component merges
 * its props onto its single child element instead of rendering a wrapper.
 */
type Slottable<T> = Prettify<T & { asChild?: boolean | undefined }>;

// ---------------------------------------------------------------------------
// Slottable prop types — extend RN props with asChild + ref
// ---------------------------------------------------------------------------

type SlottableViewProps = Slottable<ViewProps> & { ref?: ViewRef };

type SlottablePressableProps = Slottable<PressableProps> & {
  ref?: PressableRef;
  /** Platform: WEB ONLY */
  onKeyDown?: (ev: React.KeyboardEvent) => void;
  /** Platform: WEB ONLY */
  onKeyUp?: (ev: React.KeyboardEvent) => void;
};

type SlottableTextProps = Slottable<TextProps> & { ref?: TextRef };

type SlottableImageProps = Slottable<ImageProps> & { ref?: ImageRef };

// ---------------------------------------------------------------------------
// Ref types
// ---------------------------------------------------------------------------

type ViewRef = React.RefObject<View | null>;
type PressableRef = React.RefObject<View | null>;
type TextRef = React.RefObject<Text | null>;
type ImageRef = React.RefObject<Image | null>;

// ---------------------------------------------------------------------------
// Positioning & layout
// ---------------------------------------------------------------------------

interface Insets {
  top?: number;
  bottom?: number;
  left?: number;
  right?: number;
}

type PointerDownOutsideEvent = CustomEvent<{ originalEvent: PointerEvent }>;
type FocusOutsideEvent = CustomEvent<{ originalEvent: FocusEvent }>;

/**
 * Props shared by positioned overlay content (popovers, dropdown menus,
 * selects, etc.) that need to anchor relative to a trigger.
 */
interface PositionedContentProps {
  forceMount?: true | undefined;
  alignOffset?: number;
  insets?: Insets;
  avoidCollisions?: boolean;
  align?: 'start' | 'center' | 'end';
  side?: 'top' | 'bottom';
  sideOffset?: number;
  /** Platform: NATIVE ONLY */
  disablePositioningStyle?: boolean;
  /** Platform: WEB ONLY */
  loop?: boolean;
  /** Platform: WEB ONLY */
  onCloseAutoFocus?: (event: Event) => void;
  /** Platform: WEB ONLY */
  onEscapeKeyDown?: (event: KeyboardEvent) => void;
  /** Platform: WEB ONLY */
  onPointerDownOutside?: (event: PointerDownOutsideEvent) => void;
  /** Platform: WEB ONLY */
  onFocusOutside?: (event: FocusOutsideEvent) => void;
  /** Platform: WEB ONLY */
  onInteractOutside?: (event: PointerDownOutsideEvent | FocusOutsideEvent) => void;
  /** Platform: WEB ONLY */
  collisionBoundary?: Element | null | Array<Element | null>;
  /** Platform: WEB ONLY */
  sticky?: 'partial' | 'always';
  /** Platform: WEB ONLY */
  hideWhenDetached?: boolean;
}

// ---------------------------------------------------------------------------
// Misc
// ---------------------------------------------------------------------------

interface ForceMountable {
  forceMount?: true | undefined;
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

export type {
  FocusOutsideEvent,
  ForceMountable,
  ImageRef,
  Insets,
  PointerDownOutsideEvent,
  PositionedContentProps,
  PressableRef,
  Prettify,
  Slottable,
  SlottableImageProps,
  SlottablePressableProps,
  SlottableTextProps,
  SlottableViewProps,
  TextRef,
  ViewRef,
};
