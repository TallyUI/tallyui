import * as React from 'react';
import {
  Pressable,
  Text,
  TextInput,
  View,
  type GestureResponderEvent,
  type LayoutChangeEvent,
  type LayoutRectangle,
  type NativeSyntheticEvent,
  type TextInputChangeEventData,
} from 'react-native';
import { useAugmentedRef, useControllableState, useRelativePosition, type LayoutPosition } from '../hooks';
import { measureTrigger } from '../hooks/measure-trigger';
import { Portal as RNPortal } from '../portal';
import { Slot } from '../slot';
import type {
  ContentProps,
  EmptyProps,
  InputProps,
  ItemProps,
  ItemTextProps,
  Option,
  PortalProps,
  RootContext as RootContextType,
  RootProps,
  TriggerProps,
} from './types';

// Private anchor state: the anchor is the Trigger when one is mounted, otherwise the Input.
interface AnchorContextType {
  triggerPosition: LayoutPosition | null;
  setTriggerPosition: (position: LayoutPosition | null) => void;
  contentLayout: LayoutRectangle | null;
  setContentLayout: (layout: LayoutRectangle | null) => void;
  triggerRef: React.MutableRefObject<View | null>;
  inputRef: React.MutableRefObject<View | null>;
}

const AnchorContext = React.createContext<AnchorContextType | null>(null);

// Every caller has already called useRootContext(), which throws outside Root.
const useAnchorContext = () => React.useContext(AnchorContext)!;

// Stores the mounted node in an anchor ref and clears it on unmount.
function useAnchorNode(anchorRef: React.MutableRefObject<View | null>, node: React.RefObject<View | null>) {
  React.useEffect(() => {
    anchorRef.current = node.current;
    return () => {
      anchorRef.current = null;
    };
  }, [anchorRef, node]);
}

// ---------------------------------------------------------------------------
// Root context
// ---------------------------------------------------------------------------

const RootContext = React.createContext<RootContextType | null>(null);

function useRootContext(): RootContextType {
  const context = React.useContext(RootContext);
  if (!context) {
    throw new Error(
      'Combobox compound components cannot be rendered outside the Combobox.Root component'
    );
  }
  return context;
}

// ---------------------------------------------------------------------------
// Item context
// ---------------------------------------------------------------------------

interface ItemContextType {
  itemValue: string;
  label: string;
}

const ItemContext = React.createContext<ItemContextType | null>(null);

