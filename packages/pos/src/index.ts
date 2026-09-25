// Logging
export { createLogger, consoleSink, callbackSink } from './logging';
export type { Logger, LogSink, LogEntry, LogLevel } from './logging';

// Currency
export { CurrencyProvider, useCurrencyFormatter, useCurrencyCode } from './currency';
export type { CurrencyProviderProps } from './currency';

// Tax
export { TaxProvider, useTax } from './tax';
export { MICROS_PER_MINOR, ratePpmFromPercent, taxMicros, roundMicrosToMinor, computeOrderTax, taxLinesByRate } from './tax';
export type { TaxLineInput, OrderTaxTotals, RateTaxLine } from './tax';
export type { TaxProviderProps } from './tax';
export type { TaxRateMap, TaxContext } from './tax';

// Store settings
export { resolveStoreSettings, useStoreSettings, withPricingContext, taxProviderProps } from './store-settings';
export type { StoreSettingsResolution, ResolveStoreSettingsOptions, StoreSettingsState } from './store-settings';

// Repository
export { createRepository } from './repository';
export type { Repository } from './repository';

// Order
export { createOrderBuilder, createOrderManager, allocateOrderDiscount } from './order';
export type { OrderBuilder, OrderBuilderOptions } from './order';
export type { OrderManager, OrderManagerOptions, ParkedOrderSummary } from './order';
export type {
  Order,
  LineItem,
  LineTaxLine,
  AddLineInput,
  Discount,
  AppliedDiscount,
  DisplayTotals,
  DisplayLine,
  Payment,
  CustomerSummary,
  PaymentMethod,
} from './order';

// Receipt
export { buildReceiptData } from './receipt';
export type { ReceiptData, ReceiptLineItem, ReceiptConfig } from './receipt';

// Product
export { searchProducts, withStockOverlay, getProductStock, stockOverlay$, stockOverlayAsOf$ } from './product';

// Sale
export { useSale, DISCOUNTS_UNSUPPORTED, addEntryToCart, CartError, catalogueEntries, findEntryByCode, variantPriceLabel } from './sale';
export type { SaleStage, CatalogueEntry } from './sale';

export { uuidv7, finalizeOrder, toOrderCreateEnvelope, posOrderSchema, posOrderCollection, addPosOrderCollection } from './pos-order';
export type { PosOrderSyncStatus, PosOrderLine, PosOrderPayment, PosOrder, FinalizeOptions } from './pos-order';
export { createHttpCommandTransport, createOrderOutbox } from './outbox';
export type { HttpTransportOptions, OrderOutboxOptions, OrderOutbox, TransportOutcome, CommandTransport, OutboxState } from './outbox';
export { tenderReducer, initTenderState, initialTenderState, appliedMinor, changeMinor, quickTenderedAmounts, evenSplitShareMinor, activePlan, planLegs, MAX_TENDER_MINOR } from './tender';
export type { PaymentTransport, TenderView, TenderLineId, TenderPlan, SplitTab, TenderState, TenderKey, TenderAction, PlanLeg } from './tender';

// Register
export { normalizeAmount, isServerDecimal, movementFieldError, deriveExpected, parseMinor, validAmount, countVariance, overThreshold, denominationTotal, varianceText, denominations } from './register';
export type { MovementType, LedgerRow, Movement } from './register';
export { registerSessionSchema, registerSessionCollection, cashMovementSchema, closureSchema } from './register';
export type { RegisterSession, CashMovement, Closure } from './register';
export { mintUuid, readRegister, ensureRegister, observeRegister$, getBoundRegisterId, readBoundRegister, bindRegister, unbindRegister, nextSaleCounter, mintClosureNumber, advancePerpetual } from './register';
export type { RegisterHost, RegisterCounters, RegisterBucket, RegisterStore, RegisterDocument } from './register';
export { RegisterSessionRequiredError, RegisterSessionClosedError, RegisterMovementStrandedError, openSessionSelector, requireOpenSession, stampSession, openSession, startCounting, backToSelling, closeSession, recordMovement, voidMovement, writeClosure } from './register';
export type { RegisterSessionCollection, CashMovementCollection, ClosureCollection } from './register';
export { deriveSettled, exportCsv, labelKeys, clampClosureScope, selectClosureRows } from './register';
export type { Correction, RecordedFigures, ClosureScope } from './register';
export { minorToDecimal, formatClosureDate, buildClosureDocument, buildXReportDocument, registerFactsLogger, recordRegisterFact, type ClosureContext, type Actor, type RegisterFact } from './register';
export { useRegisterSession, RegisterTenderInProgressError, RegisterSessionAlreadyOpenError, type UseRegisterSessionOptions } from './register';
