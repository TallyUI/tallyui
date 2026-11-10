import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { createRxDatabase, type RxDatabase } from 'rxdb';
import { getRxStorageMemory } from 'rxdb/plugins/storage-memory';
import { wrappedValidateAjvStorage } from 'rxdb/plugins/validate-ajv';
import {
  appSettingCollection, DEFAULT_APP_SETTINGS, writeAppSetting, type AppSettingCollection,
} from './app-settings';
import { useAppSettings } from './use-app-settings';

let db: RxDatabase<{ app_settings: AppSettingCollection }>;

beforeEach(async () => {
  db = await createRxDatabase({
    name: `useappsettings${Math.random().toString(36).slice(2)}`,
    storage: wrappedValidateAjvStorage({ storage: getRxStorageMemory() }),
    multiInstance: false,
  });
  await db.addCollections({ app_settings: appSettingCollection() });
});

afterEach(async () => {
  cleanup();
  await db.remove();
});

it('returns stored values, re-renders on change, and writes through the setter', async () => {
  await writeAppSetting(db.app_settings, 'ui.font', 'grotesk');
  const { result } = renderHook(() => useAppSettings(db.app_settings));
  await waitFor(() => expect(result.current.settings).toEqual({ 'ui.scale': 'auto', 'ui.font': 'grotesk' }));

  await act(async () => {
    await writeAppSetting(db.app_settings, 'ui.scale', 'compact');
  });
  await waitFor(() => expect(result.current.settings['ui.scale']).toBe('compact'));

  await act(async () => { await result.current.setSetting('ui.font', 'system'); });
  const stored = await db.app_settings.findOne('ui.font').exec();
  expect(JSON.parse(stored!.toJSON().value)).toBe('system');
  await waitFor(() => expect(result.current.settings['ui.font']).toBe('system'));
});

it('returns the defaults without a collection and rejects the setter', async () => {
  const { result } = renderHook(() => useAppSettings(undefined));
  expect(result.current.settings).toEqual(DEFAULT_APP_SETTINGS);
  await expect(result.current.setSetting('ui.font', 'system'))
    .rejects.toThrow('useAppSettings: setSetting() needs the app settings collection');
});
