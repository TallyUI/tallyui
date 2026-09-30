import { useCallback, useEffect, useRef, useState } from 'react';
import { errorKind, SignInError } from '@tallyui/core';
import type { StoreSettings, StoreSettingsChoice, StoreSettingsChoices, TaxRounding } from '@tallyui/core';
import { resolveStoreSettings } from './resolve-store-settings';
import type { ResolveStoreSettingsOptions } from './resolve-store-settings';

export type StoreSettingsState =
  | { state: 'loading' }
  | { state: 'ready'; settings: StoreSettings; choice?: StoreSettingsChoice }
  | { state: 'choose'; choices: StoreSettingsChoices; initial?: StoreSettingsChoice; choose: (choice: StoreSettingsChoice) => void }
  | { state: 'error'; error: unknown; retry: () => void; nextRetryAt?: number }
  | { state: 'unsupported' };

// One object, so re-entering loading while already loading doesn't re-render.
const LOADING: StoreSettingsState = { state: 'loading' };

export class StoreCapabilitiesUnavailableError extends Error {
  constructor(cause?: unknown) {
    super('Store capabilities unavailable', { cause });
    this.name = 'StoreCapabilitiesUnavailableError';
  }
}

// Exponential retry for unknown rounding: 5 seconds, doubling up to 5 minutes.
const INITIAL_RETRY_MS = 5_000;
const MAX_RETRY_MS = 5 * 60_000;

// The store's taxRounding (#324): the context's capabilities, else one read of the connector's.
function readTaxRounding({ connector, context }: ResolveStoreSettingsOptions): Promise<TaxRounding | undefined> {
  if (context.capabilities) return Promise.resolve(context.capabilities.taxRounding);
  if (!connector.storeSettings || !connector.capabilities) return Promise.resolve(undefined);
  const read = connector.capabilities;
  return Promise.resolve().then(() => read(context)).then(
    (capabilities) => {
      if (!capabilities) throw new StoreCapabilitiesUnavailableError();
      return capabilities.taxRounding;
    },
    (cause) => {
      // The till must fix its own credentials or software; retrying cannot help.
      if (errorKind(cause) === 'till' || (cause instanceof SignInError && cause.code === 'invalid_credentials')) throw cause;
      throw new StoreCapabilitiesUnavailableError(cause);
    },
  );
}

/**
 * Resolves the store settings on mount, and again when `connector` or `context` changes by
 * identity (a store switch), so memoise both; the last request wins. `loadChoice` and
 * `saveChoice` are read when a request starts, so inline functions don't trigger a re-resolve.
 * The ready settings carry the store's `taxRounding` from the capabilities, so `taxProviderProps` passes it on (#324).
 * The capabilities are read beside the settings, before `ready`, so each resolve emits the settings once, with the
 * rounding already known: no later change of `settings` holds a sale.
 * Unknown rounding keeps settings unresolved and retries by itself; show "Can't reach the store's settings yet. Retrying…" while `nextRetryAt` is set.
 * A till-class or invalid-credentials sign-in error is not retried by itself, so the app prompts to sign in or update the till.
 * An app shows a sign-in prompt when the `error` state's error is a `ConnectorUnauthorizedError` with `code: 'unauthorized'`
 * or a `SignInError` with `code: 'invalid_credentials'`, and an update prompt for `code: 'till_update_required'`.
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
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const retryDelayRef = useRef(INITIAL_RETRY_MS);
  const [state, setState] = useState<StoreSettingsState>(LOADING);

  // `from`, when given, is the request that created the `choose`/`retry` calling this: a call
  // arriving after a store switch made that request stale is ignored, so it can't apply an old
  // pick to the new store. `known`, when given, is the rounding that request already read, so
  // a pick doesn't read it again.
  const resolve = useCallback((choice?: StoreSettingsChoice, from?: number, known?: Promise<TaxRounding | undefined>) => {
    if (from !== undefined && from !== requestRef.current) return;
    clearTimeout(retryTimerRef.current);
    const request = ++requestRef.current;
    const current = () => request === requestRef.current;
    setState(LOADING);
    const rounding = known ?? readTaxRounding(optionsRef.current);
    Promise.all([resolveStoreSettings(optionsRef.current, choice), rounding]).then(
      ([result, taxRounding]) => {
        if (!current()) return;
        retryDelayRef.current = INITIAL_RETRY_MS;
        if (result.status === 'ready')
          setState({ state: 'ready', settings: taxRounding ? { ...result.settings, taxRounding } : result.settings, choice: result.choice });
        else if (result.status === 'choose')
          setState({ state: 'choose', choices: result.choices, initial: result.initial, choose: (pick) => resolve(pick, request, rounding) });
        else setState({ state: 'unsupported' });
      },
      // A retry keeps the choice that failed: a new pick is saved only once it resolves.
      (error: unknown) => {
        if (!current()) return;
        const retry = () => resolve(choice, request);
        if (error instanceof StoreCapabilitiesUnavailableError) {
          const delay = retryDelayRef.current;
          const nextRetryAt = Date.now() + delay;
          retryDelayRef.current = Math.min(delay * 2, MAX_RETRY_MS);
          retryTimerRef.current = setTimeout(retry, delay);
          setState({ state: 'error', error, retry, nextRetryAt });
        } else setState({ state: 'error', error, retry });
      },
    );
  }, []);

  useEffect(() => {
    resolve();
    // Discards the in-flight result on a store switch or unmount.
    return () => {
      clearTimeout(retryTimerRef.current);
      retryDelayRef.current = INITIAL_RETRY_MS;
      requestRef.current += 1;
    };
  }, [connector, context, resolve]);

  return state;
}
