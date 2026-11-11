// Logging
export { createLogger, consoleSink, callbackSink, deriveStuckRecords, hasActor, matchesPresetFilters, presetFilters } from './logging';
export type {
  Logger, LogSink, LogEntry, LogLevel, LogActor, LogMeta, LogSyncRecord, SyncRecordOutcome, LogPreset, LogPresetFilters, StuckRecord,
} from './logging';

// CSV
export { csvCell, csvFromCells, toCsv } from './csv';
export type { CsvColumn } from './csv';

// Currency
export { CurrencyProvider, useCurrencyFormatter, useCurrencyCode } from './currency';
export type { CurrencyFormat, CurrencyProviderProps } from './currency';

// Tax
export { TaxProvider, useTax, taxLogger } from './tax';
export { MICROS_PER_MINOR, ratePpmFromPercent, taxMicros, roundMicrosToMinor, computeOrderTax, taxLinesByRate } from './tax';
export type { TaxLineInput, OrderTaxTotals, RateTaxLine } from './tax';
export type { TaxProviderProps } from './tax';
export type { TaxRateMap, TaxContext } from './tax';

// Store settings
export { resolveStoreSettings, useStoreSettings, withPricingContext, taxProviderProps } from './store-settings';
export type { StoreSettingsResolution, ResolveStoreSettingsOptions, StoreSettingsState } from './store-settings';

// Cashier permissions (v2 parity A12)
export { can, useCashier } from './cashier';
export type { CashierState } from './cashier';

// App settings
export {
  UI_SCALES, UI_THEMES, APP_SETTING_DEFINITIONS, DEFAULT_APP_SETTINGS, appSettingSchema,
  appSettingCollection, resolveAppSettings, readAppSettings, appSettings$, writeAppSetting, useAppSettings,
} from './app-settings';
export type {
  UiScale, UiTheme, AppSettings, AppSettingKey, AppSettingDefinition, AppSettingDoc, AppSettingCollection,
} from './app-settings';

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
export { couponPricingBasis } from './order';
export type { OrderBuilder, OrderBuilderOptions, OrderCouponContext, StorePricedCoupon, StorePricedCouponContext } from './order';
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
export { buildReceiptData, buildReceiptDataFromPosOrder, buildReceiptDataFromStoreOrder, RECEIPT_SCHEMA_VERSION } from './receipt';
export type { ReceiptData, ReceiptLineItem, ReceiptConfig, ReceiptSoftware, ReceiptRegister, ReceiptFiscal } from './receipt';

// Receipt templates
export { parseXml, renderHtml, sanitizeHtml, renderReceiptTemplate, renderLogiclessTemplate, renderThermalPreview, receiptTemplateData, DEFAULT_RECEIPT_TEMPLATES, PAPER_COLUMNS, renderReceiptHtml } from './receipt-template';
export type { ThermalNode, ReceiptNode, SanitizeHtmlOptions, RenderSanitizeOptions, ReceiptTemplateRow, ReceiptTemplateLine, ReceiptTemplateData, ReceiptTemplateOptions, ReceiptPaper, RenderReceiptOptions } from './receipt-template';

// Customer display
export { DISPLAY_PROTOCOL_VERSION, DISPLAY_ACTIONS, makeEnvelope, displayCart, decode as decodeDisplayMessage, encode as encodeDisplayMessage, messageBytes, MAX_MESSAGE_BYTES, displayReducer, initialDisplayState } from './customer-display';
export type { PaymentPhase, DisplayTemplate, DisplayCart, DisplayPayment, DisplayConfig, DisplayPayloads, DisplayAction, DisplayEnvelope, DecodeRefusal, DecodeResult, DisplayView, DisplayState } from './customer-display';
export { DISPLAY_CHANNEL, createBroadcastDisplayTransport, createDisplayLink, useCustomerDisplay, DISPLAY_TEMPLATE, HELLO_RETRY_MS } from './customer-display';
export type { DisplayTransport, BroadcastChannelLike, DisplayLink, DisplayClock } from './customer-display';
export { createSaleDisplayPublisher, derivePaymentEvent, useSaleDisplay } from './customer-display';
export type { SaleDisplayOptions, SaleDisplayInput, SaleDisplayPublisher } from './customer-display';

