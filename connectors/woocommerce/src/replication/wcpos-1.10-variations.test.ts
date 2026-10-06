// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import fixture from '../__tests__/fixtures/wcpos-1.10.20-variations.json';
import { closeTills, context, createFakeStore, startTill } from '../__tests__/fake-store';
import { toVariationDocument, wooProductReplication } from './products';
import { wooProductSchema } from '../schemas/products';

afterEach(closeTills);

describe('WCPOS 1.10.20 variation documents', () => {
  it.each([
    { id: 104, sku: 'MER-TEE-S-BLK', barcode: '2000000000138', size: 'S', colour: 'Black' },
    { id: 105, sku: 'MER-TEE-S-WHT', barcode: '2000000000145', size: 'S', colour: 'White' },
    { id: 106, sku: 'MER-TEE-M-BLK', barcode: '2000000000152', size: 'M', colour: 'Black' },
  ])('projects fixture variation $id', ({ id, sku, barcode, size, colour }) => {
    const { payload } = fixture.documents.find((doc) => doc.id === id)!;
    expect(toVariationDocument(payload)).toEqual({
      id, sku, barcode, price: '25.00', regular_price: '25.00', sale_price: '', on_sale: false,
      stock_status: 'instock', stock_quantity: 10, manage_stock: true, status: 'publish', purchasable: true,
      tax_class: '', tax_status: 'taxable',
      attributes: [{ id: 0, name: 'Size', option: size }, { id: 0, name: 'Colour', option: colour }],
    });
  });

  it('keeps a global attribute id and drops a non-numeric one', () => {
    expect(toVariationDocument({ id: 1, attributes: [
      { id: 7, name: 'Size', slug: 'pa_size', option: 'L' },
      { id: '7', name: 'Colour', option: 'Red' },
    ] }).attributes).toEqual([
      { id: 7, name: 'Size', option: 'L' },
      { name: 'Colour', option: 'Red' },
    ]);
  });

  it('omits undefined fields and defaults missing attributes to an empty array', () => {
    expect(toVariationDocument({ id: 104, sku: undefined, stock_quantity: null }))
      .toEqual({ id: 104, stock_quantity: null, attributes: [] });
  });
});

describe('WCPOS 1.10.20 variations pull', () => {
  it('uses product schema version 2 and retains replicated variation tax fields', async () => {
    expect(wooProductSchema.version).toBe(2);
    const store = createFakeStore(1);
    Object.assign(store.rows[0], { id: 102, type: 'variable', variations: [104, 105, 106] });
    store.respond = (url) => url.pathname === '/wp-json/wcpos/v2/variations'
      ? Response.json(fixture) : undefined;
    const till = await startTill(store, { adapter: wooProductReplication, batchSize: 10 });
    await till.sync();
    const product = (await till.local()).get('u1');
    expect(product.variation_docs).toHaveLength(fixture.documents.length);
    for (const { payload } of fixture.documents) {
      expect(product.variation_docs.find((variation: { id: number }) => variation.id === payload.id))
        .toMatchObject({ tax_class: payload.tax_class, tax_status: payload.tax_status });
    }
  });

  it('stores sorted variations with attributes after one flat-route request', async () => {
    const store = createFakeStore(1);
    Object.assign(store.rows[0], { id: 102, type: 'variable', variations: [104, 105, 106] });
    store.respond = (url) => {
      if (url.pathname !== '/wp-json/wcpos/v2/variations') return;
      const include = url.searchParams.get('include')!.split(',').map(Number);
      return Response.json({ ...fixture, documents: fixture.documents.filter((doc) => include.includes(doc.id)).reverse() });
    };
    const till = await startTill(store, { adapter: wooProductReplication, batchSize: 10 });
    await till.sync();
    const local = await till.local();
    expect(local.size).toBe(1);
    expect(local.get('u1')).toMatchObject({
      id: 102, variation_docs: fixture.documents.map((doc) => toVariationDocument(doc.payload)),
    });
    const requests = store.requests.filter((url) => url.pathname.endsWith('/variations'));
    expect(requests).toHaveLength(1);
    expect(requests[0].pathname).toBe('/wp-json/wcpos/v2/variations');
    expect(Object.fromEntries(requests[0].searchParams)).toEqual({
      include: '104,105,106', per_page: '3', orderby: 'id', order: 'asc',
    });
  });

  it('does not request variations for a page of simple products', async () => {
    const store = createFakeStore(2);
    store.rows.forEach((row) => Object.assign(row, { type: 'simple' }));
    const till = await startTill(store, { adapter: wooProductReplication, batchSize: 10 });
    await till.sync();
    expect((await till.local()).size).toBe(2);
    expect(store.requests.filter((url) => url.pathname.endsWith('/variations'))).toEqual([]);
  });

  it('rejects a variations 500 and stores no products from that page', async () => {
    const store = createFakeStore(2);
    Object.assign(store.rows[1], { id: 102, type: 'variable', variations: [104, 105, 106] });
    store.respond = (url) => url.pathname === '/wp-json/wcpos/v2/variations'
      ? Response.json({ message: 'Server error' }, { status: 500 }) : undefined;
    await expect(wooProductReplication.pull.handler(undefined, 10, context))
      .rejects.toThrow('WooCommerce API error: 500');
    const till = await startTill(store, { adapter: wooProductReplication, batchSize: 10 });
    await vi.waitFor(() => expect(till.errors.length).toBeGreaterThan(0));
    expect((await till.local()).size).toBe(0);
  });
});
