/**
 * Printers set up on this device. Local only, never replicated; the app adds the collection as
 * `printer_profiles`. Ported from WCPOS v2 `packages/database/src/collections/schemas/printer-profiles.ts`
 * (monorepo main, version 0, device-local). Left out: v2's cloud fields (`cloudPrinterId`, `cloudProvider`,
 * `connectionType: 'cloud'`; vendor services stay out of the MIT packages, ADR-084 decision 2), its vendor-SDK and
 * encoder-library hints (`nativeInterfaceType`, `printerModel`), `emitEscPrintMode` and `fullReceiptRaster`.
 * v2's schema defaults are kept as comments, not schema `default`s; a reader treats a missing field as its default.
 */
import type { RxCollection, RxDatabase, RxJsonSchema } from 'rxdb';

export const PRINTER_PROFILES_COLLECTION = 'printer_profiles';

export interface PrinterProfile {
  id: string;
  /** User-assigned, e.g. "Front counter". */
  name: string;
  connectionType: 'system' | 'network' | 'bluetooth' | 'usb';
  /** Default `generic`. */
  vendor?: 'epson' | 'star' | 'generic';
  /** IP address, Bluetooth address or USB path. */
  address?: string;
  /** Default 9100. */
  port?: number;
  /** Default `esc-pos`. */
  language?: 'esc-pos' | 'star-prnt' | 'star-line';
  /** Characters per line: 32 for 58 mm, 42 or 48 for 80 mm. Default 42. */
  columns?: number;
  /** The encoder's code page name, e.g. `cp437`; absent lets the encoder choose. */
  codePage?: string;
  /** Default true. */
  autoCut?: boolean;
  /** Default false. */
  autoOpenDrawer?: boolean;
  /** Default `pin2` (drawer 1). */
  drawerConnector?: 'pin2' | 'pin5';
  isDefault?: boolean;
  /** A platform printer (the print dialog) that cannot be deleted. */
  isBuiltIn?: boolean;
}

export const printerProfileSchema: RxJsonSchema<PrinterProfile> = {
  title: 'Printer profiles', version: 0, primaryKey: 'id', type: 'object', additionalProperties: false,
  properties: {
    id: { type: 'string', maxLength: 36 },
    name: { type: 'string' },
    connectionType: { type: 'string', enum: ['system', 'network', 'bluetooth', 'usb'] },
    vendor: { type: 'string', enum: ['epson', 'star', 'generic'] },
    address: { type: 'string' },
    port: { type: 'integer' },
    language: { type: 'string', enum: ['esc-pos', 'star-prnt', 'star-line'] },
    columns: { type: 'integer' },
    codePage: { type: 'string' },
    autoCut: { type: 'boolean' },
    autoOpenDrawer: { type: 'boolean' },
    drawerConnector: { type: 'string', enum: ['pin2', 'pin5'] },
    isDefault: { type: 'boolean' },
    isBuiltIn: { type: 'boolean' },
  },
  required: ['id', 'name', 'connectionType'],
};

export function printerProfileCollection(): { readonly schema: RxJsonSchema<PrinterProfile> } {
  return { schema: printerProfileSchema } as const;
}

export type PrinterProfileCollection = RxCollection<PrinterProfile>;

export async function addPrinterProfileCollection(db: RxDatabase): Promise<PrinterProfileCollection> {
  const added = await db.addCollections({ [PRINTER_PROFILES_COLLECTION]: printerProfileCollection() });
  return added[PRINTER_PROFILES_COLLECTION] as PrinterProfileCollection;
}
