import type { SyncContext } from './connector';

/** A manager's sign-in for one approval (ADR-082, ADR-093): sent straight to the store; never logged, kept or put in an error. */
export interface ApproverCredentials { username: string; password: string }

/** A correction the store appended to a closure (ADR-032, ADR-093), money in integer minor units. */
export type Correction = {
  id: number; type: 'late_sale' | 'late_refund' | 'late_movement' | 'recount'; created_at: string;
  actor: { id: string; name: string }; approver: { id: string; name: string } | null; reason: string;
  figures: { expected_delta?: Record<string, number>; cash_delta?: number; sales_delta?: number; refunds_delta?: number;
    counted?: Record<string, number>; variance?: Record<string, number> };
};

/** A Z closure as the store holds it (ADR-093), money in minor units. A figure the store withholds from this user is absent, never 0. */
export interface StoreClosure {
  id: string; number: number; registerId: string; sessionId: string; storeId?: string; reason: string; businessDay?: string;
  openedAt: string; closedAt: string; printedAt?: string; printCount: number; lastPrintedAt?: string;
  expected?: Record<string, number>; tillExpected?: Record<string, number>; counted?: Record<string, number>; variance?: Record<string, number>;
  periodSalesTotalMinor?: number; periodRefundsTotalMinor?: number; perpetualSalesTotalMinor?: number; perpetualRefundsTotalMinor?: number;
  unsyncedCount: number; unsyncedTotalMinor?: number; correctionsCount?: number; corrections?: Correction[];
}

/** The store's Z closures (ADR-093): online, read-through. Reads reject with `ConnectorUnauthorizedError` for a 401 or 403. */
export interface ClosureReads {
  /** Newest first. `hasMore` is true when the page came back full. */
  list(context: SyncContext, query?: { registerId?: string; after?: string; before?: string; page?: number; perPage?: number }): Promise<{ items: StoreClosure[]; hasMore: boolean }>;
  /** One closure with its `corrections`; `null` when the store has none by that id. */
  get(context: SyncContext, id: string): Promise<StoreClosure | null>;
  last(context: SyncContext, registerId: string): Promise<StoreClosure | null>;
  /** Appends a recount (`counted` names every tender, `cash` included). Replay-safe by `correctionId`. `closure` is absent when this user may not read closures. */
  recount(context: SyncContext, id: string, input: { correctionId: string; counted: Record<string, number>; reason: string; approval?: ApproverCredentials }): Promise<{ closure?: StoreClosure } | { refused: 'approval_required' | 'approval_invalid' | 'approval_forbidden' | 'not_found' }>;
  /** Records one print and returns the closure; `forbidden` when this user may not print closures. */
  markPrinted(context: SyncContext, id: string): Promise<StoreClosure | { refused: 'forbidden' | 'not_found' }>;
}
