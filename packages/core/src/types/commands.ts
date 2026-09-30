/** Supported command operation. */
export type CommandType = 'order.create';

/** Client command with a stable idempotency key and typed payload. */
export interface CommandEnvelope<P = unknown> {
  id: string; // UUIDv7, the idempotency key; never reused
  type: CommandType;
  /** 3 when the order carries ADR-065's `display` and `taxByRate` (the store accepts 3), else 2 when discounted, else 1. */
  version: 1 | 2 | 3;
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

/** An order.create envelope: its version stays 1 | 2 | 3 (ADR-062, ADR-065). */
export type OrderCreateEnvelope = CommandEnvelope<OrderCreatePayload> & { type: 'order.create'; version: 1 | 2 | 3 };

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
  | { code: 'insufficient_stock'; variantId: string; quantity: number }
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
   * One warning per sale, never a refusal: each of the till's figures that differs from the
   * server's own computation, once, with both values (#257). `total_mismatch` stays separate.
   */
  | {
      code: 'figures_mismatch';
      fields: Array<{ field: 'subtotalMinor' | 'taxMinor' | 'discountMinor'; tillMinor: number; serverMinor: number }>;
    };

/** Error reported when a command is rejected. */
export interface CommandError {
  code: string;
  message: string;
  /** A refusal's details, e.g. the server's supported version. */
  data?: Record<string, unknown>;
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
  session?: { id: string; status: 'open' | 'counting' | 'closed'; expected?: Record<string, number>; salesCount?: number };
  /** The register's counters: a floor for the till's own, never lowered. */
  counters?: { lastClosureNumber: number; perpetualSalesTotalMinor: number; perpetualRefundsTotalMinor: number };
  /** `register.closure.submit` only. */
  closure?: { serverClosureId: string; number: number; expected?: Record<string, number>; variance?: Record<string, number> };
}

export interface RegisterSessionOpenPayload {
  sessionId: string; registerId: string; storeKey?: string; businessDay?: string; openedAt: string; openedBy?: string;
  expectedFloatMinor?: number; countedFloatMinor: number; openingVarianceMinor?: number;
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
  variantId: string;
  title?: string;
  quantity: number;
  unitPriceMinor: number;
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
   */
  discountMinor?: number;
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
  subtotalMinor: number;
  /** Version 2 (ADR-062): the order's total discount, equal to Σ `lines[].discountMinor`. Present only when above 0. */
  discountMinor?: number;
  taxMinor: number;
  totalMinor: number;
  payments: OrderCreatePayment[];
  /** version 3 only; both or neither. */
  display?: OrderCreateDisplay;
  /** version 3 only; both or neither. */
  taxByRate?: OrderCreateTaxRate[];
  customer?: {
    email?: string;
    /** Version 3 only: the platform's id for the customer picked at the till, a soft reference of at most 64 characters. Absent for a guest sale, or when no customer was picked. */
    customerId?: string;
  } | null;
  registerId?: string;
  cashierRef?: string;
  locationId?: string;
  /** Version 3 only: the register session the sale was taken for, stamped or late (ADR-032). A late sale names the session that refused its stamp; the server tells the two apart by the session's closure `orderIds`. Absent when the sale had no session. */
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
