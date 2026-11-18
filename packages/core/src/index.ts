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
  VariantOptionGroup,
  ProductCategory,
  CustomerTraits,
  Money,
  ProductPrice,
  ResolvedPrice,
  StockLevel,
  StockStatus,
  StoreSettings,
  StoreSettingsChoice,
  StoreTaxClass,
  StoreTaxRate,
  StoreTaxRateLocation,
} from './types';
export type { SignInResult, ServerCapabilities, TaxRounding } from './types/connector';
export type {
  DisplaySignalling, DisplaySignallingContext, DisplaySignallingErrorCode, DisplayAdvertisement, IceServer,
  PendingPairing, DisplayRecord, SignalMessage,
} from './types';
export { DisplaySignallingError, DISPLAY_PAIR_CAPABILITY } from './types/display-signalling';
export { DEFAULT_ICE_SERVERS, parseDisplayAdvertisement, rateLimitSource } from './customer-display';
export type { CatalogueReconcileAdapter, CatalogueReconcileEntry } from './types/reconcile';
export { parseInfoCapabilities, parseTaxRounding, parseLineTax, resolveCapabilities } from './types/connector';
export { SignInError } from './sign-in';
export { ConnectorUnauthorizedError } from './unauthorized';
export { isRxdbRemoteVersionMismatch } from './rxdb-remote-version-mismatch';
export { errorKind, type ErrorKind, type SyncNotice } from './sync-notice';
export { classifyFailure, neutralFailureClass, noResponse, type ConnectivityState, type FailureClass, type UpdateRequired } from './connectivity';
export type { SignInErrorCode } from './sign-in';
export { StoreSettingsError } from './store-settings';
export { customerTraits, CustomerServiceError, type Customer, type CustomerInput, type CustomerAddress, type CustomerTaxId, type CustomerPatch, type CustomerPage } from './types/customers';
export { paymentMethodOf, defaultPaymentMethods, wireMethodOf, legMethodId } from './types/payment-methods';
export type {
  PaymentMethodDescriptor, PaymentKind, CaptureMode, CaptureModeEntry, PaymentHardware, PaymentTransport,
  PaymentOfflineMode, PaymentTipsMode, PaymentRounding,
} from './types/payment-methods';
export type { ReceiptTemplate, ReceiptTemplateKind } from './types/receipt-templates';
export type {
  StoreOrder, StoreOrderLine, StoreOrderCharge, StoreOrderPayment, StoreOrderRefund, ListOrdersQuery, StoreOrderPage, OrderFilterField,
} from './types/orders';
export { ORDER_FILTER_FIELDS, UnsupportedOrderFilterError, orderFilterFields, assertOrderFiltersSupported, assertOrderDateRange } from './order-filters';
export type { RegisterInfo } from './types/registers';
export { CASHIER_PERMISSIONS, cashierPermissions, isCashierPermission, type Cashier, type CashierPermission } from './types/cashier';
export type { StoreSettingsErrorCode, StoreSettingsChoices } from './store-settings';

export type {
  CommandType, CommandEnvelope, CommandStatus, CommandServerRefs,
  RegisterCommandType, RegisterCommandEnvelope, AnyCommandEnvelope,
  OrderRefundLine, OrderRefundPayload, OrderRefundEnvelope, OrderRefundResult, OrderRefundRejectionCode,
  OrderRefundQuantityExceedsData, OrderRefundAmountMismatchData, OrderRefundOrderStateData, OrderRefundNoOpenSessionData,
  OrderReopenPayload, OrderReopenEnvelope, OrderReopenResult, OrderReopenRejectionCode,
  OrderReopenPaymentInMotionData, OrderReopenOrderStateData,
  OrderUpdateLine, OrderUpdateFee, OrderUpdateShipping, OrderUpdatePayment, OrderUpdatePayload, OrderUpdateEnvelope, OrderUpdateRejectionCode, OrderUpdateReopenRequiredData,
  CommandWarning, CommandError, CommandResult, OrderCreateLine,
  PaymentMethodKind, OrderCreatePayment, OrderCreatePayload, OrderCreateEnvelope,
  OrderCreateDisplay, OrderCreateTaxRate,
  OrderCreateCoupon, OrderCreateCouponInvalidData, OrderCreateTotalMismatchData,
  CommandBatchRequest, CommandBatchResponse, BatchTooLargeBody,
  RegisterCommandResult, RegisterSessionOpenPayload, RegisterSessionAlreadyOpenData, RegisterSessionSupersededData,
  RegisterApprovalRequiredData, RegisterApprovalInvalidData,
  RegisterSessionTransitionPayload,
  RegisterMovementRecordPayload, RegisterMovementVoidPayload, RegisterClosureSubmitPayload,
} from './types';
export type { OrderAddress, OrderCreateCouponLine } from './types/commands';

export {
  COMMANDS_PATH, PROTOCOL_HEADER, PROTOCOL_VERSION, MAX_COMMANDS_PER_BATCH, ORDER_NOTE_MAX,
  isCommandBatchResponse,
} from './commands';

// Money helpers
export { currencySymbol, formatMoney, type MoneyFormat, minorUnitDigits, moneyFromDecimalString, moneyFromMajor, moneyToMajor, resolvePrice, resolvePriceRange } from './money';
export { minorToMajor } from './server/money';
export { findVariantByCode } from './variants';
export { knownWarnings } from './known-warnings';
export { compareIds } from './utils/compare-ids';
export { fnv1a32 } from './fnv1a32';
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
export { MoneyFormatProvider, useCurrencySymbol, useFormatMoney, type MoneyFormatProviderProps } from './context/money-format-context';
export * as woocommerceTax from './tax/woocommerce';
export * as woocommerceCoupons from './coupons/woocommerce';

// Browser-safe: command-result.ts imports only types. @tallyui/core/server re-exports these too, but
// its barrel reaches node:crypto (fingerprint.ts), so browser packages import them from here.
export { parseCommandResult, CommandResultError } from './server/command-result';
// Browser-safe: register-figures.ts has no imports. The till and demo backends derive the same session figures.
export { deriveSessionFigures, deriveVariance } from './server/register-figures';
// Browser-safe: tax-rate.ts has no imports. The till and servers convert percentages to the same integer ppm.
export { ratePpmFromPercent } from './server/tax-rate';
