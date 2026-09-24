import { describe, it, expect } from 'vitest';
import { renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';

import { ConnectorProvider, useProductStock } from './context/connector-context';
import { getProductStock, withStockOverlay } from './stock-overlay';
import type { StockReconcileAdapter, TallyConnector } from './types';

type Doc = { id: string; qty: number };
const doc: Doc = { id: 'p1', qty: 3 };
const getStock = (d: Doc) => ({ status: d.qty > 0 ? 'in_stock' as const : 'out_of_stock' as const, quantity: d.qty });
const adapter: StockReconcileAdapter<Doc> = {
  fetchPages: async function* () {},
  overlay: (d, stock) => (stock.has(d.id) && stock.get(d.id) !== d.qty ? { qty: stock.get(d.id) as number } : undefined),
};
const connector = (reconcile: boolean) => ({
  traits: { product: { getStock } },
  ...(reconcile ? { reconcile: { stock: adapter } } : {}),
}) as unknown as TallyConnector;

describe('withStockOverlay / getProductStock', () => {
  it('merges the overlay into a copy and falls back to the document', () => {
    expect(withStockOverlay(doc, adapter, undefined)).toBe(doc);
    expect(withStockOverlay(doc, adapter, new Map([['p1', 0]]))).toEqual({ id: 'p1', qty: 0 });
    expect(doc.qty).toBe(3);
    expect(getProductStock(doc, { getStock } as any, adapter, new Map([['p1', 0]]))).toEqual({ status: 'out_of_stock', quantity: 0 });
    expect(getProductStock(doc, { getStock } as any, undefined, new Map([['p1', 0]]))).toEqual({ status: 'in_stock', quantity: 3 });
  });
});

describe('useProductStock', () => {
  const asOf = '2026-09-24T01:02:03.000Z';
  const render = (c: TallyConnector, overlay?: ReadonlyMap<string, unknown>) =>
    renderHook(() => useProductStock(doc), {
      wrapper: ({ children }: { children: ReactNode }) => (
        <ConnectorProvider connector={c} stockOverlay={overlay} stockOverlayAsOf={overlay ? asOf : undefined}>{children}</ConnectorProvider>
      ),
    }).result.current;

  it('returns getStock(doc) without asOf when there is no overlay', () => {
    expect(render(connector(true))).toEqual({ status: 'in_stock', quantity: 3 });
  });

  it('returns the overlay stock with asOf when there is one', () => {
    expect(render(connector(true), new Map([['p1', 7]]))).toEqual({ status: 'in_stock', quantity: 7, asOf });
  });

  it('omits asOf when the connector does not reconcile stock', () => {
    expect(render(connector(false), new Map([['p1', 7]]))).toEqual({ status: 'in_stock', quantity: 3 });
  });
});
