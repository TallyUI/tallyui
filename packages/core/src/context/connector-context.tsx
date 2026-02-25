import { createContext, useContext, type ReactNode } from 'react';

import type { TallyConnector } from '../types';

/**
 * React context that holds the active connector.
 * Wrap your app (or a section of it) in <ConnectorProvider> to make
 * the connector's traits available to all Tally UI components below.
 */
const ConnectorContext = createContext<TallyConnector | null>(null);

export interface ConnectorProviderProps {
  connector: TallyConnector;
  children: ReactNode;
}

export function ConnectorProvider({ connector, children }: ConnectorProviderProps) {
  return (
    <ConnectorContext.Provider value={connector}>
      {children}
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
 * Convenience hook: grab just the customer traits from the active connector.
 * Returns undefined if the connector doesn't implement customer traits.
 */
export function useCustomerTraits() {
  const connector = useConnector();
  return connector.traits.customer;
}