// Product
export { searchProducts, sortProducts, productSortValue, PRODUCT_SORT_FIELDS, type ProductSort, type ProductSortValue, catalogueViewReducer, normalizeCatalogueViewState, resolveGridColumns, DEFAULT_CATALOGUE_VIEW_STATE, type CatalogueView, type CatalogueGridColumns, type CatalogueViewState, type CatalogueViewAction, withStockOverlay, getProductStock, stockOverlay$, stockOverlayAsOf$, productCategories, listCategories, inCategory } from './product';

// Scanner
export { DEFAULT_WEDGE_SETTINGS, DEFAULT_MIN_SCAN_CHARS, WEDGE_END_OF_SCAN_MS, createWedgeState, foldWedgeKey, stripBoundary, replayWedgeDetector, createWedgeDetector, DEFAULT_COOLDOWN_MS, normalizeRetailCode, hasValidRetailCheckDigit, retailCodeTwin, createScanSession, useBarcodeScanner, SCANNER_DEVICE_KEY_MAX_LENGTH, normalizeUuid, isCanonicalUuid, scannerDeviceKey, scannerTransport, createSerialLineDecoder, decodeHidPosReport, isWebSerialSupported, isWebHidSupported, isChooserCancel, SCANNER_PROFILES_COLLECTION, scannerProfileSchema, scannerProfileCollection, addScannerProfileCollection, scannerProfiles$, readScannerProfiles, saveScannerProfile, removeScannerProfile, createScanHub, createScanBus, inertScanHub, dedupeScans, SCAN_DEDUP_WINDOW_MS } from './scanner';
export { scannerProfileStore, createDeviceScannerStateCell, createSerialScanner, serialPortIdentity, DEFAULT_SERIAL_BAUD_RATE, STANDARD_SPP_SERVICE_CLASS_ID } from './scanner';
export type { WedgeSettings, WedgeState, TraceKey, WedgeReplayResult, WedgeDetectorOptions, WedgeDetector, ScanRejectReason, ScanOfferResult, ScanSessionOptions, ScanSession, UseBarcodeScannerOptions, ScannerConnectionType, ScannerIdentity, ScannerTransport, SerialLineDecoderOptions, SerialLineDecoder, HidPosDecodeOptions, HidPosResult, ScannerProfile, ScannerProfileCollection, ScanSourceKind, ScanSource, ScanEvent, ScanBus, ScanHub, WedgeScanMeta } from './scanner';
export type { ScannerProfileStore, DeviceScannerSettings, DeviceScannerState, DeviceScannerErrorPhase, DeviceScannerErrorHandler, DeviceScannerStateCell, DeviceScanner, SerialPortInfoLike, SerialPortLike, SerialLike, SerialScannerOptions } from './scanner';
export { createHidScanner, HID_POS_USAGE_PAGE } from './scanner';
export type { HidInputReportEventLike, HidDeviceLike, HidLike, HidScannerOptions } from './scanner';
export { ScanHubProvider, useScanHub, useDeviceScanControls, inertDeviceScanControls, scanTimeOf } from './scanner';
export type { DeviceScanControl, DeviceScanControls, ScanHubProviderProps } from './scanner';

// Payment drivers
export { createPaymentDriverRegistry, driverForMethod, methodDrivers, methodForProvider, createSimulatedDriver, SIMULATED_PROVIDER, SIMULATED_TIMING } from './payment-driver';
export type {
  DriverCapabilities, ReaderInfo, DriverStatus, DriverAvailability, CollectInput,
  CollectOutcome, CollectResult, DriverStatusSource, PaymentDriver, PaymentDriverRegistry,
  SimulatedReaderId, SimulatedDriverOptions,
} from './payment-driver';

