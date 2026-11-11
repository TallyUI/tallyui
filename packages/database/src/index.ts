export { createTallyDatabase, getStorageHealth } from './create-db';
export type { TallyDatabase, CreateDatabaseOptions } from './create-db';
export { connectorCollection } from './connector-collection';

export { getStorage } from './storage';

export { WEB_STORAGE_ENGINE, REQUIRED_MULTI_INSTANCE_BY_ENGINE } from './engine';
export { STORAGE_WRITE_STALL_MS, STORAGE_READ_WATCHDOG_MS, isStorageWorkerFailure, withStorageWatchdog } from './storage-watchdog';
export type { StorageHealth, StorageWatchdogOptions } from './storage-watchdog';

export { startReplication } from './replication';
export type { StartReplicationOptions, TallyReplicationState } from './replication';

export {
  createConnectivityTracker, reduceConnectivity, INITIAL_CONNECTIVITY, FAILURE_CONFIRMATION_MS, FAILURE_CONFIRMATION_TOLERANCE_MS,
} from './connectivity';
export type { ConnectivityEvent, ConnectivitySnapshot, ConnectivityTracker } from './connectivity';

export { startLiveTab } from './live-tab';
export type { LiveTabState, LiveTabOptions, LiveTabHandle } from './live-tab';

export { startStockReconcile } from './reconcile';
export type { StartStockReconcileOptions, StockReconcileResult, StockReconcileState } from './reconcile';
export { startCatalogueReconcile, shouldReconcileAfterGap, CATALOGUE_OFFLINE_GAP_MS } from './catalogue-reconcile';
export type {
  StartCatalogueReconcileOptions, CatalogueReconcileEvent, CatalogueReconcileState, CatalogueReconcileSummary,
} from './catalogue-reconcile';
export { startIdReconcile } from './id-reconcile';
export type { StartIdReconcileOptions, IdReconcileResult } from './id-reconcile';
export { startFingerprintReconcile, isFingerprintResultCurrent } from './fingerprint-reconcile';
export type { StartFingerprintReconcileOptions, FingerprintReconcileResult, FingerprintReconcileState } from './fingerprint-reconcile';
export { STOCK_LEVELS_COLLECTION, STOCK_LEVELS_LAST_PASS, stockLevelsCollection, stockLevelsSchema } from './stock-levels';
export type { StockLevelRow } from './stock-levels';
export {
  SYNC_CADENCE_PRESETS, DEFAULT_SYNC_CADENCE_PRESET, SYNC_CADENCE_LIMITS, isSyncCadencePreset, clampSyncCadence,
  syncCadencePresetFor, syncCadencePresetBudget, requestsPerHour,
} from './sync-cadence';
export type { SyncCadence, SyncCadencePreset, SyncCadenceChoice } from './sync-cadence';
export {
  SYNC_CADENCE_COLLECTION, SYNC_CADENCE_DOC_ID, syncCadenceSchema, syncCadenceCollection, addSyncCadenceCollection,
  readSyncCadence, syncCadence$, setSyncCadence, resetSyncCadence,
} from './sync-cadence-store';
export type { SyncCadenceDoc, SyncCadenceCollection, SyncCadenceProfile } from './sync-cadence-store';
export { startSyncCadence, jitteredIntervalMs } from './sync-cadence-runner';
export type { SyncCadenceTarget, StartSyncCadenceOptions, SyncCadenceRunner } from './sync-cadence-runner';
export {
  REQUEST_METRICS_HOUR_MS, REQUEST_METRICS_MAX_BUCKETS, createRequestMetrics, isRequestMetricsBucket, meteredFetch,
} from './request-metrics';
export type { RequestMetricsBucket, RequestAttempt, RequestMetrics, MeteredFetchOptions } from './request-metrics';
export {
  REQUEST_METRICS_COLLECTION, REQUEST_METRICS_PERSIST_INTERVAL_MS, requestMetricsSchema, requestMetricsCollection,
  addRequestMetricsCollection, persistRequestMetrics,
} from './request-metrics-store';
export type { RequestMetricsDoc, RequestMetricsCollection, RequestMetricsPersistence } from './request-metrics-store';
