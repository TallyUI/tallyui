import * as React from 'react';
import {
  Pressable,
  Text,
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
  GroupProps,
  ItemContext as ItemContextType,
  ItemIndicatorProps,
  ItemProps,
  ItemTextProps,
  LabelProps,
  Option,
  OverlayProps,
  PortalProps,
  RootContext as RootContextType,
  RootProps,
  SeparatorProps,
  TriggerProps,
  ValueProps,
} from './types';

// ---------------------------------------------------------------------------
// Root context
// ---------------------------------------------------------------------------

const RootContext = React.createContext<RootContextType | null>(null);

function useRootContext(): RootContextType {
  const context = React.useContext(RootContext);
  if (!context) {
    throw new Error(
      'Select compound components cannot be rendered outside the Select.Root component'
    );
  }
  return context;
}

// ---------------------------------------------------------------------------
// Item context
// ---------------------------------------------------------------------------

const ItemContext = React.createContext<ItemContextType | null>(null);

function useItemContext(): ItemContextType {
  const context = React.useContext(ItemContext);
  if (!context) {
    throw new Error(
      'Select.Item compound components cannot be rendered outside a Select.Item component'
    );
  }
  return context;
}

// ---------------------------------------------------------------------------
// Root
// ---------------------------------------------------------------------------

function Root({
  value: valueProp,
  defaultValue,
  onValueChange: onValueChangeProp,
  open: openProp,
  defaultOpen,
  onOpenChange: onOpenChangeProp,
  disabled,
  children,
}: RootProps) {
  const nativeID = React.useId();

  const [value, onValueChange] = useControllableState<Option>({
    prop: valueProp,
    defaultProp: defaultValue,
    onChange: onValueChangeProp,
  });

  const [open = false, onOpenChange] = useControllableState({
    prop: openProp,
    defaultProp: defaultOpen,
    onChange: onOpenChangeProp,
  });

  const [triggerPosition, setTriggerPosition] = React.useState<LayoutPosition | null>(null);
  const [contentLayout, setContentLayout] = React.useState<LayoutRectangle | null>(null);

  return (
    <RootContext.Provider
      value={{
        value,
        onValueChange: onValueChange as (option: Option) => void,
        open,
        onOpenChange,
        triggerPosition,
        setTriggerPosition,
        contentLayout,
        setContentLayout,
        nativeID,
        disabled,
      }}
    >
      {children}
    </RootContext.Provider>
  );
}

Root.displayName = 'SelectRoot';

// ---------------------------------------------------------------------------
// Trigger
// ---------------------------------------------------------------------------

const Trigger = React.forwardRef<View, TriggerProps>(function Trigger(
  { asChild, onPress: onPressProp, disabled, ...props },
  ref
) {
  const { open, onOpenChange, disabled: disabledRoot, setTriggerPosition } = useRootContext();

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
      if (disabled || disabledRoot) return;
      augmentedRef.current?.measure?.((_x, _y, width, height, pageX, pageY) => {
        setTriggerPosition({ width, pageX, pageY, height });
      });
      onOpenChange(!open);
      onPressProp?.(ev);
    },
    [augmentedRef, disabled, disabledRoot, onOpenChange, onPressProp, open, setTriggerPosition]
  );

  const Component = asChild ? Slot : Pressable;

  return (
    <Component
      ref={augmentedRef}
      role="combobox"
      aria-expanded={open}
      aria-disabled={(disabled || disabledRoot) || undefined}
      onPress={onPress}
      disabled={(disabled || disabledRoot) || undefined}
      {...props}
    />
  );
});

Trigger.displayName = 'SelectTrigger';

// ---------------------------------------------------------------------------
// Value
// ---------------------------------------------------------------------------

const Value = React.forwardRef<Text, ValueProps>(function Value(
  { asChild, placeholder, ...props },
  ref
) {
  const { value } = useRootContext();
  const Component = asChild ? Slot : Text;

  return (
    <Component ref={ref} {...props}>
      {value?.label ?? placeholder}
    </Component>
  );
});

Value.displayName = 'SelectValue';

// ---------------------------------------------------------------------------
// Portal
// ---------------------------------------------------------------------------

