// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRxDatabase, type RxDatabase } from 'rxdb';
import { getRxStorageMemory } from 'rxdb/plugins/storage-memory';
import { wrappedValidateAjvStorage } from 'rxdb/plugins/validate-ajv';
import {
  appSettingSchema as schemaFromEntry, useAppSettings as hookFromEntry,
  DEFAULT_APP_SETTINGS as defaultsFromEntry,
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
});
