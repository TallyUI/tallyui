import * as React from 'react';
import {
  Pressable,
  Text,
  TextInput,
  View,
  type GestureResponderEvent,
  type NativeSyntheticEvent,
  type TextInputChangeEventData,
} from 'react-native';
import { useControllableState } from '../hooks';
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
      {children}
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
      ref={ref}
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

  if (!forceMount && !rootValue.open) {
    return null;
  }

  return (
    <RNPortal hostName={hostName} name={`${rootValue.nativeID}_portal`}>
      <RootContext.Provider value={rootValue}>{children}</RootContext.Provider>
    </RNPortal>
  );
}

Portal.displayName = 'ComboboxPortal';

// ---------------------------------------------------------------------------
// Content
// ---------------------------------------------------------------------------

const Content = React.forwardRef<View, ContentProps>(function Content(
  { asChild, forceMount, ...props },
  ref
) {
  const { open } = useRootContext();

  if (!forceMount && !open) {
    return null;
  }

  const Component = asChild ? Slot : View;

  return <Component ref={ref} role="listbox" {...props} />;
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
