import type { RxJsonSchema } from 'rxdb';

import type { ProductTraits } from './traits/product';
import type { CustomerTraits } from './traits/customer';
import type { ReplicationAdapter } from './replication';
import type { CatalogueReconcileAdapter, FingerprintReconcileAdapter, IdReconcileAdapter, StockReconcileAdapter } from './reconcile';
import type { StoreSettings, StoreSettingsChoice } from './store-settings';
import type { Customer, CustomerInput } from './customers';

/**
 * Authentication configuration for a connector.
 * Each API has wildly different auth — JWT, API keys, OAuth, etc.
 * The connector declares what it needs and how to use it.
 */
export interface ConnectorAuth {
  /** Human-readable auth type for UI display */
  type: string;
  /** Fields required from the user to authenticate */
  fields: AuthField[];
  /** Build request headers from stored credentials */
  getHeaders: (credentials: Record<string, string>) => Record<string, string>;
  /** Optional: validate that credentials work (e.g., test API call) */
  validate?: (credentials: Record<string, string>) => Promise<boolean>;
  /**
   * Exchanges a user's email and password for a credential (token) to store and pass back to getHeaders as `token`.
   * Rejects with a `SignInError`: `invalid_credentials`, `unsupported` or `failed`.
   */
  signIn?: (baseUrl: string, login: { email: string; password: string }, init?: { signal?: AbortSignal; fetch?: typeof fetch }) => Promise<SignInResult>;
}

export interface SignInResult {
  token: string;
  /** ISO 8601, when the backend says when the token expires */
  expiresAt?: string;
  /** The store's contract capabilities (ADR-062), when the read was conclusive. */
  capabilities?: ServerCapabilities;
}

/** The highest `order.create` contract version a store's server currently accepts (ADR-062). */
export interface ServerCapabilities {
  orderCreate: number;
  /** The highest `register` contract version; absent or 0 means no register sync. */
  register?: number;
  /** How the store rounds tax (#287). Absent: an older server, per_order + half_away_from_zero. */
  taxRounding?: TaxRounding;
}

/** #287, ADR-071. `custom`: the till computes as when absent; that server never emits `figures_mismatch` for subtotal or tax. */
export type TaxRounding =
  | { granularity: 'per_order' | 'per_line_items' | 'per_rate_group_items'; mode: 'half_away_from_zero' | 'half_up' }
  | { granularity: 'woocommerce'; roundAtSubtotal: boolean }
  | { granularity: 'custom' };

/**
 * Resolves the capabilities to act on: a definitive fresh read always wins,
 * even a downgrade to 1; an inconclusive fresh read (`undefined`) keeps the
 * last known value. The app persists `stored` with its session, the way it
 * persists the store-settings choice, and copies the result into
 * `SyncContext.capabilities`. `finalizeOrder` treats `undefined` as 1, which
 * only happens when the value has never been read (ADR-062).
 */
export function resolveCapabilities(
  fresh: ServerCapabilities | undefined,
  stored: ServerCapabilities | undefined,
): ServerCapabilities | undefined {
  return fresh ?? stored;
}

const GRANULARITIES = ['per_order', 'per_line_items', 'per_rate_group_items'];
const MODES = ['half_away_from_zero', 'half_up'];

/**
 * Reads the `taxRounding` of `GET /tally/v1/info` (#287): a valid value comes back without
 * extra keys, and `custom` drops any `mode`. Absent gives `undefined`, the default. Core has
 * no logger, so a malformed value gives `undefined` and one reason to `warn` for the caller to log.
 */
export function parseTaxRounding(value: unknown, warn?: (reason: string) => void): TaxRounding | undefined {
  if (value === undefined) return undefined;
  const { granularity, mode, roundAtSubtotal } = (value ?? {}) as { granularity?: unknown; mode?: unknown; roundAtSubtotal?: unknown };
  if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
    if (granularity === 'custom') return { granularity };
    if (granularity === 'woocommerce' && typeof roundAtSubtotal === 'boolean') return { granularity, roundAtSubtotal };
    if (GRANULARITIES.includes(granularity as string) && MODES.includes(mode as string)) {
      return { granularity, mode } as TaxRounding;
    }
  }
  warn?.(`ignoring a malformed taxRounding, so the default applies: ${JSON.stringify(value)}`);
  return undefined;
}

