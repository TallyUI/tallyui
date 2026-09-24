/** ADR-061: the web runs premium SQLite on sqlite-wasm opfs-sahpool; one live tab. */
export const WEB_STORAGE_ENGINE = 'sqlite-sahpool' as const;

/** multiInstance each web engine requires: opfs-sahpool holds exclusive OPFS handles, so a second instance cannot exist. */
export const REQUIRED_MULTI_INSTANCE_BY_ENGINE = { 'sqlite-sahpool': false } as const;
