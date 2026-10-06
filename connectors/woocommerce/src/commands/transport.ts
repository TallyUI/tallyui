// ADR-073; M3-spike-paid-push.md proves paid order pushes against WCPOS 1.10.20.
import { minorUnitDigits, moneyFromDecimalString, moneyFromMajor, type CommandResult, type OrderCreateEnvelope } from '@tallyui/core';

export type WooTransportOutcome =
  | { kind: 'results'; results: CommandResult[] }
  | { kind: 'unauthorized' }
  | { kind: 'refused'; status: number; reason: string }
  | { kind: 'retry'; reason: string; retryAfterMs?: number };

export interface WooCommandTransportOptions {
  baseUrl: string;
  getHeaders: () => Record<string, string> | Promise<Record<string, string>>;
  fetch?: typeof fetch;
  timeoutMs?: number;
}

export function wooMinorFromDecimal(text: string, currency: string): number | undefined {
  const trimmed = text.trim();
  if (!/^\d+(\.\d+)?$/.test(trimmed)) return undefined;
  const digits = minorUnitDigits(currency);
  const [whole, fraction = ''] = trimmed.split('.');
  let end = fraction.length;
  while (end > digits && fraction[end - 1] === '0') end--;
  if (end > digits) return moneyFromMajor(trimmed, currency)?.amount;
  return moneyFromDecimalString(end ? `${whole}.${fraction.slice(0, end)}` : whole, currency)?.amount;
}

export interface WooLocalOrder { lines: ReadonlyArray<{ id: string; netMicros?: string }> }

export function toWooOrderPayload(envelope: OrderCreateEnvelope, local?: WooLocalOrder): { payload: Record<string, unknown> } | { error: { code: string; message: string } } {
  const p = envelope.payload;
  if (envelope.version === 5 && (p.fees?.length || p.shipping?.length || p.lines.some((line) => line.custom))) {
    return { error: { code: 'invalid_payload', message: 'Fees, shipping and custom lines are not supported by this connector yet.' } };
  }
  if (p.payments.length !== 1) {
    return { error: { code: 'invalid_payload', message: 'WooCommerce orders take one payment.' } };
  }
  for (const line of p.lines) {
    if (!/^[1-9]\d*$/.test(line.variantId ?? '') || !Number.isSafeInteger(Number(line.variantId))) {
      return { error: { code: 'invalid_payload', message: `Line ${line.clientLineId} has no WooCommerce product id.` } };
    }
  }
  const digits = p.display?.exponent ?? minorUnitDigits(p.currency);
  const major = (minor: number) => (minor / 10 ** digits).toFixed(digits);
  const cash = p.payments[0].method === 'cash';
  const line_items = [];
  for (const line of p.lines) {
    let subtotal = major(line.unitPriceMinor * line.quantity);
    let total = major(line.unitPriceMinor * line.quantity - (line.discountMinor ?? 0));
    if (line.taxInclusive ?? p.pricesIncludeTax) {
      if ((line.discountMinor ?? 0) > 0) {
        return { error: { code: 'unsupported_tax_mode', message: 'Discounted tax-inclusive lines are not supported for WooCommerce yet.' } };
      }
      const netMicros = local?.lines.find((stored) => stored.id === line.clientLineId)?.netMicros;
      if (netMicros === undefined) {
        return { error: { code: 'unsupported_tax_mode', message: "Tax-inclusive prices need the till's WooCommerce tax figures; update the till." } };
      }
      const net = BigInt(netMicros), divisor = 10n ** BigInt(digits);
      if (net < 0n) {
        return { error: { code: 'invalid_payload', message: `Line ${line.clientLineId} has a negative net.` } };
      }
      if (net % divisor !== 0n) {
        return { error: { code: 'invalid_payload', message: `Line ${line.clientLineId} has a net finer than 6 decimals.` } };
      }
      const micros = net / divisor;
      subtotal = total = `${micros / 1000000n}.${(micros % 1000000n).toString().padStart(6, '0')}`;
    }
    line_items.push({ product_id: Number(line.variantId), quantity: line.quantity, subtotal, total });
  }
  return { payload: {
    status: 'completed', set_paid: true, currency: p.currency,
    payment_method: cash ? 'pos_cash' : 'pos_card', payment_method_title: cash ? 'Cash' : 'Card',
    line_items,
    meta_data: [{ key: '_woocommerce_pos_uuid', value: p.clientOrderId }],
    ...(p.customer?.customerId && /^\d+$/.test(p.customer.customerId) ? { customer_id: Number(p.customer.customerId) } : {}),
    ...(p.customer?.email ? { billing: { email: p.customer.email } } : {}),
  } };
}

