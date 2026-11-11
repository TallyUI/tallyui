import * as React from 'react';
import {
  Pressable,
  View,
  type GestureResponderEvent,
  type LayoutChangeEvent,
  type LayoutRectangle,
} from 'react-native';
import { useAugmentedRef, useControllableState, useRelativePosition, type LayoutPosition } from '../hooks';
import { Portal as RNPortal } from '../portal';
import { Slot } from '../slot';
import type {
  ContentProps,
  OverlayProps,
  PortalProps,
  RootContext as RootContextType,
  RootProps,
  TriggerProps,
} from './types';

// ---------------------------------------------------------------------------
// Internal context (nativeID for aria linkage)
// ---------------------------------------------------------------------------

const InternalContext = React.createContext<{ nativeID: string } | null>(null);

function useInternalContext() {
  const context = React.useContext(InternalContext);
  if (!context) {
    throw new Error(
      'Tooltip compound components cannot be rendered outside the Tooltip.Root component'
    );
  }
  return context;
}

// ---------------------------------------------------------------------------
// Root context (open state + positioning data)
// ---------------------------------------------------------------------------

const RootContext = React.createContext<RootContextType | null>(null);

function useRootContext(): RootContextType {
  const context = React.useContext(RootContext);
  if (!context) {
    throw new Error(
      'Tooltip compound components cannot be rendered outside the Tooltip.Root component'
    );
  }
  return context;
}

// ---------------------------------------------------------------------------
// Root
// ---------------------------------------------------------------------------

function Root({
  open: openProp,
  defaultOpen,
  onOpenChange: onOpenChangeProp,
  delayDuration = 0,
  children,
}: RootProps) {
  const nativeID = React.useId();
  const [open = false, onOpenChange] = useControllableState({
    prop: openProp,
    defaultProp: defaultOpen,
    onChange: onOpenChangeProp,
  });
  const [triggerPosition, setTriggerPosition] = React.useState<LayoutPosition | null>(null);
  const [contentLayout, setContentLayout] = React.useState<LayoutRectangle | null>(null);

  return (
    <InternalContext.Provider value={{ nativeID }}>
      <RootContext.Provider
        value={{
          open,
          onOpenChange,
          delayDuration,
          triggerPosition,
          setTriggerPosition,
          contentLayout,
          setContentLayout,
        }}
      >
        {children}
      </RootContext.Provider>
    </InternalContext.Provider>
  );
}

Root.displayName = 'TooltipRoot';

// ---------------------------------------------------------------------------
// Trigger
// ---------------------------------------------------------------------------

type HandlerEvent<K extends keyof TriggerProps> =
  Parameters<Extract<TriggerProps[K], (...args: never[]) => unknown>>[0];

/**
 * Opens on hover (after `delayDuration`) and on focus no press caused; closes on leave and blur.
 * A press only closes it unless `openOnPress` is set, which touch (no hover) needs to open it.
 * `onLongPress` is left to the caller: binding it makes react-native-web drop a slow press.
 */
const Trigger = React.forwardRef<View, TriggerProps>(function Trigger(
  {
    asChild,
    openOnPress = false,
    onPress: onPressProp,
    onPressOut: onPressOutProp,
    onPointerDown: onPointerDownProp,
    onPointerUp: onPointerUpProp,
    onHoverIn: onHoverInProp,
    onHoverOut: onHoverOutProp,
    onFocus: onFocusProp,
    onBlur: onBlurProp,
    disabled,
    ...props
  },
  ref
) {
  const { open, onOpenChange, delayDuration, setTriggerPosition } = useRootContext();
  const delayTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearDelay = React.useCallback(() => {
    if (delayTimer.current !== null) clearTimeout(delayTimer.current);
    delayTimer.current = null;
  }, []);

  // A hover delay still pending at unmount must not open, or report opening, a gone tooltip.
  React.useEffect(() => clearDelay, [clearDelay]);

  const augmentedRef = useAugmentedRef<View>({
    ref,
    methods: {
      open: () => {
        onOpenChange(true);
        augmentedRef.current?.measure?.((_x, _y, width, height, pageX, pageY) => {
          setTriggerPosition({ width, pageX, pageY, height });
        });
      },
      close: () => {
        setTriggerPosition(null);
        onOpenChange(false);
      },
    },
  });

  const show = React.useCallback(() => {
    clearDelay();
    if (disabled) return;
    augmentedRef.current?.measure?.((_x, _y, width, height, pageX, pageY) => {
      setTriggerPosition({ width, pageX, pageY, height });
    });
    onOpenChange(true);
  }, [augmentedRef, clearDelay, disabled, onOpenChange, setTriggerPosition]);

  const hide = React.useCallback(() => {
    if (!open) return;
    setTriggerPosition(null);
    onOpenChange(false);
  }, [onOpenChange, open, setTriggerPosition]);

  const handleHoverIn = (ev: HandlerEvent<'onHoverIn'>) => {
    clearDelay();
    if (delayDuration > 0) {
      delayTimer.current = setTimeout(show, delayDuration);
    } else {
      show();
    }
    onHoverInProp?.(ev);
  };

  const handleHoverOut = (ev: HandlerEvent<'onHoverOut'>) => {
    clearDelay();
    hide();
    onHoverOutProp?.(ev);
  };

  // react-native-web's Pressable binds its pointerleave listener when the hover starts, so the
  // handlers it gets must read the latest render, not the one the hover began in (open === false).
  const hoverHandlers = React.useRef({ handleHoverIn, handleHoverOut });
  React.useLayoutEffect(() => {
    hoverHandlers.current = { handleHoverIn, handleHoverOut };
  });
  const onHoverIn = React.useCallback(
    (ev: HandlerEvent<'onHoverIn'>) => hoverHandlers.current.handleHoverIn(ev),
    []
  );
  const onHoverOut = React.useCallback(
    (ev: HandlerEvent<'onHoverOut'>) => hoverHandlers.current.handleHoverOut(ev),
    []
  );

  // A mouse press focuses the trigger before onPressIn fires; pointerdown comes first, so mark it.
  const pressing = React.useRef(false);

  const onPointerDown = React.useCallback(
    (ev: HandlerEvent<'onPointerDown'>) => {
      pressing.current = true;
      onPointerDownProp?.(ev);
    },
    [onPointerDownProp]
  );

  const onPointerUp = React.useCallback(
    (ev: HandlerEvent<'onPointerUp'>) => {
      pressing.current = false;
      onPointerUpProp?.(ev);
    },
    [onPointerUpProp]
  );

  const onPressOut = React.useCallback(
    (ev: GestureResponderEvent) => {
      pressing.current = false;
      onPressOutProp?.(ev);
    },
    [onPressOutProp]
  );

  const onFocus = React.useCallback(
    (ev: HandlerEvent<'onFocus'>) => {
      if (!pressing.current) show();
      onFocusProp?.(ev);
    },
    [onFocusProp, show]
  );

  const onBlur = React.useCallback(
    (ev: HandlerEvent<'onBlur'>) => {
      pressing.current = false; // a press cancelled without pointerup or onPressOut ends here
      hide();
      onBlurProp?.(ev);
    },
    [hide, onBlurProp]
  );

  const onPress = React.useCallback(
    (ev: GestureResponderEvent) => {
      // A press during the hover delay cancels it: a press never opens without openOnPress.
      clearDelay();
      if (openOnPress && !open) {
        show();
      } else {
        hide();
      }
      onPressProp?.(ev);
    },
    [clearDelay, hide, onPressProp, open, openOnPress, show]
  );

  const Component = asChild ? Slot : Pressable;

  return (
    <Component
      ref={augmentedRef}
      role="button"
      aria-disabled={disabled || undefined}
      onPress={onPress}
      onPressOut={onPressOut}
      onPointerDown={onPointerDown}
      onPointerUp={onPointerUp}
      onHoverIn={onHoverIn}
      onHoverOut={onHoverOut}
      onFocus={onFocus}
      onBlur={onBlur}
      disabled={disabled || undefined}
      {...props}
    />
  );
});