function useItemContext(): ItemContextType {
  const context = React.useContext(ItemContext);
  if (!context) {
    throw new Error(
      'Combobox.Item compound components cannot be rendered outside a Combobox.Item component'
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
  searchValue: searchValueProp,
  onSearchValueChange: onSearchValueChangeProp,
  children,
}: RootProps) {
  const nativeID = React.useId();

  const [value, onValueChange] = useControllableState<Option | undefined>({
    prop: valueProp,
    defaultProp: defaultValue,
    onChange: onValueChangeProp,
  });

  const [open = false, onOpenChange] = useControllableState({
    prop: openProp,
    defaultProp: defaultOpen,
    onChange: onOpenChangeProp,
  });

  const [searchValue = '', onSearchValueChange] = useControllableState({
    prop: searchValueProp,
    defaultProp: '',
    onChange: onSearchValueChangeProp,
  });

  const [triggerPosition, setTriggerPosition] = React.useState<LayoutPosition | null>(null);
  const [contentLayout, setContentLayout] = React.useState<LayoutRectangle | null>(null);
  const triggerRef = React.useRef<View | null>(null);
  const inputRef = React.useRef<View | null>(null);

  return (
    <RootContext.Provider
      value={{
        value,
        onValueChange: onValueChange as (option: Option | undefined) => void,
        open,
        onOpenChange,
        searchValue,
        onSearchValueChange: onSearchValueChange as (search: string) => void,
        nativeID,
      }}
    >
      <AnchorContext.Provider
        value={{ triggerPosition, setTriggerPosition, contentLayout, setContentLayout, triggerRef, inputRef }}
      >
        {children}
      </AnchorContext.Provider>
    </RootContext.Provider>
  );
}

Root.displayName = 'ComboboxRoot';

// ---------------------------------------------------------------------------
// Input
// ---------------------------------------------------------------------------

const Input = React.forwardRef<View, InputProps>(function Input(
  { asChild, placeholder, ...props },
  ref
) {
  const { open, onOpenChange, searchValue, onSearchValueChange } = useRootContext();
  const { inputRef } = useAnchorContext();
  const augmentedRef = useAugmentedRef<View>({ ref });
  useAnchorNode(inputRef, augmentedRef);

  const onChange = React.useCallback(
    (ev: NativeSyntheticEvent<TextInputChangeEventData>) => {
      onSearchValueChange(ev.nativeEvent.text);
      if (!open) {
        onOpenChange(true);
      }
    },
    [onSearchValueChange, onOpenChange, open]
  );

  const onFocus = React.useCallback(() => {
    if (!open) {
      onOpenChange(true);
    }
  }, [onOpenChange, open]);

  const Component = asChild ? Slot : TextInput;

  return (
    <Component
      ref={augmentedRef}
      role="combobox"
      aria-expanded={open}
      aria-autocomplete="list"
      placeholder={placeholder}
      value={searchValue}
      onChange={onChange}
      onFocus={onFocus}
      {...props}
    />
  );
});

Input.displayName = 'ComboboxInput';

// ---------------------------------------------------------------------------
// Trigger
// ---------------------------------------------------------------------------

const Trigger = React.forwardRef<View, TriggerProps>(function Trigger(
  { asChild, onPress: onPressProp, ...props },
  ref
) {
  const { open, onOpenChange } = useRootContext();
  const { triggerRef, inputRef } = useAnchorContext();
  const augmentedRef = useAugmentedRef<View>({ ref });
  useAnchorNode(triggerRef, augmentedRef);

  const onPress = React.useCallback(
    (ev: GestureResponderEvent) => {
      // A press on an Input inside the Trigger only opens: the Input's focus has
      // already opened the list, so a toggle would shut it again. A node without
      // `contains` falls through to the toggle.
      const input = inputRef.current as { contains?: (node: unknown) => boolean } | null;
      if (typeof input?.contains === 'function' && input.contains(ev.target)) {
        if (!open) onOpenChange(true);
      } else {
        onOpenChange(!open);
      }
      onPressProp?.(ev);
    },
    [inputRef, onOpenChange, onPressProp, open]
  );

  const Component = asChild ? Slot : Pressable;

  return (
    <Component
      ref={augmentedRef}
      role="button"
      aria-expanded={open}
      onPress={onPress}
      {...props}
    />
  );
});

Trigger.displayName = 'ComboboxTrigger';

// ---------------------------------------------------------------------------
// Portal
// ---------------------------------------------------------------------------

function Portal({ forceMount, hostName, children }: PortalProps) {
  const rootValue = useRootContext();
  const anchorValue = useAnchorContext();

  if (!forceMount && !rootValue.open) {
    return null;
  }

  return (
    <RNPortal hostName={hostName} name={`${rootValue.nativeID}_portal`}>
      <RootContext.Provider value={rootValue}><AnchorContext.Provider value={anchorValue}>{children}</AnchorContext.Provider></RootContext.Provider>
    </RNPortal>
  );
}

Portal.displayName = 'ComboboxPortal';

// ---------------------------------------------------------------------------
// Content
// ---------------------------------------------------------------------------

const Content = React.forwardRef<View, ContentProps>(function Content(
  { asChild, forceMount, style, onLayout: onLayoutProp, ...props },
  ref
) {
  const { open } = useRootContext();
  const { triggerPosition, setTriggerPosition, contentLayout, setContentLayout, triggerRef, inputRef } =
    useAnchorContext();

  React.useEffect(() => {
    if (!open) return;
    measureTrigger(triggerRef.current ?? inputRef.current, setTriggerPosition);
    return () => {
      setTriggerPosition(null);
      setContentLayout(null);
    };
  }, [open, triggerRef, inputRef, setTriggerPosition, setContentLayout]);

  // Content opens below its anchor, left edges aligned (Select's default), with
  // v2's 4 px gap (monorepo packages/components/src/popover/anchor.tsx:14), and
  // is clamped into the window exactly as Select is.
  const positionStyle = useRelativePosition({
    align: 'start',
    avoidCollisions: true,
    triggerPosition,
    contentLayout,
    alignOffset: 0,
    sideOffset: 4,
    side: 'bottom',
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
      role="listbox"
      style={[positionStyle, triggerPosition ? { minWidth: triggerPosition.width } : null, style]}
      onLayout={onLayout}
      {...props}
    />
  );
});

Content.displayName = 'ComboboxContent';

// ---------------------------------------------------------------------------
// Item
// ---------------------------------------------------------------------------

const Item = React.forwardRef<View, ItemProps>(function Item(
  { asChild, value: itemValue, label, onPress: onPressProp, ...props },
  ref
) {
  const { value, onValueChange, onOpenChange, onSearchValueChange } = useRootContext();

  const isSelected = value?.value === itemValue;

  const onPress = React.useCallback(
    (ev: GestureResponderEvent) => {
      onValueChange({ value: itemValue, label });
      onOpenChange(false);
      onSearchValueChange('');
      onPressProp?.(ev);
    },
    [itemValue, label, onOpenChange, onPressProp, onSearchValueChange, onValueChange]
  );

  const Component = asChild ? Slot : Pressable;

  return (
    <ItemContext.Provider value={{ itemValue, label }}>
      <Component
        ref={ref}
        role="option"
        aria-selected={isSelected}
        onPress={onPress}
        {...props}
      />
    </ItemContext.Provider>
  );
});

Item.displayName = 'ComboboxItem';

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

ItemText.displayName = 'ComboboxItemText';

// ---------------------------------------------------------------------------
// Empty
// ---------------------------------------------------------------------------

const Empty = React.forwardRef<View, EmptyProps>(function Empty(
  { asChild, ...props },
  ref
) {
  const Component = asChild ? Slot : View;

  return <Component ref={ref} {...props} />;
});

Empty.displayName = 'ComboboxEmpty';

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

export {
  Content,
  Empty,
  Input,
  Item,
  ItemText,
  Portal,
  Root,
  Trigger,
  useRootContext,
};
