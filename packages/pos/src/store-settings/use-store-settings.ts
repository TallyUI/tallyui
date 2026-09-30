import { useCallback, useEffect, useRef, useState } from 'react';
import type { StoreSettings, StoreSettingsChoice, StoreSettingsChoices, TaxRounding } from '@tallyui/core';
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

// The store's taxRounding (#324): the context's capabilities, else one read of the connector's. A failure or no
// value leaves the field out, the default rounding; so does a connector without `capabilities`, with no read.
function readTaxRounding({ connector, context }: ResolveStoreSettingsOptions): Promise<TaxRounding | undefined> {
  if (context.capabilities) return Promise.resolve(context.capabilities.taxRounding);
  if (!connector.storeSettings || !connector.capabilities) return Promise.resolve(undefined);
  const read = connector.capabilities;
  return Promise.resolve().then(() => read(context)).then((capabilities) => capabilities?.taxRounding, () => undefined);
}

/**
 * Resolves the store settings on mount, and again when `connector` or `context` changes by
 * identity (a store switch), so memoise both; the last request wins. `loadChoice` and
 * `saveChoice` are read when a request starts, so inline functions don't trigger a re-resolve.
 * The ready settings carry the store's `taxRounding` from the capabilities, so `taxProviderProps` passes it on (#324).
 * The capabilities are read beside the settings, before `ready`, so each resolve emits the settings once, with the
 * rounding already known: no later change of `settings` holds a sale.
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

  // `from`, when given, is the request that created the `choose`/`retry` calling this: a call
  // arriving after a store switch made that request stale is ignored, so it can't apply an old
  // pick to the new store. `known`, when given, is the rounding that request already read, so
  // a pick doesn't read it again.
  const resolve = useCallback((choice?: StoreSettingsChoice, from?: number, known?: Promise<TaxRounding | undefined>) => {
    if (from !== undefined && from !== requestRef.current) return;
    const request = ++requestRef.current;
    const current = () => request === requestRef.current;
    setState(LOADING);
    const rounding = known ?? readTaxRounding(optionsRef.current);
    Promise.all([resolveStoreSettings(optionsRef.current, choice), rounding]).then(
      ([result, taxRounding]) => {
        if (!current()) return;
        if (result.status === 'ready')
          setState({ state: 'ready', settings: taxRounding ? { ...result.settings, taxRounding } : result.settings, choice: result.choice });
        else if (result.status === 'choose')
          setState({ state: 'choose', choices: result.choices, initial: result.initial, choose: (pick) => resolve(pick, request, rounding) });
        else setState({ state: 'unsupported' });
      },
      // A retry keeps the choice that failed: a new pick is saved only once it resolves.
      (error: unknown) => {
        if (current()) setState({ state: 'error', error, retry: () => resolve(choice, request) });
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
