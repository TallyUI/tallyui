import type { ReceiptData } from '../receipt/types';
import { displayCart, makeEnvelope, type DisplayConfig, type DisplayEnvelope, type DisplayPayment } from './protocol';
import type { DisplayTransport } from './transport';

export interface DisplayClock { setTimeout(run: () => void, ms: number): unknown; clearTimeout(handle: unknown): void }

const systemClock: DisplayClock = {
  setTimeout: (run, ms) => setTimeout(run, ms),
  clearTimeout: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
};

export interface DisplayLink {
  /** The order as it stands; null, or no lines, fees or shipping, shows idle. */
  showCart(receipt: ReceiptData | null): void;
  showPayment(receipt: ReceiptData, payment: DisplayPayment): void;
  close(): void;
}

/**
 * The till's side of the customer display. Ported from WCPOS v2 (monorepo main 51e7c43,
 * core/services/customer-display/display-session.ts and service.ts) without the WebRTC: each `display.hello` is
 * answered with `display.config` under the hello's id, then the current state; a completed payment stays up for
 * `config.idle.afterCompleteMs` before `display.idle`, and an empty cart inside that window waits for it.
 */
export function createDisplayLink(transport: DisplayTransport, options: { config: DisplayConfig; clock?: DisplayClock }): DisplayLink {
  const { config, clock = systemClock } = options;
  let current: DisplayEnvelope | null = null;
  let lastKey = '';
  let idleTimer: unknown = null;
  const cancelIdle = () => {
    if (idleTimer !== null) clock.clearTimeout(idleTimer);
    idleTimer = null;
  };
  // As v2's lastPublished: the same state twice is sent once.
  const publish = (envelope: DisplayEnvelope) => {
    const key = JSON.stringify([envelope.action, envelope.payload]);
    if (key === lastKey) return;
    lastKey = key;
    current = envelope;
    transport.send(envelope);
  };
  const idle = () => publish(makeEnvelope('display.idle', { reason: 'no_cart' }));
  const unsubscribe = transport.onMessage((envelope) => {
    if (envelope.action !== 'display.hello') return;
    transport.send(makeEnvelope('display.config', { ...config, template: envelope.payload.template }, envelope.id));
    if (current) transport.send(current);
  });
  return {
    showCart(receipt) {
      if (!receipt || receipt.lineItems.length + receipt.fees.length + receipt.shipping.length === 0) {
        if (idleTimer === null) idle();
        return;
      }
      cancelIdle();
      publish(makeEnvelope('cart.updated', displayCart(receipt)));
    },
    showPayment(receipt, payment) {
      cancelIdle();
      publish(makeEnvelope('payment.state', { ...displayCart(receipt), ...payment }));
      if (payment.state === 'complete') {
        idleTimer = clock.setTimeout(() => {
          idleTimer = null;
          idle();
        }, config.idle.afterCompleteMs);
      }
    },
    close() {
      cancelIdle();
      unsubscribe();
    },
  };
}
