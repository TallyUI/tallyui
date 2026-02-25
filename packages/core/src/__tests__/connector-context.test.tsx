import { describe, it, expect } from 'vitest';
import { renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { ConnectorProvider, useConnector, useProductTraits } from '../context/connector-context';
import type { TallyConnector } from '../types';

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
