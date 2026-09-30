export type {
  TallyConnector,
  ConnectorAuth,
  ConnectorSchemas,
  ConnectorTraits,
  AuthField,
  CollectionSync,
  RemoteIdEntry,
  SyncContext,
  ServerCapabilities,
  TaxRounding,
} from './connector';

export type { ReplicationAdapter } from './replication';

export type { FingerprintReconcileAdapter, IdReconcileAdapter, StockReconcileAdapter } from './reconcile';

export type { StoreSettings, StoreSettingsChoice } from './store-settings';
export { customerTraits, CustomerServiceError, type Customer, type CustomerInput } from './customers';

export type { ProductTraits, TraitContext, VariantSummary } from './traits/product';

export type { Money, ProductPrice, ResolvedPrice } from './money';

export type { StockLevel, StockStatus } from './stock';

export type { CustomerTraits } from './traits/customer';

export type {
  CommandType, CommandEnvelope, CommandStatus, CommandServerRefs,
  RegisterCommandType, RegisterCommandEnvelope, AnyCommandEnvelope,
  CommandWarning, CommandError, CommandResult, OrderCreateLine,
  PaymentMethodKind, OrderCreatePayment, OrderCreatePayload, OrderCreateEnvelope,
  OrderCreateDisplay, OrderCreateTaxRate,
  CommandBatchRequest, CommandBatchResponse, BatchTooLargeBody,
  RegisterCommandResult, RegisterSessionOpenPayload, RegisterSessionTransitionPayload,
  RegisterMovementRecordPayload, RegisterMovementVoidPayload, RegisterClosureSubmitPayload,
} from './commands';
