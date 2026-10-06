import { useState } from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createRxDatabase, type RxDatabase } from 'rxdb';
import { getRxStorageMemory } from 'rxdb/plugins/storage-memory';
import { wrappedValidateAjvStorage } from 'rxdb/plugins/validate-ajv';
import { formatMoney, type StoreSettings } from '@tallyui/core';
import { PortalHost } from '@tallyui/primitives';
import { medusaConnector } from '@tallyui/connector-medusa';
import { catalogueEntries, orderDraftSchema, TaxProvider, taxProviderProps, useSale } from '@tallyui/pos';
import { ParkedSales } from '../sale/parked-sales';
import { formatStockSyncTime } from '../sale/catalogue';

const traits = medusaConnector.traits.product;
const entries = catalogueEntries([{
  id: 'shirt', title: 'Shirt', status: 'published', variants: [
    { id: 'blue', title: 'Blue', sku: 'BLUE', prices: [{ amount: 12.5, currency_code: 'eur' }] },
    { id: 'red', title: 'Red', sku: 'RED', prices: [{ amount: 10, currency_code: 'eur' }] },
  ],
}], traits);
const pricing: StoreSettings = { currency: 'EUR', pricesIncludeTax: false, taxRatesPpm: { default: 250000 } };
let db: RxDatabase;
let sale: ReturnType<typeof useSale>;

beforeEach(async () => {
  db = await createRxDatabase({
    name: `parkedsales${Math.random().toString(36).slice(2)}`,
    storage: wrappedValidateAjvStorage({ storage: getRxStorageMemory() }),
    multiInstance: false,
  });
  await db.addCollections({ pos_drafts: { schema: orderDraftSchema } });
});
afterEach(async () => {
  cleanup();
  await db.remove();
});

function renderSheet() {
  const onOpenChange = vi.fn();
  function Harness() {
    const [open, setOpen] = useState(true);
    sale = useSale(pricing, {
      registerId: 'register-1', cashierRef: 'cashier@store.test', capabilities: { orderCreate: 2 },
      drafts: db.pos_drafts,
    });
    return <ParkedSales sale={sale} drafts={db.pos_drafts} currency="EUR" open={open} hour12={false}
      onOpenChange={(value) => { onOpenChange(value); setOpen(value); }} />;
  }
  render(<TaxProvider {...taxProviderProps(pricing)}><Harness /><PortalHost /></TaxProvider>);
  return onOpenChange;
}

function addLines() {
  act(() => {
    sale.add(entries[0], traits);
    sale.add(entries[1], traits);
  });
}

async function parkCurrentSale() {
  const id = sale.order.id;
  fireEvent.click(screen.getByTestId('parked-sales-park'));
  await waitFor(() => {
    expect(screen.getByTestId(`parked-row-${id}`)).toBeTruthy();
    expect(sale.order.lineItems).toHaveLength(0);
  });
  return id;
}

it('disables Park for an empty cart, then stores the lines and shows their count and total', async () => {
  const onOpenChange = renderSheet();
  expect((screen.getByRole('button', { name: 'Park this sale' }) as HTMLButtonElement).disabled).toBe(true);
  addLines();
  act(() => sale.setCustomer({ id: 'c1', name: 'Alice' }));
  const before = sale.order;
  expect((screen.getByTestId('parked-sales-park') as HTMLButtonElement).disabled).toBe(false);
  const id = await parkCurrentSale();
  const drafts = await db.pos_drafts.find().exec();
  expect(drafts).toHaveLength(1);
  expect(JSON.parse(drafts[0].toJSON().data)).toEqual(JSON.parse(JSON.stringify(before)));
  const row = within(screen.getByTestId(`parked-row-${id}`));
  expect(row.getByText('2 items')).toBeTruthy();
  const total = formatMoney({ amount: before.totalMinor, currency: 'EUR' });
  expect(total).toBeDefined();
  expect(row.getByText(total!)).toBeTruthy();
  expect(row.getByText('Alice')).toBeTruthy();
  expect(row.getByText(formatStockSyncTime(new Date(drafts[0].parkedAt), undefined, false))).toBeTruthy();
  expect(row.getByRole('button', { name: 'Resume parked sale' })).toBeTruthy();
  expect(row.getByRole('button', { name: 'Discard parked sale' })).toBeTruthy();
  expect(screen.getByTestId('parked-sales')).toBeTruthy();
  expect(onOpenChange).not.toHaveBeenCalled();
});

