// Types
export type {
  TallyConnector,
  ConnectorAuth,
  ConnectorSchemas,
  ConnectorTraits,
  AuthField,
  CollectionSync,
  RemoteIdEntry,
  SyncContext,
  ProductTraits,
} from './types';

// Context & hooks
export {
  ConnectorProvider,
  useConnector,
  useProductTraits,
} from './context/connector-context';
export type { ConnectorProviderProps } from './context/connector-context';
