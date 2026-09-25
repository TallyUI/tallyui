// Logging
export { createLogger, consoleSink, callbackSink } from './logging';
export type { Logger, LogSink, LogEntry, LogLevel } from './logging';

// Currency
export { CurrencyProvider, useCurrencyFormatter, useCurrencyCode } from './currency';
export type { CurrencyProviderProps } from './currency';

// Tax
export { TaxProvider, useTax } from './tax';
export { MICROS_PER_MINOR, ratePpmFromPercent, taxMicros, roundMicrosToMinor, computeOrderTax } from './tax';
export type { TaxLineInput, OrderTaxTotals } from './tax';
export type { TaxProviderProps } from './tax';
export type { TaxRateMap, TaxContext } from './tax';

// Store settings
export { resolveStoreSettings, useStoreSettings, withPricingContext, taxProviderProps } from './store-settings';
export type { StoreSettingsResolution, ResolveStoreSettingsOptions, StoreSettingsState } from './store-settings';

// Repository
export { createRepository } from './repository';
export type { Repository } from './repository';

// Order
export { createOrderBuilder, createOrderManager } from './order';
export type { OrderBuilder, OrderBuilderOptions } from './order';
export type { OrderManager, OrderManagerOptions, ParkedOrderSummary } from './order';
export type {
  Order,
  LineItem,
  LineTaxLine,
  AddLineInput,
  Discount,
  AppliedDiscount,
  Payment,
  CustomerSummary,
  PaymentMethod,
} from './order';

// Receipt
export { buildReceiptData } from './receipt';
export type { ReceiptData, ReceiptLineItem, ReceiptConfig } from './receipt';

// Product
export { searchProducts, withStockOverlay, getProductStock, stockOverlay$, stockOverlayAsOf$ } from './product';

export { uuidv7, finalizeOrder, toOrderCreateEnvelope, posOrderSchema } from './pos-order';
export type { PosOrderSyncStatus, PosOrderLine, PosOrderPayment, PosOrder, FinalizeOptions } from './pos-order';
export { createHttpCommandTransport, createOrderOutbox } from './outbox';
export type { HttpTransportOptions, OrderOutboxOptions, OrderOutbox, TransportOutcome, CommandTransport, OutboxState } from './outbox';