export function createWooCommandTransport(options: WooCommandTransportOptions): {
  send(batch: OrderCreateEnvelope[], context?: { local?: { orders?: ReadonlyMap<string, WooLocalOrder> } }): Promise<WooTransportOutcome>;
} {
  const fetch = options.fetch ?? globalThis.fetch;
  let baseUrl = options.baseUrl;
  while (baseUrl.endsWith('/')) baseUrl = baseUrl.slice(0, -1);
  return {
    async send(batch, context) {
      const results: CommandResult[] = [];
      for (const envelope of batch) {
        const mapped = toWooOrderPayload(envelope, context?.local?.orders?.get(envelope.id));
        if ('error' in mapped) {
          results.push({ id: envelope.id, status: 'rejected', error: mapped.error });
          continue;
        }
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? 30000);
        let outcome: WooTransportOutcome;
        try {
          const response = await fetch(`${baseUrl}/push/orders`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...await options.getHeaders() },
            body: JSON.stringify({ mutationId: envelope.id, operation: 'create', collection: 'orders',
              recordId: envelope.payload.clientOrderId, baseRevision: null, payload: mapped.payload }),
            signal: controller.signal,
          });
          const status = response.status;
          const retryAfter = response.headers.get('Retry-After');
          const seconds = retryAfter === null ? NaN : Number(retryAfter);
          const retry = (reason: string): WooTransportOutcome => ({ kind: 'retry', reason,
            ...(Number.isFinite(seconds) && seconds >= 0 ? { retryAfterMs: seconds * 1000 } : {}),
          });
          if (status === 401) outcome = { kind: 'unauthorized' };
          else if (![200, 201, 400, 422, 403, 413, 415].includes(status)) outcome = retry(`status_${status}`);
          else {
            let body;
            try { body = await response.json(); } catch {}
            if (status === 200 || status === 201) {
              const doc = body?.document;
              const totalMinor = wooMinorFromDecimal(String(doc?.total), envelope.payload.currency);
              if (doc?.id == null || totalMinor === undefined) {
                outcome = retry(controller.signal.aborted ? 'timeout' : 'bad_body');
              } else {
                results.push({ id: envelope.id, status: 'applied', serverRefs: {
                  orderId: String(doc.id), displayId: String(doc.number ?? doc.id), totalMinor,
                }, ...(totalMinor !== envelope.payload.totalMinor ? { warnings: [{
                  code: 'total_mismatch' as const, expectedMinor: envelope.payload.totalMinor, serverMinor: totalMinor,
                }] } : {}) });
                continue;
              }
            } else if (status === 400 || status === 422) {
              results.push({ id: envelope.id, status: 'rejected', error: {
                code: status === 400 && body?.code === 'wcpos_insufficient_stock' ? 'insufficient_stock' : 'invalid_payload',
                message: body?.message ?? `status_${status}`,
              } });
              continue;
            } else {
              outcome = { kind: 'refused', status, reason: body?.message ?? body?.code ?? `status_${status}` };
            }
          }
        } catch {
          outcome = { kind: 'retry', reason: controller.signal.aborted ? 'timeout' : 'network' };
        } finally {
          clearTimeout(timeout);
        }
        return results.length ? { kind: 'results', results } : outcome;
      }
      return { kind: 'results', results };
    },
  };
}
