import type { DisplayCart, DisplayConfig, DisplayEnvelope, DisplayPayment } from './protocol';

/** What the customer display shows: nothing to sell, the cart, or a payment in progress or complete. */
export type DisplayView =
  | { screen: 'idle'; reason: string }
  | { screen: 'cart'; cart: DisplayCart }
  | { screen: 'payment'; cart: DisplayCart; payment: DisplayPayment };
export interface DisplayState { config: DisplayConfig | null; view: DisplayView }

export const initialDisplayState: DisplayState = { config: null, view: { screen: 'idle', reason: 'no_cart' } };

/** The display side's state, driven by decoded messages from the till. */
export function displayReducer(state: DisplayState, envelope: DisplayEnvelope): DisplayState {
  switch (envelope.action) {
    case 'display.config':
      return { ...state, config: envelope.payload };
    case 'display.idle':
      return { ...state, view: { screen: 'idle', reason: envelope.payload.reason } };
    case 'cart.updated':
      return { ...state, view: { screen: 'cart', cart: envelope.payload } };
    case 'payment.state': {
      const { receipt, linesTruncated, state: phase, leg, message } = envelope.payload;
      const payment: DisplayPayment = { state: phase, ...(leg ? { leg } : {}), ...(message !== undefined ? { message } : {}) };
      return { ...state, view: { screen: 'payment', cart: { receipt, linesTruncated }, payment } };
    }
    case 'display.hello':
      // Travels from the display to the till, so the display's own state does not change.
      return state;
  }
}
