import type { GestureResponderEvent } from 'react-native';

/**
 * State management utilities for toggle groups.
 * Handles single-select and multi-select value toggling.
 */
export const toggleGroupUtils = {
  getIsSelected(value: string | string[] | undefined, itemValue: string): boolean {
    if (value === undefined) return false;
    if (typeof value === 'string') return value === itemValue;
    return value.includes(itemValue);
  },

  getNewSingleValue(
    original: string | string[] | undefined,
    itemValue: string
  ): string | undefined {
    if (original === itemValue) return undefined;
    return itemValue;
  },

  getNewMultipleValue(
    original: string | string[] | undefined,
    itemValue: string
  ): string[] {
    if (original === undefined) return [itemValue];
    if (typeof original === 'string') {
      return original === itemValue ? [] : [original, itemValue];
    }
    if (original.includes(itemValue)) {
      return original.filter((v) => v !== itemValue);
    }
    return [...original, itemValue];
  },
};

/**
 * Mock GestureResponderEvent for use when synthesizing events
 * from keyboard interactions or other non-touch sources.
 */
export const EmptyGestureResponderEvent: GestureResponderEvent = {
  nativeEvent: {
    changedTouches: [],
    identifier: '0',
    locationX: 0,
    locationY: 0,
    pageX: 0,
    pageY: 0,
    target: '0',
    timestamp: 0,
    touches: [],
  },
  bubbles: false,
  cancelable: false,
  currentTarget: {} as any,
  defaultPrevented: false,
  eventPhase: 0,
  persist: () => {},
  isDefaultPrevented: () => false,
  isPropagationStopped: () => false,
  isTrusted: false,
  preventDefault: () => {},
  stopPropagation: () => {},
  target: {} as any,
  timeStamp: 0,
  type: '',
};