// Printing
export {
  PrintError, toPrintError, createPrintQueue, SYSTEM_PRINTER_ID, PRINTER_PROFILES_COLLECTION, printerProfileSchema,
  printerProfileCollection, addPrinterProfileCollection, createSystemPrintTransport, SYSTEM_PRINT_TIMING,
  escpos, encodeEscPos, createEscPosTransport, ESCPOS_CODE_PAGES,
} from './print';
export type {
  PrintJob, PrintJobKind, PrintErrorCode, PrintTransport, PrintQueue, PrintQueueOptions, PrintQueueState,
  PrinterProfile, PrinterProfileCollection, SystemPrintTransportOptions,
  EscPosBuilder, EncodeEscPosOptions, EscPosSink, EscPosTransportOptions,
} from './print';

// Sale
export { useSale, DISCOUNTS_UNSUPPORTED, SALE_SAVING, PAYMENT_IN_MOTION, SALE_PARTLY_PAID, SALE_IN_TENDER, openSales, isPartlyPaid, saleLogger, addEntryToCart, CartError, catalogueEntries, findEntryByCode, variantPriceLabel, woocommerceDiscountCodes, COUPONS_UNSUPPORTED, COUPONS_NEED_CONNECTION, COUPONS_REPRICING, createStorePricedDiscountCodes, cartQuantities } from './sale';
export type { SaleStage, OpenSale, CatalogueEntry, SaleDiscountCodes, SaleDiscountState, StorePricedAccepted, StorePricedCodePricing, StorePricedDiscountCodesOptions, CartQuantityLine } from './sale';

export { uuidv7, finalizeOrder, toOrderCreateEnvelope, UnsupportedOrderVersionError, posOrderSchema, posOrderCollection, addPosOrderCollection, PosOrderOpenClosedError, posOrdersLogger, getDeviceId, needsAttention, isReopened, replacedOrderIds, sameSale, OrderContentMismatchError } from './pos-order';
export { REOPENABLE_CODES, ReopenRefusedOrderError, reopenRefusedOrder, type ReopenRefusal } from './pos-order';
export { noteDelivery, type NoteDelivery } from './pos-order';
export type { PosOrderSyncStatus, PosOrderLine, PosOrderCoupon, PosOrderPayment, PosOrderLocalWarning, PosOrderServerFailures, PosOrder, FinalizeOptions } from './pos-order';
export { createHttpCommandTransport, createOrderOutbox, isRequeueable, useOrderOutbox, outboxLogger } from './outbox';
export { createRegisterOutbox, isRegisterRequeueable, useRegisterOutbox, summarizeOutboxHealth, watchOutboxHealth, useOutboxHealth } from './outbox';
export type { RegisterOutboxOptions, RegisterOutbox, UseRegisterOutboxOptions, UseRegisterOutboxResult } from './outbox';
export type { OutboxCounts, OutboxHealth, UseOutboxHealthOptions, UseOutboxHealthResult } from './outbox';
export { createBackendNotFound } from './outbox/backend-not-found';
export type { BackendNotFound } from './outbox/backend-not-found';
export type { HttpTransportOptions, OrderOutboxOptions, OrderOutbox, TransportOutcome, CommandTransport, OrderTransportContext, OutboxState, UseOrderOutboxOptions, UseOrderOutboxResult } from './outbox';
export { sendOrderRefund, type OrderRefundOutcome, posRefundSchema, posRefundCollection, submitOrderRefund, RefundAnswerPendingError, type PosRefund, type PosRefundStatus, type PosRefundCollection, refundableLines, priceRefund } from './refund';
export type { RefundableOrderLine, EarlierRefund, RefundableLine, PricedRefundLine, PricedRefund } from './refund';
export { tenderReducer, initTenderState, initialTenderState, appliedMinor, changeMinor, quickTenderedAmounts, evenSplitShareMinor, activePlan, planLegs, MAX_TENDER_MINOR, tenderVoidSchema, tenderVoidCollection, legStatus, countsTowardPaid, isInMotion, capturedMinor, inMotionMinor, canMoveLeg, canVoidLeg } from './tender';
export type { PaymentTransport, TenderView, TenderLineId, TenderPlan, SplitTab, TenderState, TenderKey, TenderAction, PlanLeg, TenderVoid, PaymentLegStatus } from './tender';

