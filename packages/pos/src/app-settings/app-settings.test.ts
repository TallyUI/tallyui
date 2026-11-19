// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRxDatabase, type RxDatabase } from 'rxdb';
import { getRxStorageMemory } from 'rxdb/plugins/storage-memory';
import { wrappedValidateAjvStorage } from 'rxdb/plugins/validate-ajv';
import {
  appSettingSchema as schemaFromEntry, useAppSettings as hookFromEntry,
  DEFAULT_APP_SETTINGS as defaultsFromEntry, CART_COLUMN_IDS, OPEN_ORDERS_POSITIONS,
} from '../index';
import { uuidv7 } from '../pos-order';
import {
  appSettingCollection, appSettingSchema, appSettings$, DEFAULT_APP_SETTINGS, readAppSettings, writeAppSetting,
  type AppSettingCollection, type AppSettings,
} from './app-settings';
import { useAppSettings } from './use-app-settings';

describe('app settings', () => {
  let db: RxDatabase<{ app_settings: AppSettingCollection }>;
  let collection: AppSettingCollection;

  beforeEach(async () => {
    db = await createRxDatabase({ name: `appsettings${uuidv7().replaceAll('-', '')}`,
      storage: wrappedValidateAjvStorage({ storage: getRxStorageMemory() }), multiInstance: false });
    ({ app_settings: collection } = await db.addCollections({ app_settings: appSettingCollection() }));
  });

  afterEach(async () => {
    await db.remove();
  });

  it('reads the defaults from an empty collection', async () => {
    expect(await readAppSettings(collection)).toEqual(DEFAULT_APP_SETTINGS);
  });

  it('writes a setting and reads it back', async () => {
    await writeAppSetting(collection, 'ui.scale', 'compact');
    await writeAppSetting(collection, 'ui.font', 'manrope');
    expect(await readAppSettings(collection)).toEqual({ ...DEFAULT_APP_SETTINGS, 'ui.scale': 'compact', 'ui.font': 'manrope' });
    await writeAppSetting(collection, 'ui.scale', 'spacious');
    await writeAppSetting(collection, 'ui.theme', 'dark');
    expect(await readAppSettings(collection)).toEqual({ ...DEFAULT_APP_SETTINGS, 'ui.theme': 'dark', 'ui.scale': 'spacious', 'ui.font': 'manrope' });
    expect(await collection.find({ selector: { key: 'ui.scale' } }).exec()).toHaveLength(1);
  });

  it('falls back to the default for invalid stored values', async () => {
    await collection.insert({ key: 'ui.scale', value: '"huge"' });
    await collection.insert({ key: 'ui.theme', value: '"ocean"' });
    for (const value of ['not json', '""', '42', JSON.stringify('x'.repeat(65))]) {
      const doc = await collection.insert({ key: 'ui.font', value });
      expect(await readAppSettings(collection)).toEqual(DEFAULT_APP_SETTINGS);
      await doc.remove();
    }
  });

  it('ignores unknown keys', async () => {
    await collection.insert({ key: 'ui.unknown', value: '"x"' });
    await collection.insert({ key: 'toString', value: '"x"' });
    expect(await readAppSettings(collection)).toEqual(DEFAULT_APP_SETTINGS);
  });

  it("reads cart.quickDiscounts as real percentages only, defaulting to v2's [5, 10, 15]", async () => {
    expect(DEFAULT_APP_SETTINGS['cart.quickDiscounts']).toEqual([5, 10, 15]);
    const read = async (value: string) => {
      const doc = await collection.insert({ key: 'cart.quickDiscounts', value });
      const settings = await readAppSettings(collection);
      await doc.remove();
      return settings['cart.quickDiscounts'];
    };
    expect(await read(JSON.stringify([5, 'x', 0, -1, 150, null, 12.5]))).toEqual([5, 12.5]);
    expect(await read(JSON.stringify('5,10'))).toEqual([5, 10, 15]);
    expect(await read('[]')).toEqual([]);
  });

  it('stores the parsed quick discounts', async () => {
    await writeAppSetting(collection, 'cart.quickDiscounts', [10, 200]);
    expect((await collection.findOne('cart.quickDiscounts').exec())!.toJSON().value).toBe('[10]');
  });

  it('rejects an invalid value and writes nothing', async () => {
    await expect(writeAppSetting(collection, 'ui.scale', 'huge' as never))
      .rejects.toThrow('writeAppSetting: invalid value for ui.scale');
    expect(await collection.find().exec()).toHaveLength(0);
  });

  it('rejects an unknown property', async () => {
    await expect(collection.insert({ key: 'ui.scale', value: '"auto"', extra: 1 } as never)).rejects.toThrow();
  });

  it('emits on change', async () => {
    const emissions: AppSettings[] = [];
    const subscription = appSettings$(collection).subscribe((settings) => emissions.push(settings));
    try {
      await writeAppSetting(collection, 'ui.scale', 'regular');
      await vi.waitFor(() => expect(emissions).toContainEqual({ ...DEFAULT_APP_SETTINGS, 'ui.scale': 'regular' }));
    } finally {
      subscription.unsubscribe();
    }
  });

  it('is exported from the package entry', () => {
    expect(schemaFromEntry).toBe(appSettingSchema);
    expect(hookFromEntry).toBe(useAppSettings);
    expect(defaultsFromEntry).toBe(DEFAULT_APP_SETTINGS);
  });

  const rawValue = async (key: string) => (await collection.findOne(key).exec())?.toJSON().value;

  it('CS1: reads cart.columns as {} and cart.openOrdersPosition as bottom from an empty collection', async () => {
    const settings = await readAppSettings(collection);
    expect(settings['cart.columns']).toEqual({});
    expect(settings['cart.openOrdersPosition']).toBe('bottom');
  });

  it('CS2: writes cart.columns and reads it back', async () => {
    const columns = { image: { show: true }, price: { onSale: false }, order: ['total', 'name'] } as const;
    await writeAppSetting(collection, 'cart.columns', columns);
    expect((await readAppSettings(collection))['cart.columns']).toEqual(columns);
  });

  it('CS3: drops unknown columns, non-boolean fields and unknown or repeated order ids', async () => {
    await collection.insert({ key: 'cart.columns', value: JSON.stringify({
      name: { show: false, sku: 'yes', extra: true }, bogus: { show: true }, sku: 5,
      order: ['price', 'nope', 'price', 'quantity', 7],
    }) });
    expect((await readAppSettings(collection))['cart.columns']).toEqual({ name: { show: false }, order: ['price', 'quantity'] });
  });

  it('CS4: reads a non-object cart.columns as {}', async () => {
    for (const value of ['"x"', '[]', 'null', '42']) {
      const doc = await collection.insert({ key: 'cart.columns', value });
      expect((await readAppSettings(collection))['cart.columns']).toEqual({});
      await doc.remove();
    }
  });

  it('CS5: rejects an array cart.columns and stores the parsed value', async () => {
    await expect(writeAppSetting(collection, 'cart.columns', [] as never))
      .rejects.toThrow('writeAppSetting: invalid value for cart.columns');
    expect(await collection.find().exec()).toHaveLength(0);
    await writeAppSetting(collection, 'cart.columns', { order: ['nope'] } as never);
    expect(await rawValue('cart.columns')).toBe('{"order":[]}');
  });

  it('CS6: keeps cart.openOrdersPosition to top or bottom', async () => {
    await writeAppSetting(collection, 'cart.openOrdersPosition', 'top');
    expect((await readAppSettings(collection))['cart.openOrdersPosition']).toBe('top');
    await collection.upsert({ key: 'cart.openOrdersPosition', value: '"middle"' });
    expect((await readAppSettings(collection))['cart.openOrdersPosition']).toBe('bottom');
    await expect(writeAppSetting(collection, 'cart.openOrdersPosition', 'left' as never))
      .rejects.toThrow('writeAppSetting: invalid value for cart.openOrdersPosition');
    expect(await rawValue('cart.openOrdersPosition')).toBe('"middle"');
  });

  it('CS7: exports the cart column ids and open-orders positions from the package entry', () => {
    expect(CART_COLUMN_IDS).toEqual(['quantity', 'image', 'name', 'sku', 'price', 'regularPrice', 'total']);
    expect(OPEN_ORDERS_POSITIONS).toEqual(['top', 'bottom']);
  });
});
