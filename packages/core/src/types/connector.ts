import type { RxJsonSchema } from 'rxdb';

import type { ProductTraits } from './traits/product';
import type { ReplicationAdapter } from './replication';

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
}

/**
 * Schema definitions for a connector.
 * Each connector provides its own RxDB schemas that mirror its API shape.
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
  // Future: order, customer, etc.
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

  /** Sync configuration for each collection (legacy — use replication instead) */
  sync: {
    products: CollectionSync;
    [key: string]: CollectionSync;
  };

  /** Replication adapters for each collection (RxDB replication protocol) */
  replication?: {
    products?: ReplicationAdapter<any>;
    [key: string]: ReplicationAdapter<any> | undefined;
  };
}