it('lists two parked sales newest first and only confirms one row at a time', async () => {
  renderSheet();
  addLines();
  const first = await parkCurrentSale();
  act(() => sale.add(entries[0], traits));
  const second = await parkCurrentSale();
  await act(async () => {
    await (await db.pos_drafts.findOne(first).exec())!.incrementalPatch({ parkedAt: '2026-09-20T12:00:00.000Z' });
    await (await db.pos_drafts.findOne(second).exec())!.incrementalPatch({ parkedAt: '2026-09-20T10:00:00.000Z' });
  });
  await waitFor(() => expect(screen.getAllByTestId(/^parked-row-/).map((row) => row.dataset.testid))
    .toEqual([`parked-row-${first}`, `parked-row-${second}`]));
  expect(within(screen.getByTestId(`parked-row-${second}`)).getByText('1 item')).toBeTruthy();
  fireEvent.click(screen.getByTestId(`parked-discard-${first}`));
  fireEvent.click(screen.getByTestId(`parked-discard-${second}`));
  expect(screen.queryByTestId(`parked-discard-confirm-${first}`)).toBeNull();
  expect(screen.getByTestId(`parked-discard-${first}`)).toBeTruthy();
  expect(screen.getByTestId(`parked-discard-confirm-${second}`)).toBeTruthy();
});

it('resumes the lines into the cart and closes the sheet', async () => {
  const onOpenChange = renderSheet();
  addLines();
  const lines = sale.order.lineItems.map(({ variantId, quantity }) => ({ variantId, quantity }));
  const id = await parkCurrentSale();
  fireEvent.click(screen.getByTestId(`parked-resume-${id}`));
  await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
  expect(sale.order.lineItems.map(({ variantId, quantity }) => ({ variantId, quantity }))).toEqual(lines);
  expect(await db.pos_drafts.findOne(id).exec()).toBeNull();
  expect(screen.queryByTestId('parked-sales')).toBeNull();
});

it('refuses resume over a cart with lines and keeps the draft', async () => {
  const onOpenChange = renderSheet();
  addLines();
  const id = await parkCurrentSale();
  act(() => sale.add(entries[0], traits));
  const current = sale.order;
  fireEvent.click(screen.getByTestId(`parked-resume-${id}`));
  await waitFor(() => expect(screen.getByTestId('parked-sales-error').textContent)
    .toBe('Park or clear the current sale first'));
  expect(sale.order).toEqual(current);
  expect(await db.pos_drafts.findOne(id).exec()).not.toBeNull();
  expect(onOpenChange).not.toHaveBeenCalled();
});

it('asks before discarding, keeps the draft on Cancel, and removes it on Confirm', async () => {
  renderSheet();
  addLines();
  const id = await parkCurrentSale();
  fireEvent.click(screen.getByTestId(`parked-discard-${id}`));
  expect(screen.getByText('Discard this parked sale?')).toBeTruthy();
  expect(await db.pos_drafts.findOne(id).exec()).not.toBeNull();
  fireEvent.click(screen.getByTestId(`parked-discard-cancel-${id}`));
  expect(screen.queryByText('Discard this parked sale?')).toBeNull();
  expect(screen.getByTestId(`parked-resume-${id}`)).toBeTruthy();
  expect(await db.pos_drafts.findOne(id).exec()).not.toBeNull();
  fireEvent.click(screen.getByTestId(`parked-discard-${id}`));
  fireEvent.click(screen.getByTestId(`parked-discard-confirm-${id}`));
  await waitFor(() => expect(screen.queryByTestId(`parked-row-${id}`)).toBeNull());
  expect(await db.pos_drafts.findOne(id).exec()).toBeNull();
  expect(screen.getByTestId('parked-sales-empty').textContent).toBe('No parked sales.');
});

it('shows an empty collection and dismisses the sheet', () => {
  const onOpenChange = renderSheet();
  expect(screen.getByText('Parked sales')).toBeTruthy();
  expect(screen.getByTestId('parked-sales-empty').textContent).toBe('No parked sales.');
  fireEvent.click(screen.getByTestId('parked-sales-dismiss'));
  expect(onOpenChange).toHaveBeenCalledWith(false);
});

it('catches a thrown resume error and keeps the draft and sheet', async () => {
  const onOpenChange = renderSheet();
  addLines();
  const id = await parkCurrentSale();
  await act(async () => {
    await (await db.pos_drafts.findOne(id).exec())!.incrementalPatch({ data: '{' });
  });
  fireEvent.click(screen.getByTestId(`parked-resume-${id}`));
  await waitFor(() => expect(screen.getByTestId('parked-sales-error').textContent).toContain('SyntaxError'));
  expect(await db.pos_drafts.findOne(id).exec()).not.toBeNull();
  expect(sale.order.lineItems).toHaveLength(0);
  expect(onOpenChange).not.toHaveBeenCalled();
});
