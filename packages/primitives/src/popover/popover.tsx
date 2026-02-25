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
  CloseProps,
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
      'Popover compound components cannot be rendered outside the Popover.Root component'
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
      'Popover compound components cannot be rendered outside the Popover.Root component'
    );
  }
  return context;
}

// ---------------------------------------------------------------------------
// Root
// ---------------------------------------------------------------------------

function Root({ open: openProp, defaultOpen, onOpenChange: onOpenChangeProp, children }: RootProps) {
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

Root.displayName = 'PopoverRoot';

// ---------------------------------------------------------------------------
// Trigger
// ---------------------------------------------------------------------------

const Trigger = React.forwardRef<View, TriggerProps>(function Trigger(
  { asChild, onPress: onPressProp, disabled, ...props },
  ref
) {
  const { open, onOpenChange, setTriggerPosition } = useRootContext();

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

  const onPress = React.useCallback(
    (ev: GestureResponderEvent) => {
      if (disabled) return;
      augmentedRef.current?.measure?.((_x, _y, width, height, pageX, pageY) => {
        setTriggerPosition({ width, pageX, pageY, height });
      });
      onOpenChange(!open);
      onPressProp?.(ev);
    },
    [augmentedRef, disabled, onOpenChange, onPressProp, open, setTriggerPosition]
  );

  const Component = asChild ? Slot : Pressable;

  return (
    <Component
      ref={augmentedRef}
      role="button"
      aria-disabled={disabled || undefined}
      onPress={onPress}
      disabled={disabled || undefined}
      {...props}
    />
  );
});

Trigger.displayName = 'PopoverTrigger';

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

Portal.displayName = 'PopoverPortal';

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

Overlay.displayName = 'PopoverOverlay';

// ---------------------------------------------------------------------------
// Content
// ---------------------------------------------------------------------------

const Content = React.forwardRef<View, ContentProps>(function Content(
  {
    asChild,
    forceMount,
    align = 'start',
    side = 'bottom',
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
      role="dialog"
      nativeID={nativeID}
      aria-labelledby={`${nativeID}_title`}
      aria-describedby={`${nativeID}_description`}
      aria-modal={true}
      style={[positionStyle, style]}
      onLayout={onLayout}
      {...props}
    />
  );
});

Content.displayName = 'PopoverContent';

// ---------------------------------------------------------------------------
// Close
// ---------------------------------------------------------------------------

const Close = React.forwardRef<View, CloseProps>(function Close(
  { asChild, onPress: onPressProp, disabled, ...props },
  ref
) {
  const { onOpenChange, setTriggerPosition, setContentLayout } = useRootContext();

  const onPress = React.useCallback(
    (ev: GestureResponderEvent) => {
      if (disabled) return;
      setTriggerPosition(null);
      setContentLayout(null);
      onOpenChange(false);
      onPressProp?.(ev);
    },
    [disabled, onOpenChange, onPressProp, setContentLayout, setTriggerPosition]
  );

  const Component = asChild ? Slot : Pressable;

  return (
    <Component
      ref={ref}
      role="button"
      aria-disabled={disabled || undefined}
      onPress={onPress}
      disabled={disabled || undefined}
      {...props}
    />
  );
});

Close.displayName = 'PopoverClose';

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

export {
  Close,
  Content,
  Overlay,
  Portal,
  Root,
  Trigger,
  useRootContext,
};
