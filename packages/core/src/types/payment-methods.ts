import type { PaymentMethodKind } from './commands';

/**
 * A payment method the till can offer, backend-neutral (a port of WCPOS v2's Payments Contract
 * v1 descriptor, `order-math/src/payments/types.ts`). A connector maps its own model into it:
 * WooCommerce gateways, Medusa payment providers, Vendure payment methods. Amounts are integer
 * minor units of the store currency. Open vocabularies keep values this build has never seen, so
 * the till can show such a method disabled instead of dropping it.
 */

/** A known value, or any other string this build does not know yet. */
type OpenEnum<Known extends string> = Known | (string & {});

/** What kind of money the method takes. Not the order's wire method: that is `PaymentMethodKind`. */
export type PaymentKind = 'cash' | 'card' | 'stored_value' | 'bank_transfer' | 'other';

/** How the payment is taken. `manual`: the cashier records it (cash, a standalone terminal). */
export type CaptureMode = 'manual' | 'webview' | 'server' | 'device' | 'stored_value' | 'gateway';

/** The transport a payment terminal is reached over. */
export type PaymentTransport = 'bluetooth' | 'usb' | 'network' | 'tap_to_pay';

/** Whether a leg can be taken while the till is offline: recorded, queued to settle later, or not at all. */
export type PaymentOfflineMode = 'record' | 'queue' | 'none';

/** Where a tip is entered, if anywhere. */
export type PaymentTipsMode = 'none' | 'on_reader' | 'at_till';

/** The terminal hardware behind a method: readers the server lists, or transports an SDK discovers. */
export type PaymentHardware =
  | {
      discovery: OpenEnum<'server'>;
      readers: { id: string; label: string; status: OpenEnum<'online' | 'offline'>; default: boolean }[];
      defaultReader: string | null;
      lockToDefault: boolean;
    }
  | {
      discovery: OpenEnum<'sdk' | 'manual'>;
      transports: { transport: OpenEnum<PaymentTransport>; offline: OpenEnum<PaymentOfflineMode>; tips: OpenEnum<PaymentTipsMode> }[];
    };

/** One way to capture a method's payments. */
export interface CaptureModeEntry {
  mode: OpenEnum<CaptureMode>;
  /** The payment provider's own name, e.g. a terminal vendor; `null` for none. */
  provider: string | null;
  hardware: PaymentHardware | null;
}

/** Cash rounding for the method: the due amount rounds to a multiple of `incrementMinor`; `nearest` rounds half up. */
export type PaymentRounding = { incrementMinor: number; mode: 'nearest' | 'up' | 'down' } | null;

export interface PaymentMethodDescriptor {
  /** The connector's own id for the method, stable across reads. */
  id: string;
  /** The name the till shows. */
  title: string;
  kind: OpenEnum<PaymentKind>;
  capture: CaptureModeEntry & {
    /** Every way the method can be captured, the primary first; absent when `mode` is the only one. */
    modes?: CaptureModeEntry[];
  };
  capabilities: {
    /** `partial`: the method may take less than the balance (a split leg). */
    amount: { partial: boolean; minMinor?: number; maxMinor?: number };
    /** Whether tendering more than is due gives change. */
    change: boolean;
    refunds: { via: OpenEnum<'provider' | 'manual' | 'device' | 'none'>; partial: boolean };
    tips: OpenEnum<PaymentTipsMode>;
    offline: OpenEnum<PaymentOfflineMode>;
    /** Whether a taken leg can be voided. */
    void: boolean;
  };
  defaults: {
    rounding: PaymentRounding;
    /** Whether taking the payment opens the cash drawer. */
    openDrawer: boolean;
  };
}

/** The descriptor of one of today's two wire methods: its `id` is the `PaymentMethodKind`. */
export function paymentMethodOf(kind: PaymentMethodKind): PaymentMethodDescriptor {
  return {
    id: kind,
    title: kind === 'cash' ? 'Cash' : 'Card terminal',
    kind: kind === 'cash' ? 'cash' : 'card',
    capture: { mode: 'manual', provider: null, hardware: null },
    capabilities: {
      amount: { partial: true },
      change: kind === 'cash',
      refunds: { via: 'manual', partial: true },
      tips: 'none',
      offline: 'record',
      void: true,
    },
    defaults: { rounding: null, openDrawer: kind === 'cash' },
  };
}

/** Today's two methods, cash then the card terminal: what the till offers when the connector has no `paymentMethods`. */
export function defaultPaymentMethods(): PaymentMethodDescriptor[] {
  return [paymentMethodOf('cash'), paymentMethodOf('external')];
}
