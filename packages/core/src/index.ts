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
  SyncContext,
  ProductTraits,
  TraitContext,
  CustomerTraits,
  Money,
  ProductPrice,
  ResolvedPrice,
  StockLevel,
  StockStatus,
} from './types';

// Money helpers
export { formatMoney, minorUnitDigits, moneyFromMajor, moneyToMajor, resolvePrice } from './money';

// Context & hooks
export {
  ConnectorProvider,
  useConnector,
  useProductTraits,
  useCustomerTraits,
  useTraitContext,
} from './context/connector-context';
export type { ConnectorProviderProps } from './context/connector-context';
