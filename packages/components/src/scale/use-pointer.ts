/** Port of WCPOS v2 `packages/components/src/lib/device.ts`, without the override context. */
import { useCallback, useMemo, useSyncExternalStore } from 'react';
import { Platform } from 'react-native';
import type { Pointer } from '@tallyui/theme';

export function usePointer(): Pointer {
  const queries = useMemo(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return [];
    }
    return [window.matchMedia('(pointer: fine)'), window.matchMedia('(hover: hover)')];
  }, []);
  const subscribe = useCallback((notify: () => void) => {
    for (const query of queries) query.addEventListener('change', notify);
    return () => {
      for (const query of queries) query.removeEventListener('change', notify);
    };
  }, [queries]);
  const getSnapshot = useCallback((): Pointer => (
    queries.length === 2 && queries.every((query) => query.matches) ? 'fine' : 'coarse'
  ), [queries]);
  return useSyncExternalStore(subscribe, getSnapshot, () => 'coarse');
}
