import * as React from 'react';
import { Pressable, Text, View, type GestureResponderEvent } from 'react-native';
import { useControllableState } from '../hooks';
import { Portal as RNPortal } from '../portal';
import { Slot } from '../slot';
import type {
  CloseProps,
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
      'Dialog compound components cannot be rendered outside the Dialog.Root component'
    );
  }
  return context;
}

const InternalContext = React.createContext<{ nativeID: string } | null>(null);

function useInternalContext() {
  const context = React.useContext(InternalContext);
  if (!context) {
    throw new Error(
      'Dialog compound components cannot be rendered outside the Dialog.Root component'
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

Root.displayName = 'DialogRoot';

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

Trigger.displayName = 'DialogTrigger';

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

Portal.displayName = 'DialogPortal';

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

Overlay.displayName = 'DialogOverlay';

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
      role="dialog"
      nativeID={nativeID}
      aria-labelledby={`${nativeID}_title`}
      aria-describedby={`${nativeID}_description`}
      {...props}
    />
  );
});

Content.displayName = 'DialogContent';

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

Title.displayName = 'DialogTitle';

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

Description.displayName = 'DialogDescription';

// ---------------------------------------------------------------------------
// Close
// ---------------------------------------------------------------------------

const Close = React.forwardRef<View, CloseProps>(function Close(
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

Close.displayName = 'DialogClose';

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

export {
  Close,
  Content,
  Description,
  Overlay,
  Portal,
  Root,
  Title,
  Trigger,
  useRootContext,
};