// Register
export { normalizeAmount, isServerDecimal, movementFieldError, deriveExpected, parseMinor, validAmount, countVariance, overThreshold, closeNeedsApproval, closureVariance, denominationTotal, varianceText, denominations } from './register';
export type { MovementType, LedgerRow, Movement } from './register';
export { registerSessionSchema, registerSessionCollection, cashMovementSchema, closureSchema } from './register';
export { addRegisterSessionCollection, RegisterSessionOpenClosedError, registerSessionsLogger, REGISTER_SESSION_MIGRATION_CLOSE_WAIT_MS } from './register';
export type { RegisterSession, CashMovement, Closure } from './register';
export { registerCommandSchema, registerCommandCollection, registerCommandsLogger, sessionOpenCommand, sessionTransitionCommand, movementCommand, closureCommand, reconcileRegisterCommands, adoptRegisterResults, takeOverSession, abandonSession, isLiveAtStore, closureApprovalStatus, reapproveClosure, RegisterReapproveError } from './register';
export type { RegisterCommand, RegisterCommandCollection, ClosureApprovalStatus } from './register';
export { mintUuid, readRegister, ensureRegister, observeRegister$, getBoundRegisterId, readBoundRegister, bindRegister, unbindRegister, nextSaleCounter, mintClosureNumber, advancePerpetual, RegisterIdInvalidError } from './register';
export type { RegisterHost, RegisterCounters, RegisterBucket, RegisterStore, RegisterDocument } from './register';
export { RegisterSessionRequiredError, RegisterSessionClosedError, RegisterNeedsUpgradeError, RegisterSessionConflictError, RegisterTakeOverError, isKnownSessionStatus, RegisterMovementAmountError, RegisterMovementReasonError, RegisterMovementStrandedError, openSessionSelector, requireOpenSession, stampSession, openSession, startCounting, backToSelling, closeSession, recordMovement, voidMovement, writeClosure } from './register';
export type { RegisterSessionCollection, CashMovementCollection, ClosureCollection } from './register';
export { deriveSettled, exportCsv, labelKeys, clampClosureScope, selectClosureRows } from './register';
export type { Correction, RecordedFigures, ClosureScope } from './register';
export { minorToDecimal, formatClosureDate, buildClosureDocument, buildXReportDocument, TAX_ROUNDING_MIXED_NOTE, registerFactsLogger, recordRegisterFact, type ClosureContext, type Actor, type RegisterFact } from './register';
export { useRegisterSession, RegisterTenderInProgressError, RegisterSessionAlreadyOpenError, RegisterCloseIncompleteError, RegisterApprovalRequiredError, type ApprovalNeeded, type UseRegisterSessionOptions } from './register';
export { roundedDue, tenderRounding } from './tender';
export type { TenderRounding } from './tender';
export { suggestFloat, type FloatSuggestion } from './register';
export { switchWarnings, handoverSlip } from './register';
export type { SwitchKind, SwitchWarning, SwitchWarningInput, SwitchWarnings, HandoverSlipInput, HandoverSlipData } from './register';

// Reports
export { salesFigures, marginOf, comparisonRange, daysOf, inRange, presetRange, DATE_PRESETS, reportOrderFromPosOrder, reportOrderFromStoreOrder, reportRefundFromPosRefund } from './reports';
export type { StoreDay, DayRange, ReportCategory, ReportLine, ReportPayment, ReportTax, ReportOrder, ReportRefund, LineJoin, Margin, SalesTotals, PaymentRow, GroupRow, TaxRow, DayPoint, SalesFiguresInput, SalesFigures, DatePreset } from './reports';
