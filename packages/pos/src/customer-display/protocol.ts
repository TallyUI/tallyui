import { uuidv7 } from '../pos-order/uuidv7';
import type { ReceiptData } from '../receipt/types';

// Ported from WCPOS v2 (monorepo main 51e7c43, core/services/customer-display/envelope.ts). v2's envelope key
// `wcpos: 1` is `tally: 1` here: same place and value, so a v2 message is refused by version, never misread.
export const DISPLAY_PROTOCOL_VERSION = 1;

export type PaymentPhase = 'started' | 'approved' | 'declined' | 'complete';
export interface DisplayTemplate { id: string | number; version: number }
/** The cart snapshot: the receipt as it stands, and whether lines were dropped to fit the message cap. */
export interface DisplayCart { receipt: ReceiptData; linesTruncated: boolean }
export interface DisplayPayment { state: PaymentPhase; leg?: { method: string; amountMinor: number }; message?: string }
export interface DisplayConfig {
  contract: '1.0';
  display: { id: string; name: string };
  store: { id: string; name: string; currency: string; locale: string; timezone?: string; logo?: string };
  presentation_hints: Record<string, unknown>;
  i18n: Record<string, string>;
  template?: DisplayTemplate;
  idle: { afterCompleteMs: number };
}
export interface DisplayPayloads {
  'cart.updated': DisplayCart;
  'payment.state': DisplayCart & DisplayPayment;
  'display.idle': { reason: string };
  /** Sent by the display to the till. */
  'display.hello': { template: DisplayTemplate };
  'display.config': DisplayConfig;
}
export type DisplayAction = keyof DisplayPayloads;
export const DISPLAY_ACTIONS: readonly DisplayAction[] = [
  'cart.updated', 'payment.state', 'display.idle', 'display.hello', 'display.config',
];
export type DisplayEnvelope<A extends DisplayAction = DisplayAction> =
  { [K in A]: { tally: 1; id: string; action: K; payload: DisplayPayloads[K] } }[A];

export function makeEnvelope<A extends DisplayAction>(action: A, payload: DisplayPayloads[A], id = uuidv7()): DisplayEnvelope<A> {
  return { tally: DISPLAY_PROTOCOL_VERSION, id, action, payload } as DisplayEnvelope<A>;
}

export function displayCart(receipt: ReceiptData): DisplayCart {
  return { receipt, linesTruncated: false };
}

export type DecodeRefusal = 'malformed' | 'version' | 'action' | 'payload';
export type DecodeResult = { ok: true; envelope: DisplayEnvelope } | { ok: false; refusal: DecodeRefusal };

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const isStr = (v: unknown): v is string => typeof v === 'string';
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isTemplate = (v: unknown) => isObj(v) && (isStr(v.id) || isNum(v.id)) && isNum(v.version);
const isLine = (v: unknown) => isObj(v) && isStr(v.name) && isNum(v.quantity) && isNum(v.displayAmountMinor);
const isCart = (p: Obj) => typeof p.linesTruncated === 'boolean' && isObj(p.receipt) && isStr(p.receipt.currency)
  && isObj(p.receipt.totals) && isNum(p.receipt.totals.totalMinor)
  && Array.isArray(p.receipt.lineItems) && p.receipt.lineItems.every(isLine);
const PHASES: readonly unknown[] = ['started', 'approved', 'declined', 'complete'];

const PAYLOAD_CHECKS: { [A in DisplayAction]: (p: Obj) => boolean } = {
  'cart.updated': isCart,
  'payment.state': (p) => isCart(p) && PHASES.includes(p.state) && (p.message === undefined || isStr(p.message))
    && (p.leg === undefined || (isObj(p.leg) && isStr(p.leg.method) && isNum(p.leg.amountMinor))),
  'display.idle': (p) => isStr(p.reason),
  'display.hello': (p) => isTemplate(p.template),
  'display.config': (p) => p.contract === '1.0'
    && isObj(p.display) && isStr(p.display.id) && isStr(p.display.name)
    && isObj(p.store) && isStr(p.store.id) && isStr(p.store.name) && isStr(p.store.currency) && isStr(p.store.locale)
    && isObj(p.presentation_hints) && isObj(p.i18n) && (p.template === undefined || isTemplate(p.template))
    && isObj(p.idle) && isNum(p.idle.afterCompleteMs),
};

/** Reads a message from the other side. Never throws: anything it cannot trust comes back as a refusal. */
export function decode(text: unknown): DecodeResult {
  if (!isStr(text)) return { ok: false, refusal: 'malformed' };
  let message: unknown;
  try {
    message = JSON.parse(text);
  } catch {
    return { ok: false, refusal: 'malformed' };
  }
  if (!isObj(message) || !isStr(message.id)) return { ok: false, refusal: 'malformed' };
  if (message.tally !== DISPLAY_PROTOCOL_VERSION) return { ok: false, refusal: 'version' };
  const action = message.action as DisplayAction;
  if (!DISPLAY_ACTIONS.includes(action)) return { ok: false, refusal: 'action' };
  if (!isObj(message.payload) || !PAYLOAD_CHECKS[action](message.payload)) return { ok: false, refusal: 'payload' };
  return { ok: true, envelope: message as unknown as DisplayEnvelope };
}
