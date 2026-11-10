/**
 * Device UI preferences, one JSON-encoded value per key. Local only, never replicated;
 * the app adds the collection as `app_settings`.
 * v2 provenance: WCPOS monorepo `packages/database/src/collections/schemas/stores.ts`
 * keeps scale (auto|compact|regular|spacious, default auto) and fonts (default auto)
 * device-local beside the theme, never server-owned. TallyUI has no replicated
 * store document for them; TallyUI CLAUDE.md forbids local writes to replicated collections.
 */
import type { RxCollection, RxJsonSchema } from 'rxdb';
import { map, type Observable } from 'rxjs';

export const UI_SCALES = ['auto', 'compact', 'regular', 'spacious'] as const;
export type UiScale = (typeof UI_SCALES)[number];

/** The typed key map. Add a key here and in APP_SETTING_DEFINITIONS; no schema change is needed. */
export interface AppSettings {
  'ui.scale': UiScale;
  /** A font id; `'auto'` follows the theme. Not an enum: the font list lives in the UI layer. */
  'ui.font': string;
}
export type AppSettingKey = keyof AppSettings;

/** One key's default and its check: `parse` returns the value when valid, else `undefined`. */
export interface AppSettingDefinition<T> {
  default: T;
  parse: (value: unknown) => T | undefined;
}
export const APP_SETTING_DEFINITIONS: { [K in AppSettingKey]: AppSettingDefinition<AppSettings[K]> } = {
  'ui.scale': { default: 'auto', parse: (value) => UI_SCALES.find((scale) => scale === value) },
  'ui.font': {
    default: 'auto',
    parse: (value) => typeof value === 'string' && value.length > 0 && value.length <= 64 ? value : undefined,
  },
};
export const DEFAULT_APP_SETTINGS: AppSettings = {
  'ui.scale': APP_SETTING_DEFINITIONS['ui.scale'].default,
  'ui.font': APP_SETTING_DEFINITIONS['ui.font'].default,
};

/** One stored setting. `value` is the JSON encoding of the setting's value, so the schema never changes when a key is added. */
export interface AppSettingDoc { key: string; value: string }
export const appSettingSchema: RxJsonSchema<AppSettingDoc> = {
  title: 'App settings', version: 0, primaryKey: 'key', type: 'object', additionalProperties: false,
  properties: {
    key: { type: 'string', maxLength: 64 },
    value: { type: 'string' },
  },
  required: ['key', 'value'],
};

export function appSettingCollection(): { readonly schema: RxJsonSchema<AppSettingDoc> } {
  return { schema: appSettingSchema } as const;
}
export type AppSettingCollection = RxCollection<AppSettingDoc>;

export function resolveAppSettings(docs: readonly AppSettingDoc[]): AppSettings {
  const settings = { ...DEFAULT_APP_SETTINGS };
  for (const doc of docs) {
    if (!Object.hasOwn(APP_SETTING_DEFINITIONS, doc.key)) continue;
    const key = doc.key as AppSettingKey;
    try {
      const value = APP_SETTING_DEFINITIONS[key].parse(JSON.parse(doc.value));
      if (value !== undefined) Object.assign(settings, { [key]: value });
    } catch {
      // Unreadable stored values leave the default in place.
    }
  }
  return settings;
}

export async function readAppSettings(collection: AppSettingCollection): Promise<AppSettings> {
  return resolveAppSettings((await collection.find().exec()).map((doc) => doc.toJSON()));
}

export function appSettings$(collection: AppSettingCollection): Observable<AppSettings> {
  return collection.find().$.pipe(map((docs) => resolveAppSettings(docs.map((doc) => doc.toJSON()))));
}

export async function writeAppSetting<K extends AppSettingKey>(
  collection: AppSettingCollection, key: K, value: AppSettings[K],
): Promise<void> {
  if (APP_SETTING_DEFINITIONS[key].parse(value) === undefined) {
    throw new Error(`writeAppSetting: invalid value for ${key}`);
  }
  await collection.upsert({ key, value: JSON.stringify(value) });
}
