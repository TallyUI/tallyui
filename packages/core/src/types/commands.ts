/** Supported command operation. */
export type CommandType = 'order.create';

/** Client command with a stable idempotency key and typed payload. */
export interface CommandEnvelope<P = unknown> {
  id: string; // UUIDv7, the idempotency key; never reused
  type: CommandType;
  version: 1;
  payload: P;
  createdAt: string; // ISO 8601, client clock
  deviceId: string;
  attempt: number; // 1-based, informational
}

/** Outcome of processing a command. */
export type CommandStatus = 'applied' | 'duplicate' | 'rejected';

/** Server order identifiers and authoritative total. */
export interface CommandServerRefs {
  orderId: string;
  displayId?: string;
  totalMinor: number;
}

/** Non-fatal discrepancies reported while processing a command. */
export type CommandWarning =
  | { code: 'total_mismatch'; expectedMinor: number; serverMinor: number }
  | { code: 'insufficient_stock'; variantId: string; quantity: number };

/** Error reported when a command is rejected. */
export interface CommandError {
  code: string;
  message: string;
}

/** Server result for a single command. */
export interface CommandResult {
  id: string;
  status: CommandStatus;
  serverRefs?: CommandServerRefs;
  warnings?: CommandWarning[];
  error?: CommandError;
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

/** Client order data submitted by an order.create command. */
export interface OrderCreatePayload {
  clientOrderId: string;
  createdAt: string;
  currency: string;
  pricesIncludeTax: boolean;
  lines: OrderCreateLine[];
  subtotalMinor: number;
  taxMinor: number;
  totalMinor: number;
  payments: OrderCreatePayment[];
  customer?: { email?: string } | null;
  registerId?: string;
  cashierRef?: string;
  locationId?: string;
}

/** Batch of commands submitted to the server. */
export interface CommandBatchRequest {
  commands: CommandEnvelope[];
}

/** Results returned by the server for a command batch. */
export interface CommandBatchResponse {
  results: CommandResult[];
}
