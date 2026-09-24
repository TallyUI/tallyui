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
} from './types';
export type { SignInResult } from './types/connector';
export { SignInError } from './sign-in';
export type { SignInErrorCode } from './sign-in';

export type {
  CommandType, CommandEnvelope, CommandStatus, CommandServerRefs,
  CommandWarning, CommandError, CommandResult, OrderCreateLine,
  PaymentMethodKind, OrderCreatePayment, OrderCreatePayload,
  CommandBatchRequest, CommandBatchResponse,
} from './types';

export {
  COMMANDS_PATH, PROTOCOL_HEADER, PROTOCOL_VERSION, MAX_COMMANDS_PER_BATCH,
  isCommandBatchResponse,
} from './commands';

// Money helpers
export { formatMoney, minorUnitDigits, moneyFromDecimalString, moneyFromMajor, moneyToMajor, resolvePrice, resolvePriceRange } from './money';
export { findVariantByCode } from './variants';
export { STOCK_LEVELS_LAST_PASS, withStockOverlay, getProductStock } from './stock-overlay';
export { combinePullAdapters } from './replication/combine';
export { createReconcileFeed } from './replication/reconcile-feed';
export type { ReconcileFeed, ReconcileFeedEntry } from './replication/reconcile-feed';

// Context & hooks
export {
  ConnectorProvider,
  useConnector,
  useProductTraits,
  useCustomerTraits,
  useTraitContext,
  useProductStock,
} from './context/connector-context';
export type { ConnectorProviderProps } from './context/connector-context';
