import { createContext, useContext, useMemo, type ReactNode } from 'react';

import { getProductStock } from '../stock-overlay';
import type { StockLevel, TallyConnector, TraitContext } from '../types';

/**
 * React context that holds the active connector.
 * Wrap your app (or a section of it) in <ConnectorProvider> to make
 * the connector's traits available to all Tally UI components below.
 */
const ConnectorContext = createContext<TallyConnector | null>(null);

const EMPTY_TRAIT_CONTEXT: TraitContext = {};
const TraitContextContext = createContext<TraitContext>(EMPTY_TRAIT_CONTEXT);

interface StockOverlayValue { overlay?: ReadonlyMap<string, unknown>; asOf?: string }
const EMPTY_STOCK_OVERLAY: StockOverlayValue = {};
const StockOverlayContext = createContext<StockOverlayValue>(EMPTY_STOCK_OVERLAY);

export interface ConnectorProviderProps {
  connector: TallyConnector;
  /**
   * Store-level facts passed to traits that need them, such as the store
   * currency for backends whose product documents omit it.
   */
  traitContext?: TraitContext;
  /** Reconciled stock (ADR-060), e.g. from `stockOverlay$` in `@tallyui/pos`. */
  stockOverlay?: ReadonlyMap<string, unknown>;
  /** ISO time the overlay was last confirmed, e.g. from `stockOverlayAsOf$`. */
  stockOverlayAsOf?: string;
  children: ReactNode;
}

export function ConnectorProvider({ connector, traitContext, stockOverlay, stockOverlayAsOf, children }: ConnectorProviderProps) {
  const overlay = useMemo(
    () => (stockOverlay || stockOverlayAsOf ? { overlay: stockOverlay, asOf: stockOverlayAsOf } : EMPTY_STOCK_OVERLAY),
    [stockOverlay, stockOverlayAsOf],
  );
  return (
    <ConnectorContext.Provider value={connector}>
      <TraitContextContext.Provider value={traitContext ?? EMPTY_TRAIT_CONTEXT}>
        <StockOverlayContext.Provider value={overlay}>{children}</StockOverlayContext.Provider>
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
 * The product's stock, from the reconciled overlay given to the nearest
 * ConnectorProvider where it has an entry, otherwise from the document.
 * `asOf` is set only when an overlay is given and the connector reconciles stock.
 */
export function useProductStock(doc: any): StockLevel & { asOf?: string } {
  const connector = useConnector();
  const { overlay, asOf } = useContext(StockOverlayContext);
  const adapter = connector.reconcile?.stock;
  if (!overlay) return connector.traits.product.getStock(doc);
  // The helpers never mutate the map; they take Map for the adapter contract.
  const stock = getProductStock(doc, connector.traits.product, adapter, overlay as Map<string, unknown>);
  return adapter && asOf ? { ...stock, asOf } : stock;
}

/**
 * Convenience hook: grab just the customer traits from the active connector.
 * Returns undefined if the connector doesn't implement customer traits.
 */
export function useCustomerTraits() {
  const connector = useConnector();
  return connector.traits.customer;
}
