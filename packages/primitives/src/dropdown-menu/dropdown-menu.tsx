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
  RootContext as RootContextType,
  RootProps,
  SeparatorProps,
  SubContentProps,
  SubProps,
  SubTriggerProps,
  TriggerProps,
} from './types';

// ---------------------------------------------------------------------------
// Root context
// ---------------------------------------------------------------------------

const RootContext = React.createContext<RootContextType | null>(null);

function useRootContext(): RootContextType {
  const context = React.useContext(RootContext);
  if (!context) {
    throw new Error(
      'DropdownMenu compound components cannot be rendered outside the DropdownMenu.Root component'
    );
  }
  return context;
}

// ---------------------------------------------------------------------------
// Form item context (shared by CheckboxItem and RadioGroup/RadioItem)
// ---------------------------------------------------------------------------

type FormItemContext =
  | { checked: boolean }
  | { value: string | undefined; onValueChange: (value: string) => void };

const FormItemContext = React.createContext<FormItemContext | null>(null);

function useFormItemContext(): FormItemContext {
  const context = React.useContext(FormItemContext);
  if (!context) {
    throw new Error(
      'DropdownMenu.ItemIndicator must be rendered inside a CheckboxItem or RadioItem'
    );
  }
  return context;
}

// ---------------------------------------------------------------------------
// Radio item context (tracks individual radio item value for ItemIndicator)
// ---------------------------------------------------------------------------

const RadioItemContext = React.createContext<{ itemValue: string } | null>(null);

// ---------------------------------------------------------------------------
// Sub context
// ---------------------------------------------------------------------------

const SubContext = React.createContext<{
  nativeID: string;
  open: boolean;
  onOpenChange: (value: boolean) => void;
} | null>(null);

function useSubContext() {
  const context = React.useContext(SubContext);
  if (!context) {
    throw new Error(
      'DropdownMenu.Sub compound components cannot be rendered outside a DropdownMenu.Sub component'
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
    <RootContext.Provider
      value={{
        open,
        onOpenChange,
        triggerPosition,
        setTriggerPosition,
        contentLayout,
        setContentLayout,
        nativeID,
      }}
    >
      {children}
    </RootContext.Provider>
  );
}

Root.displayName = 'DropdownMenuRoot';

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
      aria-expanded={open}
      aria-disabled={disabled || undefined}
      onPress={onPress}
      disabled={disabled || undefined}
      {...props}
    />
  );
});

Trigger.displayName = 'DropdownMenuTrigger';

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

Portal.displayName = 'DropdownMenuPortal';

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

Overlay.displayName = 'DropdownMenuOverlay';

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
      role="menu"
      aria-modal={true}
      style={[positionStyle, style]}
      onLayout={onLayout}
      {...props}
    />
  );
});

Content.displayName = 'DropdownMenuContent';

// ---------------------------------------------------------------------------
// Item
// ---------------------------------------------------------------------------

const Item = React.forwardRef<View, ItemProps>(function Item(
  { asChild, textValue, onPress: onPressProp, disabled, closeOnPress = true, ...props },
  ref
) {
  const { onOpenChange, setTriggerPosition, setContentLayout } = useRootContext();

  const onPress = React.useCallback(
    (ev: GestureResponderEvent) => {
      if (disabled) return;
      if (closeOnPress) {
        setTriggerPosition(null);
        setContentLayout(null);
        onOpenChange(false);
      }
      onPressProp?.(ev);
    },
    [closeOnPress, disabled, onOpenChange, onPressProp, setContentLayout, setTriggerPosition]
  );

  const Component = asChild ? Slot : Pressable;

  return (
    <Component
      ref={ref}
      role="menuitem"
      aria-valuetext={textValue}
      aria-disabled={disabled || undefined}
      onPress={onPress}
      disabled={disabled || undefined}
      {...props}
    />
  );
});

Item.displayName = 'DropdownMenuItem';

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

Group.displayName = 'DropdownMenuGroup';

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

Label.displayName = 'DropdownMenuLabel';

// ---------------------------------------------------------------------------
// CheckboxItem
// ---------------------------------------------------------------------------

const CheckboxItem = React.forwardRef<View, CheckboxItemProps>(function CheckboxItem(
  {
    asChild,
    checked,
    onCheckedChange,
    textValue,
    onPress: onPressProp,
    closeOnPress = true,
    disabled,
    ...props
  },
  ref
) {
  const { onOpenChange, setTriggerPosition, setContentLayout } = useRootContext();

  const onPress = React.useCallback(
    (ev: GestureResponderEvent) => {
      if (disabled) return;
      onCheckedChange(!checked);
      if (closeOnPress) {
        setTriggerPosition(null);
        setContentLayout(null);
        onOpenChange(false);
      }
      onPressProp?.(ev);
    },
    [checked, closeOnPress, disabled, onCheckedChange, onOpenChange, onPressProp, setContentLayout, setTriggerPosition]
  );

  const Component = asChild ? Slot : Pressable;

  return (
    <FormItemContext.Provider value={{ checked }}>
      <Component
        ref={ref}
        role="checkbox"
        aria-checked={checked}
        aria-valuetext={textValue}
        aria-disabled={disabled || undefined}
        onPress={onPress}
        disabled={disabled || undefined}
        {...props}
      />
    </FormItemContext.Provider>
  );
});

CheckboxItem.displayName = 'DropdownMenuCheckboxItem';

// ---------------------------------------------------------------------------
// RadioGroup
// ---------------------------------------------------------------------------

