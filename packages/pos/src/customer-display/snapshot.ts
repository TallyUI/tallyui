import type { DisplayCart, DisplayEnvelope } from './protocol';

// Trimming ported from WCPOS v2's serialiseSnapshot (monorepo main 51e7c43, core/services/customer-display/snapshot.ts).
/** The display contract caps each message at 200 KiB: UTF-8 bytes of the JSON text. */
export const MAX_MESSAGE_BYTES = 200 * 1024;
/** v2 bounds the note first, so totals and payments are never displaced. */
const MAX_NOTE_BYTES = 1024;
/** v2 keeps eight metadata entries per line; here a line's attributes. */
const MAX_LINE_ATTRIBUTES = 8;

const encoder = new TextEncoder();
export function messageBytes(text: string): number {
  return encoder.encode(text).byteLength;
}

function truncateUtf8(text: string, limit: number): string {
  if (messageBytes(text) <= limit) return text;
  let bytes = 0;
  let result = '';
  for (const character of text) {
    bytes += messageBytes(character);
    if (bytes > limit) break;
    result += character;
  }
  return result;
}

function trimCart(cart: DisplayCart, size: () => number): void {
  const { receipt } = cart;
  if (typeof receipt.footer?.note === 'string') receipt.footer.note = truncateUtf8(receipt.footer.note, MAX_NOTE_BYTES);
  if (size() <= MAX_MESSAGE_BYTES) return;
  for (const line of receipt.lineItems) {
    if (line.attributes) line.attributes = Object.fromEntries(Object.entries(line.attributes).slice(0, MAX_LINE_ATTRIBUTES));
  }
  if (size() <= MAX_MESSAGE_BYTES) return;
  cart.linesTruncated = true;
  let excess = size() - MAX_MESSAGE_BYTES;
  // Oldest lines go first and the newest stay, as in v2. The drop is counted from the line sizes (each line plus
  // its comma), so a huge cart is not re-serialised once per line. At least one goes, as linesTruncated says.
  let drop = 0;
  while ((excess > 0 || drop === 0) && drop < receipt.lineItems.length) excess -= messageBytes(JSON.stringify(receipt.lineItems[drop++])) + 1;
  receipt.lineItems.splice(0, drop);
  while (size() > MAX_MESSAGE_BYTES && receipt.lineItems.length > 0) receipt.lineItems.shift();
}

/**
 * Serialises a message within MAX_MESSAGE_BYTES, trimming a copy in v2's order. If it is still over after every
 * step (a non-cart action, or a receipt whose fixed fields alone are too big), the text is returned anyway, as v2
 * sends it; check with messageBytes.
 */
export function encode(envelope: DisplayEnvelope): string {
  let text = JSON.stringify(envelope);
  if (messageBytes(text) <= MAX_MESSAGE_BYTES) return text;
  const copy = JSON.parse(text) as DisplayEnvelope;
  const size = () => messageBytes(text = JSON.stringify(copy));
  if (copy.action === 'cart.updated' || copy.action === 'payment.state') trimCart(copy.payload, size);
  else if (copy.action === 'display.config') {
    copy.payload.i18n = {};
    if (size() > MAX_MESSAGE_BYTES) {
      copy.payload.presentation_hints = {};
      size();
    }
  }
  return text;
}
