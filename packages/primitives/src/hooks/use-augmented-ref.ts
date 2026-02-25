// Forked from rn-primitives.
// Licensed under the MIT License.

import * as React from 'react';

interface AugmentRefProps<T> {
  ref?: React.Ref<T>;
  methods?: Record<string, (...args: any[]) => any>;
  deps?: any[];
}

function useAugmentedRef<T>({
  ref,
  methods,
  deps = [],
}: AugmentRefProps<T>) {
  const augmentedRef = React.useRef<T>(null);
  React.useImperativeHandle(
    ref,
    () => {
      if (!augmentedRef.current) return null as unknown as T;
      return Object.assign(augmentedRef.current, {
        ...methods,
      });
    },
    [augmentedRef.current, methods]
  );
  return augmentedRef;
}

export { useAugmentedRef };
export type { AugmentRefProps };