function Portal({ forceMount, hostName, children }: PortalProps) {
  const rootValue = useRootContext();

  if (!forceMount && !rootValue.open) {
    return null;
  }

  return (
    <RNPortal hostName={hostName} name={`${rootValue.nativeID}_portal`}>
      <RootContext.Provider value={rootValue}>{children}</RootContext.Provider>
    </RNPortal>
  );
}

Portal.displayName = 'SelectPortal';

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

Overlay.displayName = 'SelectOverlay';

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
      role="list"
      aria-modal={true}
      style={[positionStyle, style]}
      onLayout={onLayout}
      {...props}
    />
  );
});

Content.displayName = 'SelectContent';

// ---------------------------------------------------------------------------
// Item
// ---------------------------------------------------------------------------

const Item = React.forwardRef<View, ItemProps>(function Item(
  { asChild, value: itemValue, label, onPress: onPressProp, disabled, closeOnPress = true, ...props },
  ref
) {
  const { value, onValueChange, onOpenChange, setTriggerPosition, setContentLayout } = useRootContext();

  const onPress = React.useCallback(
    (ev: GestureResponderEvent) => {
      if (disabled) return;

      onValueChange({ value: itemValue, label });

      if (closeOnPress) {
        setTriggerPosition(null);
        setContentLayout(null);
        onOpenChange(false);
      }

      onPressProp?.(ev);
    },
    [closeOnPress, disabled, itemValue, label, onOpenChange, onPressProp, onValueChange, setContentLayout, setTriggerPosition]
  );

  const Component = asChild ? Slot : Pressable;

  return (
    <ItemContext.Provider value={{ itemValue, label }}>
      <Component
        ref={ref}
        role="option"
        aria-checked={value?.value === itemValue}
        aria-disabled={disabled || undefined}
        onPress={onPress}
        disabled={disabled || undefined}
        {...props}
      />
    </ItemContext.Provider>
  );
});

Item.displayName = 'SelectItem';

// ---------------------------------------------------------------------------
// ItemText
// ---------------------------------------------------------------------------

const ItemText = React.forwardRef<Text, ItemTextProps>(function ItemText(
  { asChild, ...props },
  ref
) {
  const { label } = useItemContext();
  const Component = asChild ? Slot : Text;

  return (
    <Component ref={ref} {...props}>
      {label}
    </Component>
  );
});

ItemText.displayName = 'SelectItemText';

// ---------------------------------------------------------------------------
// ItemIndicator
// ---------------------------------------------------------------------------

const ItemIndicator = React.forwardRef<View, ItemIndicatorProps>(function ItemIndicator(
  { asChild, forceMount, ...props },
  ref
) {
  const { itemValue } = useItemContext();
  const { value } = useRootContext();

  if (!forceMount && value?.value !== itemValue) {
    return null;
  }

  const Component = asChild ? Slot : View;

  return <Component ref={ref} role="presentation" {...props} />;
});

ItemIndicator.displayName = 'SelectItemIndicator';

// ---------------------------------------------------------------------------
// Group
// ---------------------------------------------------------------------------

const Group = React.forwardRef<View, GroupProps>(function Group(
  { asChild, ...props },
  ref
) {
  const Component = asChild ? Slot : View;

  return <Component ref={ref} role="group" {...props} />;
});

Group.displayName = 'SelectGroup';

// ---------------------------------------------------------------------------
// Label
// ---------------------------------------------------------------------------

const Label = React.forwardRef<Text, LabelProps>(function Label(
  { asChild, ...props },
  ref
) {
  const Component = asChild ? Slot : Text;

  return <Component ref={ref} {...props} />;
});

Label.displayName = 'SelectLabel';

// ---------------------------------------------------------------------------
// Separator
// ---------------------------------------------------------------------------

const Separator = React.forwardRef<View, SeparatorProps>(function Separator(
  { asChild, decorative, ...props },
  ref
) {
  const Component = asChild ? Slot : View;

  return (
    <Component
      ref={ref}
      role={decorative ? 'presentation' : 'separator'}
      {...props}
    />
  );
});

Separator.displayName = 'SelectSeparator';

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

export {
  Content,
  Group,
  Item,
  ItemIndicator,
  ItemText,
  Label,
  Overlay,
  Portal,
  Root,
  Separator,
  Trigger,
  Value,
  useItemContext,
  useRootContext,
};
