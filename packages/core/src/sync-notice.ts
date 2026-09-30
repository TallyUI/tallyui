/** A sync that stopped and needs someone to act; `SyncStatus` owns the words for each `code`. */
export type SyncNotice = { code: string; since: number };

/** True for an error that retrying cannot fix: its class sets `permanent = true` and a string `code`. */
export function isPermanentError(error: unknown): error is Error & { permanent: true; code: string } {
  return typeof error === 'object' && error !== null
    && (error as { permanent?: unknown }).permanent === true
    && typeof (error as { code?: unknown }).code === 'string';
}
