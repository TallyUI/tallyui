// ADR-073; M3-spike-paid-push.md proves paid order pushes against WCPOS 1.10.20.
import { minorUnitDigits, moneyFromDecimalString, moneyFromMajor, woocommerceTax, type CommandResult, type OrderAddress, type OrderCreateEnvelope } from '@tallyui/core';
import { WCPOS_UUID_META_KEY } from '../replication/products';
import { wooLedgerVersion } from '../store-settings';
import { createWooCall, type Answer } from './http';
import { paymentRecordBody } from './money-body';

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
  /** True when the store's `/status` lists `order_payments_list` (`ServerCapabilities.multiplePayments`): an order may
   * then carry several payments, recorded in `_woocommerce_pos_payments`. */
  acceptsPaymentsList?: boolean | (() => boolean | Promise<boolean>);
  /** True when the store passes the coupons gate (`ServerCapabilities.coupons`, ADR-077 R2/R3). Read at push time;
   * absent means closed, so a sale still carrying coupons is refused with `coupon_invalid` and no request is made. */
  acceptsCoupons?: boolean | (() => boolean | Promise<boolean>);
  /** True when the store carries cash rounding (`ServerCapabilities.cashRounding`, ADR-094): the fork's `order_create_v5` stores
   * declare it; stock stores do not, as nothing has been proven there. Pass it from `cashRounding` as `acceptsCoupons` is passed
   * from `coupons`. Read at push time; absent means closed, so a sale carrying `cashRoundings` is refused as `invalid_payload`
   * with `cash_rounding_unsupported` and no request is made. On a WCPOS 2.0 (ledger) store the transport refuses it whatever
   * this says. */
  acceptsCashRounding?: boolean | (() => boolean | Promise<boolean>);
  /** Pass `ServerCapabilities.taxExempt` for stock stores that carry exclusive, coupon-free exempt sales.
   * Read at push time; absent means closed (`invalid_payload` with `tax_exempt_unsupported`, no request). */
  acceptsTaxExempt?: boolean | (() => boolean | Promise<boolean>);
  /** True for a WCPOS 2.0.x store, whose push carries no money: the sale is pushed `pending`, then paid through the
   * payment ledger. Read at push time; absent, the transport reads `/site` once and decides from `wcpos_version`; until
   * it can, `send` retries with what `/site` answered: `network` or `timeout` with no answer, `status_<n>` for a non-2xx
   * answer (`status_404` when the plugin is missing), `store_version_unknown` for a 2xx without a readable version. A 401,
   * or a 403 `rest_forbidden`, is `unauthorized` instead. */
  ledgerPayments?: boolean | (() => boolean | Promise<boolean>);
}

// Any-version 8-4-4-4-12 uuid, as WCPOS checks a payment id (v2.0.4 includes/Sync/Pos_Uuid.php:46-48, Ledger.php:1645).
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// A sale's minor amount as Woo's decimal string, at the display exponent else the currency's: one rule for bodies and messages.
const wooDigits = (p: OrderCreateEnvelope['payload']) => p.display?.exponent ?? minorUnitDigits(p.currency);
const wooMajor = (minor: number, digits: number) => (minor / 10 ** digits).toFixed(digits);

/** A money command for the ledger, sent with the order revision it was built against. */
export interface WooMoneyCommand { path: 'payments' | 'close'; body: Record<string, unknown> }

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

export interface WooLocalOrder {
  lines: ReadonlyArray<{ id: string; netMicros?: string; /** The line's discount in its own tax mode (gross when inclusive), as stored. */ discountMinor?: number;
    taxLines?: ReadonlyArray<{ rateId?: number; compound?: boolean; ratePpm: number }> }>;
  fees?: ReadonlyArray<{ id: string; netMicros?: string;
    /** The stored charge (ADR-075): the wire amountMinor may be its display row (#1341). */ amountMinor?: number }>;
  shipping?: ReadonlyArray<{ id: string; netMicros?: string;
    /** The stored charge (ADR-075): the wire amountMinor may be its display row (#1341). */ amountMinor?: number }>;
}

