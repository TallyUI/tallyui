/** Supported command operation. */
export type CommandType = 'order.create';

/** Client command with a stable idempotency key and typed payload. */
export interface CommandEnvelope<P = unknown> {
  id: string; // UUIDv7, the idempotency key; never reused
  type: CommandType;
  /** 3 when the order carries ADR-065's `display` and `taxByRate` (the store accepts 3), else 2 when discounted, else 1;
   *  4 is 3 with every `discountMinor` tax-exclusive, built only when capped at 4 or more (#286).
   *  5 is 4 plus fees, shipping and custom lines (ADR-075), sent only for an order that has one. */
  version: 1 | 2 | 3 | 4 | 5 | 6;
  payload: P;
  createdAt: string; // ISO 8601, client clock
  deviceId: string;
  attempt: number; // 1-based, informational
}

/** The register commands (ADR-068); each versions on its own, from 1. */
export type RegisterCommandType = 'register.session.open' | 'register.session.transition'
  | 'register.movement.record' | 'register.movement.void' | 'register.closure.submit';
/** A register command's envelope: the same fields as CommandEnvelope, with its own type and a numeric version. */
export type RegisterCommandEnvelope<P = Record<string, unknown>> =
  Omit<CommandEnvelope<P>, 'type' | 'version'> & { type: RegisterCommandType; version: number };
/** Any command a transport can carry. */
export type AnyCommandEnvelope = CommandEnvelope<unknown> | RegisterCommandEnvelope<unknown>;

/** An order.create envelope: 5 is 4 plus fees, shipping and custom lines (ADR-075), sent only for an order that has one. */
export type OrderCreateEnvelope = CommandEnvelope<OrderCreatePayload> & { type: 'order.create'; version: 1 | 2 | 3 | 4 | 5 | 6 };

/** Outcome of processing a command. */
export type CommandStatus = 'applied' | 'duplicate' | 'rejected';

/** Server order identifiers and authoritative total. */
export interface CommandServerRefs {
  orderId: string;
  displayId?: string;
  totalMinor: number;
}

/**
 * Non-fatal discrepancies reported while processing a command. A server may send codes not
 * listed here (a newer contract); readers go through `knownWarnings`, which drops them, and a
 * warning never rejects a sale.
 */
export type CommandWarning =
  | {
      code: 'total_mismatch'; expectedMinor: number; serverMinor: number;
      /**
       * Present if and only if the server added an untaxed rounding surcharge so its total
       * matches the till's; signed, in minor units, `expectedMinor - serverMinor`, where
       * `serverMinor` is the platform's total before the bridge.
       */
      bridgeMinor?: number;
    }
  | {
      /**
       * One per variant this sale took below zero stock. `quantity` is the units of this sale that
       * stock did not cover (medusapos plugin 0.2.0 and later); older servers sent the variant's
       * whole shortfall under the same field.
       */
      code: 'insufficient_stock'; variantId: string; quantity: number;
    }
  | {
      /**
       * One warning per tax rate whose tax differs by more than the server's rounding tolerance
       * (order.create v3 only); `expectedMinor` is the till's `taxByRate[].taxMinor` for that
       * rate and `serverMinor` the platform's tax for it.
       */
      code: 'tax_rate_mismatch'; ratePpm: number; expectedMinor: number; serverMinor: number;
    }
  /**
   * The sale's `customerId` (1 to 64 characters) was unknown, deleted or in another channel, so
   * the sale was kept as a guest sale rather than held (ADR-070).
   */
  | { code: 'customer_ignored'; customerId: string }
  /**
   * The order named a session the store did not hold when it applied the order (register v2).
   * The store keeps the id on the order, and an open or alias that arrives later counts it.
   * It does not mean the session was abandoned.
   */
  | { code: 'register_session_unknown'; sessionId: string }
  /**
   * One warning per sale, never a refusal: each of the till's figures that differs from the
   * server's own computation, once, with both values (#257). `total_mismatch` stays separate.
   * `parseCommandResult` refuses a `field` it doesn't know; `knownWarnings` keeps it (a newer
   * store's figure), so the type admits any non-empty string besides the three names.
   */
  | {
      code: 'figures_mismatch';
      fields: Array<{ field: 'subtotalMinor' | 'taxMinor' | 'discountMinor' | (string & {}); tillMinor: number; serverMinor: number }>;
    };