const maxVersion = (list: unknown): number | undefined => {
  const valid = Array.isArray(list) ? list.filter((v): v is number => typeof v === 'number' && Number.isSafeInteger(v) && v > 0) : [];
  return valid.length > 0 ? Math.max(...valid) : undefined;
};

/**
 * Reads a 2xx body of `GET /tally/v1/info` (ADR-062): `orderCreate` is the max of
 * `contracts["order.create"]`, or 1 when it's missing or malformed; `register` is the max of
 * `contracts.register` when valid; `taxRounding` is the top-level sibling of `contracts` (#287).
 * Absent `taxRounding` uses the default; a present malformed value is unknown, so settings wait.
 * A non-object body is also unknown, not a statement of the store's defaults.
 */
export function parseInfoCapabilities(body: unknown, warn?: (reason: string) => void): ServerCapabilities | undefined {
  if (body === null || Array.isArray(body) || typeof body !== 'object') {
    warn?.('non-object info body: capabilities unknown');
    return undefined;
  }
  const { contracts, taxRounding } = body as { contracts?: Record<string, unknown> | null; taxRounding?: unknown };
  const register = maxVersion(contracts?.register);
  const rounding = parseTaxRounding(taxRounding);
  if (taxRounding !== undefined && rounding === undefined) {
    warn?.(`malformed taxRounding: rounding is unknown, so settings wait: ${JSON.stringify(taxRounding)}`);
    return undefined;
  }
  return { orderCreate: maxVersion(contracts?.['order.create']) ?? 1,
    ...(register !== undefined ? { register } : {}), ...(rounding ? { taxRounding: rounding } : {}) };
}

export interface AuthField {
  key: string;
  label: string;
  type: 'text' | 'password' | 'url';
  placeholder?: string;
  required?: boolean;
}

/**
 * Sync configuration for a collection.
 * Defines how to fetch data from the remote API and push changes back.
 *
 * @deprecated Use ReplicationAdapter instead. This interface will be removed
 * once all connectors have migrated to the RxDB replication protocol.
 */
export interface CollectionSync<T = any> {
  /** Fetch all remote IDs (for diffing against local) */
  fetchAllIds: (context: SyncContext) => Promise<RemoteIdEntry[]>;
  /** Fetch documents by IDs */
  fetchByIds: (ids: string[], context: SyncContext) => Promise<T[]>;
  /** Fetch documents modified after a given date */
  fetchModifiedAfter?: (date: string, context: SyncContext) => Promise<T[]>;
  /** Push a local change to the remote */
  push?: (doc: T, context: SyncContext) => Promise<T>;
  /** Create a new document on the remote */
  create?: (doc: Partial<T>, context: SyncContext) => Promise<T>;
  /** Delete a document on the remote */
  delete?: (id: string, context: SyncContext) => Promise<void>;
}

export interface RemoteIdEntry {
  id: string;
  dateModified?: string;
}

export interface SyncContext {
  /** Unique connector identifier (used as replication namespace) */
  connectorId: string;
  /** Base URL for the API */
  baseUrl: string;
  /** Authenticated headers */
  headers: Record<string, string>;
  /** Optional abort signal */
  signal?: AbortSignal;
  /** From `storeSettings().pricingContext`; opaque to the app; the connector prices documents with it. Never logged. */
  pricingContext?: Record<string, string>;
  /** The store's contract capabilities (ADR-062), copied from the sign-in result. */
  capabilities?: ServerCapabilities;
}

/**
 * Schema definitions for a connector.
 * Each connector provides its own RxDB schemas that mirror its API shape.
 *
 * Each describes a server-owned, pull-replicated collection (ADR-060), so its
 * versions never transform documents: a version bump drops and resyncs.
 * `createTallyDatabase` drops the old documents, and `startReplication` resets
 * the checkpoint, so the first sync after the bump downloads the collection again.
 */
export interface ConnectorSchemas {
  products: RxJsonSchema<any>;
  // Future: orders, customers, taxes, etc.
  [key: string]: RxJsonSchema<any>;
}