Trigger.displayName = 'TooltipTrigger';

// ---------------------------------------------------------------------------
// Portal
// ---------------------------------------------------------------------------

function Portal({ forceMount, hostName, children }: PortalProps) {
  const internalValue = useInternalContext();
  const rootValue = useRootContext();

  if (!forceMount && !rootValue.open) {
    return null;
  }

  return (
    <RNPortal hostName={hostName} name={`${internalValue.nativeID}_portal`}>
      <InternalContext.Provider value={internalValue}>
        <RootContext.Provider value={rootValue}>{children}</RootContext.Provider>
      </InternalContext.Provider>
    </RNPortal>
  );
}

Portal.displayName = 'TooltipPortal';

// ---------------------------------------------------------------------------
// Overlay
// ---------------------------------------------------------------------------

const Overlay = React.forwardRef<View, OverlayProps>(function Overlay(
  { asChild, forceMount, onPress: onPressProp, closeOnPress = true, ...props },
  ref
) {
  const { open, onOpenChange, setTriggerPosition, setContentLayout } = useRootContext();

  const onPress = React.useCallback(
    (ev: GestureResponderEvent) => {
      if (closeOnPress) {
        setTriggerPosition(null);
        setContentLayout(null);
        onOpenChange(false);
      }
      onPressProp?.(ev);
    },
    [closeOnPress, onOpenChange, onPressProp, setContentLayout, setTriggerPosition]
  );

  if (!forceMount && !open) {
    return null;
  }

  const Component = asChild ? Slot : Pressable;

  return <Component ref={ref} onPress={onPress} {...props} />;
});

Overlay.displayName = 'TooltipOverlay';

// ---------------------------------------------------------------------------
// Content
// ---------------------------------------------------------------------------

const Content = React.forwardRef<View, ContentProps>(function Content(
  {
    asChild,
    forceMount,
    align = 'center',
    side = 'top',
    sideOffset = 0,
    alignOffset = 0,
    avoidCollisions = true,
    insets,
    style,
    disablePositioningStyle,
    onLayout: onLayoutProp,
    ...props
  },
  ref
) {
  const { open, triggerPosition, contentLayout, setContentLayout } = useRootContext();
  const { nativeID } = useInternalContext();

  const positionStyle = useRelativePosition({
    align,
    avoidCollisions,
    triggerPosition,
    contentLayout,
    alignOffset,
    insets,
    sideOffset,
    side,
    disablePositioningStyle,
  });

  const onLayout = React.useCallback(
    (event: LayoutChangeEvent) => {
      setContentLayout(event.nativeEvent.layout);
      onLayoutProp?.(event);
    },
    [onLayoutProp, setContentLayout]
  );

  if (!forceMount && !open) {
    return null;
  }

  const Component = asChild ? Slot : View;

  return (
    <Component
      ref={ref}
      role="tooltip"
      nativeID={nativeID}
      style={[positionStyle, style]}
      onLayout={onLayout}
      {...props}
    />
  );
});

Content.displayName = 'TooltipContent';

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

export {
  Content,
  Overlay,
  Portal,
  Root,
  Trigger,
  useRootContext,
};
