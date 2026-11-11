// Ported from WCPOS v2 packages/scanner/src/device-identity.ts (monorepo 85ecbd43f).
/** One canonical identity for a registered scanner. The key is composed here,
 * once, and every consumer compares strings. It is also the scanner-profile
 * primary key, so the database enforces one profile per device.
 *
 * Known ceiling: a key identifies a model or service, not a unit. Two identical
 * USB scanners on one till share a vid:pid and therefore one profile. A USB
 * serial number is optional and absent on most retail scanners, so keying on it
 * would mint a different key depending on whether the platform reported it. */

export type ScannerConnectionType = 'keyboard' | 'usb-serial' | 'bluetooth-spp' | 'bluetooth-le' | 'hid-pos';

/** The identifying facts each lane can observe. A discriminated union, so it
 * is a type error to build a Bluetooth key out of USB ids. */
export type ScannerIdentity =
  | { connectionType: 'keyboard'; vendorId: number; productId: number; deviceName: string }
  | { connectionType: 'usb-serial'; vendorId: number; productId: number }
  | { connectionType: 'hid-pos'; vendorId: number; productId: number }
  | { connectionType: 'bluetooth-spp'; serviceUuid: string }
  | { connectionType: 'bluetooth-le'; peripheralId: string };

/** Primary-key ceiling. The only unbounded input is an Android device name. */
export const SCANNER_DEVICE_KEY_MAX_LENGTH = 128;

const DEVICE_NAME_KEY_MAX_LENGTH = 64;

const CANONICAL_UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** Lowercase + trim. Bluetooth UUIDs from the platform and from a merchant
 * typing one into settings disagree about case; comparing them raw is how the
 * same scanner ends up registered twice. */
export function normalizeUuid(value: string): string {
  return value.trim().toLowerCase();
}

/** True for a full 128-bit UUID in canonical 8-4-4-4-12 form, after normalizing. */
export function isCanonicalUuid(value: string): boolean {
  return CANONICAL_UUID_PATTERN.test(normalizeUuid(value));
}

/** Device names are display data with vendor padding and inconsistent case.
 * Fold them hard for key purposes; the profile keeps the raw name for the UI. */
function foldDeviceName(deviceName: string): string {
  return deviceName.trim().toLowerCase().replace(/\s+/g, ' ').slice(0, DEVICE_NAME_KEY_MAX_LENGTH);
}

/** Compose the canonical key. The connection type is part of the key so the
 * same scanner registered over two transports stays two profiles: they
 * reconnect differently and the merchant should see both. */
export function scannerDeviceKey(identity: ScannerIdentity): string {
  switch (identity.connectionType) {
    case 'keyboard':
      // vid:pid alone is too coarse here: on Android the built-in virtual
      // keyboard and a paired scanner can both report 0:0, so the folded name
      // is what keeps them apart.
      return `keyboard:${identity.vendorId}:${identity.productId}:${foldDeviceName(identity.deviceName)}`;
    case 'usb-serial':
      return `usb-serial:${identity.vendorId}:${identity.productId}`;
    case 'hid-pos':
      return `hid-pos:${identity.vendorId}:${identity.productId}`;
    case 'bluetooth-spp':
      return `bluetooth-spp:${normalizeUuid(identity.serviceUuid)}`;
    case 'bluetooth-le':
      return `bluetooth-le:${normalizeUuid(identity.peripheralId)}`;
  }
}

/** Which transport the merchant is looking at, derived from the connection
 * type so there is one authority for the mapping. `hid-pos` is `unknown`:
 * WebHID reports no bus, so claiming "USB" would show a guess as a fact. */
export type ScannerTransport = 'usb' | 'bluetooth' | 'unknown';

export function scannerTransport(connectionType: ScannerConnectionType): ScannerTransport {
  switch (connectionType) {
    case 'usb-serial':
      return 'usb';
    case 'bluetooth-spp':
    case 'bluetooth-le':
      return 'bluetooth';
    case 'keyboard':
    case 'hid-pos':
      return 'unknown';
  }
}