// Match woocommerceLine's pre-coupon net calculation exactly (ADR-076).
function preCouponNetMicros(minor: bigint, digits: number, stored: WooLocalOrder['lines'][number] | undefined): string | undefined {
  if (!stored || stored.taxLines?.some((tax) => typeof tax.rateId !== 'number' || typeof tax.compound !== 'boolean')) return undefined;
  const factor = 10 ** digits, precision = woocommerceTax.getRoundingPrecision(digits);
  const input = { amount: Number(minor) / factor, rates: (stored.taxLines ?? []).map((tax, index) => ({
    id: tax.rateId!, rate: String(tax.ratePpm / 10000), compound: tax.compound!, priority: index, order: index,
  })), amountIncludesTax: true, dp: digits, perRatePrecision: precision };
  const result = woocommerceTax.calculateTaxes(input);
  const net = woocommerceTax.roundHalfUp(input.amount - result.total, precision);
  return String(Math.round(net * factor * 1e6));
}

// Repeated until stable so no removal can join a new tag (CodeQL js/incomplete-multi-character-sanitization).
function stripTags(text: string): string {
  let previous;
  do {
    previous = text;
    text = text.replace(/<[^>]*>/g, '');
  } while (text !== previous);
  return text;
}

// The dev store keyed "Size" as `size` and "Shoe Size" as `shoe-size` (#495 c/d proof, 2026-10-14): lower case, a space
// as a hyphen. A name with any other character is not sent, so Woo keeps its own empty row for it, as before.
function wooAnyAttributeKey(name: string): string | undefined {
  return /^[A-Za-z0-9]+(?:[ -][A-Za-z0-9]+)*$/.test(name) ? name.toLowerCase().replace(/ /g, '-') : undefined;
}

