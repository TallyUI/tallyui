// Types
export type {
  TallyConnector,
  ConnectorAuth,
  ConnectorSchemas,
  ConnectorTraits,
  AuthField,
  CollectionSync,
  RemoteIdEntry,
  ReplicationAdapter,
  StockReconcileAdapter,
  IdReconcileAdapter,
  FingerprintReconcileAdapter,
  SyncContext,
  ProductTraits,
  TraitContext,
  VariantSummary,
  CustomerTraits,
  Money,
  ProductPrice,
  ResolvedPrice,
  StockLevel,
  StockStatus,
  StoreSettings,
  StoreSettingsChoice,
} from './types';
export type { SignInResult, ServerCapabilities, TaxRounding } from './types/connector';
export type { CatalogueReconcileAdapter, CatalogueReconcileEntry } from './types/reconcile';
export { parseInfoCapabilities, parseTaxRounding, parseLineTax, resolveCapabilities } from './types/connector';
export { SignInError } from './sign-in';
export { ConnectorUnauthorizedError } from './unauthorized';
export { isRxdbRemoteVersionMismatch } from './rxdb-remote-version-mismatch';
export { errorKind, type ErrorKind, type SyncNotice } from './sync-notice';
export type { SignInErrorCode } from './sign-in';
export { StoreSettingsError } from './store-settings';
export { customerTraits, CustomerServiceError, type Customer, type CustomerInput } from './types/customers';
export type { StoreSettingsErrorCode, StoreSettingsChoices } from './store-settings';

export type {
  CommandType, CommandEnvelope, CommandStatus, CommandServerRefs,
  RegisterCommandType, RegisterCommandEnvelope, AnyCommandEnvelope,
  CommandWarning, CommandError, CommandResult, OrderCreateLine,
  PaymentMethodKind, OrderCreatePayment, OrderCreatePayload, OrderCreateEnvelope,
  OrderCreateDisplay, OrderCreateTaxRate,
  CommandBatchRequest, CommandBatchResponse, BatchTooLargeBody,
  RegisterCommandResult, RegisterSessionOpenPayload, RegisterSessionTransitionPayload,
  RegisterMovementRecordPayload, RegisterMovementVoidPayload, RegisterClosureSubmitPayload,
} from './types';

export {
  COMMANDS_PATH, PROTOCOL_HEADER, PROTOCOL_VERSION, MAX_COMMANDS_PER_BATCH,
  isCommandBatchResponse,
} from './commands';

// Money helpers
export { currencySymbol, formatMoney, minorUnitDigits, moneyFromDecimalString, moneyFromMajor, moneyToMajor, resolvePrice, resolvePriceRange } from './money';
export { findVariantByCode } from './variants';
export { knownWarnings } from './known-warnings';
export { compareIds } from './utils/compare-ids';
export { STOCK_LEVELS_LAST_PASS, withStockOverlay, getProductStock } from './stock-overlay';
export { combinePullAdapters } from './replication/combine';
export { createReconcileFeed } from './replication/reconcile-feed';
export type { ReconcileFeed, ReconcileFeedEntry, ReconcileFetchEntry, KeyedReconcileFeedOptions } from './replication/reconcile-feed';

// Context & hooks
export {
  ConnectorProvider,
  useConnector,
  useProductTraits,
  useCustomerTraits,
  useTraitContext,
  useProductStock,
  useStockOverlaid,
  useStockOverlayAsOf,
} from './context/connector-context';
export type { ConnectorProviderProps } from './context/connector-context';
export * as woocommerceTax from './tax/woocommerce';
