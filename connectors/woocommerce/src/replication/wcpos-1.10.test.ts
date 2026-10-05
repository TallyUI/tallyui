// @vitest-environment node
import { afterEach, describe, expect, it } from 'vitest';
import products110 from '../__tests__/fixtures/wcpos-1.10.20-products.json';
import productsNext from '../__tests__/fixtures/wcpos-next-products.json';
import { at, closeTills, context, createFakeStore, startTill } from '../__tests__/fake-store';
import { wooCatalogueReconcile } from '../reconcile/catalogue';
import { createWooReconcileFeed } from '../reconcile/feed';
import { wooProductSchema } from '../schemas/products';
import { wooProductTraits } from '../traits/product';
import { toProductDocument, WooMissingUuidError, wooProductBarcode, wooProductUuid, WCPOS_UUID_META_KEY } from './products';

afterEach(closeTills);

describe('WCPOS product uuid and barcode readers', () => {
  it.each(products110)('reads 1.10.20 product $id from meta and global_unique_id', (product) => {
    expect(wooProductUuid(product)).toBe(product.meta_data[0].value);
    expect(wooProductBarcode(product)).toBe(product.global_unique_id);
  });

  it.each(productsNext)('prefers next product $id top-level fields', (product) => {
    expect(product.uuid).not.toBe(product.meta_data[0].value);
    expect(product.barcode).not.toBe(product.global_unique_id);
    expect(wooProductUuid(product)).toBe(product.uuid);
    expect(wooProductBarcode(product)).toBe(product.barcode);
  });

  it.each(['', 123, null])('falls back from invalid top-level uuid and barcode %j', (value) => {
    const product = { ...products110[0], uuid: value, barcode: value };
    expect(wooProductUuid(product)).toBe(product.meta_data[0].value);
    expect(wooProductBarcode(product)).toBe(product.global_unique_id);
  });

  it('uses the first non-empty string under the WCPOS uuid meta key', () => {
    expect(wooProductUuid({ meta_data: [
      { key: 'other_uuid', value: 'unrelated' },
      { key: WCPOS_UUID_META_KEY, value: 123 },
      { key: WCPOS_UUID_META_KEY, value: '' },
      { key: WCPOS_UUID_META_KEY, value: 'first' },
      { key: WCPOS_UUID_META_KEY, value: 'second' },
    ] })).toBe('first');
  });

  it.each([{}, { meta_data: [] }, { meta_data: [{ key: 'other_uuid', value: 'unrelated' }] }])('returns undefined without a uuid: %j', (product) => {
    expect(wooProductUuid(product)).toBeUndefined();
  });

  it.each([123, null, '', {}])('ignores an invalid meta uuid value %j', (value) => {
    expect(wooProductUuid({ meta_data: [{ key: WCPOS_UUID_META_KEY, value }] })).toBeUndefined();
  });

  it.each([undefined, '', 123, null])('returns undefined without a string barcode or GTIN: %j', (value) => {
    expect(wooProductBarcode({ barcode: value, global_unique_id: value })).toBeUndefined();
  });
});

describe('WCPOS product documents and traits', () => {
  it.each(products110)('normalizes published 1.10.20 product $id', (product) => {
    const { global_unique_id, ...fields } = product;
    expect(toProductDocument(product)).toEqual({
      ...fields, uuid: product.meta_data[0].value, barcode: global_unique_id, _deleted: false,
    });
    expect(wooProductTraits.getBarcode!(product)).toBe(product.global_unique_id);
  });

  it.each(productsNext)('preserves next product $id top-level fields', (product) => {
    const { global_unique_id, ...fields } = product;
    expect(toProductDocument(product)).toEqual({ ...fields, _deleted: false });
    expect(wooProductTraits.getBarcode!(product)).toBe(product.barcode);
  });

  it('projects extra top-level fields onto the product schema', () => {
    const product = {
      ...products110[0],
      permalink: 'https://woo.test/product/espresso',
      date_created: '2026-01-01T08:00:00',
      _links: { self: [{ href: 'https://woo.test/wp-json/wcpos/v2/products/80' }] },
      _rxdb_digest: 'store-digest',
    };
    const document = toProductDocument(product);
    const allowedKeys = [...Object.keys(wooProductSchema.properties), '_deleted'];
    expect(Object.keys(document).filter((key) => !allowedKeys.includes(key))).toEqual([]);
    expect(document).toMatchObject({
      id: product.id, name: product.name, meta_data: product.meta_data,
      uuid: product.meta_data[0].value, barcode: product.global_unique_id, _deleted: false,
    });
  });

  it('marks a draft deleted', () => {
    expect(toProductDocument({ ...products110[0], status: 'draft' })._deleted).toBe(true);
  });

  it('throws WooMissingUuidError with the product id when no uuid exists', () => {
    expect(() => toProductDocument({ ...products110[0], meta_data: [] })).toThrow(WooMissingUuidError);
    expect(() => toProductDocument({ ...products110[0], meta_data: [] })).toThrow('WooCommerce product 80 has no uuid');
  });

  it('does not add a barcode when neither source is present', () => {
    expect(toProductDocument({ id: 80, uuid: 'present', status: 'publish' })).not.toHaveProperty('barcode');
  });
});

describe('WCPOS 1.10.20 sync', () => {
  it('pulls all three products into RxDB under their meta uuids with GTIN barcodes', async () => {
    const store = createFakeStore(0);
    store.rows = products110.map((product) => ({ ...product, stock_quantity: null, ...at(product.date_modified_gmt) }));
    const till = await startTill(store);
    await till.sync();
    const local = await till.local();
    expect([...local.keys()].sort()).toEqual(products110.map((product) => product.meta_data[0].value).sort());
    for (const product of products110) {
      expect(local.get(product.meta_data[0].value)).toMatchObject({
        id: product.id, uuid: product.meta_data[0].value, barcode: product.global_unique_id,
      });
    }
  });

  it('confirmGone keeps the meta uuid backed by the live row and removes a different local uuid', async () => {
    const store = createFakeStore(0);
    store.rows = products110.map((product) => ({ ...product, stock_quantity: null, ...at(product.date_modified_gmt) }));
    const product = products110[0];
    const matching = { id: product.id, uuid: product.meta_data[0].value };
    const stale = { id: product.id, uuid: productsNext[0].uuid };
    const adapter = wooCatalogueReconcile(createWooReconcileFeed());
    expect(await adapter.confirmGone([matching], context)).toEqual([]);
    expect(await adapter.confirmGone([stale], context)).toEqual([stale.uuid]);
  });

  it('confirmGone prefers a next row top-level uuid over its meta uuid', async () => {
    const store = createFakeStore(0);
    store.rows = productsNext.map((product) => ({ ...product, stock_quantity: null, ...at(product.date_modified_gmt) }));
    const product = productsNext[0];
    const adapter = wooCatalogueReconcile(createWooReconcileFeed());
    expect(await adapter.confirmGone([
      { id: product.id, uuid: product.uuid },
      { id: product.id, uuid: product.meta_data[0].value },
    ], context)).toEqual([product.meta_data[0].value]);
  });
});