const RadioGroup = React.forwardRef<View, RadioGroupProps>(function RadioGroup(
  { asChild, value, onValueChange, ...props },
  ref
) {
  const Component = asChild ? Slot : View;

  return (
    <FormItemContext.Provider value={{ value, onValueChange }}>
      <Component ref={ref} role="radiogroup" {...props} />
    </FormItemContext.Provider>
  );
});

RadioGroup.displayName = 'DropdownMenuRadioGroup';

// ---------------------------------------------------------------------------
// RadioItem
// ---------------------------------------------------------------------------

const RadioItem = React.forwardRef<View, RadioItemProps>(function RadioItem(
  {
    asChild,
    value: itemValue,
    textValue,
    onPress: onPressProp,
    disabled,
    closeOnPress = true,
    ...props
  },
  ref
) {
  const { onOpenChange, setTriggerPosition, setContentLayout } = useRootContext();
  const formContext = useFormItemContext() as {
    value: string | undefined;
    onValueChange: (value: string) => void;
  };

  const onPress = React.useCallback(
    (ev: GestureResponderEvent) => {
      if (disabled) return;
      formContext.onValueChange(itemValue);
      if (closeOnPress) {
        setTriggerPosition(null);
        setContentLayout(null);
        onOpenChange(false);
      }
      onPressProp?.(ev);
    },
    [closeOnPress, disabled, formContext, itemValue, onOpenChange, onPressProp, setContentLayout, setTriggerPosition]
  );

  const Component = asChild ? Slot : Pressable;

  return (
    <RadioItemContext.Provider value={{ itemValue }}>
      <Component
        ref={ref}
        role="radio"
        aria-checked={formContext.value === itemValue}
        aria-valuetext={textValue}
        aria-disabled={disabled || undefined}
        onPress={onPress}
        disabled={disabled || undefined}
        {...props}
      />
    </RadioItemContext.Provider>
  );
});

RadioItem.displayName = 'DropdownMenuRadioItem';

// ---------------------------------------------------------------------------
// ItemIndicator
// ---------------------------------------------------------------------------

const ItemIndicator = React.forwardRef<View, ItemIndicatorProps>(function ItemIndicator(
  { asChild, forceMount, ...props },
  ref
) {
  const formContext = useFormItemContext();
  const radioItemContext = React.useContext(RadioItemContext);

  if (!forceMount) {
    // Inside a RadioItem: check if the radio item value matches the group value
    if (radioItemContext) {
      const ctx = formContext as { value: string | undefined; onValueChange: (value: string) => void };
      if (ctx.value !== radioItemContext.itemValue) {
        return null;
      }
    } else {
      // Inside a CheckboxItem: check if checked
      const ctx = formContext as { checked: boolean };
      if (!ctx.checked) {
        return null;
      }
    }
  }

  const Component = asChild ? Slot : View;

  return <Component ref={ref} role="presentation" {...props} />;
});

ItemIndicator.displayName = 'DropdownMenuItemIndicator';

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

Separator.displayName = 'DropdownMenuSeparator';

// ---------------------------------------------------------------------------
// Sub
// ---------------------------------------------------------------------------

function Sub({ open: openProp, defaultOpen, onOpenChange: onOpenChangeProp, children }: SubProps) {
  const nativeID = React.useId();
  const [open = false, onOpenChange] = useControllableState({
    prop: openProp,
    defaultProp: defaultOpen,
    onChange: onOpenChangeProp,
  });

  return (
    <SubContext.Provider value={{ nativeID, open, onOpenChange }}>
      {children}
    </SubContext.Provider>
  );
}

Sub.displayName = 'DropdownMenuSub';

// ---------------------------------------------------------------------------
// SubTrigger
// ---------------------------------------------------------------------------

const SubTrigger = React.forwardRef<View, SubTriggerProps>(function SubTrigger(
  { asChild, textValue, onPress: onPressProp, disabled, ...props },
  ref
) {
  const { open, onOpenChange } = useSubContext();

  const onPress = React.useCallback(
    (ev: GestureResponderEvent) => {
      if (disabled) return;
      onOpenChange(!open);
      onPressProp?.(ev);
    },
    [disabled, onOpenChange, onPressProp, open]
  );

  const Component = asChild ? Slot : Pressable;

  return (
    <Component
      ref={ref}
      role="menuitem"
      aria-expanded={open}
      aria-valuetext={textValue}
      aria-disabled={disabled || undefined}
      onPress={onPress}
      disabled={disabled || undefined}
      {...props}
    />
  );
});

SubTrigger.displayName = 'DropdownMenuSubTrigger';

// ---------------------------------------------------------------------------
// SubContent
// ---------------------------------------------------------------------------

const SubContent = React.forwardRef<View, SubContentProps>(function SubContent(
  { asChild, forceMount, ...props },
  ref
) {
  const { open, nativeID } = useSubContext();

  if (!forceMount && !open) {
    return null;
  }

  const Component = asChild ? Slot : View;

  return <Component ref={ref} role="menu" aria-labelledby={nativeID} {...props} />;
});

SubContent.displayName = 'DropdownMenuSubContent';

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

export {
  CheckboxItem,
  Content,
  Group,
  Item,
  ItemIndicator,
  Label,
  Overlay,
  Portal,
  RadioGroup,
  RadioItem,
  Root,
  Separator,
  Sub,
  SubContent,
  SubTrigger,
  Trigger,
  useRootContext,
  useSubContext,
};
