import type { ReactNode } from 'react';
import { act, render, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { parseInfoCapabilities } from '@tallyui/core';
import type { ProductTraits, ServerCapabilities, StoreSettings, SyncContext, TallyConnector, TaxRounding } from '@tallyui/core';
import { taxFiguresForBasket, type BasketLine } from '../order';
import type { Order } from '../order/types';
import { useSale, type CatalogueEntry } from '../sale';
import { TaxProvider, useTax, type TaxContext } from '../tax';
import { taxProviderProps } from './map-store-settings';
import { useStoreSettings } from './use-store-settings';

// #324 end to end: the store's taxRounding reaches a sale through useStoreSettings, taxProviderProps and the real
// TaxProvider, with no app code. Each store's capabilities are an info body parsed as its connector parses it:
// Vendure's is the plugin's (vendurepos/app#60); Medusa's carries per_order/half_away_from_zero, today's rounding.
const info = (taxRounding: TaxRounding) => parseInfoCapabilities({ contracts: { 'order.create': [1, 2, 3] }, taxRounding })!;
const vendureRounding: TaxRounding = { granularity: 'per_rate_group_items', mode: 'half_up' };
const medusaRounding: TaxRounding = { granularity: 'per_order', mode: 'half_away_from_zero' };
const settings: StoreSettings = { currency: 'EUR', pricesIncludeTax: false, taxRatesPpm: { default: 250000, reduced: 70000 } };
const context: SyncContext = { connectorId: 'fake', baseUrl: 'https://store.test', headers: {} };

type Doc = { id: string; price: number; taxClass?: string };
const traits = {
  getId: (doc: Doc) => doc.id, getName: (doc: Doc) => doc.id, getVariantCount: () => 1, getImageUrl: () => undefined,
  getTaxClass: (doc: Doc) => doc.taxClass,
} as unknown as ProductTraits<Doc>;
const entry = (doc: Doc) => ({ product: doc, variant: { id: doc.id, sku: doc.id, prices: [{ amount: doc.price, currency: 'EUR', kind: 'base' }] } }) as unknown as CatalogueEntry<Doc>;

let sale: ReturnType<typeof useSale> | undefined;
let tax: TaxContext | undefined;
function Sale({ settings: current }: { settings: StoreSettings }) {
  sale = useSale(current, { registerId: 'register-1', cashierRef: 'cashier@store.test', capabilities: { orderCreate: 2 } });
  tax = useTax();
  return null;
}
/** The app's documented wiring (useStoreSettings' example); `wrap` stands in for the app's own TaxProvider line. */
function Till({ connector, ctx, wrap }: { connector: TallyConnector; ctx: SyncContext; wrap?: (s: StoreSettings, children: ReactNode) => ReactNode }) {
  const store = useStoreSettings({ connector, context: ctx, loadChoice: () => undefined, saveChoice: () => {} });
  if (store.state !== 'ready') return null;
  const children = <Sale settings={store.settings} />;
  return wrap ? wrap(store.settings, children) : <TaxProvider {...taxProviderProps(store.settings)}>{children}</TaxProvider>;
}
const connector = (capabilities?: () => Promise<ServerCapabilities | undefined>) =>
  ({ storeSettings: async () => settings, ...(capabilities && { capabilities }) }) as unknown as TallyConnector;

const figures = (order: Order) => [order.subtotalMinor, order.taxMinor, order.totalMinor];
/** vendurepos's #38 basket #1: TOTE 1499 × 3 less 899, TEE 1999 × 5 less 2520, at 25%. */
function toteTee() {
  for (const [doc, quantity] of [[{ id: 'tote', price: 1499 }, 3], [{ id: 'tee', price: 1999 }, 5]] as const) {
    for (let i = 0; i < quantity; i++) act(() => sale!.add(entry(doc), traits));
  }
  const [tote, tee] = sale!.order.lineItems;
  act(() => { sale!.applyDiscount(tote.id, { type: 'fixed', value: 899 }); });
  act(() => { sale!.applyDiscount(tee.id, { type: 'fixed', value: 2520 }); });
}
const toteTeeBasket: BasketLine[] = [
  { unitPriceMinor: 1499, quantity: 3, discountMinor: 899, taxInclusive: false, taxLines: [{ ratePpm: 250000 }] },
  { unitPriceMinor: 1999, quantity: 5, discountMinor: 2520, taxInclusive: false, taxLines: [{ ratePpm: 250000 }] },
];
/** 0.05 at 25% and 0.05 at 7%: per_rate_group_items rounds 1.25 → 1 and 0.35 → 0, so 1; per_order rounds 1.6 to 2. */
function twoRates() {
  act(() => sale!.add(entry({ id: 'a', price: 5 }), traits));
  act(() => sale!.add(entry({ id: 'b', price: 5, taxClass: 'reduced' }), traits));
}
const settle = async () => {
  await waitFor(() => expect(sale).toBeDefined());
  await act(async () => {}); // lets a connector's capabilities read land
};
const lineIds = () => sale!.order.lineItems.map((line) => line.id);

describe("the till takes the store's taxRounding with no app code (#324)", () => {
  beforeEach(() => {
    sale = undefined;
    tax = undefined;
  });

  it("Vendure, read through the connector: the TOTE/TEE sale equals taxFiguresForBasket's, and two rates round per group", async () => {
    const capabilities = vi.fn(async () => info(vendureRounding));
    render(<Till connector={connector(capabilities)} ctx={context} />);
    await settle();
    expect(capabilities).toHaveBeenCalledOnce();
    expect(tax!.rounding).toEqual(vendureRounding);

    toteTee();
    const expected = taxFiguresForBasket('eur', false, toteTeeBasket, vendureRounding);
    expect(figures(sale!.order)).toEqual([expected.subtotalMinor, expected.taxMinor, expected.totalMinor]);
    expect(figures(sale!.order)).toEqual([11073, 2768, 13841]);
    expect(sale!.order.taxRounding).toEqual(vendureRounding);

    for (const id of lineIds()) act(() => sale!.remove(id));
    twoRates();
    expect(figures(sale!.order)).toEqual([10, 1, 11]);
  });

  it("Medusa, from the context's capabilities: per_order half away from zero gives today's figures", async () => {
    const capabilities = vi.fn(async () => undefined);
    render(<Till connector={connector(capabilities)} ctx={{ ...context, capabilities: info(medusaRounding) }} />);
    await settle();
    expect(capabilities).not.toHaveBeenCalled();
    expect(tax!.rounding).toEqual(medusaRounding);

    toteTee();
    const today = taxFiguresForBasket('eur', false, toteTeeBasket);
    expect(figures(sale!.order)).toEqual([today.subtotalMinor, today.taxMinor, today.totalMinor]);
    for (const id of lineIds()) act(() => sale!.remove(id));
    twoRates();
    expect(figures(sale!.order)).toEqual([10, 2, 12]);
  });

  it("an explicit rounding prop wins over the store's", async () => {
    const perOrder: TaxRounding = { granularity: 'per_order', mode: 'half_up' };
    render(<Till connector={connector()} ctx={{ ...context, capabilities: info(vendureRounding) }}
      wrap={(s, children) => <TaxProvider {...taxProviderProps(s)} rounding={perOrder}>{children}</TaxProvider>} />);
    await settle();
    expect(tax!.rounding).toEqual(perOrder);
    twoRates();
    expect(figures(sale!.order)).toEqual([10, 2, 12]);
  });

  it('a strategy arriving late restarts an idle sale under it', async () => {
    let arrive!: (value: ServerCapabilities) => void;
    render(<Till connector={connector(() => new Promise((resolve) => (arrive = resolve)))} ctx={context} />);
    await waitFor(() => expect(sale).toBeDefined());
    expect(tax!.rounding).toBeUndefined();
    const before = sale!.order.id;

    await act(async () => arrive(info(vendureRounding)));
    expect(sale!.idle).toBe(true);
    expect(sale!.order.id).not.toBe(before);
    expect(sale!.order.taxRounding).toEqual(vendureRounding);
    twoRates();
    expect(figures(sale!.order)).toEqual([10, 1, 11]);
  });

  it('a sale with lines finishes on its old rounding, and the next sale takes the new one (#301)', async () => {
    let arrive!: (value: ServerCapabilities) => void;
    render(<Till connector={connector(() => new Promise((resolve) => (arrive = resolve)))} ctx={context} />);
    await waitFor(() => expect(sale).toBeDefined());
    twoRates();
    const before = sale!.order.id;

    await act(async () => arrive(info(vendureRounding)));
    expect(sale!.order.id).toBe(before);
    expect(figures(sale!.order)).toEqual([10, 2, 12]);
    expect('taxRounding' in sale!.order).toBe(false);

    for (const id of lineIds()) act(() => sale!.remove(id));
    expect(sale!.order.id).not.toBe(before);
    twoRates();
    expect(figures(sale!.order)).toEqual([10, 1, 11]);
  });
});
