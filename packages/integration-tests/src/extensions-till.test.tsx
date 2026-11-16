import { useRef, useState } from 'react';
import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createRxDatabase, type RxDatabase } from 'rxdb';
import { getRxStorageMemory } from 'rxdb/plugins/storage-memory';
import { wrappedValidateAjvStorage } from 'rxdb/plugins/validate-ajv';
import { wooProductTraits as traits } from '@tallyui/connector-woocommerce';
import {
  createExtensionHost, ExtensionHostProvider, ExtensionTarget, useSaleSource,
  type ActionSources, type ExtensionManifest, type ReadView, type RegisterView, type TargetBlockProps,
} from '@tallyui/extensions';
import { catalogueEntries, orderDraftSchema, TaxProvider, useSale } from '@tallyui/pos';

const entries = catalogueEntries([{ id: 10, name: 'Shirt', price: '10.00' }], traits, { currency: 'GBP' });
const taxProps = { pricesIncludeTax: false, ratesPpm: { default: 200000 }, taxRates: { standard: [
  { id: 1, code: 'rate-1', label: 'VAT', rate: '20.0000', priority: 1, compound: false, shipping: true },
] } };
type Sale = ReturnType<typeof useSale>;

function Coupons({ view }: TargetBlockProps['pos.cart.after-subtotal']) {
  return <span>Coupons: {view.sale!.value.coupons.length}</span>;
}

const manifest: ExtensionManifest = {
  id: 'acme.till', apiVersion: 1, capabilities: ['sale.read', 'register.read'],
  targets: { 'pos.cart.after-subtotal': { load: async () => ({ default: Coupons }) } },
  hooks: { 'checkout.tender.start': {
    tier: 'guard',
    load: async () => ({ default: (ctx) => {
      if (ctx.view.register?.value.open === false) return { refuse: 'Register closed' };
    } }),
  } },
};

function Harness({ db, register, onSale }: {
  db: RxDatabase; register: ReadView<RegisterView>; onSale: (sale: Sale) => void;
}) {
  const [host] = useState(() => createExtensionHost({
    extensions: [manifest], grant: { 'acme.till': ['sale.read', 'register.read'] },
  }));
  const sources = useRef<ActionSources>({});
  const sale = useSale({ currency: 'GBP' }, {
    registerId: 'register-1', cashierRef: 'cashier@store.test', drafts: db.pos_drafts,
    tenderGate: attempt => host.dispatch('checkout.tender.start', attempt, sources.current),
  });
  const saleSource = useSaleSource(sale);
  sources.current = { sale: saleSource, register };
  onSale(sale);
  // Cart slot placement is covered by cart.test.tsx and cart-total.test.tsx.
  return <ExtensionHostProvider host={host}>
    <ExtensionTarget id="pos.cart.after-subtotal" sale={saleSource} />
  </ExtensionHostProvider>;
}

describe('till extension through a real sale', () => {
  let db: RxDatabase;
  beforeEach(async () => {
    db = await createRxDatabase({ name: `extensionstill${Math.random().toString(36).slice(2)}`,
      storage: wrappedValidateAjvStorage({ storage: getRxStorageMemory() }), multiInstance: false });
    await db.addCollections({ pos_drafts: { schema: orderDraftSchema } });
  });
  afterEach(async () => { cleanup(); await db.remove(); });

  async function renderSale(open: boolean) {
    let sale!: Sale;
    const register: ReadView<RegisterView> = { value: { open }, subscribe: () => () => {} };
    render(<TaxProvider {...taxProps}>
      <Harness db={db} register={register} onSale={current => { sale = current; }} />
    </TaxProvider>);
    await act(async () => { sale.add(entries[0], traits); });
    return { get current() { return sale; } };
  }

  it('renders the cart block and refuses tender when the register is closed', async () => {
    const sale = await renderSale(false);
    expect(await screen.findByText('Coupons: 0')).toBeTruthy();
    await act(async () => { sale.current.startTender('cash'); });
    expect(sale.current.stage).toEqual({ kind: 'cart' });
    expect(sale.current.error).toBe('Register closed');
  });

  it('starts cash tender when the register is open', async () => {
    const sale = await renderSale(true);
    await act(async () => { sale.current.startTender('cash'); });
    expect(sale.current.stage).toEqual({ kind: 'tender', method: 'cash' });
  });
});
