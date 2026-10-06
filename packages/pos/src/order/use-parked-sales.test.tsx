import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { createRxDatabase, type RxDatabase } from 'rxdb';
import { getRxStorageMemory } from 'rxdb/plugins/storage-memory';
import { wrappedValidateAjvStorage } from 'rxdb/plugins/validate-ajv';
import { createOrderBuilder } from './order-builder';
import { orderDraftSchema, writeOrderDraft } from './order-drafts';
import { useParkedSales } from './use-parked-sales';

let db: RxDatabase;

beforeEach(async () => {
  db = await createRxDatabase({
    name: `useparkedsales${Math.random().toString(36).slice(2)}`,
    storage: wrappedValidateAjvStorage({ storage: getRxStorageMemory() }),
    multiInstance: false,
  });
  await db.addCollections({ pos_drafts: { schema: orderDraftSchema } });
});

afterEach(async () => {
  cleanup();
  await db.remove();
});

it('lists drafts newest first, updates live, and discards from the collection and list', async () => {
  const orders = ['first', 'second', 'third'].map((id) => createOrderBuilder({
    id, currency: 'EUR', taxContext: { pricesIncludeTax: false, getTaxRatePpm: () => 0 },
  }).getSnapshot());
  await writeOrderDraft(db.pos_drafts, orders[0]);
  await writeOrderDraft(db.pos_drafts, orders[1]);
  await (await db.pos_drafts.findOne('first').exec())!.incrementalPatch({ parkedAt: '2026-09-20T10:00:00.000Z' });
  await (await db.pos_drafts.findOne('second').exec())!.incrementalPatch({ parkedAt: '2026-09-20T12:00:00.000Z' });

  const { result } = renderHook(() => useParkedSales(db.pos_drafts));
  await waitFor(() => expect(result.current.parked.map(({ id }) => id)).toEqual(['second', 'first']));

  await act(async () => {
    await writeOrderDraft(db.pos_drafts, orders[2]);
    await (await db.pos_drafts.findOne('third').exec())!.incrementalPatch({ parkedAt: '2026-09-20T11:00:00.000Z' });
  });
  await waitFor(() => expect(result.current.parked.map(({ id }) => id)).toEqual(['second', 'third', 'first']));

  await act(async () => { await result.current.discard('third'); });
  expect(await db.pos_drafts.findOne('third').exec()).toBeNull();
  await waitFor(() => expect(result.current.parked.map(({ id }) => id)).toEqual(['second', 'first']));
});

it('returns an empty list without drafts and rejects discard', async () => {
  const { result } = renderHook(() => useParkedSales(undefined));
  expect(result.current.parked).toEqual([]);
  await expect(result.current.discard('missing')).rejects.toThrow('useParkedSales: discard() needs the drafts collection');
});