/** Error reported when a command is rejected. */
export interface CommandError {
  code: string;
  message: string;
  /** A refusal's details, e.g. the server's supported version. */
  data?: Record<string, unknown>;
}

/** `coupon_invalid` (order.create v6, ADR-077 d4): the store would not apply one of the order's coupons. */
export interface OrderCreateCouponInvalidData {
  /** The payload coupon's code, when the store can tell which one. */
  couponCode?: string;
  /** The store's own error code, e.g. WooCommerce's, for the log; never shown as the cashier's message. */
  storeCode?: string;
}
/**
 * `total_mismatch` as a refusal (order.create v6, ADR-077 R4): the store would accept the order but computes a
 * different total from the envelope, so it made no order. The store's own figures, as `figures_mismatch` names them.
 */
export interface OrderCreateTotalMismatchData {
  fields: Array<{ field: 'subtotalMinor' | 'taxMinor' | 'discountMinor' | 'totalMinor' | (string & {}); tillMinor: number; serverMinor: number }>;
}

/** Server result for a single command. */
export interface CommandResult {
  id: string;
  status: CommandStatus;
  serverRefs?: CommandServerRefs;
  warnings?: CommandWarning[];
  error?: CommandError;
  register?: RegisterCommandResult;
}

/** A register command's server figures (registers c2b applies them). */
export interface RegisterCommandResult {
  /** The session's server state after this command. `expected` is absent when the server redacts it (blind). */
  session?: {
    id: string; status: 'open' | 'counting' | 'closed' | 'superseded'; expected?: Record<string, number>; salesCount?: number;
    /** Sent on a resume (register v2): the store session's opening time. */
    openedAt?: string;
    /** Sent on a resume (register v2): the store session's counted opening float. */
    openingFloatMinor?: number;
  };
  /** The open was this device's own live session (register v2); the store keeps fromSessionId as a permanent alias of session.id. */
  resumed?: { fromSessionId: string };
  /** The session this open took over (register v2). */
  superseded?: { sessionId: string; openedAt?: string; deviceId?: string; deviceName?: string };
  /** The register's counters: a floor for the till's own, never lowered. */
  counters?: { lastClosureNumber: number; perpetualSalesTotalMinor: number; perpetualRefundsTotalMinor: number };
  /** `register.closure.submit` only. */
  closure?: { serverClosureId: string; number: number; expected?: Record<string, number>; variance?: Record<string, number> };
}

export interface RegisterSessionOpenPayload {
  sessionId: string; registerId: string; storeKey?: string; businessDay?: string; openedAt: string; openedBy?: string;
  expectedFloatMinor?: number; countedFloatMinor: number; openingVarianceMinor?: number;
  /** Register v2 only (ADR-078): the till's name on another till's take-over sheet, 1 to 64 characters after trim. */
  deviceName?: string;
  /** Register v2 only (ADR-078): the live session this open takes over, a compare-and-set. */
  supersedes?: string;
}
/** error.data for register_session_already_open. */
export interface RegisterSessionAlreadyOpenData {
  sessionId: string; registerId?: string; openedAt?: string; openedBy?: string;
  deviceId?: string; deviceName?: string; status?: 'open' | 'counting';
}
/** error.data for register_session_superseded. */
export interface RegisterSessionSupersededData {
  sessionId: string; supersededAt?: string; supersededBy?: string;
  deviceId?: string; deviceName?: string; newSessionId?: string;
}
export interface RegisterSessionTransitionPayload {
  sessionId: string; status: 'open' | 'counting' | 'closed'; at: string;
  /** Closing only. */ counted?: Record<string, number>; closedBy?: string; approvedBy?: string;
}
export interface RegisterMovementRecordPayload {
  movementId: string; sessionId: string; type: 'paid_in' | 'paid_out' | 'no_sale'; amountMinor: number; reason: string;
  createdAt: string; createdBy?: string;
}
export interface RegisterMovementVoidPayload {
  movementId: string; sessionId: string; voids: string; createdAt: string; createdBy?: string;
}
export interface RegisterClosureSubmitPayload {
  closureId: string; sessionId: string; registerId: string; number: number; businessDay?: string;
  openedAt: string; closedAt: string; closedBy?: string; approvedBy?: string;
  tillExpected: Record<string, number>; counted: Record<string, number>;
  periodSalesTotalMinor: number; periodRefundsTotalMinor: number;
  perpetualSalesTotalMinor: number; perpetualRefundsTotalMinor: number;
  unsyncedCount: number; unsyncedTotalMinor: number; softwareVersion: string;
  orderIds: string[]; movementIds: string[];
}

