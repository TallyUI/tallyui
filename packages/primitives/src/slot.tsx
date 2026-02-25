// Forked from rn-primitives slot implementation.
// Original code licensed under MIT — https://github.com/roninoss/rn-primitives
// Includes patterns from WorkOS/Radix Primitives (MIT).

import * as React from 'react';
import {
  StyleSheet,
  type PressableStateCallbackType,
  type PressableProps as RNPressableProps,
  type ImageStyle as RNImageStyle,
  type StyleProp,
} from 'react-native';

/**
 * Combines multiple refs into a single callback ref that sets all of them.
 */
function composeRefs<T>(...refs: (React.Ref<T> | undefined)[]) {
  return (node: T) =>
    refs.forEach((ref) => {
      if (typeof ref === 'function') {
        ref(node);
      } else if (ref != null) {
        (ref as React.RefObject<T>).current = node;
      }
    });
}

type AnyProps = Record<string, any>;

/**
 * Merges slot props with child props. Event handlers (on*) are composed so
 * both fire. Styles are merged via combineStyles. className strings are joined
 * with a space. Everything else: child overrides slot.
 */
function mergeProps(slotProps: AnyProps, childProps: AnyProps) {
  // Start with child props as the base — they take priority.
  const overrideProps = { ...childProps };

  for (const propName in childProps) {
    const slotPropValue = slotProps[propName];
    const childPropValue = childProps[propName];

    const isHandler = /^on[A-Z]/.test(propName);
    if (isHandler) {
      // If both slot and child define the handler, compose them.
      if (slotPropValue && childPropValue) {
        overrideProps[propName] = (...args: unknown[]) => {
          childPropValue(...args);
          slotPropValue(...args);
        };
      }
      // If only the slot has the handler, use it.
      else if (slotPropValue) {
        overrideProps[propName] = slotPropValue;
      }
    }
    // Merge style objects/functions.
    else if (propName === 'style') {
      overrideProps[propName] = combineStyles(slotPropValue, childPropValue);
    }
    // Join className strings.
    else if (propName === 'className') {
      overrideProps[propName] = [slotPropValue, childPropValue].filter(Boolean).join(' ');
    }
  }

  return { ...slotProps, ...overrideProps };
}

type PressableStyle = RNPressableProps['style'];
type ImageStyle = StyleProp<RNImageStyle>;
type Style = PressableStyle | ImageStyle;

/**
 * Merges two style values, handling the case where either or both may be
 * Pressable state callback functions rather than plain style objects.
 */
function combineStyles(slotStyle?: Style, childValue?: Style) {
  if (typeof slotStyle === 'function' && typeof childValue === 'function') {
    return (state: PressableStateCallbackType) => {
      return StyleSheet.flatten([slotStyle(state), childValue(state)]);
    };
  }
  if (typeof slotStyle === 'function') {
    return (state: PressableStateCallbackType) => {
      return childValue ? StyleSheet.flatten([slotStyle(state), childValue]) : slotStyle(state);
    };
  }
  if (typeof childValue === 'function') {
    return (state: PressableStateCallbackType) => {
      return slotStyle ? StyleSheet.flatten([slotStyle, childValue(state)]) : childValue(state);
    };
  }

  return StyleSheet.flatten([slotStyle, childValue].filter(Boolean));
}

/**
 * Returns true when children is text-only (a string or array of strings).
 */
function isTextChildren(
  children: React.ReactNode | ((state: PressableStateCallbackType) => React.ReactNode)
) {
  return Array.isArray(children)
    ? children.every((child) => typeof child === 'string')
    : typeof children === 'string';
}

/**
 * Slot implements the "asChild" composition pattern. It renders its single
 * child element while merging the Slot's own props and ref onto it. This lets
 * a parent component define behavior (event handlers, accessibility props, etc.)
 * while the consumer controls the rendered element.
 *
 * Throws if the child is plain text (must be a valid React element).
 */
function Slot<T extends React.ElementType>(props: React.ComponentProps<T>) {
  const { children, ref: forwardedRef, ...restOfProps } = props;

  if (isTextChildren(children)) {
    throw new Error(
      'Slot: children must be a valid React element, not a string. ' +
        'Wrap text in a <Text> component.'
    );
  }

  if (!React.isValidElement(children)) {
    return null;
  }

  const childrenProps = (children.props as Record<string, any>) ?? {};

  // Unwrap Fragment children — apply Slot to each child individually.
  if (children.type === React.Fragment) {
    return (
      <>
        {React.Children.toArray(childrenProps.children).map((child): any =>
          React.isValidElement(child)
            ? Slot({ ...restOfProps, ref: forwardedRef, children: child })
            : child
        )}
      </>
    );
  }

  const { ref: childRef, ...childProps } = childrenProps;

  return React.cloneElement(children, {
    ...mergeProps(restOfProps, childProps),
    ...(children.type === 'function'
      ? {}
      : {
          ref: forwardedRef ? composeRefs(forwardedRef, childRef) : childRef,
        }),
  } as unknown as Partial<React.ComponentProps<T>>);
}

Slot.displayName = 'Slot';

export { Slot, composeRefs, mergeProps };
