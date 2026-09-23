import { createContext, useContext, type ReactNode } from 'react';

import type { TallyConnector, TraitContext } from '../types';

/**
 * React context that holds the active connector.
 * Wrap your app (or a section of it) in <ConnectorProvider> to make
 * the connector's traits available to all Tally UI components below.
 */
const ConnectorContext = createContext<TallyConnector | null>(null);

const EMPTY_TRAIT_CONTEXT: TraitContext = {};
const TraitContextContext = createContext<TraitContext>(EMPTY_TRAIT_CONTEXT);

export interface ConnectorProviderProps {
  connector: TallyConnector;
  /**
   * Store-level facts passed to traits that need them, such as the store
   * currency for backends whose product documents omit it.
   */
  traitContext?: TraitContext;
  children: ReactNode;
}

export function ConnectorProvider({ connector, traitContext, children }: ConnectorProviderProps) {
  return (
    <ConnectorContext.Provider value={connector}>
      <TraitContextContext.Provider value={traitContext ?? EMPTY_TRAIT_CONTEXT}>
        {children}
      </TraitContextContext.Provider>
    </ConnectorContext.Provider>
  );
}

/**
 * Access the active connector. Throws if used outside a ConnectorProvider.
 */
export function useConnector(): TallyConnector {
  const connector = useContext(ConnectorContext);
  if (!connector) {
    throw new Error(
      'useConnector() must be used within a <ConnectorProvider>. ' +
      'Wrap your app with <ConnectorProvider connector={yourConnector}>.'
    );
  }
  return connector;
}

/**
 * Convenience hook: grab just the product traits from the active connector.
 */
export function useProductTraits() {
  const connector = useConnector();
  return connector.traits.product;
}

/**
 * The store-level TraitContext given to the nearest ConnectorProvider.
 */
export function useTraitContext(): TraitContext {
  return useContext(TraitContextContext);
}

/**
 * Convenience hook: grab just the customer traits from the active connector.
 * Returns undefined if the connector doesn't implement customer traits.
 */
export function useCustomerTraits() {
  const connector = useConnector();
  return connector.traits.customer;
}
