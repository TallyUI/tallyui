/**
 * The live sale as customer-display calls (ADR-085 U1), ported from WCPOS v2 (monorepo 51e7c4351)
 * core/screens/main/pos/customer-display/snapshot-source.tsx and core/services/customer-display/ledger.ts.
 * Not ported: v2's coupon debounce (TallyUI has no COUPON_TOTALS_DEBOUNCE_MS yet) and its mount counter (one publisher per link).
 */
import type { Order, Payment, SentOrder } from '../order';
import { buildReceiptData } from '../receipt/build-receipt-data';
import type { ReceiptConfig, ReceiptData } from '../receipt/types';
import type { SaleStage } from '../sale/use-sale';
import { legStatus } from '../tender/payment-legs';
import type { DisplayLink } from './display-link';
import type { DisplayPayment } from './protocol';

export interface SaleDisplayOptions {
  /** The receipt config used to build what the display shows. Default: `{ storeName: '' }`. */
  receipt?: ReceiptConfig;
  /** A payment method id to the title shown on the display (v2's methodTitles). Default: the id itself. */
  methodTitle?: (method: string) => string;
  /** Shown with a declined leg (v2 passes its translated "payment declined"). Default: no message. */
  declinedMessage?: string;
}

/** The sale as useSale exposes it: its live order and its stage. */
export interface SaleDisplayInput { order: Order; stage: SaleStage }

export interface SaleDisplayPublisher {
  update(sale: SaleDisplayInput): void;
  /** Shows idle (v2 publishes display.idle on unmount); later updates do nothing. */
  close(): void;
}

/** v2 ledger.ts derivePaymentEvent on TallyUI legs. Pure. */
export function derivePaymentEvent(
  previous: readonly Payment[], next: readonly Payment[],
  wasCompleted: boolean, completed: boolean,
  balanceDueMinor: number, options: Pick<SaleDisplayOptions, 'methodTitle' | 'declinedMessage'> = {},
): DisplayPayment | null {
  const leg = (payment: Payment) => ({
    method: options.methodTitle ? options.methodTitle(payment.method) : payment.method, amountMinor: payment.amountMinor,
  });
  if (!wasCompleted && completed) {
    const last = next.filter((payment) => legStatus(payment) === 'captured').at(-1);
    return { state: 'complete', ...(last ? { leg: leg(last) } : {}) };
  }
  const before = new Map(previous.map((payment) => [payment.id, payment]));
  const row = next.filter((payment) => {
    const old = before.get(payment.id);
    return !old || legStatus(old) !== legStatus(payment);
  }).at(-1);
  if (!row) return null;
  const status = legStatus(row);
  if (balanceDueMinor === 0 && status === 'captured') return { state: 'complete', leg: leg(row) };
  if (status === 'failed' || status === 'voided') {
    const { declinedMessage } = options;
    return { state: 'declined', leg: leg(row), ...(declinedMessage === undefined ? {} : { message: declinedMessage }) };
  }
  // The reader approved the card: shown as approved, never as paid (v2, ADR 0040 D6).
  if (status === 'authorized' || status === 'captured') return { state: 'approved', leg: leg(row) };
  if (!before.has(row.id) && status === 'pending') return { state: 'started', leg: leg(row) };
  return null;
}

type DisplayCall = ['cart', ReceiptData | null] | ['payment', ReceiptData, DisplayPayment];

/** v2's CustomerDisplaySnapshotSource without React: each `update` shows the sale's cart, payment or idle. */
export function createSaleDisplayPublisher(link: DisplayLink, options: SaleDisplayOptions = {}): SaleDisplayPublisher {
  let prior: { orderId: string; payments: readonly Payment[]; completed: boolean } | null = null;
  let lastPayment: { orderId: string; payment: DisplayPayment } | null = null;
  let lastKey = '';
  let closed = false;
  // The same call as the last one is not made again (the link dedups too; this skips building its envelope).
  const send = (...call: DisplayCall) => {
    const key = JSON.stringify(call);
    if (key === lastKey) return;
    lastKey = key;
    if (call[0] === 'cart') link.showCart(call[1]);
    else link.showPayment(call[1], call[2]);
  };
  return {
    update({ order, stage }) {
      if (closed) return;
      const completed = stage.kind === 'receipt';
      const shown: SentOrder = stage.kind === 'receipt' ? stage.order : order;
      const sameOrder = prior === null || prior.orderId === shown.id;
      if (!sameOrder) lastPayment = null;
      const remember = () => { prior = { orderId: shown.id, payments: shown.payments, completed }; };
      // An empty order shows idle; the link holds it back until afterCompleteMs after a complete.
      if (!shown.lineItems.length && !shown.fees?.length && !shown.shipping?.length) {
        send('cart', null);
        return remember();
      }
      const receipt = buildReceiptData(shown, options.receipt ?? { storeName: '' });
      // A switch to another sale is never a payment event.
      const event = sameOrder ? derivePaymentEvent(prior?.payments ?? [], shown.payments, prior?.completed ?? false,
        completed, shown.balanceDueMinor, options) : null;
      if (event) {
        lastPayment = { orderId: shown.id, payment: event };
        send('payment', receipt, event);
      } else if (stage.kind === 'tender' || completed) {
        // A cash tender adds no pending leg: the display stays on the payment screen while the cashier tenders.
        // On the receipt the live builder may still emit: the complete stays up, on the link's original idle timer.
        const held = lastPayment?.orderId === shown.id ? lastPayment.payment : null;
        send('payment', receipt, held ?? { state: completed ? 'complete' : 'started' });
      } else {
        send('cart', receipt);
      }
      remember();
    },
    close() {
      if (closed) return;
      closed = true;
      link.showCart(null);
    },
  };
}
