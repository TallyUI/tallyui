import { describe, it, expect } from 'vitest';
import { renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { ConnectorProvider, useConnector, useProductTraits, useStockOverlaid, useStockOverlayAsOf } from '../context/connector-context';
import type { StockReconcileAdapter, TallyConnector } from '../types';

/**
 * Minimal connector stub that satisfies the TallyConnector interface
 * just enough for context tests.
 */
const stubConnector: TallyConnector = {
  id: 'test',
  name: 'Test Connector',
  description: 'Stub for testing',
  auth: {
    type: 'none',
    fields: [],
    getHeaders: () => ({}),
  },
  schemas: {
    products: {
      version: 0,
      primaryKey: 'id',
      type: 'object',
      properties: { id: { type: 'string', maxLength: 100 } },
      required: ['id'],
    },
  },
  traits: {
    product: {
      getId: (doc) => doc.id,
      getName: (doc) => doc.name,
      getSku: () => undefined,
      getPrices: () => [],
      getStock: () => ({ status: 'unknown' }),
      getPrice: () => undefined,
      getRegularPrice: () => undefined,
      getSalePrice: () => undefined,
      isOnSale: () => false,
      getImageUrl: () => undefined,
      getImageUrls: () => [],
      getDescription: () => undefined,
      getStockStatus: () => 'unknown',
      getStockQuantity: () => null,
      hasVariants: () => false,
      isSellable: () => true,
      getVariantCount: () => 1,
      getType: () => 'simple',
      getBarcode: () => undefined,
      getCategoryNames: () => [],
    },
  },
  sync: {
    products: {
      fetchAllIds: async () => [],
      fetchByIds: async () => [],
    },
  },
};

function wrapper({ children }: { children: ReactNode }) {
  return <ConnectorProvider connector={stubConnector}>{children}</ConnectorProvider>;
}

describe('ConnectorProvider + useConnector', () => {
  it('provides the connector through context', () => {
    const { result } = renderHook(() => useConnector(), { wrapper });

    expect(result.current).toBe(stubConnector);
    expect(result.current.id).toBe('test');
    expect(result.current.name).toBe('Test Connector');
  });

  it('throws when useConnector is called outside a provider', () => {
    expect(() => {
      renderHook(() => useConnector());
    }).toThrow('useConnector() must be used within a <ConnectorProvider>');
  });
});

describe('useProductTraits', () => {
  it('returns the product traits from the active connector', () => {
    const { result } = renderHook(() => useProductTraits(), { wrapper });

    expect(result.current).toBe(stubConnector.traits.product);
    expect(typeof result.current.getName).toBe('function');
    expect(typeof result.current.getPrice).toBe('function');
  });

  it('traits work against a mock document', () => {
    const { result } = renderHook(() => useProductTraits(), { wrapper });
    const traits = result.current;

    const doc = { id: '1', name: 'Widget' };
    expect(traits.getName(doc)).toBe('Widget');
    expect(traits.getId(doc)).toBe('1');
  });

  it('throws when called outside a provider', () => {
    expect(() => {
      renderHook(() => useProductTraits());
    }).toThrow('useConnector() must be used within a <ConnectorProvider>');
  });
});

type StockDoc = { id: string; qty: number };
const stockAdapter: StockReconcileAdapter<StockDoc> = {
  fetchPages: async function* () {},
  overlay: (d, stock) => (stock.has(d.id) && stock.get(d.id) !== d.qty ? { qty: stock.get(d.id) as number } : undefined),
};
const stockConnector = (reconcile: boolean) => ({
  ...stubConnector,
  ...(reconcile ? { reconcile: { stock: stockAdapter } } : {}),
}) as unknown as TallyConnector;
const stockDocs: StockDoc[] = [{ id: 'p1', qty: 3 }, { id: 'p2', qty: 5 }];

function stockWrapper(connector: TallyConnector, overlay?: ReadonlyMap<string, unknown>, asOf?: string) {
  return ({ children }: { children: ReactNode }) => (
    <ConnectorProvider connector={connector} stockOverlay={overlay} stockOverlayAsOf={asOf}>{children}</ConnectorProvider>
  );
}

describe('useStockOverlaid', () => {
  it('returns the same array without a provider', () => {
    const { result } = renderHook(() => useStockOverlaid(stockDocs));
    expect(result.current).toBe(stockDocs);
  });

  it('returns the same array with a provider but no overlay', () => {
    const { result } = renderHook(() => useStockOverlaid(stockDocs), { wrapper: stockWrapper(stockConnector(true)) });
    expect(result.current).toBe(stockDocs);
  });

  it('merges the overlay into a new array, leaving the input docs unchanged', () => {
    const overlay = new Map([['p1', 9]]);
    const { result } = renderHook(() => useStockOverlaid(stockDocs), { wrapper: stockWrapper(stockConnector(true), overlay) });
    expect(result.current).not.toBe(stockDocs);
    expect(result.current).toEqual([{ id: 'p1', qty: 9 }, { id: 'p2', qty: 5 }]);
    expect(stockDocs[0]).toEqual({ id: 'p1', qty: 3 });
  });

  it('returns the same array when the connector has no reconcile.stock', () => {
    const overlay = new Map([['p1', 9]]);
    const { result } = renderHook(() => useStockOverlaid(stockDocs), { wrapper: stockWrapper(stockConnector(false), overlay) });
    expect(result.current).toBe(stockDocs);
  });

  it('returns the identical array when re-rendered with the same inputs', () => {
    const overlay = new Map([['p1', 9]]);
    const { result, rerender } = renderHook(() => useStockOverlaid(stockDocs), { wrapper: stockWrapper(stockConnector(true), overlay) });
    const first = result.current;
    rerender();
    expect(result.current).toBe(first);
  });

  it('returns the identical array when the overlay has no entry for any product', () => {
    const overlay = new Map([['no-such-id', 9]]);
    const { result } = renderHook(() => useStockOverlaid(stockDocs), { wrapper: stockWrapper(stockConnector(true), overlay) });
    expect(result.current).toBe(stockDocs);
  });
});

describe('useStockOverlayAsOf', () => {
  it('is undefined without a provider', () => {
    const { result } = renderHook(() => useStockOverlayAsOf());
    expect(result.current).toBeUndefined();
  });

  it('returns the provider\'s stockOverlayAsOf', () => {
    const asOf = '2026-09-29T00:00:00.000Z';
    const { result } = renderHook(() => useStockOverlayAsOf(), {
      wrapper: stockWrapper(stockConnector(true), new Map([['p1', 9]]), asOf),
    });
    expect(result.current).toBe(asOf);
  });

  it('is undefined when the connector has no reconcile.stock', () => {
    const asOf = '2026-09-29T00:00:00.000Z';
    const { result } = renderHook(() => useStockOverlayAsOf(), {
      wrapper: stockWrapper(stockConnector(false), new Map([['p1', 9]]), asOf),
    });
    expect(result.current).toBeUndefined();
  });
});
