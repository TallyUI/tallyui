/**
 * A pull that stopped until someone acts; `SyncStatus` owns the words for each `code`.
 * `fixedBy` says who can fix it: the till (sign in again) or the store owner.
 * `software` / `minVersion` / `fix` are copied from the error when it names them.
 */
export type SyncNotice = {
  code: string;
  since: number;
  fixedBy: 'till' | 'store';
  software?: string;
  minVersion?: string;
  fix?: string;
};

/** Who can fix a pull error: the till, the store owner, or nobody (it passes, so it is retried). */
export type ErrorKind = 'till' | 'store' | 'transient';

/**
 * 'till' or 'store' for an error whose class sets `fixedBy` to that value and a
 * string `code`; 'transient' for anything else.
 */
export function errorKind(error: unknown): ErrorKind {
  if (typeof error !== 'object' || error === null) return 'transient';
  const { fixedBy, code } = error as { fixedBy?: unknown; code?: unknown };
  return (fixedBy === 'till' || fixedBy === 'store') && typeof code === 'string' ? fixedBy : 'transient';
}
