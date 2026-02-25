import * as React from 'react';
import { Pressable, View, type GestureResponderEvent } from 'react-native';
import { useControllableState } from '../hooks';
import { Slot } from '../slot';
import type {
  RootProps,
  ItemProps,
  HeaderProps,
  TriggerProps,
  ContentProps,
  RootContext as RootContextType,
  ItemContext as ItemContextType,
} from './types';

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

const RootContext = React.createContext<RootContextType | null>(null);

function useRootContext(): RootContextType {
  const context = React.useContext(RootContext);
  if (!context) {
    throw new Error(
      'Accordion compound components cannot be rendered outside the Accordion.Root component'
    );
  }
  return context;
}

const ItemContext = React.createContext<ItemContextType | null>(null);

function useItemContext(): ItemContextType {
  const context = React.useContext(ItemContext);
  if (!context) {
    throw new Error(
      'Accordion.Item compound components cannot be rendered outside the Accordion.Item component'
    );
  }
  return context;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isItemExpanded(
  rootValue: string | string[] | undefined,
  itemValue: string
): boolean {
  if (rootValue === undefined) return false;
  return Array.isArray(rootValue)
    ? rootValue.includes(itemValue)
    : rootValue === itemValue;
}

// ---------------------------------------------------------------------------
// Root
// ---------------------------------------------------------------------------

const Root = React.forwardRef<View, RootProps>(function Root(
  {
    asChild,
    type,
    value: valueProp,
    defaultValue,
    onValueChange: onValueChangeProp,
    disabled = false,
    ...rest
  },
  ref
) {
  // Pull collapsible out of rest for single type; it doesn't exist on MultipleRootProps
  const collapsible = (rest as { collapsible?: boolean }).collapsible ?? false;
  const { collapsible: _collapsible, ...props } = rest as typeof rest & { collapsible?: boolean };

  const [value, setValue] = useControllableState({
    prop: valueProp,
    defaultProp: defaultValue,
    onChange: onValueChangeProp as (state: string | string[] | undefined) => void,
  });

  const onValueChange = React.useCallback(
    (newValue: string | string[]) => {
      setValue(newValue);
    },
    [setValue]
  );

  const Component = asChild ? Slot : View;

  return (
    <RootContext.Provider
      value={{ type, value, onValueChange, collapsible, disabled }}
    >
      <Component ref={ref} {...props} />
    </RootContext.Provider>
  );
});

Root.displayName = 'AccordionRoot';

// ---------------------------------------------------------------------------
// Item
// ---------------------------------------------------------------------------

const Item = React.forwardRef<View, ItemProps>(function Item(
  { asChild, value: itemValue, disabled: disabledProp = false, ...props },
  ref
) {
  const { value: rootValue, disabled: rootDisabled } = useRootContext();

  const expanded = isItemExpanded(rootValue, itemValue);
  const isDisabled = rootDisabled || disabledProp;

  const Component = asChild ? Slot : View;

  return (
    <ItemContext.Provider
      value={{ value: itemValue, isExpanded: expanded, disabled: isDisabled }}
    >
      <Component ref={ref} {...props} />
    </ItemContext.Provider>
  );
});

Item.displayName = 'AccordionItem';

// ---------------------------------------------------------------------------
// Header
// ---------------------------------------------------------------------------

const Header = React.forwardRef<View, HeaderProps>(function Header(
  { asChild, ...props },
  ref
) {
  const Component = asChild ? Slot : View;

  return <Component ref={ref} role="heading" {...props} />;
});

Header.displayName = 'AccordionHeader';

// ---------------------------------------------------------------------------
// Trigger
// ---------------------------------------------------------------------------

const Trigger = React.forwardRef<View, TriggerProps>(function Trigger(
  { asChild, onPress: onPressProp, disabled: disabledProp, ...props },
  ref
) {
  const { type, collapsible, onValueChange, value: rootValue } = useRootContext();
  const { value: itemValue, isExpanded, disabled: itemDisabled } = useItemContext();

  const isDisabled = itemDisabled || disabledProp;

  const onPress = React.useCallback(
    (ev: GestureResponderEvent) => {
      if (isDisabled) return;

      if (type === 'single') {
        if (isExpanded && !collapsible) {
          // Non-collapsible single: do not close the open item
          onPressProp?.(ev);
          return;
        }
        // Single collapsible: toggle; Single not expanded: expand
        onValueChange(isExpanded ? '' : itemValue);
      } else {
        // Multiple: toggle this item in the array
        const currentValue = (Array.isArray(rootValue) ? rootValue : []) as string[];
        if (isExpanded) {
          onValueChange(currentValue.filter((v) => v !== itemValue));
        } else {
          onValueChange([...currentValue, itemValue]);
        }
      }

      onPressProp?.(ev);
    },
    [isDisabled, type, collapsible, isExpanded, itemValue, rootValue, onValueChange, onPressProp]
  );

  const Component = asChild ? Slot : Pressable;

  return (
    <Component
      ref={ref}
      role="button"
      aria-expanded={isExpanded}
      aria-disabled={isDisabled || undefined}
      onPress={onPress}
      disabled={isDisabled || undefined}
      {...props}
    />
  );
});

Trigger.displayName = 'AccordionTrigger';

// ---------------------------------------------------------------------------
// Content
// ---------------------------------------------------------------------------

const Content = React.forwardRef<View, ContentProps>(function Content(
  { asChild, forceMount, ...props },
  ref
) {
  const { isExpanded } = useItemContext();

  if (!forceMount && !isExpanded) {
    return null;
  }

  const Component = asChild ? Slot : View;

  return (
    <Component
      ref={ref}
      role="region"
      {...props}
    />
  );
});

Content.displayName = 'AccordionContent';

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

export { Root, Item, Header, Trigger, Content, useRootContext, useItemContext };
