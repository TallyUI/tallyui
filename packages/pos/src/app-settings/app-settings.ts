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
import { DEFAULT_TILE_FIELDS, normalizeTileFields, type TileFields } from '../product/tile-fields';

export const UI_SCALES = ['auto', 'compact', 'regular', 'spacious'] as const;
export type UiScale = (typeof UI_SCALES)[number];
/** v2's first three themes (`core/screens/main/settings/theme.tsx`); TallyUI's tokens define light and dark. */
export const UI_THEMES = ['system', 'light', 'dark'] as const;
export type UiTheme = (typeof UI_THEMES)[number];
/** The same ids, in the same default order, as `@tallyui/components` `CartColumnSettings` (`cart/cart-columns.tsx`);
 * pos cannot import components, so keep the two in step. */
export const CART_COLUMN_IDS = ['quantity', 'image', 'name', 'sku', 'price', 'regularPrice', 'total'] as const;
export type CartColumnId = (typeof CART_COLUMN_IDS)[number];
/** v2 `openOrdersPosition`, default bottom (`initial-settings.json:153`). */
export const OPEN_ORDERS_POSITIONS = ['top', 'bottom'] as const;
export type OpenOrdersPosition = (typeof OPEN_ORDERS_POSITIONS)[number];

/** Structurally the same as `@tallyui/components` `CartColumnSettings`, so a stored value passes straight to `Cart`. */
export interface CartColumnsSetting {
  quantity?: { show?: boolean; split?: boolean };
  image?: { show?: boolean };
  name?: { show?: boolean; sku?: boolean };
  sku?: { show?: boolean };
  price?: { show?: boolean; onSale?: boolean };
  regularPrice?: { show?: boolean };
  total?: { show?: boolean };
  order?: readonly CartColumnId[];
}

/** The typed key map. Add a key here and in APP_SETTING_DEFINITIONS; no schema change is needed. */
export interface AppSettings {
  /** The app applies it (e.g. Uniwind's setTheme); this store only records it. */
  'ui.theme': UiTheme;
  'ui.scale': UiScale;
  /** A font id; `'auto'` follows the theme. Not an enum: the font list lives in the UI layer. */
  'ui.font': string;
  /**
   * The cart's quick-discount keys in percent, for `Cart`'s `quickDiscounts`. v2 keeps them per screen,
   * `pos-cart.quickDiscounts: [5, 10, 15]` (`core/src/screens/main/contexts/ui-settings/initial-settings.json`).
   */
  'cart.quickDiscounts': readonly number[];
  /** Cart Settings › Columns (v2 `pos-cart.columns`), for `Cart`'s `columns`; per device, unlike v2's
   * per store × login (desk, 19 Nov). */
  'cart.columns': CartColumnsSetting;
  'cart.openOrdersPosition': OpenOrdersPosition;
  /**
   * Which words a catalogue grid tile shows. v2 keeps them per screen as `pos-products.gridFields`.
   * Desk 19 Nov (Q6): per device, camelCase keys, and the default is today's tile.
   */
  'catalogue.tileFields': TileFields;
  /** Print the receipt after checkout without asking (v2 `pos-cart.autoPrintReceipt`, default false).
   * The app runs the print; this store only records it. Per device (desk, 19 Nov). */
  'print.autoPrintReceipt': boolean;
  /** Template id to printer profile id: the device's routing overrides, for `PrintingSettings`'s `routing`
   * and `resolvePrinter`. A template with no entry uses Auto. Per device. */
  'print.templatePrinters': Readonly<Record<string, string>>;
}
export type AppSettingKey = keyof AppSettings;

