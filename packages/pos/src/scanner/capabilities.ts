// Ported from WCPOS v2 packages/scanner/src/capabilities.ts (monorepo 85ecbd43f).
/** Feature detection for the direct-connection transports. Web Serial and
 * WebHID exist on Chromium desktop; elsewhere these functions return false. */

interface NavigatorLike {
  serial?: unknown;
  hid?: unknown;
  userAgent?: string;
}

function nav(navLike?: NavigatorLike): NavigatorLike | undefined {
  if (navLike) return navLike;
  return typeof navigator !== 'undefined' ? (navigator as NavigatorLike) : undefined;
}

export function isWebSerialSupported(navLike?: NavigatorLike): boolean {
  return !!nav(navLike)?.serial;
}

export function isWebHidSupported(navLike?: NavigatorLike): boolean {
  return !!nav(navLike)?.hid;
}