/** Order line with client identity and price in minor units. */
export interface OrderCreateLine {
  clientLineId: string;
  /** Required unless `custom` is set (version 5). */
  variantId?: string;
  /** Version 5 instruction: a non-catalogue line, without variantId; takes line and order discounts. */
  custom?: {
    /** Recorded title, 1–255 characters. */
    name: string;
    /** Recorded SKU, at most 64 characters when present. */
    sku?: string;
    /** Instruction, at most 64 characters; absent means the standard class. */
    taxClass?: string;
    /** Instruction: `none` means no tax on this line. */
    taxStatus: 'taxable' | 'none';
  };
  title?: string;
  quantity: number;
  unitPriceMinor: number;
  /** Version 6 recorded figure: the product's regular (not sale) unit price, in the line's tax mode and integer minor units, when the till knew it. */
  regularUnitPriceMinor?: number;
  /** Version 6 recorded: the variant's attribute names and values (#495), each at most 255 characters. */
  attributes?: Record<string, string>;
  /**
   * This line's own tax mode, when it differs from the order's `pricesIncludeTax`
   * (a price that carries its own flag, D2c). Absent means the order's flag, so
   * older clients and single-mode orders are unchanged.
   */
  taxInclusive?: boolean;
  /**
   * Version 2 (ADR-062): this line's total discount, its own line discounts plus its allocated share of
   * the order discount, in the line's own tax mode and integer minor units. The line is taxed on
   * `unitPriceMinor × quantity − discountMinor`. Present only when above 0.
   * Version 4+ (#286): tax-exclusive (net) in every mode; an inclusive line's is `net(A) − net(A − D)`.
   */
  discountMinor?: number;
}

/** Version 6 (ADR-077): a coupon the till applied. Recorded figures, in integer minor units of the order's currency. */
export interface OrderCreateCoupon {
  /** The coupon code as the store knows it, 1–255 characters. */
  code: string;
  /** The store's id for the coupon, 1–64 characters. */
  couponId: string;
  /** The discount it gave, tax-exclusive, integer >= 0. */
  discountMinor: number;
  /** The tax on that discount, integer >= 0. */
  discountTaxMinor: number;
}

/** Version 5: a fee, never discounted (ADR-075). */
export interface OrderCreateFee {
  /** Identity: UUID, stable for the order's life, at most 36 characters. */
  clientFeeId: string;
  /** Recorded fee title, 1–255 characters. */
  name: string;
  /** Instruction: integer >= 0, gross when pricesIncludeTax, net otherwise; never discounted. */
  amountMinor: number;
  /** Instruction: `none` means no tax on this fee. */
  taxStatus: 'taxable' | 'none';
  /** Instruction, at most 64 characters; absent means the standard class. */
  taxClass?: string;
  /** Informational till tax, integer >= 0; a server difference is total_mismatch, not a refusal. */
  taxMinor: number;
}

/** Version 5: the same instructions and recorded/informational fields as a fee, never discounted. */
export interface OrderCreateShipping extends Omit<OrderCreateFee, 'clientFeeId'> {
  /** Identity: UUID, stable for the order's life, at most 36 characters. */
  clientShippingId: string;
  /** Recorded shipping method id, at most 64 characters; absent means a POS-entered charge. */
  methodId?: string;
}

/** Supported order payment method. */
export type PaymentMethodKind = 'cash' | 'external';