/** One key's default and its check: `parse` returns the value when valid, else `undefined`. */
export interface AppSettingDefinition<T> {
  default: T;
  parse: (value: unknown) => T | undefined;
}
/** Each column's known fields; parseCartColumns keeps only these, and only when boolean. */
const CART_COLUMN_FIELDS: Record<CartColumnId, readonly string[]> = {
  quantity: ['show', 'split'], image: ['show'], name: ['show', 'sku'], sku: ['show'],
  price: ['show', 'onSale'], regularPrice: ['show'], total: ['show'],
};
const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** Known columns and boolean fields only; `order` keeps known ids, first occurrence. */
function parseCartColumns(value: unknown): CartColumnsSetting | undefined {
  if (!isPlainObject(value)) return undefined;
  const parsed: Record<string, unknown> = {};
  for (const id of CART_COLUMN_IDS) {
    const column = value[id];
    if (!isPlainObject(column)) continue;
    parsed[id] = Object.fromEntries(CART_COLUMN_FIELDS[id]
      .filter((field) => typeof column[field] === 'boolean').map((field) => [field, column[field]]));
  }
  if (Array.isArray(value.order)) {
    const known = value.order.filter((id): id is CartColumnId => (CART_COLUMN_IDS as readonly unknown[]).includes(id));
    parsed.order = [...new Set(known)];
  }
  return parsed as CartColumnsSetting;
}
const isIdString = (value: unknown): value is string =>
  typeof value === 'string' && value.length > 0 && value.length <= 128;
/** Non-empty string keys and values of at most 128 characters only; a fresh object. */
function parseTemplatePrinters(value: unknown): Record<string, string> | undefined {
  if (!isPlainObject(value)) return undefined;
  return Object.fromEntries(Object.entries(value)
    .filter((entry): entry is [string, string] => isIdString(entry[0]) && isIdString(entry[1])));
}
export const APP_SETTING_DEFINITIONS: { [K in AppSettingKey]: AppSettingDefinition<AppSettings[K]> } = {
  'ui.theme': { default: 'system', parse: (value) => UI_THEMES.find((theme) => theme === value) },
  'ui.scale': { default: 'auto', parse: (value) => UI_SCALES.find((scale) => scale === value) },
  'ui.font': {
    default: 'auto',
    parse: (value) => typeof value === 'string' && value.length > 0 && value.length <= 64 ? value : undefined,
  },
  'cart.quickDiscounts': {
    default: [5, 10, 15],
    // As v2's `ensureNumberArray`: only real percentages (0 < n <= 100) survive; an empty list is no keys.
    parse: (value) => Array.isArray(value)
      ? value.filter((n): n is number => typeof n === 'number' && Number.isFinite(n) && n > 0 && n <= 100)
      : undefined,
  },
  'cart.columns': { default: {}, parse: parseCartColumns },
  'cart.openOrdersPosition': { default: 'bottom', parse: (value) => OPEN_ORDERS_POSITIONS.find((p) => p === value) },
  'catalogue.tileFields': { default: DEFAULT_TILE_FIELDS, parse: normalizeTileFields },
  'print.autoPrintReceipt': { default: false, parse: (value) => typeof value === 'boolean' ? value : undefined },
  'print.templatePrinters': { default: {}, parse: parseTemplatePrinters },
};
export const DEFAULT_APP_SETTINGS: AppSettings = {
  'ui.theme': APP_SETTING_DEFINITIONS['ui.theme'].default,
  'ui.scale': APP_SETTING_DEFINITIONS['ui.scale'].default,
  'ui.font': APP_SETTING_DEFINITIONS['ui.font'].default,
  'cart.quickDiscounts': APP_SETTING_DEFINITIONS['cart.quickDiscounts'].default,
  'cart.columns': APP_SETTING_DEFINITIONS['cart.columns'].default,
  'cart.openOrdersPosition': APP_SETTING_DEFINITIONS['cart.openOrdersPosition'].default,
  'catalogue.tileFields': APP_SETTING_DEFINITIONS['catalogue.tileFields'].default,
  'print.autoPrintReceipt': APP_SETTING_DEFINITIONS['print.autoPrintReceipt'].default,
  'print.templatePrinters': APP_SETTING_DEFINITIONS['print.templatePrinters'].default,
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
  // The parsed value is stored, so a list keeps only what a read would keep.
  const parsed = APP_SETTING_DEFINITIONS[key].parse(value);
  if (parsed === undefined) {
    throw new Error(`writeAppSetting: invalid value for ${key}`);
  }
  await collection.upsert({ key, value: JSON.stringify(parsed) });
}
