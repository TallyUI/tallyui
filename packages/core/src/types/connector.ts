import type { RxJsonSchema } from 'rxdb';

import type { ProductTraits } from './traits/product';
import type { CustomerTraits } from './traits/customer';
import type { ReplicationAdapter } from './replication';
import type { FingerprintReconcileAdapter, IdReconcileAdapter, StockReconcileAdapter } from './reconcile';
import type { StoreSettings, StoreSettingsChoice } from './store-settings';

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
  };

  /**
   * Reads the store's own settings (TV4): currency, tax inclusivity, tax
   * rates and a connector-specific pricing context. Read once after
   * sign-in; the app feeds all three consumers from the result. Read-only,
   * never writes to the store (ADR-048).
   */
  storeSettings?: (context: SyncContext, choice?: StoreSettingsChoice) => Promise<StoreSettings>;
}
