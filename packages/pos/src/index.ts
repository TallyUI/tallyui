// Logging
export { createLogger, consoleSink, callbackSink } from './logging';
export type { Logger, LogSink, LogEntry, LogLevel } from './logging';

// Currency
export { CurrencyProvider, useCurrencyFormatter, useCurrencyCode } from './currency';
export type { CurrencyProviderProps } from './currency';

// Tax
export { TaxProvider, useTax, taxLogger } from './tax';
export { MICROS_PER_MINOR, ratePpmFromPercent, taxMicros, roundMicrosToMinor, computeOrderTax, taxLinesByRate } from './tax';
export type { TaxLineInput, OrderTaxTotals, RateTaxLine } from './tax';
export type { TaxProviderProps } from './tax';
export type { TaxRateMap, TaxContext } from './tax';

// Store settings
export { resolveStoreSettings, useStoreSettings, withPricingContext, taxProviderProps } from './store-settings';
export type { StoreSettingsResolution, ResolveStoreSettingsOptions, StoreSettingsState } from './store-settings';

// RxDB reads past the query cache, and live lists that can't leave it stale (RxDB 16.21.1 bug 4)
export { readFresh, countFresh, watchFresh } from './rxdb';

// Repository
export { createRepository } from './repository';
export type { Repository } from './repository';

// Order
export { createOrderBuilder, createOrderManager, allocateOrderDiscount, taxFiguresForBasket } from './order';
export { orderDraftSchema, writeOrderDraft, restoreOrderDraft, parkedOrderSummaries$ } from './order';
export { useParkedSales } from './order';
export type { BasketLine } from './order';
export type { OrderBuilder, OrderBuilderOptions, OrderCouponContext } from './order';
export type { OrderManager, OrderManagerOptions, ParkedOrderSummary } from './order';
export type {
  Order,
  OrderCoupon,
  SentOrder,
  LineItem,
  LineTaxLine,
  AddLineInput,
  ChargeLine,
  ChargeInput,
  FeeLine,
  ShippingLine,
  Discount,
  AppliedDiscount,
  DisplayTotals,
  DisplayLine,
  Payment,
  CustomerSummary,
  PaymentMethod,
} from './order';

// Receipt
export { buildReceiptData, RECEIPT_SCHEMA_VERSION } from './receipt';
export type { ReceiptData, ReceiptLineItem, ReceiptConfig, ReceiptSoftware, ReceiptRegister, ReceiptFiscal } from './receipt';

// Product
export { searchProducts, sortProducts, productSortValue, PRODUCT_SORT_FIELDS, type ProductSort, type ProductSortValue, catalogueViewReducer, normalizeCatalogueViewState, resolveGridColumns, DEFAULT_CATALOGUE_VIEW_STATE, type CatalogueView, type CatalogueGridColumns, type CatalogueViewState, type CatalogueViewAction, withStockOverlay, getProductStock, stockOverlay$, stockOverlayAsOf$, productCategories, listCategories, inCategory } from './product';

// Sale
export { useSale, DISCOUNTS_UNSUPPORTED, SALE_SAVING, saleLogger, addEntryToCart, CartError, catalogueEntries, findEntryByCode, variantPriceLabel } from './sale';
export type { SaleStage, CatalogueEntry } from './sale';

export { uuidv7, finalizeOrder, toOrderCreateEnvelope, UnsupportedOrderVersionError, posOrderSchema, posOrderCollection, addPosOrderCollection, PosOrderOpenClosedError, posOrdersLogger, getDeviceId, needsAttention, isReopened, sameSale, OrderContentMismatchError } from './pos-order';
export type { PosOrderSyncStatus, PosOrderLine, PosOrderPayment, PosOrderLocalWarning, PosOrderServerFailures, PosOrder, FinalizeOptions } from './pos-order';
export { createHttpCommandTransport, createOrderOutbox, useOrderOutbox, outboxLogger } from './outbox';
export { createRegisterOutbox, useRegisterOutbox } from './outbox';
export type { RegisterOutboxOptions, RegisterOutbox, UseRegisterOutboxOptions, UseRegisterOutboxResult } from './outbox';
export { createBackendNotFound } from './outbox/backend-not-found';
export type { BackendNotFound } from './outbox/backend-not-found';
export type { HttpTransportOptions, OrderOutboxOptions, OrderOutbox, TransportOutcome, CommandTransport, OrderTransportContext, OutboxState, UseOrderOutboxOptions, UseOrderOutboxResult } from './outbox';
export { tenderReducer, initTenderState, initialTenderState, appliedMinor, changeMinor, quickTenderedAmounts, evenSplitShareMinor, activePlan, planLegs, MAX_TENDER_MINOR, tenderVoidSchema, tenderVoidCollection } from './tender';
export type { PaymentTransport, TenderView, TenderLineId, TenderPlan, SplitTab, TenderState, TenderKey, TenderAction, PlanLeg, TenderVoid } from './tender';

// Register
export { normalizeAmount, isServerDecimal, movementFieldError, deriveExpected, parseMinor, validAmount, countVariance, overThreshold, closeNeedsApproval, denominationTotal, varianceText, denominations } from './register';
export type { MovementType, LedgerRow, Movement } from './register';
export { registerSessionSchema, registerSessionCollection, cashMovementSchema, closureSchema } from './register';
export { addRegisterSessionCollection, RegisterSessionOpenClosedError, registerSessionsLogger, REGISTER_SESSION_MIGRATION_CLOSE_WAIT_MS } from './register';
export type { RegisterSession, CashMovement, Closure } from './register';
export { registerCommandSchema, registerCommandCollection, registerCommandsLogger, sessionOpenCommand, sessionTransitionCommand, movementCommand, closureCommand, reconcileRegisterCommands, adoptRegisterResults, takeOverSession, abandonSession } from './register';
export type { RegisterCommand, RegisterCommandCollection } from './register';
export { mintUuid, readRegister, ensureRegister, observeRegister$, getBoundRegisterId, readBoundRegister, bindRegister, unbindRegister, nextSaleCounter, mintClosureNumber, advancePerpetual, RegisterIdInvalidError } from './register';
export type { RegisterHost, RegisterCounters, RegisterBucket, RegisterStore, RegisterDocument } from './register';
export { RegisterSessionRequiredError, RegisterSessionClosedError, RegisterNeedsUpgradeError, RegisterSessionConflictError, RegisterTakeOverError, isKnownSessionStatus, RegisterMovementAmountError, RegisterMovementReasonError, RegisterMovementStrandedError, openSessionSelector, requireOpenSession, stampSession, openSession, startCounting, backToSelling, closeSession, recordMovement, voidMovement, writeClosure } from './register';
export type { RegisterSessionCollection, CashMovementCollection, ClosureCollection } from './register';
export { deriveSettled, exportCsv, labelKeys, clampClosureScope, selectClosureRows } from './register';
export type { Correction, RecordedFigures, ClosureScope } from './register';
export { minorToDecimal, formatClosureDate, buildClosureDocument, buildXReportDocument, TAX_ROUNDING_MIXED_NOTE, registerFactsLogger, recordRegisterFact, type ClosureContext, type Actor, type RegisterFact } from './register';
export { useRegisterSession, RegisterTenderInProgressError, RegisterSessionAlreadyOpenError, RegisterCloseIncompleteError, RegisterApprovalRequiredError, type UseRegisterSessionOptions } from './register';
