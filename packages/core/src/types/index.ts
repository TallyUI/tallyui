export type {
  TallyConnector,
  ConnectorAuth,
  ConnectorSchemas,
  ConnectorTraits,
  AuthField,
  CollectionSync,
  RemoteIdEntry,
  SyncContext,
} from './connector';

export type { ReplicationAdapter } from './replication';

export type { StockReconcileAdapter } from './reconcile';

export type { ProductTraits, TraitContext, VariantSummary } from './traits/product';

export type { Money, ProductPrice, ResolvedPrice } from './money';

export type { StockLevel, StockStatus } from './stock';

export type { CustomerTraits } from './traits/customer';

export type {
  CommandType, CommandEnvelope, CommandStatus, CommandServerRefs,
  CommandWarning, CommandError, CommandResult, OrderCreateLine,
  PaymentMethodKind, OrderCreatePayment, OrderCreatePayload,
  CommandBatchRequest, CommandBatchResponse,
} from './commands';
