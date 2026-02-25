import * as React from 'react';
import { Pressable, Text, View, type GestureResponderEvent } from 'react-native';
import { useControllableState } from '../hooks';
import { Portal as RNPortal } from '../portal';
import { Slot } from '../slot';
import type {
  ActionProps,
  CancelProps,
  ContentProps,
  DescriptionProps,
  OverlayProps,
  PortalProps,
  RootContext as RootContextType,
  RootProps,
  TitleProps,
  TriggerProps,
} from './types';

// ---------------------------------------------------------------------------
// Contexts
// ---------------------------------------------------------------------------

const RootContext = React.createContext<RootContextType | null>(null);

function useRootContext(): RootContextType {
  const context = React.useContext(RootContext);
  if (!context) {
    throw new Error(
      'AlertDialog compound components cannot be rendered outside the AlertDialog.Root component'
    );
  }
  return context;
}

const InternalContext = React.createContext<{ nativeID: string } | null>(null);

function useInternalContext() {
  const context = React.useContext(InternalContext);
  if (!context) {
    throw new Error(
      'AlertDialog compound components cannot be rendered outside the AlertDialog.Root component'
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

  return (
    <InternalContext.Provider value={{ nativeID }}>
      <RootContext.Provider value={{ open, onOpenChange }}>
        {children}
      </RootContext.Provider>
    </InternalContext.Provider>
  );
}

Root.displayName = 'AlertDialogRoot';

// ---------------------------------------------------------------------------
// Trigger
// ---------------------------------------------------------------------------

const Trigger = React.forwardRef<View, TriggerProps>(function Trigger(
  { asChild, onPress: onPressProp, disabled, ...props },
  ref
) {
  const { open, onOpenChange } = useRootContext();

  const onPress = React.useCallback(
    (ev: GestureResponderEvent) => {
      onOpenChange(!open);
      onPressProp?.(ev);
    },
    [onOpenChange, onPressProp, open]
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

Trigger.displayName = 'AlertDialogTrigger';

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

Portal.displayName = 'AlertDialogPortal';

// ---------------------------------------------------------------------------
// Overlay
// ---------------------------------------------------------------------------

const Overlay = React.forwardRef<View, OverlayProps>(function Overlay(
  { asChild, forceMount, ...props },
  ref
) {
  const { open } = useRootContext();

  if (!forceMount && !open) {
    return null;
  }

  const Component = asChild ? Slot : View;

  return <Component ref={ref} aria-modal={true} {...props} />;
});

Overlay.displayName = 'AlertDialogOverlay';

// ---------------------------------------------------------------------------
// Content
// ---------------------------------------------------------------------------

const Content = React.forwardRef<View, ContentProps>(function Content(
  { asChild, forceMount, ...props },
  ref
) {
  const { open } = useRootContext();
  const { nativeID } = useInternalContext();

  if (!forceMount && !open) {
    return null;
  }

  const Component = asChild ? Slot : View;

  return (
    <Component
      ref={ref}
      role="alertdialog"
      nativeID={nativeID}
      aria-labelledby={`${nativeID}_title`}
      aria-describedby={`${nativeID}_description`}
      {...props}
    />
  );
});

Content.displayName = 'AlertDialogContent';

// ---------------------------------------------------------------------------
// Title
// ---------------------------------------------------------------------------

const Title = React.forwardRef<Text, TitleProps>(function Title(
  { asChild, ...props },
  ref
) {
  const { nativeID } = useInternalContext();

  const Component = asChild ? Slot : Text;

  return <Component ref={ref} role="heading" nativeID={`${nativeID}_title`} {...props} />;
});

Title.displayName = 'AlertDialogTitle';

// ---------------------------------------------------------------------------
// Description
// ---------------------------------------------------------------------------

const Description = React.forwardRef<Text, DescriptionProps>(function Description(
  { asChild, ...props },
  ref
) {
  const { nativeID } = useInternalContext();

  const Component = asChild ? Slot : Text;

  return <Component ref={ref} nativeID={`${nativeID}_description`} {...props} />;
});

Description.displayName = 'AlertDialogDescription';

// ---------------------------------------------------------------------------
// Action
// ---------------------------------------------------------------------------

const Action = React.forwardRef<View, ActionProps>(function Action(
  { asChild, onPress: onPressProp, disabled, ...props },
  ref
) {
  const { onOpenChange } = useRootContext();

  const onPress = React.useCallback(
    (ev: GestureResponderEvent) => {
      onOpenChange(false);
      onPressProp?.(ev);
    },
    [onOpenChange, onPressProp]
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

Action.displayName = 'AlertDialogAction';

// ---------------------------------------------------------------------------
// Cancel
// ---------------------------------------------------------------------------

const Cancel = React.forwardRef<View, CancelProps>(function Cancel(
  { asChild, onPress: onPressProp, disabled, ...props },
  ref
) {
  const { onOpenChange } = useRootContext();

  const onPress = React.useCallback(
    (ev: GestureResponderEvent) => {
      onOpenChange(false);
      onPressProp?.(ev);
    },
    [onOpenChange, onPressProp]
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

Cancel.displayName = 'AlertDialogCancel';

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

export {
  Action,
  Cancel,
  Content,
  Description,
  Overlay,
  Portal,
  Root,
  Title,
  Trigger,
  useRootContext,
};
