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
export { formatMoney, minorUnitDigits, moneyFromDecimalString, moneyFromMajor, moneyToMajor, resolvePrice } from './money';
export { findVariantByCode } from './variants';
export { STOCK_LEVELS_LAST_PASS, withStockOverlay, getProductStock } from './stock-overlay';

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
