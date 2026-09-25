import { useCallback, useEffect, useRef, useState } from 'react';
import type { StoreSettings, StoreSettingsChoice, StoreSettingsChoices } from '@tallyui/core';
import { resolveStoreSettings } from './resolve-store-settings';
import type { ResolveStoreSettingsOptions } from './resolve-store-settings';

export type StoreSettingsState =
  | { state: 'loading' }
  | { state: 'ready'; settings: StoreSettings; choice?: StoreSettingsChoice }
  | { state: 'choose'; choices: StoreSettingsChoices; initial?: StoreSettingsChoice; choose: (choice: StoreSettingsChoice) => void }
  | { state: 'error'; error: unknown; retry: () => void }
  | { state: 'unsupported' };

// One object, so re-entering loading while already loading doesn't re-render.
const LOADING: StoreSettingsState = { state: 'loading' };

/**
 * Resolves the store settings on mount, and again when `connector` or `context` changes by
 * identity (a store switch), so memoise both; the last request wins. `loadChoice` and
 * `saveChoice` are read when a request starts, so inline functions don't trigger a re-resolve.
 *
 * ```tsx
 * const store = useStoreSettings({ connector, context, loadChoice, saveChoice });
 * if (store.state === 'choose')
 *   return <StoreSettingsChoiceScreen choices={store.choices} initial={store.initial} onSubmit={store.choose} />;
 * if (store.state !== 'ready') return <Loading />; // or an error with store.retry, or the app's own config when unsupported
 * const syncContext = withPricingContext(context, store.settings); // for the replication
 * return <TaxProvider {...taxProviderProps(store.settings)}>{children}</TaxProvider>;
 * ```
 */
export function useStoreSettings(options: ResolveStoreSettingsOptions): StoreSettingsState {
  const { connector, context } = options;
  const optionsRef = useRef(options);
  optionsRef.current = options;
  const requestRef = useRef(0);
  const [state, setState] = useState<StoreSettingsState>(LOADING);

  const resolve = useCallback((choice?: StoreSettingsChoice) => {
    const request = ++requestRef.current;
    const current = () => request === requestRef.current;
    setState(LOADING);
    resolveStoreSettings(optionsRef.current, choice).then(
      (result) => {
        if (!current()) return;
        if (result.status === 'ready') setState({ state: 'ready', settings: result.settings, choice: result.choice });
        else if (result.status === 'choose') setState({ state: 'choose', choices: result.choices, initial: result.initial, choose: resolve });
        else setState({ state: 'unsupported' });
      },
      // A retry keeps the choice that failed: a new pick is saved only once it resolves.
      (error: unknown) => {
        if (current()) setState({ state: 'error', error, retry: () => resolve(choice) });
      },
    );
  }, []);

  useEffect(() => {
    resolve();
    // Discards the in-flight result on a store switch or unmount.
    return () => {
      requestRef.current += 1;
    };
  }, [connector, context, resolve]);

  return state;
}