/**
 * Trait implementations for a connector.
 * These are the accessor functions that components program against.
 */
export interface ConnectorTraits {
  product: ProductTraits;
  customer?: CustomerTraits;
}

/**
 * The main connector interface.
 * Each backend (WooCommerce, Medusa, Vendure, etc.) implements this.
 */
export interface TallyConnector {
  /** Unique identifier for this connector */
  id: string;
  /** Human-readable name */
  name: string;
  /** Description of the backend this connects to */
  description: string;
  /** Icon or logo URL */
  icon?: string;

  /** Authentication configuration */
  auth: ConnectorAuth;

  /** RxDB schemas for each collection */
  schemas: ConnectorSchemas;

  /** Trait implementations — how to extract standard data from connector-specific docs */
  traits: ConnectorTraits;

  /**
   * @deprecated Use `replication` instead.
   * Sync configuration for each collection (legacy pull-based sync).
   */
  sync: {
    products: CollectionSync;
    [key: string]: CollectionSync;
  };

  /** Replication adapters for each collection (RxDB replication protocol) */
  replication?: {
    products?: ReplicationAdapter<any>;
    [key: string]: ReplicationAdapter<any> | undefined;
  };

  /** Periodic re-reads of state that replication misses (ADR-060) */
  reconcile?: {
    stock?: StockReconcileAdapter;
    ids?: IdReconcileAdapter;
    prices?: FingerprintReconcileAdapter;
    /** Prices the backend calculates for the sales context (price lists, sale dates), which change without a timestamp bump. */
    calculatedPrices?: FingerprintReconcileAdapter;
    /** The daily catalogue check (#248): refetches what differs, deletes only with proof. */
    catalogue?: CatalogueReconcileAdapter;
  };

  /**
   * Reads the store's own settings (TV4): currency, tax inclusivity, tax
   * rates and a connector-specific pricing context. Read once after
   * sign-in; the app feeds all three consumers from the result. Read-only,
   * never writes to the store (ADR-048).
   */
  storeSettings?: (context: SyncContext, choice?: StoreSettingsChoice) => Promise<StoreSettings>;

  /**
   * Re-reads the store's contract capabilities (ADR-062) for a session
   * restored without signing in again — otherwise a restored session would
   * block discounts until the cashier signed in again. `undefined` means
   * the read was inconclusive (offline or a server error), not version 1;
   * see `resolveCapabilities`.
   * It may throw when the store refuses the read. Medusa throws `SignInError` (`invalid_credentials`) for a 401; its
   * 403 gives `undefined`. Vendure throws `ConnectorUnauthorizedError` only once its sign-in probe settles the
   * cause: `status: 401` when the session is signed out, `status: 403` when a signed-in administrator lacks the
   * CreateOrder permission; a probe that fails gives `undefined`. Branch on the error's `code` (only
   * `unauthorized` or `invalid_credentials` means sign in again), never on its class.
   */
  capabilities?: (context: SyncContext) => Promise<ServerCapabilities | undefined>;
  /** Customer search: online only; `undefined` when the connector has no customer support. */
  searchCustomers?: (context: SyncContext, query: string, options?: { limit?: number }) => Promise<Customer[]>;
  /** Customer creation: online only; `undefined` when the connector has no customer support. */
  createCustomer?: (context: SyncContext, input: CustomerInput) => Promise<Customer>;
  /** Customer lookup: online only; `undefined` when the connector has no customer support. */
  getCustomer?: (context: SyncContext, id: string) => Promise<Customer | null>;
  /**
   * Emails the receipt of an order the store already has: online only, and **not idempotent** (each call sends one
   * email, so an app never retries it on its own after a timeout). `orderId` is the store's id from the order-create
   * result (`serverRefs.orderId`). `options.saveToBilling` also stores the address on the order's billing email where
   * the platform supports it. Rejects with `ConnectorUnauthorizedError` for credentials and `CustomerServiceError`
   * (`invalid` for a refused order or address, `server` or `network` otherwise). `undefined` when the connector can't
   * email receipts.
   */
  emailReceipt?: (context: SyncContext, orderId: string, email: string, options?: { saveToBilling?: boolean }) => Promise<void>;
}
