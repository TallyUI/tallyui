/** ADR-061: the web runs premium SQLite on sqlite-wasm opfs-sahpool; one live tab. */
export const WEB_STORAGE_ENGINE = 'sqlite-sahpool' as const;

/** multiInstance each web engine requires: opfs-sahpool holds exclusive OPFS handles, so a second instance cannot exist. */
export const REQUIRED_MULTI_INSTANCE_BY_ENGINE = { 'sqlite-sahpool': false } as const;

/**
 * ADR-061 pins the web engine and `multiInstance` together. Throws for a
 * storage marked `tallyEngine: 'sqlite-sahpool'` (opfs-sahpool holds
 * exclusive OPFS handles, so a second instance cannot exist) and, since
 * that is the only web engine and `REQUIRED_MULTI_INSTANCE_BY_ENGINE`
 * requires `false` for it, for every other storage too.
 */
export function assertMultiInstanceAllowed(storage: { tallyEngine?: string } | undefined, multiInstance: boolean): void {
  if (!multiInstance) return;
  const reason = storage?.tallyEngine === WEB_STORAGE_ENGINE
    ? ' opfs-sahpool holds exclusive OPFS handles, so a second instance cannot exist.'
    : '';
  throw new Error(`multiInstance: true is unsupported: TallyUI databases are single-instance (ADR-061).${reason}`);
}
