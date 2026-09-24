import { describe, it, expect, vi, afterEach } from 'vitest';
import type { SyncContext } from '@tallyui/core';

import { medusaStockReconcile } from './stock';
import { medusaAdminUserConnector, medusaConnector } from '../index';

const context: SyncContext = { connectorId: 'medusa', baseUrl: 'https://medusa.test', headers: { Authorization: 'Bearer t' } };

const page = (ids: string[], count: number) => new Response(JSON.stringify({
  inventory_items: ids.map((id) => ({ id, location_levels: [{ stocked_quantity: 10, reserved_quantity: 1, location_id: 'sloc_1' }] })),
  count, offset: 0, limit: 1000,
}));

describe('medusaStockReconcile', () => {
  afterEach(() => vi.restoreAllMocks());

  it('is wired as reconcile.stock on both connectors', () => {
    expect(medusaConnector.reconcile?.stock).toBe(medusaStockReconcile);
    expect(medusaAdminUserConnector.reconcile?.stock).toBe(medusaStockReconcile);
  });

  it('pages inventory items by offset in id order until count, with the narrow fields', async () => {
    const fetch = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(page(['iitem_1', 'iitem_2'], 1500))
      .mockResolvedValueOnce(page(['iitem_3'], 1500));

    const pages = [];
    for await (const p of medusaStockReconcile.fetchPages(context)) pages.push(p);

    expect(pages).toHaveLength(2);
    expect(pages[0].get('iitem_2')).toEqual([{ stocked_quantity: 10, reserved_quantity: 1 }]);
    expect(fetch).toHaveBeenCalledTimes(2);
    const urls = fetch.mock.calls.map(([url]) => new URL(url as string));
    expect(urls[0].pathname).toBe('/admin/inventory-items');
    expect(urls.map((u) => Object.fromEntries(u.searchParams))).toEqual([0, 1000].map((offset) => ({
      limit: '1000', offset: String(offset),
      fields: 'id,location_levels.stocked_quantity,location_levels.reserved_quantity,location_levels.location_id',
      order: 'id',
    })));
    expect((fetch.mock.calls[0][1]!.headers as Record<string, string>).Authorization).toBe('Bearer t');
  });

  it('throws with the Medusa error message', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response(JSON.stringify({ message: 'Unauthorized' }), { status: 401 }));
    await expect(medusaStockReconcile.fetchPages(context)[Symbol.asyncIterator]().next()).rejects.toThrow('Medusa API error: 401: Unauthorized');
  });

  const item = (id: string, levels: Array<[number, number]>) => ({
    required_quantity: 1, variant_id: 'var_1', inventory_item_id: id,
    inventory: { id, location_levels: levels.map(([stocked_quantity, reserved_quantity]) => ({ stocked_quantity, reserved_quantity })) },
  });
  const doc = {
    id: 'prod_1',
    variants: [
      { id: 'var_1', inventory_items: [item('iitem_1', [[10, 1], [4, 0]])] },
      { id: 'var_2', inventory_items: [item('iitem_2', [[3, 0]])] },
    ],
  };
  const levels = (pairs: Array<[number, number]>) => pairs.map(([stocked_quantity, reserved_quantity]) => ({ stocked_quantity, reserved_quantity }));

  it('patches an inventory item whose reserved quantity changed', () => {
    const stock = new Map<string, unknown>([['iitem_1', levels([[10, 2], [4, 0]])], ['iitem_2', levels([[3, 0]])]]);
    const patch = medusaStockReconcile.patch(doc, stock);
    expect(patch).toEqual({
      variants: [{ id: 'var_1', inventory_items: [item('iitem_1', [[10, 2], [4, 0]])] }, doc.variants[1]],
    });
    expect(patch!.variants[1]).toBe(doc.variants[1]);
    expect(doc.variants[0].inventory_items[0].inventory.location_levels[0].reserved_quantity).toBe(1);
  });

  it('returns undefined for identical quantities in a different order', () => {
    const stock = new Map<string, unknown>([['iitem_1', levels([[4, 0], [10, 1]])], ['iitem_other', levels([[0, 0]])]]);
    expect(medusaStockReconcile.patch(doc, stock)).toBeUndefined();
  });
});