/** Order payment with client identity and amounts in minor units. */
export interface OrderCreatePayment {
  clientPaymentId: string;
  method: PaymentMethodKind;
  amountMinor: number;
  tenderedMinor?: number;
  changeMinor?: number;
  reference?: string;
}

/** Version 3 (ADR-065): the receipt's display figures, integer minor units of `currency` at `exponent`. */
export interface OrderCreateDisplay {
  currency: string;
  exponent: number;
  taxInclusive: boolean;
  subtotalMinor: number;
  discountMinor: number;
  taxMinor: number;
  totalMinor: number;
  orderDiscountMinor: number;
  lines: Array<{
    clientLineId: string;
    amountMinor: number;
    discounts: Array<{ discountId: string; label?: string; amountMinor: number }>;
  }>;
  /** Version 5 recorded figures: one row per payload fee, in the display tax mode. */
  fees?: Array<{
    /** Identity: the payload fee's clientFeeId. */
    clientFeeId: string;
    /** Recorded integer minor units, equal to the payload fee amount. */
    amountMinor: number;
  }>;
  /** Version 5 recorded figures: one row per payload shipping charge, in the display tax mode. */
  shipping?: Array<{
    /** Identity: the payload shipping charge's clientShippingId. */
    clientShippingId: string;
    /** Recorded integer minor units, equal to the payload shipping amount. */
    amountMinor: number;
  }>;
  /** Version 6 recorded figures: one row per payload coupon, its discount in the display tax mode. */
  coupons?: Array<{ code: string; amountMinor: number }>;
}

/** Version 3 (ADR-065): one tax rate's net, tax and gross, as the receipt's tax summary splits them. */
export interface OrderCreateTaxRate {
  ratePpm: number;
  code?: string;
  netMinor: number;
  taxMinor: number;
  grossMinor: number;
}

/** Client order data submitted by an order.create command. */
export interface OrderCreatePayload {
  clientOrderId: string;
  createdAt: string;
  currency: string;
  pricesIncludeTax: boolean;
  lines: OrderCreateLine[];
  /** Version 5 instructions: fees in the order's tax mode; omitted when none. */
  fees?: OrderCreateFee[];
  /** Version 5 instructions: shipping in the order's tax mode; omitted when none. */
  shipping?: OrderCreateShipping[];
  /** Version 6 (ADR-077): the coupons the till applied, in the order it applied them; omitted when none.
   * The store re-applies them by `code` and refuses the order with `coupon_invalid` if one no longer applies. */
  coupons?: OrderCreateCoupon[];
  subtotalMinor: number;
  /**
   * Version 2 (ADR-062): the order's total discount, equal to Σ `lines[].discountMinor`. Present only when above 0.
   * Version 4+ (#286) means every `discountMinor`, this and each line's, is tax-exclusive, so the sum still holds.
   */
  discountMinor?: number;
  taxMinor: number;
  totalMinor: number;
  payments: OrderCreatePayment[];
  /** Version 3+; both or neither. */
  display?: OrderCreateDisplay;
  /** Version 3+; both or neither. */
  taxByRate?: OrderCreateTaxRate[];
  customer?: {
    email?: string;
    /** Version 3+: the platform's id for the customer picked at the till, a soft reference of at most 64 characters. Absent for a guest sale, or when no customer was picked. */
    customerId?: string;
  } | null;
  registerId?: string;
  cashierRef?: string;
  locationId?: string;
  /** Version 3+: the register session the sale was taken for, stamped or late (ADR-032). A late sale names the session that refused its stamp; the server tells the two apart by the session's closure `orderIds`. Absent when the sale had no session. */
  sessionId?: string;
}

/** Batch of commands submitted to the server. */
export interface CommandBatchRequest<E extends AnyCommandEnvelope = CommandEnvelope> {
  commands: E[];
}

/** Results returned by the server for a command batch. */
export interface CommandBatchResponse {
  results: CommandResult[];
}

/** The `413` body for a batch over the limit (ADR-038; Front desk ruling 18). */
export type BatchTooLargeBody = { code: 'batch_too_large'; maxCommands: number; message: string };