function decodeCouponMessage(message: unknown): string {
  const entities: Record<string, string> = { quot: '"', amp: '&', lt: '<', gt: '>', apos: "'" };
  return stripTags(typeof message === 'string' ? message : '')
    .replace(/&(quot|amp|lt|gt|apos|#\d+|#x[\da-f]+);/gi, (_, entity: string) => entities[entity.toLowerCase()]
      ?? ((value: number) => value > 0x10FFFF ? _ : String.fromCodePoint(value))(
        parseInt(entity.slice(entity[1].toLowerCase() === 'x' ? 2 : 1), entity[1].toLowerCase() === 'x' ? 16 : 10)))
    .replace(/[<>]/g, '')
    .replace(/\s+/g, ' ').trim() || 'status_400';
}

// order.create 8's address keys and wc/v3's names for them (#722).
const WOO_ADDRESS_KEYS = [['firstName', 'first_name'], ['lastName', 'last_name'], ['company', 'company'], ['address1', 'address_1'],
  ['address2', 'address_2'], ['city', 'city'], ['state', 'state'], ['postcode', 'postcode'], ['country', 'country'], ['phone', 'phone']] as const;

function wooAddress(address: OrderAddress | undefined): Record<string, string> {
  return Object.fromEntries(WOO_ADDRESS_KEYS.flatMap(([ours, theirs]) => typeof address?.[ours] === 'string' ? [[theirs, address[ours]]] : []));
}

export function toWooOrderPayload(envelope: OrderCreateEnvelope, local?: WooLocalOrder, options?: { paymentsList?: boolean; ledger?: boolean }): { payload: Record<string, unknown>; money?: WooMoneyCommand[] } | { error: { code: string; message: string } } {
  const p = envelope.payload;
  if (p.payments.length === 0 || (p.payments.length > 1 && !options?.paymentsList)) {
    return { error: { code: 'invalid_payload', message: 'WooCommerce orders take one payment.' } };
  }
  const ledger = options?.ledger === true;
  const closes = p.totalMinor === 0 && !p.payments.some((payment) => payment.amountMinor > 0);
  if (ledger && p.payments.some((payment) => !UUID.test(payment.clientPaymentId))) {
    return { error: { code: 'invalid_payload', message: 'WooCommerce POS 2.0 records each payment by a UUID; this sale has a payment without one.' } };
  }
  if (ledger && closes && !UUID.test(envelope.id)) return { error: { code: 'invalid_payload', message: "WooCommerce POS 2.0 closes a free sale by a UUID command id; this sale's id is not one." } };
  // Ledger::validate_input refuses an amount that is not positive (v2.0.4 Ledger.php:1648-1654).
  if (ledger && !closes && p.payments.some((payment) => payment.amountMinor <= 0)) {
    return { error: { code: 'invalid_payload', message: 'Every payment on a WooCommerce POS 2.0 sale must be more than zero.' } };
  }
  if (p.payments.length > 20) {
    return { error: { code: 'invalid_payload', message: 'WooCommerce records at most 20 payments.' } };
  }
  if (p.payments.length > 1 && p.payments.reduce((sum, payment) => sum + payment.amountMinor, 0) !== p.totalMinor) {
    return { error: { code: 'invalid_payload', message: 'Payments do not add up to the order total.' } };
  }
  for (const line of p.lines) {
    if (!line.custom && (!/^[1-9]\d*$/.test(line.variantId ?? '') || !Number.isSafeInteger(Number(line.variantId)))) {
      return { error: { code: 'invalid_payload', message: `Line ${line.clientLineId} has no WooCommerce product id.` } };
    }
  }
  const digits = wooDigits(p);
  const major = (minor: number) => wooMajor(minor, digits);
  const inclusiveNet = (netMicros: string | undefined, id: string) => {
    if (netMicros === undefined) {
      return { error: { code: 'unsupported_tax_mode', message: "Tax-inclusive prices need the till's WooCommerce tax figures; update the till." } };
    }
    const net = BigInt(netMicros), divisor = 10n ** BigInt(digits);
    if (net < 0n) {
      return { error: { code: 'invalid_payload', message: `Line ${id} has a negative net.` } };
    }
    if (net % divisor !== 0n) {
      return { error: { code: 'invalid_payload', message: `Line ${id} has a net finer than 6 decimals.` } };
    }
    const micros = net / divisor;
    return `${micros / 1000000n}.${(micros % 1000000n).toString().padStart(6, '0')}`;
  };
  // 2.10 PR4: an exclusive store gets a charge's 6-dp net when it is not a whole cent.
  const chargeTotal = (amountMinor: number, netMicros: string | undefined, id: string) =>
    p.pricesIncludeTax || (netMicros !== undefined && BigInt(netMicros) !== BigInt(amountMinor) * 1000000n)
      ? inclusiveNet(netMicros, id) : major(amountMinor);
  const line_items = [];
  for (const line of p.lines) {
    const inclusive = line.taxInclusive ?? p.pricesIncludeTax;
    const stored = local?.lines.find((entry) => entry.id === line.clientLineId);
    let total = major(line.unitPriceMinor * line.quantity - (line.discountMinor ?? 0));
    let subtotal = total;
    if (inclusive) {
      const net = inclusiveNet(stored?.netMicros, line.clientLineId);
      if (typeof net !== 'string') return net;
      subtotal = total = net;
    }
    const custom = line.custom;
    let price = major(line.unitPriceMinor);
    if (p.coupons?.length) {
      // An inclusive line's wire discount is net and can round to 0 (#1342): the stored gross one is what Woo needs.
      const discount = !inclusive ? line.discountMinor ?? 0
        : stored?.discountMinor ?? ((line.discountMinor ?? 0) > 0 ? undefined : 0);
      if (discount === undefined) return { error: { code: 'unsupported_tax_mode', message: "Tax-inclusive prices need the till's WooCommerce tax figures; update the till." } };
      const quantity = BigInt(line.quantity), minor = BigInt(line.unitPriceMinor) * quantity - BigInt(discount);
      if (inclusive) {
        const net = inclusiveNet(preCouponNetMicros(minor, digits, stored), line.clientLineId);
        if (typeof net !== 'string') return net;
        subtotal = total = net;
      }
      const divisor = quantity * 10n ** BigInt(digits), micros = (minor * 1000000n * 2n + divisor) / (divisor * 2n);
      price = minor % quantity === 0n ? major(Number(minor / quantity))
        : `${micros / 1000000n}.${(micros % 1000000n).toString().padStart(6, '0')}`;
    }
    const regular_price = p.coupons?.length && line.regularUnitPriceMinor !== undefined ? major(line.regularUnitPriceMinor) : price;
    const picked = (line.anyAttributes ?? []).flatMap((name) => {
      const key = wooAnyAttributeKey(name);
      const value = line.attributes?.[name];
      return key && value ? [{ key, value }] : [];
    });
    const lineMeta = [...(p.coupons?.length ? [{ key: '_woocommerce_pos_data', value: JSON.stringify({ price, regular_price }) }] : []), ...picked];
    line_items.push(custom ? {
      product_id: 0, name: custom.name, ...(custom.sku ? { sku: custom.sku } : {}), quantity: line.quantity, subtotal, total,
      tax_class: custom.taxClass ?? '', meta_data: [{ key: '_woocommerce_pos_data',
        value: JSON.stringify({ price, regular_price, tax_status: custom.taxStatus }) }],
    } : { product_id: Number(line.variantId), quantity: line.quantity, subtotal, total,
      ...(lineMeta.length ? { meta_data: lineMeta } : {}) });
  }
  const fee_lines = [], shipping_lines = [];
  for (const fee of p.fees ?? []) {
    const stored = local?.fees?.find((entry) => entry.id === fee.clientFeeId);
    const total = chargeTotal(stored?.amountMinor ?? fee.amountMinor, stored?.netMicros, fee.clientFeeId);
    if (typeof total !== 'string') return total;
    fee_lines.push({ name: fee.name, total, tax_status: fee.taxStatus, tax_class: fee.taxClass ?? '' });
  }
  // ADR-094: a tax-none rounding's total is its signed amount in every tax mode (22 Nov fork proofs), so it never goes through chargeTotal.
  for (const entry of p.cashRoundings ?? []) fee_lines.push({ name: 'Rounding', total: major(entry.minor), tax_status: 'none', tax_class: '' });
  for (const shipping of p.shipping ?? []) {
    const stored = local?.shipping?.find((entry) => entry.id === shipping.clientShippingId);
    const total = chargeTotal(stored?.amountMinor ?? shipping.amountMinor, stored?.netMicros, shipping.clientShippingId);
    if (typeof total !== 'string') return total;
    // WCPOS (1.10.20 and 2.0.4 Orders.php) clears a shipping line's taxes when this meta says `none`.
    shipping_lines.push({ method_id: shipping.methodId ?? 'pos', method_title: shipping.name, total,
      ...(shipping.taxStatus === 'none' ? { meta_data: [{ key: '_woocommerce_pos_data', value: JSON.stringify({ tax_status: 'none' }) }] } : {}) });
  }
  const primary = p.payments.reduce((largest, payment) => payment.amountMinor > largest.amountMinor ? payment : largest);
  const cash = primary.method === 'cash';
  const meta_data = [{ key: WCPOS_UUID_META_KEY, value: p.clientOrderId }];
  if (p.taxExempt === true) meta_data.push({ key: 'is_vat_exempt', value: 'yes' });
  if (p.payments.length > 1 && !ledger) {
    meta_data.push({ key: '_woocommerce_pos_payments', value: JSON.stringify(p.payments.map((payment) => ({
      method: payment.method === 'cash' ? 'pos_cash' : 'pos_card',
      title: payment.method === 'cash' ? 'Cash' : 'Card', amount: major(payment.amountMinor),
      ...(payment.reference !== undefined ? { reference: payment.reference } : {}),
      ...(payment.method === 'cash' && payment.tenderedMinor !== undefined ? { tendered: major(payment.tenderedMinor) } : {}),
      ...(payment.method === 'cash' && payment.changeMinor !== undefined ? { change: major(payment.changeMinor) } : {}),
    }))) });
  }
  // Version 8 (#722): WCPOS taxes the order on the address its meta names (billing, or shipping with no fallback), else the base.
  if (p.taxAddress) meta_data.push({ key: '_woocommerce_pos_tax_based_on', value: p.taxAddress });
  const billing = { ...(p.customer?.email ? { email: p.customer.email } : {}), ...(p.taxAddress ? wooAddress(p.customer?.billing) : {}) };
  const shipping = p.taxAddress && p.customer?.shipping ? wooAddress(p.customer.shipping) : undefined;
  // WCPOS 2.0 pushes only open statuses and strips money keys (v2.0.4 Writers/Pushable_Document.php:36,68-70; Services/
  // Pos_Order_Audit.php:72): a ledger sale is pushed pending, then one `record` per payment (API/V2/Payments_Controller.php:
  // 62-75,138-163; id, method_id, positive amount, matching currency, cash-only tendered: Ledger.php:603-636,1644-1661), or a
  // free sale closed (Payments_Controller.php:69,172-179) with the envelope id at version nibble 8 as its uuid command_id
  // (Money_Command.php:70-72): the same on every retry, never equal to a till's v7 id.
  const money: WooMoneyCommand[] | undefined = !ledger ? undefined : closes
    ? [{ path: 'close', body: { command_id: `${envelope.id.slice(0, 14)}8${envelope.id.slice(15)}` } }]
    : p.payments.map((payment) => ({ path: 'payments', body: paymentRecordBody({ ...payment, id: payment.clientPaymentId }, p.currency, digits) }));
  return { ...(money ? { money } : {}), payload: {
    ...(ledger ? { status: 'pending', currency: p.currency } : {
      status: 'completed', set_paid: true, currency: p.currency,
      payment_method: cash ? 'pos_cash' : 'pos_card', payment_method_title: cash ? 'Cash' : 'Card',
    }),
    line_items,
    ...(fee_lines.length ? { fee_lines } : {}),
    ...(shipping_lines.length ? { shipping_lines } : {}),
    ...(p.coupons?.length ? { coupon_lines: p.coupons.map(({ code }) => ({ code })) } : {}),
    meta_data,
    ...(p.customer?.customerId && /^\d+$/.test(p.customer.customerId) ? { customer_id: Number(p.customer.customerId) } : {}),
    ...(Object.keys(billing).length ? { billing } : {}),
    ...(shipping ? { shipping } : {}),
    // Version 7 (ADR-083): the till froze and cut the note already, and wc/v3 sanitises it; no note, no key.
    ...(typeof p.note === 'string' && p.note.length > 0 ? { customer_note: p.note } : {}),
  } };
}

/** A capability option given as a value or read at push time; absent means closed. */
function capability(flag: boolean | (() => boolean | Promise<boolean>) | undefined): boolean | Promise<boolean> {
  return typeof flag === 'function' ? flag() : flag ?? false;
}

export function createWooCommandTransport(options: WooCommandTransportOptions): {
  send(batch: OrderCreateEnvelope[], context?: { local?: { orders?: ReadonlyMap<string, WooLocalOrder> } }): Promise<WooTransportOutcome>;
} {
  const { call, retry } = createWooCall(options);
  // WCPOS 2.0.0 and later (its pre-releases too) take money only through the ledger; 1.10.x and the fork have none.
  let siteLedger: boolean | undefined;
  // Until /site gives a readable version, its answer is returned so that `send` can retry with it.
  const ledgerStore = async (): Promise<boolean | Answer> => {
    if (options.ledgerPayments !== undefined) return capability(options.ledgerPayments);
    if (siteLedger === undefined) {
      const site = await call('site', { method: 'GET' });
      const ledger = wooLedgerVersion(site.body?.wcpos_version);
      if (ledger === undefined) return site;
      siteLedger = ledger;
    }
    return siteLedger;
  };
  return {
    async send(batch, context) {
      if (batch.length === 0) return { kind: 'results', results: [] };
      let ledger: boolean | Answer | undefined;
      const taxExempt = batch.some((envelope) => envelope.payload.taxExempt !== undefined) && await capability(options.acceptsTaxExempt);
      const paymentsList = await capability(options.acceptsPaymentsList);
      const coupons = batch.some((envelope) => envelope.payload.coupons?.length) && await capability(options.acceptsCoupons);
      const cashRounding = batch.some((envelope) => envelope.payload.cashRoundings !== undefined) && await capability(options.acceptsCashRounding);
      const results: CommandResult[] = [];
      for (const envelope of batch) {
        // Refuse exemption first so an exempt sale is never refused with a reopenable code.
        if (envelope.payload.taxExempt !== undefined && !taxExempt) {
          results.push({ id: envelope.id, status: 'rejected', error: { code: 'invalid_payload',
            message: "This store's WooCommerce connector does not carry tax exemption yet; complete the sale without it.", data: { storeCode: 'tax_exempt_unsupported' } } });
          continue;
        }
        if (envelope.payload.taxExempt && envelope.payload.pricesIncludeTax) {
          results.push({ id: envelope.id, status: 'rejected', error: { code: 'invalid_payload', data: { storeCode: 'tax_exempt_inclusive' },
            message: "This store's prices include tax; WooCommerce tax exemption is only carried where prices exclude it. Complete the sale without it." } });
          continue;
        }
        if (envelope.payload.taxExempt && envelope.payload.coupons?.length) {
          results.push({ id: envelope.id, status: 'rejected', error: { code: 'invalid_payload', data: { storeCode: 'tax_exempt_coupons' },
            message: 'WooCommerce tax exemption is not carried with coupons on this store. Remove the coupons, or complete the sale without exemption.' } });
          continue;
        }
        ledger ??= await ledgerStore();
        if (typeof ledger !== 'boolean') {
          if (results.length) return { kind: 'results', results };
          // As the register transport's shared() does: an expired or refused token asks for sign-in.
          if (ledger.status === 401 || (ledger.status === 403 && ledger.body?.code === 'rest_forbidden')) return { kind: 'unauthorized' };
          return ledger.status >= 200 && ledger.status < 300
            ? { kind: 'retry', reason: 'store_version_unknown' } : retry(ledger, `status_${ledger.status}`);
        }
        if (envelope.payload.coupons?.length && !coupons) {
          results.push({ id: envelope.id, status: 'rejected', error: { code: 'coupon_invalid',
            message: "This store's WooCommerce POS plugin does not accept coupons (1.9.0 or later is needed). Remove the coupon and complete the sale again.",
            data: { storeCode: 'coupons_unsupported' } } });
          continue;
        }
        // ADR-094: never dropped, which would push a wrong total; nothing is proven on a WCPOS 2.0 (ledger) store.
        if (envelope.payload.cashRoundings !== undefined && (!cashRounding || ledger)) {
          results.push({ id: envelope.id, status: 'rejected', error: { code: 'invalid_payload', message: ledger
            ? 'WooCommerce POS 2.0 does not carry cash rounding; complete the sale without it.'
            : "This store's WooCommerce connector does not carry cash rounding; complete the sale without it.",
          data: { storeCode: 'cash_rounding_unsupported' } } });
          continue;
        }
        const mapped = toWooOrderPayload(envelope, context?.local?.orders?.get(envelope.id), { paymentsList, ledger });
        if ('error' in mapped) {
          results.push({ id: envelope.id, status: 'rejected', error: mapped.error });
          continue;
        }
        let outcome: WooTransportOutcome;
        const pushed = await call('push/orders', { method: 'POST', body: { mutationId: envelope.id, operation: 'create', collection: 'orders',
          recordId: envelope.payload.clientOrderId, baseRevision: null, payload: mapped.payload } });
        const { status, body } = pushed;
        if (status === 0) outcome = retry(pushed, 'network');
        else if (status === 401) outcome = { kind: 'unauthorized' };
        // WCPOS 2.0.4 refuses a till below its protocol: 426 wcpos_update_required (Services/Protocol_Gate.php:15-17).
        else if (status === 426 && body?.code === 'wcpos_update_required') outcome = { kind: 'refused', status, reason: body?.message ?? body.code };
        // A 2.0 store refuses a legacy `completed` push (API/V2/Writers/Pushable_Document.php:100-105): it was upgraded under this transport.
        else if (!ledger && status === 422 && body?.code === 'wcpos_status_not_pushable' && options.ledgerPayments === undefined) { siteLedger = undefined; outcome = retry(pushed, 'ledger_store_detected'); }
        else if (![200, 201, 400, 422, 403, 413, 415].includes(status)) outcome = retry(pushed, `status_${status}`);
        else if (status === 200 || status === 201) {
          const doc = body?.document;
          const totalMinor = wooMinorFromDecimal(String(doc?.total), envelope.payload.currency);
          // The push answers { document, currentRevision } (v2.0.4 API/V2/Write_Controller.php:767-783).
          let revision = body?.currentRevision;
          if (doc?.id == null || totalMinor === undefined || (mapped.money && (typeof revision !== 'string' || !revision))) {
            outcome = retry(pushed, pushed.aborted ? 'timeout' : 'bad_body');
          } else {
            const orderId = String(doc.id), displayId = String(doc.number ?? doc.id);
            // v2.0.4 leaves an under-covered order pos-partial (Projection.php:72-78) and refuses an over-covering record (Ledger.php:662-699).
            if (ledger && totalMinor !== envelope.payload.totalMinor) {
              const tillMinor = envelope.payload.totalMinor, digits = wooDigits(envelope.payload);
              results.push({ id: envelope.id, status: 'rejected', error: { code: 'invalid_payload', message: `WooCommerce order #${displayId} totals ${wooMajor(totalMinor, digits)} but the till charged ${wooMajor(tillMinor, digits)}; no payment was recorded on it.`,
                data: { orderId, displayId, storeCode: 'total_mismatch', tillMinor, serverMinor: totalMinor } } });
              continue;
            }
            let failed: Answer | undefined;
            let recorded = 0;
            for (const command of mapped.money ?? []) {
              const path = `orders/${orderId}/${command.path}`;
              let answer = await call(path, { method: 'POST', body: { ...command.body, revision } });
              // A stale revision is resent once, same body, with the server's (Command_Log.php:256-275); the
              // fingerprint leaves out command_id and revision (Command_Log.php:47-48), so the resend is the same command.
              const stale = answer.status === 409 && answer.body?.code === 'wcpos_revision_stale' ? answer.body?.data?.currentRevision : undefined;
              if (typeof stale === 'string' && stale) answer = await call(path, { method: 'POST', body: { ...command.body, revision: stale } });
              // Every 2xx money answer carries the revision after it (Payments_Controller.php:376-405); a refused row is
              // never a 2xx (Payments_Controller.php:154-161, Ledger.php:698).
              if (answer.status >= 200 && answer.status < 300 && typeof answer.body?.revision === 'string' && answer.body.revision) {
                revision = answer.body.revision;
                recorded += 1;
                continue;
              }
              failed = answer;
              break;
            }
            const code = failed?.body?.code;
            const terminal = typeof code === 'string' && (code.startsWith('wcpos_') || code === 'rest_invalid_param' || code === 'rest_forbidden');
            if (!failed) {
              results.push({ id: envelope.id, status: 'applied', serverRefs: { orderId, displayId, totalMinor },
                ...(totalMinor !== envelope.payload.totalMinor ? { warnings: [{
                  code: 'total_mismatch' as const, expectedMinor: envelope.payload.totalMinor, serverMinor: totalMinor,
                }] } : {}) });
              continue;
            } else if (failed.status === 401) outcome = { kind: 'unauthorized' };
            // The store was rolled back below 2.0 under this transport: /site is read again.
            else if (failed.status === 404 && code === 'rest_no_route') { siteLedger = undefined; outcome = retry(failed, 'ledger_route_missing'); }
            // A retry resends the whole envelope: the push replays by mutationId (Write_Controller.php:153-157,219-240)
            // and a recorded payment by its id, whatever revision it carries (Ledger.php:585-595, Command_Log.php:93-112).
            // Lock busy: Order_Lock.php:136-147, Payments_Controller.php:103-105.
            // Only known refusals are terminal: `Payments_Controller.php:394-398` answers a failed re-read after the effect stood as a plain 4xx; a replay answers the stored outcome.
            else if (failed.status < 400 || failed.status >= 500 || (failed.status === 409
              && ['wcpos_revision_stale', 'wcpos_payment_locked', 'woo_rxdb_sync_record_locked'].includes(code)) || !terminal) {
              outcome = retry(failed, failed.status >= 200 && failed.status < 300 ? (failed.aborted ? 'timeout' : 'bad_body') : code ?? `status_${failed.status}`);
            } else {
              // Stock is held on record and close (Ledger.php:701-705,1848-1852; Services/Stock_Validator.php:382-392).
              results.push({ id: envelope.id, status: 'rejected', error: {
                code: failed.status === 400 && code === 'wcpos_insufficient_stock' ? 'insufficient_stock' : 'invalid_payload',
                message: `WooCommerce order #${displayId} was ${recorded === 0 ? 'created but not paid' : `created and part paid (${recorded} of ${mapped.money!.length} payments recorded)`}: ${failed.body?.message ?? code ?? `status_${failed.status}`}`,
                data: { orderId, displayId, storeCode: code ?? `status_${failed.status}`, ...(recorded ? { recorded } : {}) } } });
              continue;
            }
          }
        } else if (status === 400 && body?.code === 'woocommerce_rest_invalid_coupon') {
          const message = decodeCouponMessage(body?.message), quoted = /"([^"]*)"/.exec(message)?.[1];
          const couponCode = envelope.payload.coupons?.find(({ code }) => code.toLowerCase() === quoted?.toLowerCase())?.code;
          results.push({ id: envelope.id, status: 'rejected', error: { code: 'coupon_invalid', message,
            data: { storeCode: body.code, ...(couponCode ? { couponCode } : {}) } } });
          continue;
        } else if (status === 400 || status === 422) {
          results.push({ id: envelope.id, status: 'rejected', error: {
            code: status === 400 && body?.code === 'wcpos_insufficient_stock' ? 'insufficient_stock' : 'invalid_payload',
            message: body?.message ?? `status_${status}`,
          } });
          continue;
        } else {
          outcome = { kind: 'refused', status, reason: body?.message ?? body?.code ?? `status_${status}` };
        }
        return results.length ? { kind: 'results', results } : outcome;
      }
      return { kind: 'results', results };
    },
  };
}
